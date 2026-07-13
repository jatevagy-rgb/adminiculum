/**
 * Matter Intake Readiness Engine — WORKFLOW-CORE-INTAKE-MATTER-OPENING-1
 *
 * Pure, deterministic helpers for the canonical intake / opening-readiness
 * contract. No database access, no free-text inference, no automated conflict
 * decision, no duplicate-client decision, no e-mail-based authorization.
 *
 * TRUTHFUL IMPLEMENTATION NOTES
 * ---------------------------------------------------------------------------
 * - Intake state maps onto the REAL CaseStatus enum only: `CLIENT_INPUT` is the
 *   intake-compatible state (the existing case-creation default). Activation is
 *   the existing valid transition CLIENT_INPUT → DRAFT. Decline maps to the
 *   persistable CANCELLED status (CLOSED lifecycle category). No `OPEN`,
 *   `ACTIVE`, or `INTAKE` Prisma status is invented.
 * - There is NO structured conflict-review persistence in the schema, so
 *   conflictReview.status is always "UNAVAILABLE", the capability is always
 *   false, and CONFLICT_REVIEW_REQUIRED / CONFLICT_BLOCKED blockers are never
 *   emitted. Conflict clearance is never simulated in descriptions/JSON.
 * - Opening readiness is an OPERATIONAL workflow result. It never claims that
 *   legal engagement is valid, that conflict rules are legally satisfied, that
 *   identity verification is legally sufficient, or that professional-conduct
 *   requirements are complete.
 */

export type IntakeChecklistCode =
  | 'CLIENT_SELECTED'
  | 'CLIENT_IDENTITY'
  | 'CLIENT_ROLE'
  | 'RESPONSIBLE_LAWYER'
  | 'CONFLICT_REVIEW'
  | 'MATTER_DESCRIPTION'
  | 'INITIAL_TASKS'
  | 'INITIAL_DEADLINE';

export type IntakeBlockerCode =
  | 'MISSING_CLIENT'
  | 'MISSING_CLIENT_ROLE'
  | 'MISSING_RESPONSIBLE_LAWYER'
  | 'CONFLICT_REVIEW_REQUIRED'
  | 'CONFLICT_BLOCKED'
  | 'MISSING_REQUIRED_INFORMATION';

export interface IntakeChecklistItem {
  code: IntakeChecklistCode;
  label: string;
  required: boolean;
  complete: boolean;
  available: boolean;
  href?: string | null;
}

export interface IntakeBlocker {
  code: IntakeBlockerCode;
  label: string;
  href?: string | null;
}

export interface IntakeReadinessSummary {
  readyForActivation: boolean;
  completedRequiredItems: number;
  totalRequiredItems: number;
}

export interface IntakeCapabilities {
  canEditClientLink: boolean;
  canEditClientRole: boolean;
  canChangeResponsibleLawyer: boolean;
  canManageCollaborators: boolean;
  canRecordConflictReview: boolean;
  canCreateOpeningTasks: boolean;
  canSetInitialDeadline: boolean;
  canActivateMatter: boolean;
  canDeclineMatter: boolean;
}

export interface IntakeAvailability {
  clientIdentity: boolean;
  clientRole: boolean;
  parties: boolean;
  opposingParties: boolean;
  conflictReviewPersistence: boolean;
  engagementState: boolean;
  openingTaskBundle: boolean;
  initialDeadline: boolean;
}

/** The intake-compatible persistable CaseStatus value (case-creation default). */
export const INTAKE_STATUS = 'CLIENT_INPUT';
/** Activation target — the existing valid CLIENT_INPUT → DRAFT transition. */
export const ACTIVATION_TARGET_STATUS = 'DRAFT';
/** Decline target — persistable CANCELLED (CLOSED lifecycle category). */
export const DECLINE_TARGET_STATUS = 'CANCELLED';

export const INTAKE_AVAILABILITY: IntakeAvailability = {
  clientIdentity: true, // structured contact/identifier fields exist (no verification status)
  clientRole: true, // cases.clientRole
  parties: false, // SCHEMA_CHANGE_REQUIRED
  opposingParties: false, // SCHEMA_CHANGE_REQUIRED
  conflictReviewPersistence: false, // SCHEMA_CHANGE_REQUIRED
  engagementState: false, // SCHEMA_CHANGE_REQUIRED
  openingTaskBundle: true, // existing Task model + type-code convention
  initialDeadline: true, // existing Case.deadline via PATCH /cases/:id
};

export interface IntakeChecklistInput {
  hasClient: boolean;
  clientHasContactData: boolean;
  hasClientRole: boolean;
  hasResponsibleLawyer: boolean;
  hasDescription: boolean;
  openTaskCount: number;
  hasInitialDeadline: boolean;
  caseId: string;
}

