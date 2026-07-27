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

/** A review round is "active" (occupies the one-active-round slot) until terminal. */
export function isActiveStatus(status: ReviewStatus): boolean {
  return !TERMINAL.has(status);
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
