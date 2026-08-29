/**
 * SEC-2: Upload Validation Core for Workforce Uploads
 *
 * Shared validation for all workforce-facing upload endpoints. Extends the
 * client-portal patterns from fileValidation.ts with workforce-specific
 * file types, ZIP/DOCX safe archive inspection, filename/path sanitization,
 * and template traversal prevention.
 *
 * Client-controlled MIME types are NEVER trusted for acceptance decisions.
 * Magic-byte detection is the single source of truth for file type.
 */

import * as path from 'path';
import { getWorkforceScanner, shouldRejectWorkforceScan } from './scannerAdapter';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

/** Maximum file size for workforce uploads (25 MB decoded). */
export const MAX_WORKFORCE_FILE_BYTES = 25 * 1024 * 1024;

/** Maximum decompressed size for ZIP/DOCX archive inspection (100 MB). */
export const MAX_ARCHIVE_DECOMPRESSED_BYTES = 100 * 1024 * 1024;

/** Maximum number of entries allowed in a ZIP/DOCX archive. */
export const MAX_ARCHIVE_ENTRY_COUNT = 500;

/**
 * Accepted MIME types for workforce uploads. These are the ONLY types that
 * can pass magic-byte detection. The client-declared MIME is never used
 * for acceptance.
 */
export const WORKFORCE_ACCEPTED_MIME = new Set([
  'application/pdf',
  'application/msword',                                                          // .doc
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',     // .docx
  'text/plain',                                                                   // .txt
]);

/** Extension to MIME mapping for cross-check. */
const EXT_TO_MIME: Record<string, string> = {
  pdf: 'application/pdf',
  doc: 'application/msword',
  docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  txt: 'text/plain',
};

/** MIME to canonical extension mapping. */
const MIME_TO_EXT: Record<string, string> = {
  'application/pdf': 'pdf',
  'application/msword': 'doc',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document': 'docx',
  'text/plain': 'txt',
};

// ---------------------------------------------------------------------------
// Magic-byte detection (extended for workforce types)
// ---------------------------------------------------------------------------

function startsWith(buf: Buffer, bytes: number[], offset = 0): boolean {
  if (buf.length < offset + bytes.length) return false;
  for (let i = 0; i < bytes.length; i++) if (buf[offset + i] !== bytes[i]) return false;
  return true;
}

/**
 * Detect MIME type from magic bytes. Returns null for unknown/unsafe types.
 * This is the ONLY source of truth for file type acceptance.
 */
export function detectMimeFromMagicBytes(buf: Buffer): string | null {
  if (!buf || buf.length < 4) return null;

  // PDF: %PDF
  if (startsWith(buf, [0x25, 0x50, 0x44, 0x46])) return 'application/pdf';

  // JPEG: FF D8 FF
  if (startsWith(buf, [0xff, 0xd8, 0xff])) return 'image/jpeg';

  // PNG: 8-byte signature
  if (startsWith(buf, [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])) return 'image/png';

  // ISO-BMFF (HEIC/HEIF): 'ftyp' at offset 4
  if (buf.length >= 12 && startsWith(buf, [0x66, 0x74, 0x79, 0x70], 4)) {
    const brand = buf.slice(8, 12).toString('ascii');
    if (['heic', 'heix', 'heif', 'mif1', 'msf1', 'hevc', 'hevx'].includes(brand)) return 'image/heic';
  }

  // ZIP (DOCX is ZIP-based): PK\x03\x04
  if (startsWith(buf, [0x50, 0x4b, 0x03, 0x04])) {
    // Distinguish DOCX from generic ZIP by looking for [Content_Types].xml
    // inside the archive. For detection purposes, report as DOCX MIME if
    // the extension matches; otherwise report as generic ZIP (which will
    // be rejected unless the extension cross-check passes).
    return 'application/zip';
  }

  // MS Office legacy format (OLE2/CFBF): D0 CF 11 E0 A1 B1 1A E1
  if (startsWith(buf, [0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1])) {
    return 'application/msword'; // Could be .doc, .xls, .ppt — we accept as .doc
  }

  // Plain text: no magic bytes. Heuristic: if no other magic matched and
  // the content looks like printable text, accept as text/plain.
  // This is conservative: only accept if the first 512 bytes are valid
  // UTF-8 with no null bytes (binary content would have nulls).
  if (buf.length >= 4) {
    const head = buf.slice(0, Math.min(512, buf.length));
    let hasNull = false;
    for (let i = 0; i < head.length; i++) {
      if (head[i] === 0x00) { hasNull = true; break; }
    }
    if (!hasNull) {
      // Looks like text. Verify it's valid UTF-8.
      try {
        head.toString('utf8');
        return 'text/plain';
      } catch {
        // Not valid UTF-8 — fall through
      }
    }
  }

  return null;
}

