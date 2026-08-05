/**
 * CP1 intake — shared, pure, framework-free helpers used by both the customer
 * and internal intake UIs. Kept side-effect free so they can be unit-tested with
 * the repository's node:test harness.
 *
 * These map the backend's authoritative enum/state values to Hungarian product
 * language and enforce explicit request payload allowlists (never a broad object
 * spread back to the API).
 */

export type IntakeStatusCode =
  | 'draft' | 'submitted' | 'triage-in-progress' | 'more-information-required'
  | 'linked' | 'converted' | 'declined' | 'closed' | 'withdrawn' | 'processing';

/** Customer-facing status pill classes (white + terracotta system). */
export function intakeStatusTone(code: string): string {
  switch (code) {
    case 'draft': return 'bg-stone-100 text-stone-700';
    case 'submitted':
    case 'triage-in-progress': return 'bg-[#f3ead2] text-[#6f5514]';
    case 'more-information-required': return 'bg-[#fde7d6] text-[#8a3f1f]';
    case 'linked':
    case 'converted': return 'bg-emerald-50 text-emerald-800';
    case 'declined':
    case 'withdrawn':
    case 'closed': return 'bg-stone-200 text-stone-600';
    default: return 'bg-stone-100 text-stone-700';
  }
}

/** Customer-facing attachment state label. Never claims CLEAN unless the server does. */
export function attachmentStateLabel(state: string): string {
  switch (state) {
    case 'ready-for-review': return 'Feldolgozható';
    case 'not-accepted': return 'A fájl nem használható';
    case 'processing-unavailable':
    default: return 'Biztonsági ellenőrzésre vár';
  }
}

export const INTAKE_URGENCIES: Array<{ value: string; label: string }> = [
  { value: 'LOW', label: 'Alacsony' },
  { value: 'NORMAL', label: 'Normál' },
  { value: 'HIGH', label: 'Magas' },
  { value: 'URGENT', label: 'Sürgős' },
];

/**
 * Explicit allowlist for a create-draft payload. The server derives ownership,
 * identity, workspace, status, linked case, grant and publication — the customer
 * may only supply these fields.
 */
export function buildCreateIntakePayload(input: {
  subject: string;
  description: string;
  organizationGroupId?: string | null;
  urgency?: string | null;
  requestedDeadline?: string | null;
}): Record<string, unknown> {
  const payload: Record<string, unknown> = {
    subject: input.subject.trim(),
    description: input.description.trim(),
  };
  if (input.organizationGroupId) payload.organizationGroupId = input.organizationGroupId;
  if (input.urgency) payload.urgency = input.urgency;
  if (input.requestedDeadline) payload.requestedDeadline = input.requestedDeadline;
  return payload;
}

/** Explicit allowlist for an update-draft payload (only changed, permitted keys). */
export function buildUpdateIntakePayload(
  input: { subject?: string; description?: string; organizationGroupId?: string | null; urgency?: string | null; requestedDeadline?: string | null },
  expectedRevision?: number | null,
): Record<string, unknown> {
  const payload: Record<string, unknown> = {};
  if (input.subject !== undefined) payload.subject = input.subject.trim();
  if (input.description !== undefined) payload.description = input.description.trim();
  if (input.organizationGroupId !== undefined) payload.organizationGroupId = input.organizationGroupId || null;
  if (input.urgency !== undefined) payload.urgency = input.urgency;
  if (input.requestedDeadline !== undefined) payload.requestedDeadline = input.requestedDeadline || null;
  if (expectedRevision != null) payload.expectedRevision = expectedRevision;
  return payload;
}

/** Keys a customer intake payload must never contain (server-authoritative). */
export const FORBIDDEN_INTAKE_KEYS = [
  'workspaceId', 'clientId', 'requesterMembershipId', 'clientPortalIdentityId',
  'linkedCaseId', 'participantRole', 'permissions', 'status', 'internalTriageNote',
  'triagedByInternalUserId', 'submittedSnapshot', 'conversionFingerprint',
];

export function payloadIsCustomerSafe(payload: Record<string, unknown>): boolean {
  return !Object.keys(payload).some((key) => FORBIDDEN_INTAKE_KEYS.includes(key));
}

/** Map a backend error code to a customer-safe, actionable Hungarian message. */
export function intakeErrorMessage(code: string | undefined, fallback = 'A művelet nem sikerült. Kérjük, próbálja újra.'): string {
  switch (code) {
    case 'REVISION_CONFLICT': return 'A megkeresés időközben módosult. Frissítettük az adatokat, kérjük, nézze át és próbálja újra.';
    case 'INTAKE_NOT_EDITABLE': return 'Ez a megkeresés már nem szerkeszthető.';
    case 'INTAKE_NOT_SUBMITTABLE': return 'A megkeresés a jelenlegi állapotában nem küldhető be.';
    case 'INTAKE_NOT_WITHDRAWABLE': return 'A megkeresés már nem vonható vissza.';
    case 'INTAKE_RESPONSE_NOT_EXPECTED': return 'Jelenleg nincs megválaszolandó információkérés.';
    case 'INTAKE_FIELD_NOT_ALLOWED': return 'Nem engedélyezett mező szerepelt a kérésben.';
    case 'CLIENT_WORKSPACE_MEMBERSHIP_REQUIRED': return 'A hozzáférése ehhez a munkatérhez nem aktív. Kérjük, vegye fel a kapcsolatot az irodával.';
    case 'CLIENT_WORKSPACE_SELECTION_REQUIRED': return 'Kérjük, válasszon munkateret.';
    case 'CLIENT_WORKSPACE_NOT_ORGANIZATION': return 'Ez a funkció csak szervezeti ügyfélfelületen érhető el.';
    case 'REQUEST_NOT_FOUND': return 'A hivatkozott információkérés nem elérhető.';
    default: return fallback;
  }
}
