/**
 * Review workflow invariants (DOC-REVIEW-WORKFLOW-1).
 *
 * These lock the legal-review rules that the persistence, API and UI all defer
 * to: the lifecycle transitions, and the non-negotiable guards around approval,
 * resubmission, blocking points, reviewer access and the one-active-round rule.
 */
import {
  evaluateTransition,
  candidateActions,
  approvalAppliesToVersion,
  canOpenNewRound,
  isActiveStatus,
  versionReviewStatusFor,
  activeReviewVersionId,
  isActiveReviewStatus,
  resolveVersionReviewStatus,
} from '../src/modules/documents/review/reviewWorkflow';

const OK = { actorAuthorized: true, reviewerHasAccess: true };

describe('version-level review projection (DocumentVersion.reviewStatus)', () => {
  it('maps document-level review states onto the version-level enum', () => {
    expect(versionReviewStatusFor('DRAFT')).toBe('NOT_IN_REVIEW');
    expect(versionReviewStatusFor('ASSIGNED')).toBe('IN_REVIEW');
    expect(versionReviewStatusFor('IN_REVIEW')).toBe('IN_REVIEW');
    expect(versionReviewStatusFor('RESUBMITTED')).toBe('IN_REVIEW');
    expect(versionReviewStatusFor('CHANGES_REQUESTED')).toBe('CHANGES_REQUESTED');
    expect(versionReviewStatusFor('APPROVED')).toBe('APPROVED');
    expect(versionReviewStatusFor('CLOSED')).toBe('NOT_IN_REVIEW');
    expect(versionReviewStatusFor('CANCELLED')).toBe('NOT_IN_REVIEW');
  });

  it('binds a review to its active round version, not its anchor version', () => {
    expect(activeReviewVersionId({ documentVersionId: 'v1', currentRound: { reviewVersionId: 'v2' } })).toBe('v2');
    expect(activeReviewVersionId({ documentVersionId: 'v1', currentRound: null })).toBe('v1');
    expect(activeReviewVersionId(null)).toBeNull();
  });

  it('treats only APPROVED/CANCELLED/CLOSED as terminal', () => {
    expect(isActiveReviewStatus('IN_REVIEW')).toBe(true);
    expect(isActiveReviewStatus('CHANGES_REQUESTED')).toBe(true);
    expect(isActiveReviewStatus('APPROVED')).toBe(false);
    expect(isActiveReviewStatus('CLOSED')).toBe(false);
  });

  it('reconciles a stored NOT_IN_REVIEW version with its canonical active review', () => {
    expect(resolveVersionReviewStatus({
      versionId: 'v1',
      storedStatus: 'NOT_IN_REVIEW',
      reviews: [{ status: 'IN_REVIEW', documentVersionId: 'v1', currentRound: { reviewVersionId: 'v1' } }],
    })).toBe('IN_REVIEW');

    expect(resolveVersionReviewStatus({
      versionId: 'v2',
      storedStatus: 'NOT_IN_REVIEW',
      reviews: [{ status: 'RESUBMITTED', documentVersionId: 'v1', currentRound: { reviewVersionId: 'v2' } }],
    })).toBe('IN_REVIEW');
  });

  it('keeps a recorded approval on the exact version even after the review closes', () => {
    expect(resolveVersionReviewStatus({
      versionId: 'v3',
      storedStatus: 'NOT_IN_REVIEW',
      reviews: [{ status: 'CLOSED', documentVersionId: 'v3', currentRound: { reviewVersionId: 'v3' }, approvedVersionId: 'v3' }],
    })).toBe('APPROVED');
  });

  it('never invents review state for a version with no canonical review', () => {
    expect(resolveVersionReviewStatus({ versionId: 'v1', storedStatus: 'NOT_IN_REVIEW', reviews: [] })).toBe('NOT_IN_REVIEW');
    expect(resolveVersionReviewStatus({ versionId: 'v1', storedStatus: 'APPROVED', reviews: [] })).toBe('APPROVED');
  });
});