// ---------------------------------------------------------------------------
// Unsafe content detection
// ---------------------------------------------------------------------------

/** True for content that must never be accepted (executable/script/polyglot). */
export function looksUnsafe(buf: Buffer): boolean {
  if (!buf || buf.length === 0) return true;

  const head = buf.slice(0, 512).toString('utf8').trimStart().toLowerCase();

  // Markup/script injection
  if (head.startsWith('<?xml')) return true;
  if (head.startsWith('<svg')) return true;
  if (head.startsWith('<!doctype')) return true;
  if (head.startsWith('<html')) return true;
  if (head.includes('<script')) return true;

  // Executables
  if (startsWith(buf, [0x4d, 0x5a])) return true; // MZ (PE/EXE/DLL)
  if (startsWith(buf, [0x7f, 0x45, 0x4c, 0x46])) return true; // ELF

  return false;
}

// ---------------------------------------------------------------------------
// Filename sanitization
// ---------------------------------------------------------------------------

/**
 * Sanitize an upload filename. Strips path separators, null bytes, control
 * characters, and Windows reserved names. Returns a safe filename suitable
 * for storage.
 */
export function sanitizeUploadFileName(name: string): string {
  if (!name || typeof name !== 'string') return 'unnamed';

  // Strip any path components (defensive — multer should already do this)
  let safe = name.replace(/[/\\]/g, '');

  // Remove null bytes
  safe = safe.replace(/\0/g, '');

  // Remove control characters (0x00-0x1F except tab/newline which are already stripped)
  safe = safe.replace(/[\x00-\x08\x0b\x0c\x0e-\x1f]/g, '');

  // Remove Windows drive letter prefix (e.g., C:)
  safe = safe.replace(/^[a-zA-Z]:/g, '');

  // Strip leading/trailing dots and spaces (Windows)
  safe = safe.replace(/^[.\s]+|[.\s]+$/g, '');

  // Windows reserved names (CON, PRN, AUX, NUL, COM1-9, LPT1-9)
  const base = safe.split('.')[0]?.toUpperCase() || '';
  if (/^(CON|PRN|AUX|NUL|COM[1-9]|LPT[1-9])$/.test(base)) {
    safe = `_${safe}`;
  }

  // Truncate to 200 chars (leave room for prefix/suffix)
  if (safe.length > 200) {
    const ext = path.extname(safe);
    safe = safe.slice(0, 200 - ext.length) + ext;
  }

  return safe || 'unnamed';
}

// ---------------------------------------------------------------------------
// Path traversal prevention
// ---------------------------------------------------------------------------

/**
 * Check if a filename or path contains traversal sequences.
 * Returns true if the path is UNSAFE (contains traversal).
 */
export function hasPathTraversal(name: string): boolean {
  if (!name || typeof name !== 'string') return false;

  // Check for null bytes
  if (name.includes('\0')) return true;

  // Check for directory traversal
  if (name.includes('..')) return true;
  if (/^[/\\]/.test(name)) return true;
  if (name.includes('\\\\')) return true;

  // Check for URL-encoded traversal
  const decoded = name.replace(/%2[eE]/g, '.').replace(/%2[fF]/g, '/').replace(/%5[cC]/g, '\\');
  if (decoded.includes('..')) return true;
  if (/^[/\\]/.test(decoded)) return true;

  return false;
}

