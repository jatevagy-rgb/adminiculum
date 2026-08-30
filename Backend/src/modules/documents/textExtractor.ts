// ============================================================================
// TEXT EXTRACTOR - Extract text content from documents for anonymization & comparison
// ============================================================================

import mammoth from 'mammoth';

/** Maximum allowed input buffer size in bytes for shared text extraction (25 MB). */
export const SHARED_EXTRACTOR_MAX = 25_000_000;

/** Maximum allowed extracted text length in characters for shared text extraction (5,000,000 chars). */
export const SHARED_EXTRACTED_TEXT_MAX = 5_000_000;

/** Backwards-compatible aliases */
export const MAX_EXTRACT_BYTES = SHARED_EXTRACTOR_MAX;
export const MAX_EXTRACTED_TEXT_CHARS = SHARED_EXTRACTED_TEXT_MAX;

type PdfParseModule = {
  PDFParse?: unknown;
  default?: unknown;
};

type LegacyPdfParseFn = (buffer: Buffer) => Promise<{
  text: string;
  numpages: number;
}>;

type PdfParseV2Instance = {
  getText: () => Promise<{
    text?: string;
    total?: number;
    pages?: Array<{ text?: string; num?: number; pageNumber?: number }>;
  }>;
  destroy?: () => Promise<void> | void;
};

type PdfParseV2Ctor = new (options: { data: Uint8Array }) => PdfParseV2Instance;

function resolvePdfParse(mod: any): { ctor: PdfParseV2Ctor | null; legacy: LegacyPdfParseFn | null } {
  if (!mod) return { ctor: null, legacy: null };
  const ctor =
    (typeof mod?.PDFParse === 'function' ? mod.PDFParse : null) ??
    (typeof mod?.default?.PDFParse === 'function' ? mod.default.PDFParse : null);
  const legacy =
    (typeof mod === 'function' ? mod : null) ??
    (typeof mod?.default === 'function' ? mod.default : null);
  return { ctor, legacy };
}

/**
 * Supported MIME types for text extraction
 */
export const SUPPORTED_MIME_TYPES = {
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document': 'docx',
  'application/msword': 'doc',
  'application/pdf': 'pdf',
  'text/plain': 'txt',
  'text/html': 'html',
  'application/rtf': 'rtf',
} as const;

export type SupportedFormat = typeof SUPPORTED_MIME_TYPES[keyof typeof SUPPORTED_MIME_TYPES];

/**
 * Options for text extraction
 */
export interface ExtractTextOptions {
  maxBytes?: number;
  maxChars?: number;
}

/**
 * Result of text extraction
 */
export interface ExtractionResult {
  success: boolean;
  text?: string;
  error?: string;
  format?: SupportedFormat;
  pageCount?: number;
  reasonCode?: string;
}

/**
 * Detect format from MIME type or filename
 */
export function detectFormat(mimeType: string, fileName?: string): SupportedFormat | null {
  // Try MIME type first
  const formatFromMime = SUPPORTED_MIME_TYPES[mimeType as keyof typeof SUPPORTED_MIME_TYPES];
  if (formatFromMime) {
    return formatFromMime;
  }

  // Fall back to file extension
  if (fileName) {
    const ext = fileName.toLowerCase().split('.').pop();
    switch (ext) {
      case 'docx':
        return 'docx';
      case 'doc':
        return 'doc';
      case 'pdf':
        return 'pdf';
      case 'txt':
      case 'md':
      case 'csv':
        return 'txt';
      case 'html':
      case 'htm':
        return 'html';
      case 'rtf':
        return 'rtf';
    }
  }

  return null;
}

/**
 * Extract text from a DOCX file buffer using mammoth
 */
async function extractFromDocx(buffer: Buffer, maxChars: number = SHARED_EXTRACTED_TEXT_MAX): Promise<ExtractionResult> {
  try {
    const result = await mammoth.extractRawText({ buffer });
    const text = result?.value ?? '';
    if (!text.trim()) {
      return {
        success: false,
        text: '',
        error: 'A dokumentum nem tartalmaz kinyerhető szöveget.',
        format: 'docx',
        reasonCode: 'NO_EXTRACTABLE_TEXT',
      };
    }
    if (text.length > maxChars) {
      return {
        success: false,
        error: 'A kinyert szöveg mérete meghaladja a megengedett korlátot.',
        format: 'docx',
        reasonCode: 'CONTENT_TOO_LARGE',
      };
    }
    return {
      success: true,
      text,
      format: 'docx',
    };
  } catch (error) {
    return {
      success: false,
      error: 'A dokumentum szövegének kinyerése sikertelen volt.',
      format: 'docx',
      reasonCode: 'EXTRACTION_FAILED',
    };
  }
}

/**
 * Ensure the pdfjs worker is initialized on the main thread for deterministic Node 20 / Jest execution.
 * Avoids dynamic import() failures in VM environments without mutating global prototypes.
 */
function ensurePdfWorker(): void {
  const g = globalThis as any;
  if (g.pdfjsWorker?.WorkerMessageHandler) return;
  try {
    const fs = require('fs');
    const workerPath = require.resolve('pdfjs-dist/legacy/build/pdf.worker.mjs');
    let code = fs.readFileSync(workerPath, 'utf8');
    code = code.replace(/import\.meta\.url/g, '""');
    code = code.replace(/export\s*\{\s*WorkerMessageHandler\s*\};?/g, '');
    new Function(code)();
  } catch {
    // Fall back to default runtime loader if worker bundling differs
  }
}

/**
 * Extract text from a PDF file buffer using pdf-parse
 */
