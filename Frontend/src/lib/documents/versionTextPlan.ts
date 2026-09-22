/**
 * Read-only preview text plan for the immutable-version surface.
 *
 * The annotation surface is DocumentVersion-scoped, and eligibility is a
 * precondition for EVERY plan: a version that has not yet reconciled to the
 * selected document (the versions list still holds the previous document's
 * versions during a switch) must never drive any fetch — including the TXT
 * blob or version-text API path — or the old document's bytes/text could flash
 * on the new document's surface.
 *
 *   - VERSION_TEXT — the exact selected version's own extracted text, read from
 *     that version's own storage via `GET /documents/:id/versions/:versionId/text`.
 *     This is the canonical version-scoped channel for DOCX/PDF (and any other
 *     text-extractable immutable format). Offsets/fingerprints built from it are
 *     version-true. Never substituted with the current/latest version.
 *   - VERSION_BLOB — TXT versions render their exact stored bytes via
 *     `downloadDocumentVersion(...)`; the raw bytes remain the source of truth
 *     for plain text without going through the extractor.
 *   - DOCUMENT_TEXT — the CURRENT version of an uploaded non-text-extractable
 *     document may show the document-level extracted text
 *     (`GET /documents/:id/text`) as a READ-ONLY preview. That endpoint reads the
 *     document's current SharePoint item and `promote-current` keeps that
 *     pointer in sync with `isCurrent`, so it is only meaningful for the current
 *     version. It is never an annotation anchor source and is never substituted
 *     for a non-current version's stored content.
 *   - NONE — keep the truthful placeholder (no selected version, a selection that
 *     has not yet reconciled to the selected document, a non-uploaded/working
 *     copy, or a non-current version without proven version-scoped text).
 */
export type VersionTextPlan = 'VERSION_TEXT' | 'VERSION_BLOB' | 'DOCUMENT_TEXT' | 'NONE';

/** True when the plan reads the exact selected version's own content. */
export function isVersionScopedTextPlan(plan: VersionTextPlan): boolean {
  return plan === 'VERSION_TEXT' || plan === 'VERSION_BLOB';
}

/**
 * Formats whose exact version text is available through the canonical
 * version-text endpoint (same DOCX/PDF/TXT set the shared backend extractor
 * supports). TXT deliberately stays on VERSION_BLOB: its stored bytes are plain
 * text already and need no server-side extraction.
 */
const VERSION_TEXT_FORMATS = new Set(['DOCX', 'PDF']);

export function resolveVersionTextPlan(input: {
  hasSelectedVersion: boolean;
  fileType: string | null | undefined;
  versionIsCurrent: boolean;
  versionBelongsToSelectedDocument: boolean;
  documentIsUploaded: boolean;
}): VersionTextPlan {
  if (!input.hasSelectedVersion) return 'NONE';
  if (!input.versionBelongsToSelectedDocument) return 'NONE';
  if (input.fileType === 'TXT') return 'VERSION_BLOB';
  if (!input.documentIsUploaded) return 'NONE';
  if (input.fileType && VERSION_TEXT_FORMATS.has(input.fileType)) return 'VERSION_TEXT';
  if (input.versionIsCurrent) return 'DOCUMENT_TEXT';
  return 'NONE';
}
