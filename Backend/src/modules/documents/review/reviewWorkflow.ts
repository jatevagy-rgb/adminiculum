/**
 * Document review workflow state machine (DOC-REVIEW-WORKFLOW-1).
 *
 * A pure, dependency-free encoding of the internal review lifecycle and its
 * legal invariants. Every route and UI action funnels through evaluateTransition
 * so the rules live in one deterministic, unit-testable place — never scattered
 * across handlers where an invariant could quietly rot.
 *
 * It decides *whether* a transition is permitted and *what* the next status is;
 * it performs no I/O and touches no database. Persistence, DTOs and audit are
 * layered on top and simply trust this verdict.
 *
 * Non-negotiable invariants it enforces:
 *   - approval records an exact approvedVersionId and can only approve the version
 *     actually under review — never a historical or newer one by accident;
 *   - uploading a new version never silently transfers an existing approval;
 *   - changes cannot be requested without open points or an explicit rationale;
 *   - a version cannot be resubmitted without a newer eligible version;
 *   - approval is blocked while any blocking review point is unresolved;
 *   - approval is blocked while the exact relevant comparison still has unresolved
 *     change segments (UNREVIEWED / NEEDS_DISCUSSION / REJECTED), because human
 *     comparison review is authoritative and independent of review points;
 *   - the reviewer must have case/document access;
 *   - closing a review never publishes anything to a client.
 */

export type ReviewStatus =
  | 'DRAFT' | 'ASSIGNED' | 'IN_REVIEW' | 'CHANGES_REQUESTED'
  | 'RESUBMITTED' | 'APPROVED' | 'CANCELLED' | 'CLOSED';

export type ReviewAction =
  | 'ASSIGN' | 'START' | 'REQUEST_CHANGES' | 'RESUBMIT'
  | 'APPROVE' | 'CLOSE' | 'CANCEL';

export type ReviewPointStatus = 'OPEN' | 'ANSWERED' | 'RESOLVED' | 'REJECTED' | 'DEFERRED';

const TERMINAL: ReadonlySet<ReviewStatus> = new Set(['APPROVED', 'CANCELLED', 'CLOSED']);
const REVIEWABLE: ReadonlySet<ReviewStatus> = new Set(['IN_REVIEW', 'RESUBMITTED']);

/**
 * VERSION-LEVEL review state of ONE immutable DocumentVersion. Deliberately
 * distinct from the document-level DocumentReview status and from Document.workStatus.
 */
export type VersionReviewStatus = 'NOT_IN_REVIEW' | 'IN_REVIEW' | 'CHANGES_REQUESTED' | 'APPROVED';

/** A review round is "active" (occupies the one-active-round slot) until terminal. */
export function isActiveStatus(status: ReviewStatus): boolean {
  return !TERMINAL.has(status);
}

/** True while a review still occupies the document's single active slot. */
export function isActiveReviewStatus(status: unknown): boolean {
  return !TERMINAL.has(String(status) as ReviewStatus);
}

/**
 * The exact version a review is bound to: the version of its ACTIVE ROUND. A
 * RESUBMIT moves the review onto a newer version while keeping its original
 * anchor `documentVersionId`, so reading only the anchor would be version-untruthful.
 */
export function activeReviewVersionId(review: {
  currentRound?: { reviewVersionId?: string | null } | null;
  documentVersionId?: string | null;
} | null | undefined): string | null {
  return review?.currentRound?.reviewVersionId || review?.documentVersionId || null;
}

/**
 * VERSION-LEVEL projection of a canonical review status (never the other way
 * around). DRAFT means the review exists but has not started; CLOSED/CANCELLED
 * mean the workflow ended, so that version is no longer under active review.
 */
export function versionReviewStatusFor(reviewStatus: ReviewStatus): VersionReviewStatus {
  switch (reviewStatus) {
    case 'ASSIGNED':
    case 'IN_REVIEW':
    case 'RESUBMITTED':
      return 'IN_REVIEW';
    case 'CHANGES_REQUESTED':
      return 'CHANGES_REQUESTED';
    case 'APPROVED':
      return 'APPROVED';
    default:
      return 'NOT_IN_REVIEW';
  }
}