async function extractFromPdf(buffer: Buffer, maxChars: number = SHARED_EXTRACTED_TEXT_MAX): Promise<ExtractionResult> {
  try {
    ensurePdfWorker();
    const pdfParseModule = require('pdf-parse');
    const { ctor: PdfParseCtor, legacy: legacyPdfParse } = resolvePdfParse(pdfParseModule);
    let rawText = '';
    let pageCount: number | undefined;

    if (PdfParseCtor) {
      const parser = new PdfParseCtor({ data: new Uint8Array(buffer) });
      try {
        const result = await parser.getText();
        pageCount = result?.total || result?.pages?.length;
        if (Array.isArray(result?.pages) && result.pages.length > 0) {
          rawText = result.pages.map((p: any) => (p?.text != null ? String(p.text) : '')).join('\n').trim();
        } else {
          rawText = (result?.text || '').trim();
        }
      } finally {
        await parser.destroy?.();
      }
    } else if (legacyPdfParse) {
      const result = await legacyPdfParse(buffer);
      rawText = (result?.text || '').trim();
      pageCount = result?.numpages;
    } else {
      throw new Error('pdf-parse parser export not found');
    }

    if (!rawText.trim()) {
      return {
        success: false,
        text: '',
        error: 'A PDF nem tartalmaz géppel kinyerhető szöveget.',
        format: 'pdf',
        reasonCode: 'NO_EXTRACTABLE_TEXT',
        pageCount,
      };
    }

    if (rawText.length > maxChars) {
      return {
        success: false,
        error: 'A kinyert szöveg mérete meghaladja a megengedett korlátot.',
        format: 'pdf',
        reasonCode: 'CONTENT_TOO_LARGE',
        pageCount,
      };
    }

    return {
      success: true,
      text: rawText,
      format: 'pdf',
      pageCount,
    };
  } catch (error) {
    return {
      success: false,
      error: 'A PDF szövegének kinyerése sikertelen volt.',
      format: 'pdf',
      reasonCode: 'EXTRACTION_FAILED',
    };
  }
}

/**
 * Extract text from a plain text file buffer
 */
async function extractFromTxt(buffer: Buffer, maxChars: number = SHARED_EXTRACTED_TEXT_MAX): Promise<ExtractionResult> {
  try {
    // Try UTF-8 first, then fall back to latin1
    let text = buffer.toString('utf-8');

    // Check for null bytes which indicate binary content
    if (text.includes('\0')) {
      return {
        success: false,
        error: 'A fájl bináris tartalmat tartalmaz, nem sima szöveg.',
        format: 'txt',
        reasonCode: 'FORMAT_NOT_TEXT_EXTRACTABLE',
      };
    }

    // Strip UTF-8 BOM if present
    if (text.charCodeAt(0) === 0xfeff) {
      text = text.slice(1);
    }

    if (!text.trim()) {
      return {
        success: false,
        text: '',
        error: 'A szöveges dokumentum nem tartalmaz kinyerhető szöveget.',
        format: 'txt',
        reasonCode: 'NO_EXTRACTABLE_TEXT',
      };
    }

    if (text.length > maxChars) {
      return {
        success: false,
        error: 'A kinyert szöveg mérete meghaladja a megengedett korlátot.',
        format: 'txt',
        reasonCode: 'CONTENT_TOO_LARGE',
      };
    }

    return {
      success: true,
      text,
      format: 'txt',
    };
  } catch (error) {
    return {
      success: false,
      error: 'A szöveges dokumentum kinyerése sikertelen volt.',
      format: 'txt',
      reasonCode: 'EXTRACTION_FAILED',
    };
  }
}

/**
 * Main text extraction function
 * Takes a file buffer and format specification, returns extracted text
 */
export async function extractText(
  buffer: Buffer,
  mimeType: string,
  fileName?: string,
  options?: ExtractTextOptions
): Promise<ExtractionResult> {
  const maxBytes = options?.maxBytes ?? SHARED_EXTRACTOR_MAX;
  const maxChars = options?.maxChars ?? SHARED_EXTRACTED_TEXT_MAX;

  if (buffer.byteLength > maxBytes) {
    return {
      success: false,
      error: 'A dokumentum mérete meghaladja a megengedett korlátot.',
      reasonCode: 'CONTENT_TOO_LARGE',
    };
  }

  const format = detectFormat(mimeType, fileName);

  if (!format) {
    return {
      success: false,
      error: `Nem támogatott fájlformátum: ${mimeType}. Támogatott formátumok: DOCX, PDF, TXT.`,
      reasonCode: 'FORMAT_NOT_TEXT_EXTRACTABLE',
    };
  }

  switch (format) {
    case 'docx':
      return extractFromDocx(buffer, maxChars);
    case 'doc':
      // mammoth doesn't support old .doc format well, try anyway
      return extractFromDocx(buffer, maxChars);
    case 'pdf':
      return extractFromPdf(buffer, maxChars);
    case 'txt':
      return extractFromTxt(buffer, maxChars);
    case 'html':
      // Strip HTML tags for plain text
      return extractFromTxt(buffer, maxChars);
    case 'rtf':
      // RTF extraction not implemented, return raw text
      return extractFromTxt(buffer, maxChars);
    default:
      return {
        success: false,
        error: `Nem támogatott formátum: ${format}`,
        reasonCode: 'FORMAT_NOT_TEXT_EXTRACTABLE',
      };
  }
}

export default {
  extractText,
  detectFormat,
  SUPPORTED_MIME_TYPES,
  SHARED_EXTRACTOR_MAX,
  SHARED_EXTRACTED_TEXT_MAX,
  MAX_EXTRACT_BYTES,
  MAX_EXTRACTED_TEXT_CHARS,
};