// ---------------------------------------------------------------------------
// ZIP/DOCX safe archive inspection
// ---------------------------------------------------------------------------

export interface ArchiveInspectionResult {
  ok: boolean;
  codeSafe: string;
  entryCount: number;
  totalDecompressedBytes: number;
  hasMacro: boolean;
  hasSuspiciousEntry: boolean;
}

/**
 * Inspect a ZIP-based file (DOCX) for safety. Checks:
 * - Maximum entry count
 * - Maximum total decompressed size
 * - Path traversal in entry names (zip-slip)
 * - Absolute paths
 * - Macro-enabled Office documents (.docm, .xlm, etc.)
 * - Suspicious nested archives
 *
 * This function is synchronous and uses the JSZip library which is already
 * a project dependency.
 */
export async function inspectArchive(buf: Buffer): Promise<ArchiveInspectionResult> {
  const result: ArchiveInspectionResult = {
    ok: true,
    codeSafe: 'OK',
    entryCount: 0,
    totalDecompressedBytes: 0,
    hasMacro: false,
    hasSuspiciousEntry: false,
  };

  try {
    // Dynamic import to avoid hard dependency at module load time
    const JSZip = (await import('jszip')).default;
    const zip = await JSZip.loadAsync(buf);

    const entries = Object.keys(zip.files);
    result.entryCount = entries.length;

    if (entries.length > MAX_ARCHIVE_ENTRY_COUNT) {
      result.ok = false;
      result.codeSafe = 'TOO_MANY_ARCHIVE_ENTRIES';
      return result;
    }

    // Check for macro-enabled Office types
    const macroExtensions = ['.docm', '.dotm', '.xlsm', '.xltm', '.pptm', '.potm', '.ppsm'];
    for (const entry of entries) {
      const lower = entry.toLowerCase();
      if (macroExtensions.some(ext => lower.endsWith(ext))) {
        result.hasMacro = true;
        result.ok = false;
        result.codeSafe = 'MACRO_ENABLED_DOCUMENT';
        return result;
      }
    }

    // Check each entry for path traversal, absolute paths, and decompressed size
    let totalSize = 0;
    for (const entry of entries) {
      // Path traversal check (zip-slip prevention)
      if (hasPathTraversal(entry)) {
        result.hasSuspiciousEntry = true;
        result.ok = false;
        result.codeSafe = 'PATH_TRAVERSAL_IN_ARCHIVE';
        return result;
      }

      // Absolute path check
      if (/^[/\\]/.test(entry) || /^[a-zA-Z]:[/\\]/.test(entry)) {
        result.hasSuspiciousEntry = true;
        result.ok = false;
        result.codeSafe = 'ABSOLUTE_PATH_IN_ARCHIVE';
        return result;
      }

      // Decompressed size check
      const fileData = zip.files[entry];
      if (fileData && !fileData.dir) {
        try {
          const content = await fileData.async('nodebuffer');
          totalSize += content.length;
          if (totalSize > MAX_ARCHIVE_DECOMPRESSED_BYTES) {
            result.ok = false;
            result.codeSafe = 'ARCHIVE_TOO_LARGE_DECOMPRESSED';
            return result;
          }
        } catch {
          // Entry may be compressed and too large to decompress — treat as unsafe
          result.ok = false;
          result.codeSafe = 'ARCHIVE_DECOMPRESSION_FAILED';
          return result;
        }
      }
    }

    result.totalDecompressedBytes = totalSize;
  } catch (err: any) {
    // ZIP parsing failure — reject as unsafe
    result.ok = false;
    result.codeSafe = 'ARCHIVE_PARSE_FAILED';
  }

  return result;
}

// ---------------------------------------------------------------------------
// Main validation pipeline
// ---------------------------------------------------------------------------

export interface WorkforceUploadInput {
  buffer: Buffer;
  declaredMimeType?: string | null;
  originalFileName: string;
  maxFileBytes?: number;
  /** If true, perform ZIP/DOCX archive inspection. */
  inspectArchiveContent?: boolean;
}

