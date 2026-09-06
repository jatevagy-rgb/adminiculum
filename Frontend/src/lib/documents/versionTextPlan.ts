/**
 * Read-only preview text plan for the immutable-version surface.
 *
 * The annotation surface is DocumentVersion-scoped:
 *   - VERSION_BLOB — TXT versions render their exact stored bytes via
 *     `downloadDocumentVersion(...)` and remain the only TEXT_RANGE anchor
 *     source (offsets/fingerprints are version-true).
 *   - DOCUMENT_TEXT — the CURRENT version of an uploaded non-TXT document may
 *     show the document-level extracted text (`GET /documents/:id/text`) as a
 *     READ-ONLY preview. The endpoint reads the document's current SharePoint
 *     item, and `promote-current` keeps that pointer in sync with `isCurrent`,
 *     so document-level text is only meaningful for the current version. It is
 *     never an annotation anchor source and is never substituted for a
 *     non-current version's stored content.
 *   - NONE — keep the truthful placeholder (no selected version, a non-current
 *     version without proven version-scoped text, a selection that has not yet
 *     reconciled to the selected document, or a non-uploaded document).
 */
export type VersionTextPlan = 'VERSION_BLOB' | 'DOCUMENT_TEXT' | 'NONE';

export function resolveVersionTextPlan(input: {
  hasSelectedVersion: boolean;
  fileType: string | null | undefined;
  versionIsCurrent: boolean;
  versionBelongsToSelectedDocument: boolean;
  documentIsUploaded: boolean;
}): VersionTextPlan {
  if (!input.hasSelectedVersion) return 'NONE';
  if (input.fileType === 'TXT') return 'VERSION_BLOB';
  if (
    input.documentIsUploaded &&
    input.versionIsCurrent &&
    input.versionBelongsToSelectedDocument
  ) {
    return 'DOCUMENT_TEXT';
  }
  return 'NONE';
}
