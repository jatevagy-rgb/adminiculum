/**
 * Case Lifecycle Engine — WORKFLOW-CORE-LITIGATION-CASE-LIFECYCLE-1
 *
 * Pure, deterministic helpers for the canonical case-lifecycle contract.
 *
 * TRUTHFUL IMPLEMENTATION NOTE
 * ---------------------------------------------------------------------------
 * The Prisma `CaseStatus` enum is the single source of truth for persistable
 * case states. It contains:
 *   CLIENT_INPUT, DRAFT, IN_REVIEW, APPROVED, SENT_TO_CLIENT, CLIENT_FEEDBACK,
 *   FINAL, ON_HOLD, CANCELLED, ARCHIVED
 *
 * It does NOT contain a dedicated `CLOSED` or `CLOSING` value (the aspirational
 * `CASE_STATUS.CLOSED` in utils/constants.ts is not part of the DB enum and is
 * therefore NOT persistable). This module maps lifecycle categories onto the
 * real enum only, and exposes availability flags so the frontend never renders
 * an unsupported lifecycle state.
 *
 * This module performs NO database access, NO free-text inference, and makes NO
 * legal judgement. Lifecycle status is workflow state, not legal truth.
 */

export type CaseLifecycleCategory =
  | 'INTAKE'
  | 'ACTIVE'
  | 'ON_HOLD'
  | 'CLOSING'
  | 'CLOSED'
  | 'ARCHIVED';

export type CaseLifecycleAction = 'CLOSE' | 'REOPEN' | 'ARCHIVE';

export type CaseClosureBlockerCode =
  | 'OPEN_TASKS'
  | 'OVERDUE_TASKS'
  | 'ACTIVE_REVIEW'
  | 'OPEN_DEADLINES'
  | 'ACTIVE_HANDOFF'
  | 'UNRESOLVED_LITIGATION_ITEM'
  | 'MISSING_RESPONSIBLE_LAWYER';

export interface CaseClosureBlocker {
  code: CaseClosureBlockerCode;
  label: string;
  count?: number;
  href?: string | null;
}

export interface CaseLifecycleCapabilities {
  canChangeStatus: boolean;
  canStartClosing: boolean;
  canClose: boolean;
  canReopen: boolean;
  canArchive: boolean;
}

export interface CaseLifecycleAvailability {
  closingState: boolean;
  closedAt: boolean;
  archivedAt: boolean;
  litigationBlockers: boolean;
  closureChecklist: boolean;
}

export interface CaseLifecycleDto {
  caseId: string;
  generatedAt: string;
  status: string;
  lifecycleCategory: CaseLifecycleCategory;
  openedAt?: string | null;
  closedAt?: string | null;
  archivedAt?: string | null;
  updatedAt?: string | null;
  responsibleLawyer?: {
    id: string;
    displayName: string;
  } | null;
  blockers: CaseClosureBlocker[];
  closureReadiness: {
    ready: boolean;
    reasons: string[];
  };
  capabilities: CaseLifecycleCapabilities;
  availability: CaseLifecycleAvailability;
}

/**
 * Persistable CaseStatus enum values (mirror of prisma schema.prisma CaseStatus).
 * Kept as a literal set so the engine never emits a status the DB cannot store.
 */
export const PERSISTABLE_CASE_STATUSES = [
  'CLIENT_INPUT',
  'DRAFT',
  'IN_REVIEW',
  'APPROVED',
  'SENT_TO_CLIENT',
  'CLIENT_FEEDBACK',
  'FINAL',
  'ON_HOLD',
  'CANCELLED',
  'ARCHIVED',
] as const;

export type PersistableCaseStatus = (typeof PERSISTABLE_CASE_STATUSES)[number];

const ACTIVE_STATUSES = new Set<string>([
  'DRAFT',
  'IN_REVIEW',
  'APPROVED',
  'SENT_TO_CLIENT',
  'CLIENT_FEEDBACK',
]);

const CLOSED_STATUSES = new Set<string>(['FINAL', 'CANCELLED']);

