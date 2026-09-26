/**
 * Shared TEXT_RANGE anchor validation for the Document Workspace Phase 2 reader
 * surface (modification proposals + narrow review-comment authoring).
 *
 * This module is intentionally behaviour-preserving with respect to the existing
 * annotation validation: it mirrors the annotation text-range rules (trimmed
 * non-empty selectedText; integer offsets with startOffset >= 0 and
 * endOffset > startOffset) and the same length bounds, but it is stricter in the
 * one place the Phase 2 reader requires it — offsets are REQUIRED, not optional.
 *
 * It deliberately does NOT lowercase/case-fold anything: the annotation
 * `normalizedSelectedText` semantics stay untouched, and proposal equality uses
 * its own whitespace-only normalization.
 */

export class AnchorValidationError extends Error {
  constructor(
    public readonly code: string,
    message: string,
    public readonly status = 400
  ) {
    super(message);
    this.name = 'AnchorValidationError';
  }
}

export const MAX_SELECTED_TEXT_LENGTH = 4000;
export const MAX_CONTEXT_LENGTH = 500;
export const MAX_KEY_LENGTH = 120;

export interface TextRangeInput {
  selectedText?: unknown;
  startOffset?: unknown;
  endOffset?: unknown;
  textPrefix?: unknown;
  textSuffix?: unknown;
  contentFingerprint?: unknown;
}

export interface NormalizedTextRange {
  selectedText: string;
  startOffset: number;
  endOffset: number;
  textPrefix: string | null;
  textSuffix: string | null;
  contentFingerprint: string | null;
}

export function trimToNull(value: unknown, maxLength: number, field: string): string | null {
  if (value === undefined || value === null) return null;
  if (typeof value !== 'string') {
    throw new AnchorValidationError('INVALID_FIELD', `${field} must be a string.`);
  }
  const trimmed = value.trim();
  if (!trimmed) return null;
  if (trimmed.length > maxLength) {
    throw new AnchorValidationError('FIELD_TOO_LONG', `${field} is too long.`);
  }
  return trimmed;
}

function requiredInteger(value: unknown, field: string): number {
  if (value === undefined || value === null || value === '') {
    throw new AnchorValidationError('INVALID_TEXT_RANGE', `${field} is required.`);
  }
  const numberValue = Number(value);
  if (!Number.isInteger(numberValue)) {
    throw new AnchorValidationError('INVALID_FIELD', `${field} must be an integer.`);
  }
  return numberValue;
}

/**
 * Validates and normalizes a required TEXT_RANGE anchor. Throws
 * AnchorValidationError with the established annotation codes:
 *   - INVALID_TEXT_ANCHOR  when selectedText is missing/blank
 *   - INVALID_TEXT_RANGE   when offsets are missing or not start >= 0 < end
 *   - INVALID_FIELD        when an offset is not an integer
 *   - FIELD_TOO_LONG       when a bounded context field exceeds its limit
 */
export function requireTextRange(input: TextRangeInput): NormalizedTextRange {
  const selectedText = trimToNull(input.selectedText, MAX_SELECTED_TEXT_LENGTH, 'selectedText');
  if (!selectedText) {
    throw new AnchorValidationError('INVALID_TEXT_ANCHOR', 'selectedText is required for text annotations.');
  }

  const startOffset = requiredInteger(input.startOffset, 'startOffset');
  const endOffset = requiredInteger(input.endOffset, 'endOffset');
  if (startOffset < 0 || endOffset <= startOffset) {
    throw new AnchorValidationError('INVALID_TEXT_RANGE', 'Text range offsets are invalid.');
  }

  return {
    selectedText,
    startOffset,
    endOffset,
    textPrefix: trimToNull(input.textPrefix, MAX_CONTEXT_LENGTH, 'textPrefix'),
    textSuffix: trimToNull(input.textSuffix, MAX_CONTEXT_LENGTH, 'textSuffix'),
    contentFingerprint: trimToNull(input.contentFingerprint, MAX_KEY_LENGTH, 'contentFingerprint'),
  };
}

/**
 * Proposal-specific equality normalization: trim leading/trailing whitespace and
 * collapse internal whitespace runs to a single space. Deliberately does NOT
 * lowercase or case-fold, so "Megrendelő" -> "megrendelő" is a real change.
 */
export function normalizeProposalText(value: string): string {
  return value.replace(/\s+/g, ' ').trim();
}