describe('lifecycle transitions', () => {
  it('assigns a reviewer from DRAFT', () => {
    expect(evaluateTransition('DRAFT', 'ASSIGN', OK)).toMatchObject({ allowed: true, nextStatus: 'ASSIGNED' });
  });

  it('starts review from ASSIGNED', () => {
    expect(evaluateTransition('ASSIGNED', 'START', OK)).toMatchObject({ allowed: true, nextStatus: 'IN_REVIEW' });
  });

  it('rejects an out-of-order transition', () => {
    expect(evaluateTransition('DRAFT', 'APPROVE', OK)).toMatchObject({ allowed: false, reason: 'INVALID_STATE' });
    expect(evaluateTransition('APPROVED', 'START', OK)).toMatchObject({ allowed: false, reason: 'INVALID_STATE' });
  });
});

describe('authorization', () => {
  it('rejects an unauthorized actor for any action', () => {
    expect(evaluateTransition('DRAFT', 'ASSIGN', { actorAuthorized: false })).toMatchObject({ allowed: false, reason: 'ACTOR_NOT_AUTHORIZED' });
  });

  it('rejects assigning a reviewer without case/document access', () => {
    expect(evaluateTransition('DRAFT', 'ASSIGN', { actorAuthorized: true, reviewerHasAccess: false }))
      .toMatchObject({ allowed: false, reason: 'REVIEWER_NO_ACCESS' });
  });
});

describe('request changes', () => {
  it('requires open points or a rationale', () => {
    expect(evaluateTransition('IN_REVIEW', 'REQUEST_CHANGES', { ...OK, openPoints: 0, hasRationale: false }))
      .toMatchObject({ allowed: false, reason: 'RATIONALE_OR_POINTS_REQUIRED' });
    expect(evaluateTransition('IN_REVIEW', 'REQUEST_CHANGES', { ...OK, openPoints: 2 }))
      .toMatchObject({ allowed: true, nextStatus: 'CHANGES_REQUESTED' });
    expect(evaluateTransition('IN_REVIEW', 'REQUEST_CHANGES', { ...OK, openPoints: 0, hasRationale: true }))
      .toMatchObject({ allowed: true, nextStatus: 'CHANGES_REQUESTED' });
  });
});

describe('approval invariants', () => {
  it('is blocked while a blocking review point is open', () => {
    expect(evaluateTransition('IN_REVIEW', 'APPROVE', { ...OK, openBlockingPoints: 1, reviewVersionId: 'v2', approveVersionId: 'v2' }))
      .toMatchObject({ allowed: false, reason: 'BLOCKING_POINTS_OPEN' });
  });

  it('approves the exact version under review', () => {
    const r = evaluateTransition('IN_REVIEW', 'APPROVE', { ...OK, openBlockingPoints: 0, reviewVersionId: 'v2', approveVersionId: 'v2' });
    expect(r).toMatchObject({ allowed: true, nextStatus: 'APPROVED', approvedVersionId: 'v2' });
  });

  it('is blocked while the exact comparison has unresolved change segments even with no blocking point', () => {
    expect(evaluateTransition('IN_REVIEW', 'APPROVE', { ...OK, openBlockingPoints: 0, unresolvedSegments: 1, reviewVersionId: 'v2', approveVersionId: 'v2' }))
      .toMatchObject({ allowed: false, reason: 'COMPARISON_SEGMENTS_UNRESOLVED' });
    expect(evaluateTransition('IN_REVIEW', 'APPROVE', { ...OK, openBlockingPoints: 0, unresolvedSegments: 0, reviewVersionId: 'v2', approveVersionId: 'v2' }))
      .toMatchObject({ allowed: true, nextStatus: 'APPROVED', approvedVersionId: 'v2' });
    // Unresolved comparison work is independent of review points: zero open or
    // blocking points must not let approval bypass unresolved change segments.
    expect(evaluateTransition('IN_REVIEW', 'APPROVE', { ...OK, openPoints: 0, openBlockingPoints: 0, unresolvedSegments: 2, reviewVersionId: 'v2', approveVersionId: 'v2' }))
      .toMatchObject({ allowed: false, reason: 'COMPARISON_SEGMENTS_UNRESOLVED' });
  });

  it('refuses to approve a different (historical or newer) version by accident', () => {
    expect(evaluateTransition('IN_REVIEW', 'APPROVE', { ...OK, openBlockingPoints: 0, reviewVersionId: 'v2', approveVersionId: 'v1' }))
      .toMatchObject({ allowed: false, reason: 'APPROVE_VERSION_MISMATCH' });
  });

  it('never inherits approval onto a newer version', () => {
    expect(approvalAppliesToVersion('v2', 'v2')).toBe(true);
    expect(approvalAppliesToVersion('v2', 'v3')).toBe(false);
    expect(approvalAppliesToVersion(null, 'v2')).toBe(false);
  });
});

