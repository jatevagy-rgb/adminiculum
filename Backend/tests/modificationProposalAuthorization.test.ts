/**
 * Pure unit tests for modification-proposal decision authority. Role alone must
 * never be enough for LAWYER/COLLAB_LAWYER; TRAINEE/LEGAL_ASSISTANT/CLIENT/
 * EXTERNAL_REVIEWER can never decide; unknown roles fail closed.
 */
import { resolveProposalDecisionAuthority } from '../src/modules/documents/proposalAuthorization';

const base = {
  actorId: 'actor-1',
  documentReviewerId: 'reviewer-9',
  caseAssignedLawyerId: 'assigned-9',
  caseCreatedById: 'creator-9',
};

describe('resolveProposalDecisionAuthority', () => {
  it('allows ADMIN and PARTNER regardless of relationship', () => {
    for (const role of ['ADMIN', 'PARTNER']) {
      expect(resolveProposalDecisionAuthority({ ...base, actorRole: role }).allowed).toBe(true);
    }
  });

  it('allows LAWYER when they are the document reviewer', () => {
    expect(
      resolveProposalDecisionAuthority({ ...base, actorRole: 'LAWYER', actorId: 'reviewer-9' }).allowed
    ).toBe(true);
  });

  it('allows COLLAB_LAWYER when they are the case assigned lawyer', () => {
    expect(
      resolveProposalDecisionAuthority({ ...base, actorRole: 'COLLAB_LAWYER', actorId: 'assigned-9' }).allowed
    ).toBe(true);
  });

  it('allows LAWYER when they created the case', () => {
    expect(
      resolveProposalDecisionAuthority({ ...base, actorRole: 'LAWYER', actorId: 'creator-9' }).allowed
    ).toBe(true);
  });

  it('denies a LAWYER with no relationship, even when they can read the case', () => {
    const result = resolveProposalDecisionAuthority({ ...base, actorRole: 'LAWYER', actorId: 'unrelated' });
    expect(result.allowed).toBe(false);
    expect(result.reason).toBe('no_relationship_to_document_or_case');
  });

  it.each(['TRAINEE', 'LEGAL_ASSISTANT', 'CLIENT', 'EXTERNAL_REVIEWER'])(
    'never allows %s to decide',
    (role) => {
      expect(
        resolveProposalDecisionAuthority({ ...base, actorRole: role, actorId: 'reviewer-9' }).allowed
      ).toBe(false);
    }
  );

  it('fails closed for an unknown/empty role', () => {
    expect(resolveProposalDecisionAuthority({ ...base, actorRole: '' }).allowed).toBe(false);
    expect(resolveProposalDecisionAuthority({ ...base, actorRole: null }).allowed).toBe(false);
  });
});
