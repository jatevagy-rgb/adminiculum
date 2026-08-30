/**
 * Authoritative version-text provider (STRUCTURED-DOC-COMPARISON-1, Phase 4).
 *
 * Comparison may only run over text we can stand behind. Reuses the canonical
 * textExtractor pipeline for DOCX (Mammoth), PDF (pdf-parse), and plain text formats.
 * For unsupported/binary/empty/oversized formats, returns an explicit typed reason
 * code rather than fabricated text or geometry.
 *
 * Pure/decoupled: the async resolver takes its download capability as a
 * dependency so the classification and decoding are unit-testable without
 * storage or a database, and no storage identifier or full content is ever
 * logged or returned.
 */
import {
  extractText,
} from '../textExtractor';

/** Bump when extraction changes in a way that alters canonical text. */
export const EXTRACTION_REVISION = 2;

/** Maximum allowed input buffer size in bytes for structured comparison (2 MB). */
export const COMPARISON_INPUT_MAX = 2_000_000;

/** Maximum allowed extracted text length in characters for structured comparison (400,000 chars). */
export const COMPARISON_EXTRACTED_TEXT_MAX = 400_000;

/** Backwards-compatible aliases */
export const MAX_EXTRACT_BYTES = COMPARISON_INPUT_MAX;
export const MAX_EXTRACTED_TEXT_CHARS = COMPARISON_EXTRACTED_TEXT_MAX;

export interface VersionTextResult {
  supported: boolean;
  text: string | null;
  /** Safe machine-readable reason when unsupported/failed (never leaks paths). */
  reasonCode: string | null;
  extractionRevision: number;
}

/** True for formats whose stored bytes or structure support authoritative plain text extraction for comparison. */
export function isTextExtractable(mimeType: string | null | undefined, fileName: string | null | undefined): boolean {
  const mt = (mimeType || '').toLowerCase().trim();
  const ext = (fileName || '').toLowerCase().split('.').pop() || '';

  // Explicitly reject unsupported legacy .doc, html, and rtf for comparison
  if (mt === 'application/msword' || ext === 'doc') return false;
  if (mt === 'text/html' || ext === 'html' || ext === 'htm') return false;
  if (mt === 'application/rtf' || mt === 'text/rtf' || ext === 'rtf') return false;

  // Allow DOCX
  if (mt === 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' || ext === 'docx') return true;

  // Allow PDF
  if (mt === 'application/pdf' || ext === 'pdf') return true;

  // Allow plain text formats: txt, md, csv
  if (mt === 'text/plain' || mt === 'text/csv' || mt === 'text/markdown') return true;
  if (ext === 'txt' || ext === 'md' || ext === 'csv') return true;

  return false;
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
  const unsupported = (reasonCode: string): VersionTextResult => ({
    supported: false,
    text: null,
    reasonCode,
    extractionRevision: EXTRACTION_REVISION,
  });

  if (!isTextExtractable(version.mimeType, version.originalFileName)) {
    return unsupported('FORMAT_NOT_TEXT_EXTRACTABLE');
  }
  if (version.size != null && version.size > COMPARISON_INPUT_MAX) {
    return unsupported('CONTENT_TOO_LARGE');
  }
  let buf: Buffer | null;
  try {
    buf = await download(version.documentId, version.id);
  } catch {
    return unsupported('EXTRACTION_FAILED');
  }
  if (!buf) return unsupported('CONTENT_UNAVAILABLE');
  if (buf.byteLength > COMPARISON_INPUT_MAX) return unsupported('CONTENT_TOO_LARGE');

  try {
    const extraction = await extractText(
      buf,
      version.mimeType || 'application/octet-stream',
      version.originalFileName || undefined,
      { maxBytes: COMPARISON_INPUT_MAX, maxChars: COMPARISON_EXTRACTED_TEXT_MAX }
    );

    if (!extraction.success) {
      return unsupported(extraction.reasonCode || 'EXTRACTION_FAILED');
    }

    if (!extraction.text || !extraction.text.trim()) {
      return unsupported('NO_EXTRACTABLE_TEXT');
    }

    if (extraction.text.length > COMPARISON_EXTRACTED_TEXT_MAX) {
      return unsupported('CONTENT_TOO_LARGE');
    }

    return {
      supported: true,
      text: extraction.text,
      reasonCode: null,
      extractionRevision: EXTRACTION_REVISION,
    };
  } catch {
    return unsupported('EXTRACTION_FAILED');
  }
}
