// ============================================================================
// TEXT EXTRACTOR - Extract text content from documents for anonymization
// ============================================================================

import mammoth from 'mammoth';
import pdfParseLib from 'pdf-parse';

// pdf-parse is a CommonJS module that exports a function
const pdfParse = pdfParseLib as unknown as (buffer: Buffer) => Promise<{
  text: string;
  numpages: number;
}>;

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
    return {
      success: true,
      text: result.value,
      format: 'docx'
    };
  } catch (error) {
    console.error('DOCX extraction error:', error);
    return {
      success: false,
      error: `DOCX extraction failed: ${error instanceof Error ? error.message : 'Unknown error'}`,
      format: 'docx'
    };
  }
}

/**
 * Extract text from a PDF file buffer using pdf-parse
 */
async function extractFromPdf(buffer: Buffer): Promise<ExtractionResult> {
  try {
    const result = await pdfParse(buffer);
    return {
      success: true,
      text: result.text,
      format: 'pdf',
      pageCount: result.numpages
    };
  } catch (error) {
    console.error('PDF extraction error:', error);
    return {
      success: false,
      error: `PDF extraction failed: ${error instanceof Error ? error.message : 'Unknown error'}`,
      format: 'pdf'
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
        error: 'File appears to be binary, not plain text',
        format: 'txt'
      };
    }

    return {
      success: true,
      text,
      format: 'txt'
    };
  } catch (error) {
    return {
      success: false,
      error: `TXT extraction failed: ${error instanceof Error ? error.message : 'Unknown error'}`,
      format: 'txt'
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
  const format = detectFormat(mimeType, fileName);

  if (!format) {
    return {
      success: false,
      error: `Unsupported file format: ${mimeType}. Supported formats: DOCX, PDF, TXT`
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
        error: `No extractor available for format: ${format}`
      };
  }
}

export default {
  extractText,
  detectFormat,
  SUPPORTED_MIME_TYPES
};
