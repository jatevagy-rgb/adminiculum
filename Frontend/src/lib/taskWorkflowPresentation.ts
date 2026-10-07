import { ApiError } from "./api";
import { BUSINESS_TIME_ZONE, formatDeadline } from "./businessDateTime";
import type {
  SubmissionReadinessCode,
  SubmissionWarningCode,
  TaskLifecycleListItem,
  TaskReviewQueueItem,
  TaskSubmission,
  TaskSubmissionWorkflow,
} from "./taskLifecycleApi";

export const TASK_STATUS_LABELS: Record<string, string> = {
  PENDING: "Teendő",
  TODO: "Teendő",
  ASSIGNED: "Teendő",
  IN_PROGRESS: "Folyamatban",
  IN_REVIEW: "Review alatt",
  UNDER_REVIEW: "Review alatt",
  SUBMITTED: "Review alatt",
  DONE: "Lezárva",
  COMPLETED: "Lezárva",
  CANCELLED: "Lezárva",
  BLOCKED: "Elakadt",
};

export const SUBMISSION_STATUS_LABELS: Record<string, string> = {
  DRAFT: "Piszkozat",
  SUBMITTED: "Leadva",
  RETURNED: "Visszaküldve",
  APPROVED: "Jóváhagyva",
  SUPERSEDED: "Korábbi verzió",
  CANCELLED: "Lezárva",
};

export const ATTENTION_LABELS: Record<string, string> = {
  QUICK_SCAN: "Gyors átfutás",
  APPROVAL: "Jóváhagyás",
  SIGNATURE: "Aláírás",
  EDITING: "Szerkesztés",
  DETAILED_REVIEW: "Részletes ellenőrzés",
};

/**
 * Indicative PLANNING duration bands (same canonical bands as the backend
 * attentionCategory contract). Approximate review attention/time only —
 * NOT actual TimeEntry, NOT Task.estimatedMinutes, NOT billing time.
 */
export const ATTENTION_DURATION_BANDS: Record<string, { minMinutes: number; maxMinutes: number }> = {
  QUICK_SCAN: { minMinutes: 5, maxMinutes: 15 },
  APPROVAL: { minMinutes: 10, maxMinutes: 20 },
  SIGNATURE: { minMinutes: 5, maxMinutes: 10 },
  EDITING: { minMinutes: 30, maxMinutes: 60 },
  DETAILED_REVIEW: { minMinutes: 60, maxMinutes: 120 },
};

export function attentionDurationLabel(attention: string | null | undefined): string | null {
  const band = ATTENTION_DURATION_BANDS[String(attention || "").toUpperCase()];
  if (!band) return null;
  return band.minMinutes === band.maxMinutes ? `≈ ${band.minMinutes} perc` : `≈ ${band.minMinutes}–${band.maxMinutes} perc`;
}

export const DOCUMENT_ROLE_LABELS: Record<string, string> = {
  PRIMARY_OUTPUT: "Elsődleges eredmény",
  SUPPORTING_DOCUMENT: "Kiegészítő dokumentum",
  REVIEW_REFERENCE: "Review-háttéranyag",
  FINAL_OUTPUT: "Végleges eredmény",
};

/**
 * Human Hungarian labels for the canonical DocumentReviewStatus lifecycle. Used
 * by ordinary review presentation so the raw state token never reaches the UI.
 */
export const DOCUMENT_REVIEW_STATUS_LABELS: Record<string, string> = {
  DRAFT: "Piszkozat",
  ASSIGNED: "Kijelölve",
  READY_FOR_REVIEW: "Review-ra kész",
  IN_REVIEW: "Review alatt",
  RESUBMITTED: "Újra beküldve",
  CHANGES_REQUESTED: "Módosítás kérve",
  APPROVED: "Jóváhagyva",
  READY_FOR_CLIENT: "Ügyfélnek kész",
  PUBLISHED: "Közzétéve",
  CLOSED: "Lezárva",
  CANCELLED: "Visszavonva",
};

export const UNKNOWN_DOCUMENT_REVIEW_STATUS_LABEL = "Ismeretlen review állapot";

export function documentReviewStatusLabel(status?: string | null): string {
  const key = String(status || "").trim().toUpperCase();
  if (!key) return UNKNOWN_DOCUMENT_REVIEW_STATUS_LABEL;
  return DOCUMENT_REVIEW_STATUS_LABELS[key] || UNKNOWN_DOCUMENT_REVIEW_STATUS_LABEL;
}

