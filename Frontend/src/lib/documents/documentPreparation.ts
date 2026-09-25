/**
 * Dependency-light view model for the Case Workspace document preparation
 * surface (DOCUMENT-PREP-DASHBOARD-1).
 *
 * Deliberately React-free and API-free, mirroring `./workContext.ts`, so the
 * selection / truthfulness / clipboard rules can be unit tested directly
 * without a DOM, a network or the component layer.
 *
 * Every helper here reports only what the persisted data actually contains. It
 * never synthesises a risk level, a point count or an anonymized record.
 */

export interface PreparationDocumentIdentity {
  id: string;
}

/**
 * Default preparation document:
 *   1. the first active document, when at least one exists;
 *   2. otherwise the first document in the list.
 * Returns null only when there is no document at all.
 */
export function resolveDefaultPreparationDocumentId(
  documents: PreparationDocumentIdentity[],
  activeDocuments: PreparationDocumentIdentity[],
): string | null {
  if (!documents || documents.length === 0) return null;
  const activeIds = new Set((activeDocuments || []).map((doc) => doc.id));
  const firstActive = documents.find((doc) => activeIds.has(doc.id));
  return (firstActive ?? documents[0]).id;
}

export interface AnonymousDocumentLike {
  createdAt: string;
  redactedText: string;
  redactedItems?: unknown[] | null;
}

/**
 * The newest working anonymous document is authoritative. Returns null when the
 * list is empty; an unparseable `createdAt` sorts last rather than crashing.
 */
export function pickLatestAnonymousDocument<T extends AnonymousDocumentLike>(
  items: T[] | null | undefined,
): T | null {
  if (!items || items.length === 0) return null;
  const timeOf = (value: string): number => {
    const parsed = Date.parse(value);
    return Number.isNaN(parsed) ? 0 : parsed;
  };
  return items.reduce((latest, item) => (timeOf(item.createdAt) > timeOf(latest.createdAt) ? item : latest), items[0]);
}

/** Safe redacted-item count for display; null when the payload has no array. */
export function redactedItemCount(item: AnonymousDocumentLike | null | undefined): number | null {
  if (!item || !Array.isArray(item.redactedItems)) return null;
  return item.redactedItems.length;
}

export interface LegalAnalysisLike {
  riskMatrixDetected: boolean;
  updatedAt?: string | null;
}

export interface RiskMatrixSummary {
  hasMatrix: boolean;
  latestUpdatedAt: string | null;
}

/**
 * Truthful risk-matrix state. A matrix exists only when a persisted record
 * carries `riskMatrixDetected === true`. No text is parsed client-side and no
 * risk level / count is ever derived.
 */
export function summarizeRiskMatrix(analyses: LegalAnalysisLike[] | null | undefined): RiskMatrixSummary {
  const withMatrix = (analyses || []).filter((analysis) => analysis.riskMatrixDetected === true);
  if (withMatrix.length === 0) return { hasMatrix: false, latestUpdatedAt: null };
  const timeOf = (value: string | null | undefined): number => {
    if (!value) return 0;
    const parsed = Date.parse(value);
    return Number.isNaN(parsed) ? 0 : parsed;
  };
  const latest = withMatrix.reduce(
    (best, analysis) => (timeOf(analysis.updatedAt) > timeOf(best.updatedAt) ? analysis : best),
    withMatrix[0],
  );
  return { hasMatrix: true, latestUpdatedAt: latest.updatedAt ?? null };
}

export interface ActivityLike {
  objectId: string | null;
  occurredAt: string;
  actionLabel?: string;
}

/**
 * Most recent case activity whose object is the selected document, when the
 * activity feed exposes a matching objectId. Returns null otherwise so the
 * caller can fall back to a truthful document fact (upload timestamp).
 */
export function latestDocumentActivity<T extends ActivityLike>(
  activity: T[] | null | undefined,
  documentId: string,
): T | null {
  const matches = (activity || []).filter((entry) => entry.objectId === documentId);
  if (matches.length === 0) return null;
  const timeOf = (value: string): number => {
    const parsed = Date.parse(value);
    return Number.isNaN(parsed) ? 0 : parsed;
  };
  return matches.reduce((latest, entry) => (timeOf(entry.occurredAt) > timeOf(latest.occurredAt) ? entry : latest), matches[0]);
}

export const DOCUMENT_DELETE_DEPENDENCY_MESSAGE =
  "A dokumentum kapcsolódó munkafolyamat miatt nem törölhető.";
export const DOCUMENT_DELETE_FORBIDDEN_MESSAGE = "Nincs jogosultságod a dokumentum törléséhez.";
export const DOCUMENT_DELETE_NOT_FOUND_MESSAGE = "A dokumentum nem található vagy már törölték.";
export const DOCUMENT_DELETE_STORAGE_MESSAGE =
  "A SharePoint-törlés nem sikerült, ezért az adatbázis nem módosult.";
export const DOCUMENT_DELETE_GENERIC_MESSAGE =
  "A dokumentum törlése nem sikerült. Próbáld újra később.";

/** Human, non-technical delete failure message keyed by the canonical HTTP status. */
export function documentDeleteErrorMessage(status: number | null | undefined): string {
  switch (status) {
    case 409: return DOCUMENT_DELETE_DEPENDENCY_MESSAGE;
    case 403: return DOCUMENT_DELETE_FORBIDDEN_MESSAGE;
    case 404: return DOCUMENT_DELETE_NOT_FOUND_MESSAGE;
    case 502: return DOCUMENT_DELETE_STORAGE_MESSAGE;
    default: return DOCUMENT_DELETE_GENERIC_MESSAGE;
  }
}

export const CLIPBOARD_COPY_FAILURE_MESSAGE =
  "Nem sikerült a vágólapra másolni. Jelöld ki és másold kézzel.";

export interface ClipboardLike {
  writeText(text: string): Promise<void>;
}

/**
 * Write `text` to the clipboard and report whether it actually resolved. The
 * caller must not claim a successful copy until this returns true.
 */
export async function copyTextToClipboard(
  text: string,
  clipboard?: ClipboardLike | null,
): Promise<boolean> {
  const target = clipboard ?? (typeof navigator !== "undefined" ? navigator.clipboard : undefined);
  if (!target || !text) return false;
  try {
    await target.writeText(text);
    return true;
  } catch {
    return false;
  }
}