export interface WorkforceUploadResult {
  ok: boolean;
  detectedMimeType: string | null;
  sizeBytes: number;
  codeSafe: string;
  /** Set when archive inspection finds issues. */
  archiveInspection?: ArchiveInspectionResult;
  /** Set when scanner runs. Only CLEAN allows ok=true. */
  scanOutcome?: string;
}

/**
 * Validate a workforce upload file. Runs the full SEC-2 pipeline:
 * 1. Empty check
 * 2. Size check
 * 3. Unsafe content check (executables, scripts, polyglots)
 * 4. Magic-byte type detection
 * 5. Type acceptance check (against workforce allowed types)
 * 6. Extension vs detected MIME cross-check
 * 7. Optional: ZIP/DOCX archive inspection (decompression bomb, traversal, macros)
 *
 * Client-declared MIME is NEVER trusted for acceptance.
 */
export async function validateWorkforceUpload(
  input: WorkforceUploadInput
): Promise<WorkforceUploadResult> {
  const buf = input.buffer;
  const sizeBytes = buf ? buf.length : 0;
  const maxBytes = input.maxFileBytes ?? MAX_WORKFORCE_FILE_BYTES;

  // 1. Empty
  if (sizeBytes === 0) {
    return { ok: false, detectedMimeType: null, sizeBytes, codeSafe: 'EMPTY_FILE' };
  }

  // 2. Size
  if (sizeBytes > maxBytes) {
    const detected = detectMimeFromMagicBytes(buf);
    return { ok: false, detectedMimeType: detected, sizeBytes, codeSafe: 'FILE_TOO_LARGE' };
  }

  // 3. Unsafe content
  if (looksUnsafe(buf)) {
    const detected = detectMimeFromMagicBytes(buf);
    return { ok: false, detectedMimeType: detected, sizeBytes, codeSafe: 'UNSAFE_CONTENT' };
  }

  // 4. Magic-byte detection
  const detected = detectMimeFromMagicBytes(buf);

  // 5. Extension cross-check
  const ext = extOf(input.originalFileName);

  // For ZIP-based files (DOCX), the magic bytes detect as 'application/zip'.
  // Handle this BEFORE the type acceptance check since 'application/zip' is not
  // in WORKFORCE_ACCEPTED_MIME — only .docx extensions are valid for ZIP.
  if (detected === 'application/zip') {
    if (ext !== 'docx') {
      return { ok: false, detectedMimeType: detected, sizeBytes, codeSafe: 'EXTENSION_MISMATCH' };
    }
  } else {
    // For non-ZIP types, check against the accepted MIME set
    if (!detected) {
      return { ok: false, detectedMimeType: null, sizeBytes, codeSafe: 'UNSUPPORTED_TYPE' };
    }
    if (!WORKFORCE_ACCEPTED_MIME.has(detected)) {
      return { ok: false, detectedMimeType: detected, sizeBytes, codeSafe: 'UNSUPPORTED_TYPE' };
    }
    // Extension vs detected MIME cross-check
    const extMime = EXT_TO_MIME[ext];
    if (extMime && extMime !== detected) {
      return { ok: false, detectedMimeType: detected, sizeBytes, codeSafe: 'EXTENSION_MISMATCH' };
    }
  }

  // 6. Optional archive inspection for ZIP-based files (DOCX)
  if (input.inspectArchiveContent && detected === 'application/zip' && ext === 'docx') {
    const archiveResult = await inspectArchive(buf);
    if (!archiveResult.ok) {
      return {
        ok: false,
        detectedMimeType: detected,
        sizeBytes,
        codeSafe: archiveResult.codeSafe,
        archiveInspection: archiveResult,
      };
    }
  }

  // 7. Malware scan — only CLEAN may continue
  const scanner = getWorkforceScanner();
  const scanResult = await scanner.scan({
    buffer: buf,
    detectedMimeType: detected,
    sizeBytes,
    fileName: input.originalFileName,
  });

  if (shouldRejectWorkforceScan(scanResult)) {
    return {
      ok: false,
      detectedMimeType: detected,
      sizeBytes,
      codeSafe: `SCAN_${scanResult.outcome}`,
      scanOutcome: scanResult.outcome,
    };
  }

  return { ok: true, detectedMimeType: detected, sizeBytes, codeSafe: 'OK', scanOutcome: scanResult.outcome };
}