describe('resubmission requires a newer eligible version', () => {
  it('rejects resubmitting the same version changes were requested against', () => {
    expect(evaluateTransition('CHANGES_REQUESTED', 'RESUBMIT', { ...OK, reviewVersionNumber: 2, latestVersionNumber: 2, latestVersionId: 'v2' }))
      .toMatchObject({ allowed: false, reason: 'NEWER_VERSION_REQUIRED' });
  });

  it('accepts resubmitting a genuinely newer version and advances the round', () => {
    const r = evaluateTransition('CHANGES_REQUESTED', 'RESUBMIT', {
      ...OK, reviewVersionNumber: 2, latestVersionNumber: 3, latestVersionId: 'v3', resubmitVersionId: 'v3', resubmitVersionNumber: 3,
    });
    expect(r).toMatchObject({ allowed: true, nextStatus: 'RESUBMITTED', nextReviewVersionId: 'v3', nextRoundIncrement: true });
  });

  it('can only resubmit from CHANGES_REQUESTED', () => {
    expect(evaluateTransition('IN_REVIEW', 'RESUBMIT', { ...OK, reviewVersionNumber: 2, latestVersionNumber: 3 }))
      .toMatchObject({ allowed: false, reason: 'INVALID_STATE' });
  });
});

describe('a second round then approval', () => {
  it('runs changes → resubmit → approve on the resubmitted version', () => {
    const changed = evaluateTransition('IN_REVIEW', 'REQUEST_CHANGES', { ...OK, openPoints: 1 });
    expect(changed.allowed).toBe(true);
    const resub = evaluateTransition('CHANGES_REQUESTED', 'RESUBMIT', { ...OK, reviewVersionNumber: 2, latestVersionNumber: 3, latestVersionId: 'v3', resubmitVersionNumber: 3 });
    expect(resub).toMatchObject({ allowed: true, nextReviewVersionId: 'v3' });
    const approve = evaluateTransition('RESUBMITTED', 'APPROVE', { ...OK, openBlockingPoints: 0, reviewVersionId: 'v3', approveVersionId: 'v3' });
    expect(approve).toMatchObject({ allowed: true, approvedVersionId: 'v3' });
  });
});

describe('close and cancel', () => {
  it('closes an approved review without publishing', () => {
    const r = evaluateTransition('APPROVED', 'CLOSE', OK);
    expect(r).toMatchObject({ allowed: true, nextStatus: 'CLOSED' });
    // No publication field is produced by any transition.
    expect(JSON.stringify(r)).not.toMatch(/publish|client/i);
  });

  it('cancels a non-terminal review and refuses to cancel a terminal one', () => {
    expect(evaluateTransition('IN_REVIEW', 'CANCEL', OK)).toMatchObject({ allowed: true, nextStatus: 'CANCELLED' });
    expect(evaluateTransition('APPROVED', 'CANCEL', OK)).toMatchObject({ allowed: false, reason: 'INVALID_STATE' });
  });
});

describe('one active round invariant', () => {
  it('allows a new round only when no round is active', () => {
    expect(canOpenNewRound([])).toBe(true);
    expect(canOpenNewRound(['APPROVED', 'CLOSED', 'CANCELLED'])).toBe(true);
    expect(canOpenNewRound(['CLOSED', 'IN_REVIEW'])).toBe(false);
    expect(isActiveStatus('IN_REVIEW')).toBe(true);
    expect(isActiveStatus('APPROVED')).toBe(false);
  });
});

describe('truthful action affordances', () => {
  it('offers only state-appropriate actions and never a publish action', () => {
    expect(candidateActions('IN_REVIEW')).toEqual(expect.arrayContaining(['APPROVE', 'REQUEST_CHANGES', 'CLOSE']));
    expect(candidateActions('CHANGES_REQUESTED')).toContain('RESUBMIT');
    expect(candidateActions('APPROVED')).toEqual(['CLOSE']);
    expect(candidateActions('CLOSED')).toEqual([]);
    const all = ['DRAFT', 'ASSIGNED', 'IN_REVIEW', 'CHANGES_REQUESTED', 'RESUBMITTED', 'APPROVED', 'CANCELLED', 'CLOSED'] as const;
    for (const s of all) expect(JSON.stringify(candidateActions(s))).not.toMatch(/publish|deliver|client/i);
  });
});
