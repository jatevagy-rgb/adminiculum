import type { ClientRequestType } from './clientInteractionApi';

/**
 * Customer read model for a published ClientRequest.
 *
 * Everything here is derived from canonical customer-safe request fields only:
 * `title`, `instructions`, `dueAt`, `status`, `documentSpec`, `fields`.
 * Nothing is invented; when a canonical value is absent the caller must render an
 * honest empty state instead of a fabricated value.
 */

/** Marker written by the canonical internal composer (buildClientRequestDraftPayload). */
export const WHY_MARKER = 'Miért szükséges:';

const MAX_STEPS = 12;

const MIME_LABELS: Record<string, string> = {
  'application/pdf': 'PDF',
  'image/jpeg': 'JPG',
  'image/jpg': 'JPG',
  'image/png': 'PNG',
  'image/heic': 'HEIC',
  'image/webp': 'WEBP',
};

const REQUEST_TYPE_LABELS: Record<ClientRequestType, string> = {
  DOCUMENT_UPLOAD: 'Dokumentum bekérése',
  INFORMATION_REQUEST: 'Információ bekérése',
  DATA_FORM: 'Adatbekérés',
  QUESTION_RESPONSE: 'Kérdés megválaszolása',
  CORRECTION_REQUEST: 'Javítás bekérése',
  MISSING_DOCUMENT_REQUEST: 'Hiányzó dokumentum bekérése',
};

export function requestTypeLabel(type: string): string {
  return REQUEST_TYPE_LABELS[type as ClientRequestType] || 'Ügyvédi bekérés';
}

function splitLines(text: string): string[] {
  return text
    .split(/\r?\n/)
    .map((line) => line.replace(/^\s*[-•*]\s*/, '').replace(/^\s*\d+[.)]\s*/, '').trim())
    .filter(Boolean)
    .slice(0, MAX_STEPS);
}

export function splitRequestInstructions(raw?: string | null): { steps: string[]; why: string | null } {
  const text = String(raw ?? '').trim();
  if (!text) return { steps: [], why: null };
  const index = text.indexOf(WHY_MARKER);
  if (index < 0) return { steps: splitLines(text), why: null };
  const why = text.slice(index + WHY_MARKER.length).trim();
  return { steps: splitLines(text.slice(0, index)), why: why || null };
}

function megabytes(bytes: number): string {
  const mb = bytes / (1024 * 1024);
  return Number.isInteger(mb) ? String(mb) : mb.toFixed(1).replace('.', ',');
}

export function requestDocumentSpecHints(spec: unknown): string[] {
  if (!spec || typeof spec !== 'object' || Array.isArray(spec)) return [];
  const value = spec as Record<string, unknown>;
  const hints: string[] = [];
  const accepted = Array.isArray(value.acceptedMimeTypes)
    ? value.acceptedMimeTypes
        .map((mime) => MIME_LABELS[String(mime)] || String(mime))
        .filter(Boolean)
    : [];
  if (accepted.length) hints.push(`Elfogadott formátum: ${accepted.join(', ')}`);
  const maxFileCount = Number(value.maxFileCount);
  if (Number.isFinite(maxFileCount) && maxFileCount > 0) hints.push(`Legfeljebb ${maxFileCount} fájl tölthető fel`);
  const maxFileSizeBytes = Number(value.maxFileSizeBytes);
  if (Number.isFinite(maxFileSizeBytes) && maxFileSizeBytes > 0) hints.push(`Fájlonként legfeljebb ${megabytes(maxFileSizeBytes)} MB`);
  if (value.frontBackRequired === true) hints.push('Az első és a hátsó oldal is szükséges');
  if (value.mobilePhotoAccepted === true) hints.push('Telefonnal készített fotó is elfogadható');
  return hints;
}

export function requestStateTone(status: string): 'amber' | 'green' | 'blue' | 'neutral' | 'red' {
  switch (status) {
    case 'PUBLISHED':
    case 'CORRECTION_REQUESTED':
      return 'amber';
    case 'SUBMITTED':
    case 'UNDER_INTERNAL_REVIEW':
    case 'PARTIALLY_SUBMITTED':
      return 'blue';
    case 'COMPLETED':
      return 'green';
    case 'EXPIRED':
      return 'red';
    default:
      return 'neutral';
  }
}

export function canRespondToRequest(status: string): boolean {
  return !['COMPLETED', 'CANCELLED', 'EXPIRED'].includes(status);
}

export const NOT_AVAILABLE_PREFIX = 'Nem áll rendelkezésre:';

export function notAvailableSubject(requestTitle: string): string {
  return `${NOT_AVAILABLE_PREFIX} ${String(requestTitle || '').trim()}`.trim().slice(0, 200);
}

export function notAvailableBody(requestTitle: string, dueAt?: string | null, customerText?: string): string {
  const title = String(requestTitle || '').trim() || 'a kérés';
  const deadline = dueAt ? ` (határidő: ${String(dueAt).slice(0, 10)})` : '';
  const note = String(customerText || '').trim();
  const head = `Nem tudom teljesíteni a következő bekérést: ${title}${deadline}. A kért dokumentum vagy adat jelenleg nem áll rendelkezésemre.`;
  return note ? `${head}\n\nMegjegyzés: ${note}`.slice(0, 4000) : head.slice(0, 4000);
}

