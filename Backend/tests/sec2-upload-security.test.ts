/**
 * SEC-2: Upload Validation Core Tests
 *
 * Comprehensive tests for workforce upload validation:
 * - Magic-byte detection (PDF, DOC, DOCX, TXT, executables)
 * - Unsafe content detection (scripts, executables, polyglots)
 * - File size limits
 * - Extension vs MIME cross-check
 * - Filename sanitization
 * - Path traversal prevention
 * - ZIP/DOCX archive inspection
 * - Scanner adapter integration
 */

import {
  detectMimeFromMagicBytes,
  looksUnsafe,
  sanitizeUploadFileName,
  hasPathTraversal,
  validateWorkforceUpload,
  inspectArchive,
  WORKFORCE_ACCEPTED_MIME,
  MAX_WORKFORCE_FILE_BYTES,
} from '../src/modules/upload-security/uploadValidationCore';
import {
  getWorkforceScanner,
  setWorkforceScanner,
  DevMockWorkforceScanner,
  shouldRejectWorkforceScan,
} from '../src/modules/upload-security/scannerAdapter';

// ---------------------------------------------------------------------------
// Test fixtures
// ---------------------------------------------------------------------------

const PDF_BUFFER = Buffer.from([
  0x25, 0x50, 0x44, 0x46, 0x2d, 0x31, 0x2e, 0x34, 0x0a, 0x25, 0xe2, 0xe3, 0xcf, 0xd3, 0x0a,
  0x31, 0x20, 0x30, 0x20, 0x6f, 0x62, 0x6a, 0x0a, 0x3c, 0x3c, 0x20, 0x2f, 0x54, 0x79, 0x70,
  0x65, 0x20, 0x2f, 0x43, 0x61, 0x74, 0x61, 0x6c, 0x6f, 0x67, 0x20, 0x3e, 0x3e, 0x0a, 0x65,
  0x6e, 0x64, 0x6f, 0x62, 0x6a, 0x0a,
]);

const DOC_BUFFER = Buffer.from([
  0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00,
  0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x3e, 0x00, 0x03, 0x00, 0xfe, 0xff,
  0x09, 0x08, 0x02, 0x00, 0x00, 0x00,
]);

const TXT_BUFFER = Buffer.from('Hello, this is a plain text file for testing purposes.\n');

const XML_BUFFER = Buffer.from('<?xml version="1.0" encoding="UTF-8"?><!DOCTYPE foo><foo/>');
const SVG_BUFFER = Buffer.from('<svg xmlns="http://www.w3.org/2000/svg"><circle r="10"/></svg>');
const EXE_BUFFER = Buffer.from([0x4d, 0x5a, 0x90, 0x00, 0x03, 0x00, 0x00, 0x00]);
const ELF_BUFFER = Buffer.from([0x7f, 0x45, 0x4c, 0x46, 0x02, 0x01, 0x01, 0x00]);
const HTML_BUFFER = Buffer.from('<!DOCTYPE html><html><head><title>Test</title></head></html>');
const EMPTY_BUFFER = Buffer.alloc(0);

function makeZipBuffer(): Buffer {
  // Minimal ZIP header (PK\x03\x04) padded to >512 bytes to avoid text heuristic
  const header = Buffer.from([
    0x50, 0x4b, 0x03, 0x04, 0x14, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00,
    0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00,
    0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00,
    0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00,
    0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00,
    0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00,
    0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00,
    0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00,
  ]);
  // Pad with non-null binary to exceed 512 bytes and avoid text heuristic
  const padding = Buffer.alloc(512, 0xab);
  return Buffer.concat([header, padding]);
}

// ---------------------------------------------------------------------------
// detectMimeFromMagicBytes
// ---------------------------------------------------------------------------

