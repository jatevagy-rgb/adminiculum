/**
 * Deterministic placeholder (pseudonym) generation (ANONYMIZATION-FOUNDATION-1).
 *
 * Pseudonymization is a REPLACEMENT with a stable placeholder. The same
 * original value in one work package always receives the same placeholder, and
 * different values receive different placeholders. Assignment is a pure
 * function of the ordered input, so identical input + identical approvals
 * always produce identical placeholders.
 *
 * The module never claims irreversible anonymization: the mapping back to the
 * original values lives only inside the in-memory operation result and is never
 * exported or persisted.
 */

import type { SensitiveCategory } from './types';

/** Placeholder prefixes per category, following the Hungarian UI vocabulary. */
const PREFIX_BY_CATEGORY: Record<SensitiveCategory, string> = {
  EMAIL: 'EMAIL',
  PHONE: 'TELEFON',
  IBAN: 'IBAN',
  TAX_ID: 'ADÓSZÁM',
  IDENTIFIER: 'AZONOSÍTÓ',
  ADDRESS: 'CÍM',
  PERSON: 'SZEMÉLY',
  ORGANIZATION: 'SZERVEZET',
  PROJECT: 'PROJEKT',
  BUSINESS_SECRET: 'ÜZLETI_TITOK',
  OTHER_SENSITIVE: 'EGYÉB',
};

/**
 * Create a placeholder of the form `[PREFIX_n]`, e.g. `[SZEMÉLY_1]`,
 * `[EMAIL_1]`, `[TELEFON_1]`, `[CÍM_1]`, `[IBAN_1]`, `[AZONOSÍTÓ_1]`,
 * `[ÜZLETI_TITOK_1]`.
 */
export function placeholderFor(category: SensitiveCategory, index: number): string {
  return `[${PREFIX_BY_CATEGORY[category]}_${index}]`;
}

/**
 * Deterministic assigner that maps original values to placeholders.
 *
 * `consume` is called for each approved redaction in ascending source-offset
 * order. The first distinct value per category receives index 1, the next 2,
 * and so on. Identical normalized values always resolve to the same placeholder.
 */
export class PseudonymAssigner {
  private readonly byKey = new Map<string, string>();
  private readonly nextIndexByCategory = new Map<SensitiveCategory, number>();

  /** Normalization used ONLY for grouping — original values are never exported. */
  static normalizeKey(category: SensitiveCategory, original: string): string {
    return `${category}::${original.normalize('NFD').toLowerCase().replace(/\p{M}/gu, '')}`;
  }

  assign(category: SensitiveCategory, original: string): string {
    const key = PseudonymAssigner.normalizeKey(category, original);
    const existing = this.byKey.get(key);
    if (existing !== undefined) {
      return existing;
    }
    const next = (this.nextIndexByCategory.get(category) ?? 0) + 1;
    this.nextIndexByCategory.set(category, next);
    const placeholder = placeholderFor(category, next);
    this.byKey.set(key, placeholder);
    return placeholder;
  }
}