export const EXTERNAL_ACTION_LABELS: Record<string, string> = {
  CLIENT_SEND: "Ügyfélnek küldés",
  SIGNATURE: "Aláírás",
  COURT_FILING: "Bírósági benyújtás",
  AUTHORITY_SUBMISSION: "Hatósági benyújtás",
  OTHER: "Egyéb",
};

export const PRIORITY_LABELS: Record<string, string> = {
  URGENT: "Magas",
  HIGH: "Magas",
  MEDIUM: "Közepes",
  LOW: "Alacsony",
};

export const READINESS_LABELS: Record<SubmissionReadinessCode, string> = {
  WORK_SUMMARY_REQUIRED: "Az elvégzett munka összefoglalása hiányzik.",
  REVIEW_ATTENTION_REQUIRED: "Válassza ki a review típusát.",
  REVIEWER_REQUIRED: "Válasszon reviewert.",
  REVIEWER_INELIGIBLE: "A kiválasztott reviewer már nem jogosult.",
  REVIEWER_MUST_BE_RESPONSIBLE_LAWYER: "A Leadás reviewerét csak az ügy felelős ügyvédje lehet.",
  RESPONSIBLE_LAWYER_MISSING: "Az ügyhöz nincs felelős ügyvéd rendelve; a Leadás nem küldhető be.",
  RESPONSIBLE_LAWYER_INELIGIBLE: "Az ügy felelős ügyvédje inaktív vagy nem jogosult jogi review-ra.",
  SELF_REVIEW_NOT_ALLOWED: "A beadó nem review-zhatja saját munkáját.",
  OUTPUT_REQUIRED: "Kapcsoljon elsődleges eredménydokumentumot.",
  EXACT_VERSION_REQUIRED: "A dokumentumhoz nincs pontos verzió kötve; kapcsolja újra az eredménydokumentumot.",
  TIME_ENTRY_OR_ZERO_CONFIRMATION_REQUIRED: "Kapcsoljon munkaórát, vagy erősítse meg, hogy nincs rögzítendő idő.",
  TASK_STATE_NOT_SUBMITTABLE: "A feladat jelenlegi állapotában nem adható le.",
  SUBMISSION_NOT_DRAFT: "Ez a Leadás már nem szerkeszthető.",
  DOCUMENT_SCOPE_INVALID: "A kapcsolt dokumentum nem ehhez az ügyhöz tartozik.",
  TIME_ENTRY_SCOPE_INVALID: "A kapcsolt munkaóra nem ehhez a feladathoz vagy munkacsomaghoz tartozik.",
};

export const READINESS_COMPLETED_LABELS: Partial<Record<SubmissionReadinessCode, string>> = {
  WORK_SUMMARY_REQUIRED: "Az elvégzett munka összefoglalása megadva.",
  REVIEW_ATTENTION_REQUIRED: "A review típusa kiválasztva.",
  REVIEWER_REQUIRED: "A reviewer kiválasztva.",
  OUTPUT_REQUIRED: "Az elsődleges eredménydokumentum kapcsolva.",
  EXACT_VERSION_REQUIRED: "A pontos dokumentumverzió kötve.",
  TIME_ENTRY_OR_ZERO_CONFIRMATION_REQUIRED: "A munkaidő feltétel teljesítve.",
  TASK_STATE_NOT_SUBMITTABLE: "A feladat jelenlegi állapotában leadható.",
};

export const WARNING_LABELS: Record<SubmissionWarningCode, string> = {
  ZERO_TIME_CONFIRMED: "A Leadás nulla rögzített munkaórával kerül review-ra.",
  VERSION_NOT_CURRENT: "Egy kapcsolt dokumentumnak újabb verziója létezik. A beküldésnél a pontos verziót kifejezetten meg kell erősíteni.",
};

export const NEXT_ACTION_LABELS: Record<string, string> = {
  START_TASK: "Indítás",
  OPEN_TASK: "Megnyitás",
  CONTINUE_SUBMISSION: "Leadás folytatása",
  VIEW_SUBMISSION: "Leadás megtekintése",
  OPEN_REVIEW: "Review megnyitása",
  CONTINUE_RETURNED_WORK: "Javítás folytatása",
  RECORD_EXTERNAL_COMPLETION: "Külső lépés rögzítése",
  VIEW_COMPLETED: "Megtekintés",
};

