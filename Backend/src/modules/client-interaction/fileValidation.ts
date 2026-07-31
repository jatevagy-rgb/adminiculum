/**
 * Client-upload file validation (Phase 9). Pure, dependency-free checks:
 * magic-byte type detection, declared-vs-detected MIME/extension comparison,
 * size bounds, and rejection of unsafe/executable/polyglot content. The
 * browser-declared MIME type is never trusted for acceptance decisions.
 */

export const DEFAULT_MAX_FILE_BYTES = 25 * 1024 * 1024; // 25 MB per file
export const DEFAULT_MAX_TOTAL_BYTES = 60 * 1024 * 1024; // 60 MB per submission

/** MIME types a client upload may carry. */
export const ACCEPTED_UPLOAD_MIME = new Set([
  'application/pdf',
  'image/jpeg',
  'image/png',
  'image/heic',
  'image/heif',
]);

const EXT_TO_MIME: Record<string, string> = {
  pdf: 'application/pdf',
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  png: 'image/png',
  heic: 'image/heic',
  heif: 'image/heif',
};

function startsWith(buf: Buffer, bytes: number[], offset = 0): boolean {
  if (buf.length < offset + bytes.length) return false;
  for (let i = 0; i < bytes.length; i++) if (buf[offset + i] !== bytes[i]) return false;
  return true;
}

/** Detect a MIME type from magic bytes. Returns null when unknown/unsafe. */
export function detectMimeFromMagicBytes(buf: Buffer): string | null {
  if (!buf || buf.length < 4) return null;
  if (startsWith(buf, [0x25, 0x50, 0x44, 0x46])) return 'application/pdf'; // %PDF
  if (startsWith(buf, [0xff, 0xd8, 0xff])) return 'image/jpeg';
  if (startsWith(buf, [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])) return 'image/png';
  // ISO-BMFF (HEIC/HEIF): 'ftyp' at offset 4, brand at offset 8
  if (buf.length >= 12 && startsWith(buf, [0x66, 0x74, 0x79, 0x70], 4)) {
    const brand = buf.slice(8, 12).toString('ascii');
    if (['heic', 'heix', 'heif', 'mif1', 'msf1', 'hevc', 'hevx'].includes(brand)) return 'image/heic';
  }
  return null;
}

/** True for content that must never be accepted (script/markup/polyglot). */
export function looksUnsafe(buf: Buffer): boolean {
  if (!buf || buf.length === 0) return true;
  const head = buf.slice(0, 512).toString('utf8').trimStart().toLowerCase();
  if (head.startsWith('<?xml') || head.startsWith('<svg') || head.startsWith('<!doctype') || head.startsWith('<html') || head.includes('<script')) return true;
  if (startsWith(buf, [0x4d, 0x5a])) return true; // MZ (PE/EXE)
  if (startsWith(buf, [0x7f, 0x45, 0x4c, 0x46])) return true; // ELF
  return false;
}

export interface FileValidationInput {
  buffer: Buffer;
  declaredMimeType?: string | null;
  originalFileName: string;
  maxFileBytes?: number;
  acceptedMime?: Set<string>;
}

export interface FileValidationResult {
  ok: boolean;
  detectedMimeType: string | null;
  sizeBytes: number;
  codeSafe: string;
}

function extOf(name: string): string {
  const m = /\.([a-z0-9]+)$/i.exec(String(name || '').toLowerCase());
  return m ? m[1] : '';
}

/**
 * Validate a single uploaded file. Returns ok=false with a bounded codeSafe on
 * any rejection. Never trusts declaredMimeType alone.
 */
export function validateUploadFile(input: FileValidationInput): FileValidationResult {
  const buf = input.buffer;
  const sizeBytes = buf ? buf.length : 0;
  const accepted = input.acceptedMime || ACCEPTED_UPLOAD_MIME;
  const maxBytes = input.maxFileBytes ?? DEFAULT_MAX_FILE_BYTES;
  const detected = detectMimeFromMagicBytes(buf);

  if (sizeBytes === 0) return { ok: false, detectedMimeType: null, sizeBytes, codeSafe: 'EMPTY_FILE' };
  if (sizeBytes > maxBytes) return { ok: false, detectedMimeType: detected, sizeBytes, codeSafe: 'FILE_TOO_LARGE' };
  if (looksUnsafe(buf)) return { ok: false, detectedMimeType: detected, sizeBytes, codeSafe: 'UNSAFE_CONTENT' };
  if (!detected) return { ok: false, detectedMimeType: null, sizeBytes, codeSafe: 'UNSUPPORTED_TYPE' };
  if (!accepted.has(detected)) return { ok: false, detectedMimeType: detected, sizeBytes, codeSafe: 'UNSUPPORTED_TYPE' };

  // Extension must be consistent with the detected content (jpg/jpeg both map to jpeg).
  const ext = extOf(input.originalFileName);
  const extMime = EXT_TO_MIME[ext];
  if (extMime && extMime !== detected) return { ok: false, detectedMimeType: detected, sizeBytes, codeSafe: 'EXTENSION_MISMATCH' };

  return { ok: true, detectedMimeType: detected, sizeBytes, codeSafe: 'OK' };
}