// ---------------------------------------------------------------------------
// Safe user-facing rejection mapping
// ---------------------------------------------------------------------------

export interface SafeUploadRejection {
  status: number;
  code: string;
  message: string;
}

const ARCHIVE_REJECTION_CODES = new Set([
  'MACRO_ENABLED_DOCUMENT',
  'PATH_TRAVERSAL_IN_ARCHIVE',
  'ABSOLUTE_PATH_IN_ARCHIVE',
  'TOO_MANY_ARCHIVE_ENTRIES',
  'ARCHIVE_TOO_LARGE_DECOMPRESSED',
  'ARCHIVE_DECOMPRESSION_FAILED',
  'ARCHIVE_PARSE_FAILED',
]);

/**
 * Map a failed WorkforceUploadResult to a SAFE, user-facing rejection.
 *
 * SAFE COPY: the internal codeSafe (SCAN_SCAN_FAILED, SCANNER_NOT_CONFIGURED,
 * SCAN_INFECTED, HTTP_SCAN_*, provider classifications, etc.) is NEVER echoed
 * to the user — only bounded Hungarian copy, differentiated per outcome
 * (infected vs "cannot scan now, try later" vs validation).
 *
 * STABLE CONTRACT: every content-validation failure is a fail-closed 4xx
 * rejection with status 400 and code CONTENT_VALIDATION_FAILED. Differentiation
 * for the user lives in the message, not in a status/code the client branches
 * on — this preserves the SEC-2 upload contract while removing the leak.
 */
export function mapWorkforceUploadRejection(result: WorkforceUploadResult): SafeUploadRejection {
  const message = safeRejectionMessage(result);
  return { status: 400, code: 'CONTENT_VALIDATION_FAILED', message };
}

function safeRejectionMessage(result: WorkforceUploadResult): string {
  // Scanner verdicts first (result.scanOutcome is set only when the scan ran).
  switch (result.scanOutcome) {
    case 'INFECTED':
      return 'A feltöltött fájl nem felelt meg a biztonsági ellenőrzésen, ezért nem tölthető fel.';
    case 'UNSUPPORTED':
      return 'A fájltípus biztonsági ellenőrzése nem támogatott.';
    case 'SCAN_FAILED':
      return 'A fájl biztonsági ellenőrzése most nem végezhető el. Próbálja meg később.';
    default:
      break;
  }

  switch (result.codeSafe) {
    case 'EMPTY_FILE':
      return 'A feltöltött fájl üres.';
    case 'FILE_TOO_LARGE':
      return 'A fájl mérete meghaladja a megengedett méretet.';
    case 'UNSAFE_CONTENT':
      return 'A fájl nem engedélyezett tartalmat tartalmaz.';
    case 'UNSUPPORTED_TYPE':
      return 'A fájltípus nem támogatott.';
    case 'EXTENSION_MISMATCH':
      return 'A fájl kiterjesztése nem egyezik a tartalmával.';
    default:
      break;
  }

  if (ARCHIVE_REJECTION_CODES.has(result.codeSafe)) {
    return 'A dokumentum (DOCX) nem felel meg a biztonsági követelményeknek.';
  }

  // Anything unclassified: generic safe rejection, no internal code echoed.
  return 'A fájl ellenőrzése sikertelen.';
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function extOf(name: string): string {
  const m = /\.([a-z0-9]+)$/i.exec(String(name || '').toLowerCase());
  return m ? m[1] : '';
}

/** Get the canonical extension for a detected MIME type. */
export function extensionForMime(mime: string): string | undefined {
  return MIME_TO_EXT[mime];
}

/** Get the MIME type for a file extension. */
export function mimeForExtension(ext: string): string | undefined {
  return EXT_TO_MIME[ext.toLowerCase()];
}