export function taskStatusLabel(status?: string | null): string {
  return TASK_STATUS_LABELS[String(status || "").toUpperCase()] || "Nincs állapotadat";
}

export function submissionStatusLabel(status?: string | null, revision?: number | null): string {
  if (!status) return "Nincs kapcsolt Leadás";
  const label = SUBMISSION_STATUS_LABELS[String(status).toUpperCase()] || "Nincs állapotadat";
  return revision ? `${label} · ${revision}. verzió` : label;
}

export function submissionLabelFromItem(item: TaskLifecycleListItem): string {
  return submissionStatusLabel(item.submissionStatus, item.submissionRevision);
}

export function nextActionLabel(code?: string | null): string | null {
  const normalized = String(code || "").toUpperCase();
  if (!NEXT_ACTION_LABELS[normalized]) {
    if (normalized) console.warn("[TASK_WORKFLOW] Ismeretlen következő lépés érkezett.");
    return null;
  }
  return NEXT_ACTION_LABELS[normalized];
}

export function nextActorLabel(
  workflow: Pick<TaskSubmissionWorkflow, "nextActionCode" | "currentReviewer" | "task">,
): string {
  const code = String(workflow.nextActionCode || "").toUpperCase();
  if (["OPEN_REVIEW", "VIEW_SUBMISSION"].includes(code)) {
    return workflow.currentReviewer?.displayName || "A kijelölt reviewer";
  }
  if (["START_TASK", "OPEN_TASK", "CONTINUE_SUBMISSION", "CONTINUE_RETURNED_WORK"].includes(code)) {
    return workflow.task.assignee?.displayName || "A feladat felelőse";
  }
  if (code === "RECORD_EXTERNAL_COMPLETION") return "A backend által jogosult belső reviewer";
  if (code === "VIEW_COMPLETED") return "Nincs további teendő";
  return "A backend nem adott biztonságos következő szereplőt";
}

export function formatDate(value?: string | null): string {
  if (!value) return "—";
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? "—" : date.toLocaleDateString("hu-HU", { timeZone: BUSINESS_TIME_ZONE });
}

export function formatDateTime(value?: string | null): string {
  return formatDeadline(value);
}

export function formatMinutes(minutes?: number | null): string {
  const safe = Math.max(0, Number(minutes || 0));
  const hours = Math.floor(safe / 60);
  const remainder = safe % 60;
  if (!hours) return `${remainder} perc`;
  return remainder ? `${hours} óra ${remainder} perc` : `${hours} óra`;
}

export type ReviewUrgency = "NONE" | "LATER" | "SOON" | "URGENT" | "CRITICAL";

export function reviewUrgency(item: Pick<TaskReviewQueueItem, "dueDate" | "priority">, now = new Date()): ReviewUrgency {
  if (!item.dueDate) return String(item.priority).toUpperCase() === "URGENT" ? "URGENT" : "NONE";
  const due = new Date(item.dueDate);
  if (Number.isNaN(due.getTime())) return "NONE";
  const start = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
  const dueDay = new Date(due.getFullYear(), due.getMonth(), due.getDate()).getTime();
  const days = Math.floor((dueDay - start) / 86_400_000);
  if (days < 0) return "CRITICAL";
  if (days <= 1 || String(item.priority).toUpperCase() === "URGENT") return "URGENT";
  if (days <= 5) return "SOON";
  return "LATER";
}

export const URGENCY_LABELS: Record<ReviewUrgency, string> = {
  NONE: "Nincs határidő",
  LATER: "Ráér",
  SOON: "Közeleg",
  URGENT: "Sürgős",
  CRITICAL: "Lejárt / kritikus",
};

export function sortReviewQueue(items: TaskReviewQueueItem[], now = new Date()): TaskReviewQueueItem[] {
  const rank: Record<ReviewUrgency, number> = { CRITICAL: 0, URGENT: 1, SOON: 2, LATER: 3, NONE: 4 };
  return [...items].sort((left, right) => {
    const urgencyDelta = rank[reviewUrgency(left, now)] - rank[reviewUrgency(right, now)];
    if (urgencyDelta) return urgencyDelta;
    const leftDeadline = left.dueDate ? new Date(left.dueDate).getTime() : Number.POSITIVE_INFINITY;
    const rightDeadline = right.dueDate ? new Date(right.dueDate).getTime() : Number.POSITIVE_INFINITY;
    if (leftDeadline !== rightDeadline) return leftDeadline - rightDeadline;
    const leftSubmitted = left.submittedAt ? new Date(left.submittedAt).getTime() : Number.POSITIVE_INFINITY;
    const rightSubmitted = right.submittedAt ? new Date(right.submittedAt).getTime() : Number.POSITIVE_INFINITY;
    return leftSubmitted - rightSubmitted;
  });
}