export function deriveIntakeChecklist(input: IntakeChecklistInput): IntakeChecklistItem[] {
  const caseHref = `/cases/${encodeURIComponent(input.caseId)}`;
  return [
    {
      code: 'CLIENT_SELECTED',
      label: 'Ügyfél kiválasztva és az ügyhöz kapcsolva.',
      required: true,
      complete: input.hasClient,
      available: true,
      href: caseHref,
    },
    {
      code: 'CLIENT_IDENTITY',
      label:
        'Ügyfél elérhetőségi / azonosító alapadat rögzítve (nem minősül azonosítás-ellenőrzésnek).',
      required: false,
      complete: input.hasClient && input.clientHasContactData,
      available: true,
      href: null,
    },
    {
      code: 'CLIENT_ROLE',
      label: 'Ügyfél szerep (pozíció) rögzítve az ügyben.',
      required: true,
      complete: input.hasClientRole,
      available: true,
      href: caseHref,
    },
    {
      code: 'RESPONSIBLE_LAWYER',
      label: 'Felelős ügyvéd kijelölve.',
      required: true,
      complete: input.hasResponsibleLawyer,
      available: true,
      href: caseHref,
    },
    {
      code: 'CONFLICT_REVIEW',
      label: 'Összeférhetetlenségi ellenőrzés nincs strukturáltan rögzítve ebben a rendszerben.',
      required: false,
      complete: false,
      available: false, // no conflict-review persistence
      href: null,
    },
    {
      code: 'MATTER_DESCRIPTION',
      label: 'Rövid belső ügyleírás rögzítve.',
      required: true,
      complete: input.hasDescription,
      available: true,
      href: caseHref,
    },
    {
      code: 'INITIAL_TASKS',
      label: 'Kezdő feladat(ok) létrehozva.',
      required: false,
      complete: input.openTaskCount > 0,
      available: true,
      href: '/tasks',
    },
    {
      code: 'INITIAL_DEADLINE',
      label: 'Kezdő ügyhatáridő beállítva.',
      required: false,
      complete: input.hasInitialDeadline,
      available: true,
      href: caseHref,
    },
  ];
}

export function deriveIntakeBlockers(checklist: IntakeChecklistItem[]): IntakeBlocker[] {
  const blockers: IntakeBlocker[] = [];
  const incomplete = new Set(
    checklist.filter((item) => item.required && item.available && !item.complete).map((item) => item.code)
  );

  if (incomplete.has('CLIENT_SELECTED')) {
    blockers.push({ code: 'MISSING_CLIENT', label: 'Nincs ügyfél kapcsolva az ügyhöz.', href: null });
  }
  if (incomplete.has('CLIENT_ROLE')) {
    blockers.push({ code: 'MISSING_CLIENT_ROLE', label: 'Az ügyfél szerepe nincs rögzítve.', href: null });
  }
  if (incomplete.has('RESPONSIBLE_LAWYER')) {
    blockers.push({ code: 'MISSING_RESPONSIBLE_LAWYER', label: 'Nincs felelős ügyvéd kijelölve.', href: null });
  }
  if (incomplete.has('MATTER_DESCRIPTION')) {
    blockers.push({
      code: 'MISSING_REQUIRED_INFORMATION',
      label: 'Az ügy operatív megnyitásához szükséges adatok hiányosak (ügyleírás).',
      href: null,
    });
  }

  // CONFLICT_REVIEW_REQUIRED / CONFLICT_BLOCKED are never emitted: there is no
  // structured conflict-review persistence, and the engine must not simulate one.
  return blockers;
}

export function deriveIntakeReadiness(checklist: IntakeChecklistItem[], blockers: IntakeBlocker[]): IntakeReadinessSummary {
  const required = checklist.filter((item) => item.required && item.available);
  const completed = required.filter((item) => item.complete);
  return {
    readyForActivation: blockers.length === 0 && required.length > 0 && completed.length === required.length,
    completedRequiredItems: completed.length,
    totalRequiredItems: required.length,
  };
}

export function deriveIntakeCapabilities(params: {
  status: string;
  isCaseManager: boolean;
  readyForActivation: boolean;
}): IntakeCapabilities {
  const status = String(params.status || '').toUpperCase();
  const isIntake = status === INTAKE_STATUS;
  const isTerminal = status === 'ARCHIVED' || status === 'CANCELLED' || status === 'FINAL';
  const manager = params.isCaseManager;

  return {
    // Re-linking an existing case to a different client is not supported by the
    // current PATCH /cases contract (clientId is not updatable) — truthfully false.
    canEditClientLink: false,
    canEditClientRole: manager && !isTerminal,
    canChangeResponsibleLawyer: manager && !isTerminal,
    canManageCollaborators: manager && !isTerminal,
    // No conflict-review persistence exists → never offered.
    canRecordConflictReview: false,
    canCreateOpeningTasks: manager && !isTerminal,
    canSetInitialDeadline: manager && !isTerminal,
    canActivateMatter: manager && isIntake && params.readyForActivation,
    canDeclineMatter: manager && isIntake,
  };
}

