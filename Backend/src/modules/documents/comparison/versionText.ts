/**
 * Authoritative version-text provider (STRUCTURED-DOC-COMPARISON-1, Phase 4).
 *
 * Comparison may only run over text we can stand behind. For TXT that is the
 * stored version content decoded as UTF-8; for PDF/DOCX there is no authoritative
 * extracted-text source in Adminiculum today, so those return UNSUPPORTED with a
 * concise reason rather than fabricated text or geometry.
 *
 * Pure/decoupled: the async resolver takes its download capability as a
 * dependency so the classification and decoding are unit-testable without
 * storage or a database, and no storage identifier or full content is ever
 * logged or returned.
 */

/** Bump when extraction changes in a way that alters canonical text. */
export const EXTRACTION_REVISION = 1;

/** Refuse to extract absurdly large blobs as "text". */
export const MAX_EXTRACT_BYTES = 2_000_000;

export interface VersionTextResult {
  supported: boolean;
  text: string | null;
  /** Safe machine-readable reason when unsupported/failed (never leaks paths). */
  reasonCode: string | null;
  extractionRevision: number;
}

/** True only for formats whose stored bytes are authoritative plain text. */
export function isTextExtractable(mimeType: string | null | undefined, fileName: string | null | undefined): boolean {
  const mt = (mimeType || '').toLowerCase();
  if (mt.startsWith('text/')) return true;
  if (mt === 'application/json' || mt === 'application/xml') return true;
  const ext = (fileName || '').toLowerCase().split('.').pop() || '';
  return ext === 'txt' || ext === 'md' || ext === 'csv';
}

/** Decode a text buffer as UTF-8, stripping a BOM. No normalization here — the engine owns that. */
export function decodeTextBuffer(buf: Buffer): string {
  let s = buf.toString('utf8');
  if (s.charCodeAt(0) === 0xfeff) s = s.slice(1);
  return s;
}

export interface VersionMeta {
  id: string;
  documentId: string;
  mimeType: string | null;
  originalFileName: string | null;
  size: number | null;
}

/**
 * Resolve authoritative text for a version. `download` returns the raw bytes for
 * a (documentId, versionId) or null/error; ownership/authorization is enforced by
 * the caller before this runs.
 */
export async function resolveVersionText(
  version: VersionMeta,
  download: (documentId: string, versionId: string) => Promise<Buffer | null>,
): Promise<VersionTextResult> {
  const unsupported = (reasonCode: string): VersionTextResult => ({ supported: false, text: null, reasonCode, extractionRevision: EXTRACTION_REVISION });

  if (!isTextExtractable(version.mimeType, version.originalFileName)) {
    return unsupported('FORMAT_NOT_TEXT_EXTRACTABLE');
  }
  if (version.size != null && version.size > MAX_EXTRACT_BYTES) {
    return unsupported('CONTENT_TOO_LARGE');
  }
  let buf: Buffer | null;
  try {
    buf = await download(version.documentId, version.id);
  } catch {
    return unsupported('EXTRACTION_FAILED');
  }
  if (!buf) return unsupported('CONTENT_UNAVAILABLE');
  if (buf.byteLength > MAX_EXTRACT_BYTES) return unsupported('CONTENT_TOO_LARGE');
  return { supported: true, text: decodeTextBuffer(buf), reasonCode: null, extractionRevision: EXTRACTION_REVISION };
}