/**
 * Deterministic target status for each lifecycle action, using only persistable
 * enum values. Documented in docs/workflow-core-case-lifecycle-transition-matrix.md.
 *
 * - CLOSE   -> FINAL   (operationally finalized/closed; sets completedAt)
 * - REOPEN  -> IN_REVIEW (safe active re-entry; clears completedAt). Prior status
 *              is not persisted anywhere, so re-entry is a fixed deterministic state.
 * - ARCHIVE -> ARCHIVED (retains all data; never deletes)
 */
export const LIFECYCLE_ACTION_TARGET: Record<CaseLifecycleAction, PersistableCaseStatus> = {
  CLOSE: 'FINAL',
  REOPEN: 'IN_REVIEW',
  ARCHIVE: 'ARCHIVED',
};

export function isPersistableCaseStatus(value: unknown): value is PersistableCaseStatus {
  return typeof value === 'string' && (PERSISTABLE_CASE_STATUSES as readonly string[]).includes(value);
}

export function deriveLifecycleCategory(status?: string | null): CaseLifecycleCategory {
  const normalized = String(status || '').toUpperCase();
  if (normalized === 'CLIENT_INPUT') return 'INTAKE';
  if (normalized === 'ON_HOLD') return 'ON_HOLD';
  if (normalized === 'ARCHIVED') return 'ARCHIVED';
  if (CLOSED_STATUSES.has(normalized)) return 'CLOSED';
  if (ACTIVE_STATUSES.has(normalized)) return 'ACTIVE';
  // Unknown/legacy values map to ACTIVE rather than inventing an unsupported state.
  return 'ACTIVE';
}

export interface ClosureBlockerInput {
  hasResponsibleLawyer: boolean;
  openTaskCount: number;
  overdueTaskCount: number;
  activeReviewCount: number;
  openDeadlineCount: number;
  activeHandoffCount: number;
}

/**
 * Derives operational closure blockers from already-fetched counts. This is an
 * OPERATIONAL readiness signal, not a legal-closure determination. The
 * UNRESOLVED_LITIGATION_ITEM code is intentionally never emitted here because no
 * structured litigation-item model exists in the current schema
 * (availability.litigationBlockers = false).
 */
export function deriveClosureBlockers(input: ClosureBlockerInput): CaseClosureBlocker[] {
  const blockers: CaseClosureBlocker[] = [];

  if (!input.hasResponsibleLawyer) {
    blockers.push({
      code: 'MISSING_RESPONSIBLE_LAWYER',
      label: 'Nincs felelős ügyvéd kijelölve.',
      href: null,
    });
  }
  if (input.overdueTaskCount > 0) {
    blockers.push({
      code: 'OVERDUE_TASKS',
      label: 'Lejárt határidejű feladatok vannak.',
      count: input.overdueTaskCount,
      href: '/tasks',
    });
  }
  if (input.openTaskCount > 0) {
    blockers.push({
      code: 'OPEN_TASKS',
      label: 'Nyitott feladatok vannak.',
      count: input.openTaskCount,
      href: '/tasks',
    });
  }
  if (input.activeReviewCount > 0) {
    blockers.push({
      code: 'ACTIVE_REVIEW',
      label: 'Folyamatban lévő felülvizsgálat van.',
      count: input.activeReviewCount,
      href: '/tasks',
    });
  }
  if (input.openDeadlineCount > 0) {
    blockers.push({
      code: 'OPEN_DEADLINES',
      label: 'Nyitott határidők vannak.',
      count: input.openDeadlineCount,
      href: '/deadlines',
    });
  }
  if (input.activeHandoffCount > 0) {
    blockers.push({
      code: 'ACTIVE_HANDOFF',
      label: 'Aktív ügyvédi átadási csomag van.',
      count: input.activeHandoffCount,
      href: null,
    });
  }

  return blockers;
}

export function deriveClosureReadiness(blockers: CaseClosureBlocker[]): {
  ready: boolean;
  reasons: string[];
} {
  if (blockers.length === 0) {
    return { ready: true, reasons: [] };
  }
  return {
    ready: false,
    // Operational wording only — never asserts legal closure.
    reasons: [
      'Az ügy operatív lezárásának feltételei még nem teljesülnek.',
      ...blockers.map((blocker) => blocker.label),
    ],
  };
}