describe('SEC-2: detectMimeFromMagicBytes', () => {
  it('detects PDF from magic bytes', () => {
    expect(detectMimeFromMagicBytes(PDF_BUFFER)).toBe('application/pdf');
  });

  it('detects MS Office legacy format (OLE2/CFBF)', () => {
    expect(detectMimeFromMagicBytes(DOC_BUFFER)).toBe('application/msword');
  });

  it('detects plain text from heuristic', () => {
    expect(detectMimeFromMagicBytes(TXT_BUFFER)).toBe('text/plain');
  });

  it('detects ZIP header', () => {
    expect(detectMimeFromMagicBytes(makeZipBuffer())).toBe('application/zip');
  });

  it('returns null for null buffer', () => {
    expect(detectMimeFromMagicBytes(null as any)).toBeNull();
  });

  it('returns null for empty buffer', () => {
    expect(detectMimeFromMagicBytes(Buffer.alloc(0))).toBeNull();
  });

  it('returns null for tiny buffer (< 4 bytes)', () => {
    expect(detectMimeFromMagicBytes(Buffer.from([0x25, 0x50, 0x44]))).toBeNull();
  });

  it('returns null for binary content with null bytes', () => {
    const binary = Buffer.alloc(512);
    binary[0] = 0xff;
    binary[1] = 0xfe;
    binary[2] = 0x00;
    expect(detectMimeFromMagicBytes(binary)).toBeNull();
  });

  it('rejects JPEG from workforce acceptance (not in WORKFORCE_ACCEPTED_MIME)', () => {
    const jpegBuffer = Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10]);
    const detected = detectMimeFromMagicBytes(jpegBuffer);
    expect(detected).toBe('image/jpeg');
    expect(WORKFORCE_ACCEPTED_MIME.has(detected!)).toBe(false);
  });

  it('rejects PNG from workforce acceptance', () => {
    const pngBuffer = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
    const detected = detectMimeFromMagicBytes(pngBuffer);
    expect(detected).toBe('image/png');
    expect(WORKFORCE_ACCEPTED_MIME.has(detected!)).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// looksUnsafe
// ---------------------------------------------------------------------------

describe('SEC-2: looksUnsafe', () => {
  it('rejects null buffer', () => {
    expect(looksUnsafe(null as any)).toBe(true);
  });

  it('rejects empty buffer', () => {
    expect(looksUnsafe(Buffer.alloc(0))).toBe(true);
  });

  it('rejects XML content', () => {
    expect(looksUnsafe(XML_BUFFER)).toBe(true);
  });

  it('rejects SVG content', () => {
    expect(looksUnsafe(SVG_BUFFER)).toBe(true);
  });

  it('rejects HTML/DOCTYPE content', () => {
    expect(looksUnsafe(HTML_BUFFER)).toBe(true);
  });

  it('rejects MZ executable', () => {
    expect(looksUnsafe(EXE_BUFFER)).toBe(true);
  });

  it('rejects ELF executable', () => {
    expect(looksUnsafe(ELF_BUFFER)).toBe(true);
  });

  it('rejects content with <script> tag', () => {
    const scriptBuffer = Buffer.from('<script>alert("xss")</script>');
    expect(looksUnsafe(scriptBuffer)).toBe(true);
  });

  it('accepts valid PDF content', () => {
    expect(looksUnsafe(PDF_BUFFER)).toBe(false);
  });

  it('accepts valid DOC content', () => {
    expect(looksUnsafe(DOC_BUFFER)).toBe(false);
  });

  it('accepts valid TXT content', () => {
    expect(looksUnsafe(TXT_BUFFER)).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// sanitizeUploadFileName
// ---------------------------------------------------------------------------

describe('SEC-2: sanitizeUploadFileName', () => {
  it('strips path separators', () => {
    expect(sanitizeUploadFileName('/etc/passwd')).toBe('etcpasswd');
    expect(sanitizeUploadFileName('C:\\Windows\\System32\\file.txt')).toBe('WindowsSystem32file.txt');
  });

  it('removes null bytes', () => {
    expect(sanitizeUploadFileName('file\x00.txt')).toBe('file.txt');
  });

  it('removes control characters', () => {
    expect(sanitizeUploadFileName('file\x01\x02\x03.txt')).toBe('file.txt');
  });

  it('strips leading/trailing dots and spaces', () => {
    expect(sanitizeUploadFileName('..file..')).toBe('file');
    expect(sanitizeUploadFileName('  file  ')).toBe('file');
  });

  it('prefixes Windows reserved names', () => {
    expect(sanitizeUploadFileName('CON.txt')).toBe('_CON.txt');
    expect(sanitizeUploadFileName('NUL.doc')).toBe('_NUL.doc');
    expect(sanitizeUploadFileName('PRN.docx')).toBe('_PRN.docx');
    expect(sanitizeUploadFileName('AUX.pdf')).toBe('_AUX.pdf');
    expect(sanitizeUploadFileName('COM1.txt')).toBe('_COM1.txt');
    expect(sanitizeUploadFileName('LPT1.txt')).toBe('_LPT1.txt');
  });

  it('truncates long filenames', () => {
    const longName = 'a'.repeat(300) + '.txt';
    const result = sanitizeUploadFileName(longName);
    expect(result.length).toBeLessThanOrEqual(200);
    expect(result.endsWith('.txt')).toBe(true);
  });

  it('returns "unnamed" for empty/null input', () => {
    expect(sanitizeUploadFileName('')).toBe('unnamed');
    expect(sanitizeUploadFileName(null as any)).toBe('unnamed');
    expect(sanitizeUploadFileName(undefined as any)).toBe('unnamed');
  });

  it('preserves normal filenames', () => {
    expect(sanitizeUploadFileName('contract-template.docx')).toBe('contract-template.docx');
    expect(sanitizeUploadFileName('Legal Brief 2024.pdf')).toBe('Legal Brief 2024.pdf');
  });
});

// ---------------------------------------------------------------------------
// hasPathTraversal
// ---------------------------------------------------------------------------

describe('SEC-2: hasPathTraversal', () => {
  it('detects .. traversal', () => {
    expect(hasPathTraversal('../../../etc/passwd')).toBe(true);
    expect(hasPathTraversal('file/../../secret')).toBe(true);
  });

  it('detects absolute paths', () => {
    expect(hasPathTraversal('/etc/passwd')).toBe(true);
    expect(hasPathTraversal('\\Windows\\System32')).toBe(true);
  });

  it('detects null bytes', () => {
    expect(hasPathTraversal('file\x00.txt')).toBe(true);
  });

  it('detects URL-encoded traversal', () => {
    expect(hasPathTraversal('..%2F..%2Fetc%2Fpasswd')).toBe(true);
    expect(hasPathTraversal('..%2f..%2fetc%2fpasswd')).toBe(true);
  });

  it('allows normal relative paths', () => {
    expect(hasPathTraversal('templates/contract.docx')).toBe(false);
    expect(hasPathTraversal('file.txt')).toBe(false);
  });

  it('allows filenames with dots in middle', () => {
    expect(hasPathTraversal('file.v2.docx')).toBe(false);
    expect(hasPathTraversal('my.file.txt')).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// validateWorkforceUpload
// ---------------------------------------------------------------------------

describe('SEC-2: validateWorkforceUpload', () => {
  beforeEach(() => {
    setWorkforceScanner(new DevMockWorkforceScanner());
  });
  afterEach(() => {
    setWorkforceScanner(null);
  });

  it('rejects empty file', async () => {
    const result = await validateWorkforceUpload({
      buffer: Buffer.alloc(0),
      originalFileName: 'test.pdf',
    });
    expect(result.ok).toBe(false);
    expect(result.codeSafe).toBe('EMPTY_FILE');
  });

  it('rejects oversized file', async () => {
    const largeBuffer = Buffer.alloc(MAX_WORKFORCE_FILE_BYTES + 1, 0x41);
    const result = await validateWorkforceUpload({
      buffer: largeBuffer,
      originalFileName: 'large.pdf',
    });
    expect(result.ok).toBe(false);
    expect(result.codeSafe).toBe('FILE_TOO_LARGE');
  });

  it('rejects unsafe XML content', async () => {
    const result = await validateWorkforceUpload({
      buffer: XML_BUFFER,
      originalFileName: 'test.pdf',
    });
    expect(result.ok).toBe(false);
    expect(result.codeSafe).toBe('UNSAFE_CONTENT');
  });

  it('rejects unsafe SVG content', async () => {
    const result = await validateWorkforceUpload({
      buffer: SVG_BUFFER,
      originalFileName: 'test.pdf',
    });
    expect(result.ok).toBe(false);
    expect(result.codeSafe).toBe('UNSAFE_CONTENT');
  });

  it('rejects executable (MZ) content', async () => {
    const result = await validateWorkforceUpload({
      buffer: EXE_BUFFER,
      originalFileName: 'test.pdf',
    });
    expect(result.ok).toBe(false);
    expect(result.codeSafe).toBe('UNSAFE_CONTENT');
  });

  it('rejects unsupported MIME type (JPEG)', async () => {
    const jpegBuffer = Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10, 0x4a, 0x46]);
    const result = await validateWorkforceUpload({
      buffer: jpegBuffer,
      originalFileName: 'test.jpg',
    });
    expect(result.ok).toBe(false);
    expect(result.codeSafe).toBe('UNSUPPORTED_TYPE');
  });

  it('rejects extension mismatch (PDF buffer + .docx filename)', async () => {
    const result = await validateWorkforceUpload({
      buffer: PDF_BUFFER,
      originalFileName: 'test.docx',
    });
    expect(result.ok).toBe(false);
    expect(result.codeSafe).toBe('EXTENSION_MISMATCH');
  });

  it('rejects extension mismatch (DOC buffer + .pdf filename)', async () => {
    const result = await validateWorkforceUpload({
      buffer: DOC_BUFFER,
      originalFileName: 'test.pdf',
    });
    expect(result.ok).toBe(false);
    expect(result.codeSafe).toBe('EXTENSION_MISMATCH');
  });

  it('accepts valid PDF with .pdf extension', async () => {
    const result = await validateWorkforceUpload({
      buffer: PDF_BUFFER,
      originalFileName: 'contract.pdf',
    });
    expect(result.ok).toBe(true);
    expect(result.detectedMimeType).toBe('application/pdf');
    expect(result.codeSafe).toBe('OK');
  });

  it('accepts valid DOC with .doc extension', async () => {
    const result = await validateWorkforceUpload({
      buffer: DOC_BUFFER,
      originalFileName: 'agreement.doc',
    });
    expect(result.ok).toBe(true);
    expect(result.detectedMimeType).toBe('application/msword');
    expect(result.codeSafe).toBe('OK');
  });

  it('accepts valid plain text with .txt extension', async () => {
    const result = await validateWorkforceUpload({
      buffer: TXT_BUFFER,
      originalFileName: 'notes.txt',
    });
    expect(result.ok).toBe(true);
    expect(result.detectedMimeType).toBe('text/plain');
    expect(result.codeSafe).toBe('OK');
  });

  it('accepts valid DOCX with .docx extension', async () => {
    const JSZip = (await import('jszip')).default;
    const zip = new JSZip();
    zip.file('word/document.xml', '<w:document/>');
    const buf = await zip.generateAsync({ type: 'nodebuffer' });
    const result = await validateWorkforceUpload({
      buffer: buf,
      originalFileName: 'document.docx',
    });
    expect(result.ok).toBe(true);
    expect(result.detectedMimeType).toBe('application/zip');
    expect(result.codeSafe).toBe('OK');
  });

  it('rejects ZIP buffer with .pdf extension', async () => {
    const JSZip = (await import('jszip')).default;
    const zip = new JSZip();
    zip.file('word/document.xml', '<w:document/>');
    const buf = await zip.generateAsync({ type: 'nodebuffer' });
    const result = await validateWorkforceUpload({
      buffer: buf,
      originalFileName: 'document.pdf',
    });
    expect(result.ok).toBe(false);
    expect(result.codeSafe).toBe('EXTENSION_MISMATCH');
  });

  it('ignores client-declared MIME type', async () => {
    // Client claims it's a PDF, but it's actually a DOC
    const result = await validateWorkforceUpload({
      buffer: DOC_BUFFER,
      declaredMimeType: 'application/pdf',
      originalFileName: 'test.doc',
    });
    // Should accept based on magic bytes, not client-declared MIME
    expect(result.ok).toBe(true);
    expect(result.detectedMimeType).toBe('application/msword');
  });

  it('rejects polyglot file (XML in first 512 bytes)', async () => {
    // Simulate a polyglot: starts with PDF header but the first 512 bytes
    // contain XML-like content that triggers the unsafe check
    const xmlHeader = Buffer.from('<?xml version="1.0" encoding="UTF-8"?>');
    const pdfPayload = Buffer.alloc(512 - xmlHeader.length, 0x41);
    const polyglot = Buffer.concat([xmlHeader, pdfPayload]);
    const result = await validateWorkforceUpload({
      buffer: polyglot,
      originalFileName: 'test.pdf',
    });
    // Should be rejected as unsafe content (XML detected in first 512 bytes)
    expect(result.ok).toBe(false);
    expect(result.codeSafe).toBe('UNSAFE_CONTENT');
  });
});

// ---------------------------------------------------------------------------
// inspectArchive
// ---------------------------------------------------------------------------

describe('SEC-2: inspectArchive', () => {
  it('rejects unparseable ZIP data', async () => {
    const badZip = Buffer.from('this is not a zip file');
    const result = await inspectArchive(badZip);
    expect(result.ok).toBe(false);
    expect(result.codeSafe).toBe('ARCHIVE_PARSE_FAILED');
  });

  it('accepts empty ZIP archive', async () => {
    // Create a minimal valid ZIP with no entries
    const JSZip = (await import('jszip')).default;
    const zip = new JSZip();
    const buf = await zip.generateAsync({ type: 'nodebuffer' });
    const result = await inspectArchive(buf);
    expect(result.ok).toBe(true);
    expect(result.entryCount).toBe(0);
  });

  it('rejects archive with too many entries', async () => {
    const JSZip = (await import('jszip')).default;
    const zip = new JSZip();
    // Create 501 entries (exceeds MAX_ARCHIVE_ENTRY_COUNT)
    for (let i = 0; i < 501; i++) {
      zip.file(`entry-${i}.txt`, 'content');
    }
    const buf = await zip.generateAsync({ type: 'nodebuffer' });
    const result = await inspectArchive(buf);
    expect(result.ok).toBe(false);
    expect(result.codeSafe).toBe('TOO_MANY_ARCHIVE_ENTRIES');
    expect(result.entryCount).toBe(501);
  });

  it('rejects archive with macro-enabled document', async () => {
    const JSZip = (await import('jszip')).default;
    const zip = new JSZip();
    zip.file('document.docm', 'macro content');
    const buf = await zip.generateAsync({ type: 'nodebuffer' });
    const result = await inspectArchive(buf);
    expect(result.ok).toBe(false);
    expect(result.codeSafe).toBe('MACRO_ENABLED_DOCUMENT');
    expect(result.hasMacro).toBe(true);
  });

  it('rejects archive with path traversal', async () => {
    const JSZip = (await import('jszip')).default;
    const zip = new JSZip();
    zip.file('../../../etc/passwd', 'malicious content');
    const buf = await zip.generateAsync({ type: 'nodebuffer' });
    const result = await inspectArchive(buf);
    expect(result.ok).toBe(false);
    expect(result.codeSafe).toBe('PATH_TRAVERSAL_IN_ARCHIVE');
    expect(result.hasSuspiciousEntry).toBe(true);
  });

  it('rejects archive with absolute path', async () => {
    const JSZip = (await import('jszip')).default;
    const zip = new JSZip();
    zip.file('/tmp/malicious.txt', 'malicious content');
    const buf = await zip.generateAsync({ type: 'nodebuffer' });
    const result = await inspectArchive(buf);
    expect(result.ok).toBe(false);
    // Absolute path starting with / is caught by hasPathTraversal
    expect(result.codeSafe).toBe('PATH_TRAVERSAL_IN_ARCHIVE');
    expect(result.hasSuspiciousEntry).toBe(true);
  });

  it('accepts clean ZIP with valid entries', async () => {
    const JSZip = (await import('jszip')).default;
    const zip = new JSZip();
    zip.file('document.xml', '<document/>');
    zip.file('styles.xml', '<styles/>');
    zip.file('[Content_Types].xml', '<Types/>');
    const buf = await zip.generateAsync({ type: 'nodebuffer' });
    const result = await inspectArchive(buf);
    expect(result.ok).toBe(true);
    expect(result.entryCount).toBe(3);
    expect(result.totalDecompressedBytes).toBeGreaterThan(0);
    expect(result.hasMacro).toBe(false);
    expect(result.hasSuspiciousEntry).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// Scanner adapter
// ---------------------------------------------------------------------------

describe('SEC-2: Scanner adapter', () => {
  afterEach(() => {
    setWorkforceScanner(null);
  });

  it('returns SCAN_FAILED when no scanner is configured', async () => {
    const scanner = getWorkforceScanner();
    const result = await scanner.scan({
      buffer: PDF_BUFFER,
      detectedMimeType: 'application/pdf',
      sizeBytes: PDF_BUFFER.length,
      fileName: 'test.pdf',
    });
    expect(result.outcome).toBe('SCAN_FAILED');
    expect(result.provider).toBe('NONE');
    expect(result.codeSafe).toBe('SCANNER_NOT_CONFIGURED');
  });

  it('shouldReject returns true for SCAN_FAILED', () => {
    const result = { outcome: 'SCAN_FAILED' as const, provider: 'NONE', codeSafe: 'SCANNER_NOT_CONFIGURED' };
    expect(shouldRejectWorkforceScan(result)).toBe(true);
  });

  it('shouldReject returns true for INFECTED', () => {
    const result = { outcome: 'INFECTED' as const, provider: 'TEST', codeSafe: 'MALWARE_DETECTED' };
    expect(shouldRejectWorkforceScan(result)).toBe(true);
  });

  it('shouldReject returns false for CLEAN', () => {
    const result = { outcome: 'CLEAN' as const, provider: 'TEST', codeSafe: 'OK' };
    expect(shouldRejectWorkforceScan(result)).toBe(false);
  });

  it('DevMockWorkforceScanner returns CLEAN for supported types', async () => {
    setWorkforceScanner(new DevMockWorkforceScanner());
    const scanner = getWorkforceScanner();
    const result = await scanner.scan({
      buffer: PDF_BUFFER,
      detectedMimeType: 'application/pdf',
      sizeBytes: PDF_BUFFER.length,
      fileName: 'test.pdf',
    });
    expect(result.outcome).toBe('CLEAN');
    expect(result.provider).toBe('DEV_MOCK');
  });

  it('DevMockWorkforceScanner returns UNSUPPORTED for image types', async () => {
    setWorkforceScanner(new DevMockWorkforceScanner());
    const scanner = getWorkforceScanner();
    const result = await scanner.scan({
      buffer: Buffer.from([0xff, 0xd8, 0xff]),
      detectedMimeType: 'image/jpeg',
      sizeBytes: 3,
      fileName: 'test.jpg',
    });
    expect(result.outcome).toBe('UNSUPPORTED');
  });
});

// ---------------------------------------------------------------------------
// Integration: validateWorkforceUpload + scanner
// ---------------------------------------------------------------------------

describe('SEC-2: Upload validation + scanner integration', () => {
  afterEach(() => {
    setWorkforceScanner(null);
  });

  it('full pipeline: valid PDF passes validation with DevMock scanner', async () => {
    setWorkforceScanner(new DevMockWorkforceScanner());
    const validation = await validateWorkforceUpload({
      buffer: PDF_BUFFER,
      originalFileName: 'contract.pdf',
    });
    expect(validation.ok).toBe(true);
    expect(validation.scanOutcome).toBe('CLEAN');
  });

  it('full pipeline: valid DOCX passes validation', async () => {
    setWorkforceScanner(new DevMockWorkforceScanner());
    const JSZip = (await import('jszip')).default;
    const zip = new JSZip();
    zip.file('word/document.xml', '<w:document/>');
    zip.file('[Content_Types].xml', '<Types/>');
    const buf = await zip.generateAsync({ type: 'nodebuffer' });
    const validation = await validateWorkforceUpload({
      buffer: buf,
      originalFileName: 'agreement.docx',
      inspectArchiveContent: true,
    });
    expect(validation.ok).toBe(true);
    expect(validation.scanOutcome).toBe('CLEAN');
  });

  it('full pipeline: invalid content fails validation before scanner runs', async () => {
    const validation = await validateWorkforceUpload({
      buffer: EXE_BUFFER,
      originalFileName: 'malware.exe',
    });
    expect(validation.ok).toBe(false);
    expect(validation.codeSafe).toBe('UNSAFE_CONTENT');
    expect(validation.scanOutcome).toBeUndefined();
  });

  it('unconfigured scanner rejects valid content (fail-closed)', async () => {
    // No scanner installed — UnconfiguredWorkforceScanner returns SCAN_FAILED
    const validation = await validateWorkforceUpload({
      buffer: PDF_BUFFER,
      originalFileName: 'contract.pdf',
    });
    expect(validation.ok).toBe(false);
    expect(validation.codeSafe).toBe('SCAN_SCAN_FAILED');
    expect(validation.scanOutcome).toBe('SCAN_FAILED');
  });

  it('INFECTED scanner rejects valid content before storage', async () => {
    setWorkforceScanner({
      provider: 'TEST_INFECTED',
      scan: async () => ({ outcome: 'INFECTED', provider: 'TEST_INFECTED', codeSafe: 'MALWARE_DETECTED' }),
    });
    const validation = await validateWorkforceUpload({
      buffer: PDF_BUFFER,
      originalFileName: 'contract.pdf',
    });
    expect(validation.ok).toBe(false);
    expect(validation.codeSafe).toBe('SCAN_INFECTED');
    expect(validation.scanOutcome).toBe('INFECTED');
  });

  it('SCAN_FAILED scanner rejects valid content before storage', async () => {
    setWorkforceScanner({
      provider: 'TEST_ERROR',
      scan: async () => ({ outcome: 'SCAN_FAILED', provider: 'TEST_ERROR', codeSafe: 'SCANNER_TIMEOUT' }),
    });
    const validation = await validateWorkforceUpload({
      buffer: PDF_BUFFER,
      originalFileName: 'contract.pdf',
    });
    expect(validation.ok).toBe(false);
    expect(validation.codeSafe).toBe('SCAN_SCAN_FAILED');
    expect(validation.scanOutcome).toBe('SCAN_FAILED');
  });
});