export function latestReturnedRevision(submissions: TaskSubmission[]): TaskSubmission | null {
  return submissions.find((submission) => String(submission.status).toUpperCase() === "RETURNED") || null;
}

export const TASK_WORKFLOW_COLUMNS = [
  "Feladat",
  "Ügy / ügyfél",
  "Felelős",
  "Prioritás",
  "Határidő",
  "Állapot",
  "Leadás",
  "Következő lépés",
] as const;

export function isSubmissionReadOnly(status?: string | null, editPermitted = false): boolean {
  return String(status || "").toUpperCase() !== "DRAFT" || !editPermitted;
}

export function isSubmissionReadyForUi(
  ready: boolean,
  hasUnsavedChanges: boolean,
  reviewerStillEligible: boolean,
  submitPermitted: boolean,
): boolean {
  return ready && !hasUnsavedChanges && reviewerStillEligible && submitPermitted;
}

export function submissionDisabledReason(
  ready: boolean,
  hasUnsavedChanges: boolean,
  reviewerDirectoryAvailable: boolean,
  reviewerStillEligible: boolean,
  submitPermitted: boolean,
): string | null {
  if (hasUnsavedChanges) return "Előbb mentse a piszkozatot.";
  if (reviewerDirectoryAvailable && !reviewerStillEligible) return "Válasszon jogosult reviewert.";
  if (!ready || !submitPermitted) return "A backend readiness szerint még hiányzik előfeltétel.";
  return null;
}

export type LeadasHandoffMode = "CONTINUE" | "OFFER_TIME";

/**
 * Decides the Leadás handoff entry step for a canonical submission workflow.
 *
 * This reads the backend readiness projection and the backend permitted
 * actions; it never re-derives readiness. "OFFER_TIME" is returned only when
 * the canonical workflow says the time/zero-confirmation prerequisite is still
 * outstanding AND the user is allowed to act on a draft. A recorded linked
 * time or an already-confirmed zero time therefore never fabricates a missing
 * time warning, and missing time alone never becomes a hard blocker because
 * "OFFER_TIME" still offers the canonical "Kihagyás" (zeroTimeConfirmed) path.
 */
export function leadasHandoffMode(workflow: TaskSubmissionWorkflow | null): LeadasHandoffMode {
  if (!workflow) return "CONTINUE";
  const draft = workflow.activeDraft;
  if (!draft) {
    const canStartDraft = workflow.permittedActions.createDraft && !workflow.permittedActions.reviseReturned;
    return canStartDraft ? "OFFER_TIME" : "CONTINUE";
  }
  const outstanding = [
    ...(workflow.readiness?.missingPrerequisites || []),
    ...(workflow.readiness?.blockingErrors || []),
  ];
  if (!outstanding.includes("TIME_ENTRY_OR_ZERO_CONFIRMATION_REQUIRED")) return "CONTINUE";
  return workflow.permittedActions.editDraft ? "OFFER_TIME" : "CONTINUE";
}

export function isReturnFormValid(note: string, corrections: string): boolean {
  return Boolean(note.trim() && corrections.trim());
}

export function isExternalApprovalPending(submission: Pick<TaskSubmission, "status" | "externalActionRequired" | "externalCompletedAt">): boolean {
  return String(submission.status).toUpperCase() === "APPROVED" && submission.externalActionRequired && !submission.externalCompletedAt;
}

export function sortRevisionHistory<T extends { revisionNumber: number }>(revisions: T[]): T[] {
  return [...revisions].sort((left, right) => right.revisionNumber - left.revisionNumber);
}

export function safeReviewProjectionKeys(): string[] {
  return [
    "task",
    "client",
    "matter",
    "case",
    "submission",
    "outputs",
    "documentReviews",
    "time",
    "history",
    "decision",
    "permittedActions",
    "nextActionCode",
    "reviewVersion",
  ];
}

