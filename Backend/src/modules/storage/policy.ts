/**
 * DW0 — upload policy.
 *
 * Single source of truth for byte transport limits so the frontend and backend
 * agree on what can be accepted before memory expansion. Transport remains
 * JSON/base64 for DW0; streaming is intentionally deferred.
 *
 *   MAX_DOCUMENT_UPLOAD_BYTES  : effective DECODED binary cap (25 MiB).
 *   BASE64_ENVELOPE_BYTES      : base64 of that binary (4/3 of decoded) plus a
 *                                small JSON safety margin.
 *   EXPRESS_JSON_BODY_LIMIT    : the current Express json limit (≈50 MiB).
 *
 * The decoded 25 MiB cap must stay below the Express JSON body limit so the
 * request is rejected by our explicit check (413) before the JSON parser, and
 * never silently truncated by the body limit.
 */

export const DW0_MAX_DOCUMENT_UPLOAD_BYTES = 25 * 1024 * 1024; // 25 MiB decoded

/** base64(25 MiB) = ceil(25 MiB * 4/3) = 34,952,789 bytes ≈ 33.3 MiB. */
export const DW0_BASE64_ENVELOPE_BYTES = Math.ceil((DW0_MAX_DOCUMENT_UPLOAD_BYTES * 4) / 3);

/** Approximate JSON envelope = base64 + field name + a few hundred bytes slack. */
export const DW0_JSON_ENVELOPE_BYTES = DW0_BASE64_ENVELOPE_BYTES + 4096;

/**
 * True only if the current binary cap fits safely inside a given Express JSON
 * body limit (default ≈ 50 MiB). If it ever stops being true, reduce the binary
 * cap or raise the body limit — never let a request silently truncate.
 */
export function binaryCapFitsJsonBodyLimit(expressJsonBodyLimitBytes: number, binaryCap = DW0_MAX_DOCUMENT_UPLOAD_BYTES): boolean {
  return DW0_JSON_ENVELOPE_BYTES <= expressJsonBodyLimitBytes;
}

/**
 * Opaque binary evidence package support.
 *
 * ZIP is accepted as an OPAQUE byte artifact: no extraction, no indexing, no
 * archive traversal, no member processing. It is subject to the same global
 * size cap as DOCX/PDF.
 */
export const DW0_ALLOWED_UPLOAD_EXTENSIONS: Record<string, Set<string>> = {
  '.pdf': new Set(['application/pdf']),
  '.doc': new Set(['application/msword', 'application/octet-stream']),
  '.docx': new Set([
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    'application/zip',
    'application/octet-stream',
  ]),
  '.zip': new Set(['application/zip', 'application/x-zip-compressed', 'application/octet-stream']),
  '.txt': new Set(['text/plain', 'application/octet-stream']),
};

export const DW0_MAX_UPLOAD_FILENAME_LENGTH = 180;