/**
 * Resolves the truthful version-level review status for one immutable version,
 * preferring the canonical active review bound to it, then a recorded approval,
 * and finally the stored (legacy/manual) value. Keeps existing rows truthful even
 * before any new transition has mirrored the value.
 */
export function resolveVersionReviewStatus(params: {
  versionId: string;
  storedStatus: string | null | undefined;
  reviews: Array<{
    status: unknown;
    documentVersionId?: string | null;
    currentRound?: { reviewVersionId?: string | null } | null;
    approvedVersionId?: string | null;
  }>;
}): string {
  const { versionId, storedStatus, reviews } = params;
  const bound = reviews.filter((review) => activeReviewVersionId(review) === versionId);
  const active = bound.find((review) => isActiveReviewStatus(review.status));
  if (active) return versionReviewStatusFor(String(active.status) as ReviewStatus);
  if (reviews.some((review) => review.approvedVersionId === versionId)) return 'APPROVED';
  return storedStatus || 'NOT_IN_REVIEW';
}

/** Only an exactly-matching approved version counts — approval is never inherited. */
export function approvalAppliesToVersion(approvedVersionId: string | null, versionId: string): boolean {
  return approvedVersionId != null && approvedVersionId === versionId;
}

/** A brand-new round may open only when no other round for the document is active. */
export function canOpenNewRound(existingStatuses: ReviewStatus[]): boolean {
  return !existingStatuses.some(isActiveStatus);
}

export interface TransitionContext {
  /** Reviewer has case/document read access (checked upstream, asserted here). */
  reviewerHasAccess?: boolean;
  /** Whether the acting user is the owner or the assigned reviewer. */
  actorAuthorized?: boolean;
  /** Count of review points still blocking (severity BLOCKING and not resolved/deferred/rejected). */
  openBlockingPoints?: number;
  /** Total number of open points (any severity). */
  openPoints?: number;
  /**
   * Number of unresolved change segments (UNREVIEWED / NEEDS_DISCUSSION /
   * REJECTED) in the exact previous->reviewed-version comparison. Distinct from
   * review points: a segment can be unresolved without any corresponding review
   * point, and human comparison review must still be resolved before approval.
   */
  unresolvedSegments?: number;
  /** Whether a concise rationale accompanies the action. */
  hasRationale?: boolean;
  /** Version currently under review. */
  reviewVersionId?: string;
  reviewVersionNumber?: number;
  /** Newest eligible version of the logical document. */
  latestVersionId?: string;
  latestVersionNumber?: number;
  /** For APPROVE: the version the caller intends to approve. */
  approveVersionId?: string;
  /** For RESUBMIT: the version the caller intends to resubmit for the next round. */
  resubmitVersionId?: string;
  resubmitVersionNumber?: number;
}

export interface TransitionResult {
  allowed: boolean;
  /** Present when allowed. */
  nextStatus?: ReviewStatus;
  /** When allowed and the round advances, the version the next round reviews. */
  nextReviewVersionId?: string;
  nextRoundIncrement?: boolean;
  /** When allowed and APPROVE, the exact version approved. */
  approvedVersionId?: string;
  /** Machine-readable reason when not allowed. */
  reason?: string;
}

const deny = (reason: string): TransitionResult => ({ allowed: false, reason });

/**
 * Decide a single review transition. Deterministic and total: any status/action
 * pair yields either an explicit allow (with the resulting status) or an explicit
 * denial with a code.
 */
