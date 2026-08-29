// ============================================================================
// TEXT EXTRACTOR - Extract text content from documents for anonymization & comparison
// ============================================================================

import mammoth from 'mammoth';

// Ensure Node.js <= 20 compatibility for pdf-parse v2 CJS
if (typeof (Uint8Array as any).fromBase64 !== 'function') {
  (Uint8Array as any).fromBase64 = (base64: string): Uint8Array => {
    return new Uint8Array(Buffer.from(base64, 'base64'));
  };
}
if (typeof (Uint8Array.prototype as any).toBase64 !== 'function') {
  (Uint8Array.prototype as any).toBase64 = function (): string {
    return Buffer.from(this).toString('base64');
  };
}

/** Maximum allowed input buffer size in bytes for text extraction (2MB). */
export const MAX_EXTRACT_BYTES = 2_000_000;

/** Maximum allowed extracted text length in characters (400,000 chars). */
export const MAX_EXTRACTED_TEXT_CHARS = 400_000;

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
    pages?: Array<unknown>;
  }>;
  destroy?: () => Promise<void> | void;
};

type PdfParseV2Ctor = new (options: { data: Uint8Array }) => PdfParseV2Instance;

function resolvePdfParseV2Ctor(pdfParseModule: PdfParseModule): PdfParseV2Ctor | null {
  const candidate = (pdfParseModule as unknown as { PDFParse?: unknown })?.PDFParse;
  return typeof candidate === 'function' ? (candidate as PdfParseV2Ctor) : null;
}

function resolveLegacyPdfParse(pdfParseModule: PdfParseModule): LegacyPdfParseFn | null {
  const candidate =
    (pdfParseModule as unknown as { default?: unknown })?.default ??
    (pdfParseModule as unknown);
  return typeof candidate === 'function' ? (candidate as LegacyPdfParseFn) : null;
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
async function extractFromDocx(buffer: Buffer): Promise<ExtractionResult> {
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
    if (text.length > MAX_EXTRACTED_TEXT_CHARS) {
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

function getPdfParseCandidates(mod: any): { ctor: PdfParseV2Ctor | null; legacy: LegacyPdfParseFn | null } {
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
 * Extract text from a PDF file buffer using pdf-parse
 */
async function extractFromPdf(buffer: Buffer): Promise<ExtractionResult> {
  try {
    let pdfParseModule: any;
    try {
      pdfParseModule = require('pdf-parse');
    } catch {
      pdfParseModule = await import('pdf-parse');
    }

    const { ctor: PdfParseCtor, legacy: legacyPdfParse } = getPdfParseCandidates(pdfParseModule);
    let rawText = '';
    let pageCount: number | undefined;

    if (PdfParseCtor) {
      const parser = new PdfParseCtor({ data: new Uint8Array(buffer) });
      try {
        const result = await parser.getText();
        rawText = result?.text || '';
        pageCount = result?.total || result?.pages?.length;
      } finally {
        await parser.destroy?.();
      }
    } else if (legacyPdfParse) {
      const result = await legacyPdfParse(buffer);
      rawText = result?.text || '';
      pageCount = result?.numpages;
    } else {
      throw new Error('pdf-parse parser export not found');
    }

    // Strip synthetic page marker lines (e.g. "-- 1 of 5 --") to check for meaningful text
    const cleanText = rawText.replace(/--\s*\d+\s+of\s+\d+\s*--/g, '').trim();

    if (!cleanText) {
      return {
        success: false,
        text: '',
        error: 'A PDF nem tartalmaz géppel kinyerhető szöveget.',
        format: 'pdf',
        reasonCode: 'NO_EXTRACTABLE_TEXT',
        pageCount,
      };
    }

    if (cleanText.length > MAX_EXTRACTED_TEXT_CHARS) {
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
      text: cleanText,
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
async function extractFromTxt(buffer: Buffer): Promise<ExtractionResult> {
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

    if (text.length > MAX_EXTRACTED_TEXT_CHARS) {
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
  fileName?: string
): Promise<ExtractionResult> {
  if (buffer.byteLength > MAX_EXTRACT_BYTES) {
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
      return extractFromDocx(buffer);
    case 'doc':
      // mammoth doesn't support old .doc format well, try anyway
      return extractFromDocx(buffer);
    case 'pdf':
      return extractFromPdf(buffer);
    case 'txt':
      return extractFromTxt(buffer);
    case 'html':
      // Strip HTML tags for plain text
      return extractFromTxt(buffer);
    case 'rtf':
      // RTF extraction not implemented, return raw text
      return extractFromTxt(buffer);
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
  MAX_EXTRACT_BYTES,
  MAX_EXTRACTED_TEXT_CHARS,
};