export type IntakeTransitionErrorCode =
  | 'CASE_MANAGE_FORBIDDEN'
  | 'INVALID_INTAKE_STATE'
  | 'ACTIVATION_BLOCKED';

export interface IntakeTransitionDecision {
  allowed: boolean;
  targetStatus?: string;
  errorCode?: IntakeTransitionErrorCode;
  reason?: string;
  blockers?: IntakeBlocker[];
}

/**
 * Explicit, human-triggered activation only. Never clears conflict review,
 * never assigns responsibility, never completes tasks.
 */
export function validateMatterActivation(params: {
  currentStatus: string;
  isCaseManager: boolean;
  blockers: IntakeBlocker[];
}): IntakeTransitionDecision {
  if (!params.isCaseManager) {
    return {
      allowed: false,
      errorCode: 'CASE_MANAGE_FORBIDDEN',
      reason: 'A művelethez ügykezelői jogosultság szükséges.',
    };
  }
  if (String(params.currentStatus || '').toUpperCase() !== INTAKE_STATUS) {
    return {
      allowed: false,
      errorCode: 'INVALID_INTAKE_STATE',
      reason: 'Az ügy aktiválása jelenleg nem engedélyezett: az ügy nem beérkezési állapotban van.',
    };
  }
  if (params.blockers.length > 0) {
    return {
      allowed: false,
      errorCode: 'ACTIVATION_BLOCKED',
      reason: 'Az ügy operatív megnyitásához szükséges adatok hiányosak.',
      blockers: params.blockers,
    };
  }
  return { allowed: true, targetStatus: ACTIVATION_TARGET_STATUS };
}

export function validateMatterDecline(params: {
  currentStatus: string;
  isCaseManager: boolean;
}): IntakeTransitionDecision {
  if (!params.isCaseManager) {
    return {
      allowed: false,
      errorCode: 'CASE_MANAGE_FORBIDDEN',
      reason: 'A művelethez ügykezelői jogosultság szükséges.',
    };
  }
  if (String(params.currentStatus || '').toUpperCase() !== INTAKE_STATUS) {
    return {
      allowed: false,
      errorCode: 'INVALID_INTAKE_STATE',
      reason: 'Csak beérkezési állapotban lévő ügy utasítható el.',
    };
  }
  return { allowed: true, targetStatus: DECLINE_TARGET_STATUS };
}

// ---------------------------------------------------------------------------
// Opening task bundle definitions (backend-owned; explicit user confirmation
// required — nothing is created automatically). Titles are safe and contain no
// client-sensitive data. Completing these tasks does NOT claim that legal or
// regulatory obligations are satisfied.
// ---------------------------------------------------------------------------

export const OPENING_TASK_TYPE_PREFIX = 'INTAKE_OPENING_';

export const OPENING_TASK_DEFINITIONS: ReadonlyArray<{ code: string; title: string }> = [
  { code: 'VERIFY_CLIENT_DETAILS', title: 'Ügyfél alapadatok ellenőrzése' },
  { code: 'RECORD_CLIENT_ROLE', title: 'Ügyfél szerep rögzítése az ügyben' },
  { code: 'COMPLETE_CONFLICT_REVIEW', title: 'Összeférhetetlenségi ellenőrzés elvégzése (manuális, rendszeren kívüli)' },
  { code: 'CONFIRM_RESPONSIBLE_LAWYER', title: 'Felelős ügyvéd megerősítése' },
  { code: 'COLLECT_INITIAL_DOCUMENTS', title: 'Kezdeti dokumentumok bekérése' },
  { code: 'REVIEW_INITIAL_DOCUMENTS', title: 'Kezdeti dokumentumok áttekintése' },
  { code: 'CONFIRM_SCOPE_AND_NEXT_STEP', title: 'Megbízási terjedelem és következő lépés megerősítése' },
  { code: 'SET_INITIAL_DEADLINE', title: 'Kezdő határidő beállítása' },
];

export function isValidOpeningTaskCode(code: unknown): code is string {
  return typeof code === 'string' && OPENING_TASK_DEFINITIONS.some((definition) => definition.code === code);
}

export function openingTaskTypeForCode(code: string): string {
  return `${OPENING_TASK_TYPE_PREFIX}${code}`;
}
