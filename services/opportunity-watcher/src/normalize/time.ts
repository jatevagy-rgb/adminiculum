/**
 * GWO-1 — source timestamp normalization.
 *
 * Rules:
 * - offset/timezone present  -> safe ISO-8601 conversion (UTC, lossless)
 * - date-only source value   -> date-only semantics preserved ('YYYY-MM-DD')
 * - value without timezone   -> ambiguity preserved (raw value kept, flagged)
 * - unparseable value        -> kept verbatim, precision 'unknown'
 *
 * Precision is never fabricated and no timezone is ever assumed
 * (neither UTC nor Europe/Budapest).
 */

export type TimePrecision = 'datetime' | 'date' | 'unknown';

export interface NormalizedTimeValue {
  /** DTO-facing value; null when the source value is absent/empty. */
  value: string | null;
  raw: string | null;
  precision: TimePrecision;
  timezoneExplicit: boolean;
}

const DATE_ONLY = /^\d{4}-\d{2}-\d{2}$/;
const WITH_TIMEZONE = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(:\d{2}(\.\d{1,6})?)?(Z|[+-]\d{2}:?\d{2})$/;
const WITHOUT_TIMEZONE = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(:\d{2}(\.\d{1,6})?)?$/;

export function normalizeSourceTimestamp(raw: string | null | undefined): NormalizedTimeValue {
  if (typeof raw !== 'string' || raw.trim().length === 0) {
    return { value: null, raw: null, precision: 'unknown', timezoneExplicit: false };
  }
  const trimmed = raw.trim();

  if (DATE_ONLY.test(trimmed)) {
    return { value: trimmed, raw: trimmed, precision: 'date', timezoneExplicit: false };
  }

  if (WITH_TIMEZONE.test(trimmed)) {
    const parsed = new Date(trimmed);
    if (!Number.isNaN(parsed.getTime())) {
      return { value: parsed.toISOString(), raw: trimmed, precision: 'datetime', timezoneExplicit: true };
    }
  }

  if (WITHOUT_TIMEZONE.test(trimmed)) {
    // No timezone information in the source value: keep it and mark the ambiguity.
    return { value: trimmed, raw: trimmed, precision: 'datetime', timezoneExplicit: false };
  }

  return { value: trimmed, raw: trimmed, precision: 'unknown', timezoneExplicit: false };
}