export function deriveLifecycleCapabilities(params: {
  category: CaseLifecycleCategory;
  isCaseManager: boolean;
}): CaseLifecycleCapabilities {
  const { category, isCaseManager } = params;
  const isClosed = category === 'CLOSED';
  const isArchived = category === 'ARCHIVED';
  const isOpenLike = category === 'INTAKE' || category === 'ACTIVE' || category === 'ON_HOLD';

  return {
    canChangeStatus: isCaseManager && !isArchived,
    // No CLOSING state exists in the schema, so a two-phase closing flow is never offered.
    canStartClosing: false,
    canClose: isCaseManager && isOpenLike,
    canReopen: isCaseManager && (isClosed || isArchived),
    canArchive: isCaseManager && isClosed,
  };
}

export const LIFECYCLE_AVAILABILITY: CaseLifecycleAvailability = {
  closingState: false, // no CLOSING enum value
  closedAt: false, // no dedicated closedAt column (completedAt is surfaced as a proxy)
  archivedAt: false, // no dedicated archivedAt column
  litigationBlockers: false, // no structured litigation-item model
  closureChecklist: true, // operational checklist derived from tasks/deadlines/reviews
};

export type LifecycleTransitionErrorCode =
  | 'CASE_MANAGE_FORBIDDEN'
  | 'INVALID_LIFECYCLE_TRANSITION'
  | 'CLOSURE_BLOCKED';

export interface LifecycleTransitionDecision {
  allowed: boolean;
  targetStatus?: PersistableCaseStatus;
  errorCode?: LifecycleTransitionErrorCode;
  reason?: string;
  blockers?: CaseClosureBlocker[];
}

/**
 * Pure validation of a lifecycle transition. No DB access. Explicit actor
 * authorization and an explicit source/target-state matrix. Never performs an
 * automatic transition and never treats archive and delete as equivalent.
 */
export function validateCaseLifecycleTransition(params: {
  action: CaseLifecycleAction;
  currentCategory: CaseLifecycleCategory;
  isCaseManager: boolean;
  blockers: CaseClosureBlocker[];
}): LifecycleTransitionDecision {
  const { action, currentCategory, isCaseManager, blockers } = params;

  if (!isCaseManager) {
    return {
      allowed: false,
      errorCode: 'CASE_MANAGE_FORBIDDEN',
      reason: 'A művelethez ügykezelői jogosultság szükséges.',
    };
  }

  if (action === 'CLOSE') {
    const canClose = currentCategory === 'INTAKE' || currentCategory === 'ACTIVE' || currentCategory === 'ON_HOLD';
    if (!canClose) {
      return {
        allowed: false,
        errorCode: 'INVALID_LIFECYCLE_TRANSITION',
        reason: `Az ügy jelenlegi állapotából (${currentCategory}) nem zárható le.`,
      };
    }
    if (blockers.length > 0) {
      return {
        allowed: false,
        errorCode: 'CLOSURE_BLOCKED',
        reason: 'Az ügy operatív lezárásának feltételei még nem teljesülnek.',
        blockers,
      };
    }
    return { allowed: true, targetStatus: LIFECYCLE_ACTION_TARGET.CLOSE };
  }

  if (action === 'REOPEN') {
    const canReopen = currentCategory === 'CLOSED' || currentCategory === 'ARCHIVED';
    if (!canReopen) {
      return {
        allowed: false,
        errorCode: 'INVALID_LIFECYCLE_TRANSITION',
        reason: `Az ügy jelenlegi állapotából (${currentCategory}) nem nyitható újra.`,
      };
    }
    return { allowed: true, targetStatus: LIFECYCLE_ACTION_TARGET.REOPEN };
  }

  if (action === 'ARCHIVE') {
    const canArchive = currentCategory === 'CLOSED';
    if (!canArchive) {
      return {
        allowed: false,
        errorCode: 'INVALID_LIFECYCLE_TRANSITION',
        reason: `Az ügy csak lezárt állapotból archiválható (jelenlegi: ${currentCategory}).`,
      };
    }
    return { allowed: true, targetStatus: LIFECYCLE_ACTION_TARGET.ARCHIVE };
  }

  return {
    allowed: false,
    errorCode: 'INVALID_LIFECYCLE_TRANSITION',
    reason: 'Ismeretlen életciklus-művelet.',
  };
}