export function evaluateTransition(status: ReviewStatus, action: ReviewAction, ctx: TransitionContext = {}): TransitionResult {
  // Actor authorization is required for every mutation.
  if (ctx.actorAuthorized === false) return deny('ACTOR_NOT_AUTHORIZED');

  switch (action) {
    case 'ASSIGN': {
      if (status !== 'DRAFT') return deny('INVALID_STATE');
      if (ctx.reviewerHasAccess === false) return deny('REVIEWER_NO_ACCESS');
      return { allowed: true, nextStatus: 'ASSIGNED' };
    }

    case 'START': {
      if (status !== 'ASSIGNED') return deny('INVALID_STATE');
      if (ctx.reviewerHasAccess === false) return deny('REVIEWER_NO_ACCESS');
      return { allowed: true, nextStatus: 'IN_REVIEW' };
    }

    case 'REQUEST_CHANGES': {
      if (!REVIEWABLE.has(status)) return deny('INVALID_STATE');
      // Changes requested must be actionable: at least one open point or a rationale.
      if (!(ctx.openPoints && ctx.openPoints > 0) && ctx.hasRationale !== true) {
        return deny('RATIONALE_OR_POINTS_REQUIRED');
      }
      return { allowed: true, nextStatus: 'CHANGES_REQUESTED' };
    }

    case 'RESUBMIT': {
      if (status !== 'CHANGES_REQUESTED') return deny('INVALID_STATE');
      // A newer eligible version must exist and be the one resubmitted — you
      // cannot resubmit the same version that changes were requested against.
      const newer =
        ctx.latestVersionNumber != null &&
        ctx.reviewVersionNumber != null &&
        ctx.latestVersionNumber > ctx.reviewVersionNumber;
      if (!newer) return deny('NEWER_VERSION_REQUIRED');
      const nextVersionId = ctx.resubmitVersionId ?? ctx.latestVersionId;
      if (!nextVersionId) return deny('NEWER_VERSION_REQUIRED');
      if (ctx.resubmitVersionNumber != null && ctx.reviewVersionNumber != null &&
          ctx.resubmitVersionNumber <= ctx.reviewVersionNumber) {
        return deny('NEWER_VERSION_REQUIRED');
      }
      return { allowed: true, nextStatus: 'RESUBMITTED', nextReviewVersionId: nextVersionId, nextRoundIncrement: true };
    }

    case 'APPROVE': {
      if (!REVIEWABLE.has(status)) return deny('INVALID_STATE');
      // No approval while blocking points remain open.
      if ((ctx.openBlockingPoints ?? 0) > 0) return deny('BLOCKING_POINTS_OPEN');
      // No approval while the exact relevant comparison still has unresolved
      // change segments. This is a separate dimension from review points: the
      // comparison engine creates segments with a default UNREVIEWED state and a
      // segment can be moved to NEEDS_DISCUSSION without any review point, so
      // approval must fail closed until the lawyer has actually reviewed the
      // changes. Human review remains authoritative; AI never gates approval.
      if ((ctx.unresolvedSegments ?? 0) > 0) return deny('COMPARISON_SEGMENTS_UNRESOLVED');
      // Approval must target exactly the version under review — never a
      // historical or newer version selected by accident.
      const approveId = ctx.approveVersionId ?? ctx.reviewVersionId;
      if (!approveId || !ctx.reviewVersionId || approveId !== ctx.reviewVersionId) {
        return deny('APPROVE_VERSION_MISMATCH');
      }
      return { allowed: true, nextStatus: 'APPROVED', approvedVersionId: ctx.reviewVersionId };
    }

    case 'CLOSE': {
      // Closing is allowed from any active state or from APPROVED; it never publishes.
      if (status === 'CLOSED' || status === 'CANCELLED') return deny('INVALID_STATE');
      return { allowed: true, nextStatus: 'CLOSED' };
    }

    case 'CANCEL': {
      if (TERMINAL.has(status)) return deny('INVALID_STATE');
      return { allowed: true, nextStatus: 'CANCELLED' };
    }

    default:
      return deny('UNKNOWN_ACTION');
  }
}

/** Actions the current status could permit (before context checks). Drives truthful UI affordances. */
export function candidateActions(status: ReviewStatus): ReviewAction[] {
  switch (status) {
    case 'DRAFT': return ['ASSIGN', 'CANCEL'];
    case 'ASSIGNED': return ['START', 'CANCEL'];
    case 'IN_REVIEW': return ['REQUEST_CHANGES', 'APPROVE', 'CLOSE', 'CANCEL'];
    case 'CHANGES_REQUESTED': return ['RESUBMIT', 'CLOSE', 'CANCEL'];
    case 'RESUBMITTED': return ['REQUEST_CHANGES', 'APPROVE', 'CLOSE', 'CANCEL'];
    case 'APPROVED': return ['CLOSE'];
    default: return [];
  }
}