const ERROR_MESSAGES: Record<string, string> = {
  TASK_NOT_FOUND: "A feladat nem található vagy nincs hozzáférése.",
  TASK_SUBMISSION_STATE_CONFLICT: "A Leadás állapota időközben megváltozott.",
  REVIEW_ALREADY_DECIDED: "Erről a Leadásról már döntés született.",
  SELF_REVIEW_NOT_ALLOWED: "Saját Leadás nem review-zható.",
  REVIEWER_INELIGIBLE: "A kiválasztott reviewer nem jogosult.",
  REVIEWER_MUST_BE_RESPONSIBLE_LAWYER: "A Leadás reviewerét csak az ügy felelős ügyvédje lehet.",
  RESPONSIBLE_LAWYER_MISSING: "Az ügyhöz nincs felelős ügyvéd rendelve; a Leadás nem küldhető be.",
  RESPONSIBLE_LAWYER_INELIGIBLE: "Az ügy felelős ügyvédje inaktív vagy nem jogosult jogi review-ra.",
  EXACT_VERSION_REQUIRED: "A dokumentumhoz nincs pontos verzió kötve; kapcsolja újra az eredménydokumentumot.",
  EXACT_VERSION_CONFIRMATION_REQUIRED: "Újabb dokumentumverzió létezik. Erősítse meg a beküldött pontos verziót, vagy kapcsolja újra a dokumentumot.",
  EXACT_VERSION_INVALID: "A kiválasztott verzió nem tartozik a kapcsolt dokumentumhoz.",
  HANDOFF_NOT_READY: "A Leadás még nem küldhető review-ra.",
  TASK_SUBMISSION_NOT_READY: "A Leadás még nem küldhető review-ra.",
  IDEMPOTENCY_KEY_REUSED: "A műveletazonosító már más kéréshez tartozik. Frissítse az oldalt.",
  REVIEW_VERSION_STALE: "A Review időközben megváltozott. Az adatokat újratöltöttük.",
  REVIEW_DETAIL_REQUIRED: "Nyissa meg újra a Review részleteit a döntés előtt.",
  RETURN_NOTE_REQUIRED: "A review megjegyzés kötelező.",
  REQUESTED_CORRECTIONS_REQUIRED: "A kért javítások megadása kötelező.",
  DOCUMENT_NOT_FOUND: "A dokumentum nem található vagy nem kapcsolható ehhez az ügyhöz.",
  TIME_ENTRY_NOT_FOUND: "A munkaóra nem található vagy nem kapcsolható ehhez a feladathoz.",
  ZERO_TIME_CONFIRMATION_CONFLICT: "Kapcsolt munkaóra mellett nem erősíthető meg a nulla idő.",
  TASK_ROLE_CASE_ACCESS_REQUIRED: "A kiválasztott munkatárs nem rendelkezik hozzáféréssel ehhez az ügyhöz.",
  TASK_ROLE_USER_INELIGIBLE: "A kiválasztott munkatárs jelenleg nem jelölhető ki erre a feladatra.",
  REVIEWER_CANNOT_BE_WORKER: "A feladat végrehajtója és ellenőrzője nem lehet ugyanaz a személy.",
  COLLABORATOR_IS_WORKER: "A feladat felelőse nem jelölhető meg párhuzamos közreműködőként is.",
  COLLABORATOR_IS_REVIEWER: "Az ellenőrző nem lehet egyben párhuzamos közreműködő.",
  TASK_ASSIGNMENT_FORBIDDEN: "Ön nem rendelheti a feladatot ehhez a munkatárshoz.",
  ASSIGNEE_NOT_CASE_MEMBER: "A feladat felelőse csak az ügy csapatának tagja lehet.",
  ASSIGNEE_NOT_AVAILABLE: "A kiválasztott munkatárs jelenleg nem érhető el.",
  TASK_ACTION_FORBIDDEN: "Ehhez a feladatművelethez nincs jogosultsága.",
};

export function taskWorkflowErrorMessage(error: unknown): string {
  if (error instanceof ApiError) {
    if (error.code && ERROR_MESSAGES[error.code]) return ERROR_MESSAGES[error.code];
    if (error.status === 401) return "A munkamenet lejárt. Jelentkezzen be újra.";
    if (error.status === 403 || error.status === 404) return "A művelet nem engedélyezett vagy az elem nem érhető el.";
    if (error.status === 0) return "A válasz nem érkezett meg. Az állapotot újra ellenőrizzük.";
  }
  return "A művelet most nem hajtható végre. Frissítse az adatokat, majd próbálja újra.";
}
