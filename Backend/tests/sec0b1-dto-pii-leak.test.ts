/**
 * SEC-0B1 P1 FIX: DTO-level PII leak tests.
 *
 * Locks the security boundary: Working DTO never exposes original PII or
 * customPrompt. Summary DTO contains neither. Sensitive DTO contains full
 * data only behind access gate.
 */

import { toSummary, toWorking, toSensitive } from '../src/modules/anonymize/dto';

// ---------------------------------------------------------------------------
// Test fixtures
// ---------------------------------------------------------------------------

const ANON_DOC_WITH_PII = {
  id: 'anon-1',
  name: 'Test Document',
  caseId: 'case-1',
  sourceDocId: 'doc-1',
  aiTask: 'ANONYMIZE',
  rehydrationStatus: 'COMPLETED',
  rehydratedAt: new Date('2025-01-15'),
  createdAt: new Date('2025-01-10'),
  updatedAt: new Date('2025-01-12'),
  patternCount: 5,
  content: 'A szerződés aláírása [TOKEN_1] napon történt.',
  redactedItems: [
    {
      type: 'PERSON_NAME',
      original: 'Kovács Péter',
      replacement: '[TOKEN_1]',
      position: { start: 25, end: 38 },
    },
    {
      type: 'EMAIL',
      original: 'kovacs.peter@example.hu',
      replacement: '[TOKEN_2]',
      position: { start: 100, end: 123 },
    },
  ],
  customPrompt: 'Kérjük, anonymizálja a személyneveket és email címeket.',
  rehydratedContent: 'A szerződés aláírása Kovács Péter napon történt.',
  aiResponseText: 'Anonymization complete.',
  rehydrationWarnings: [],
  originalDocId: 'doc-1',
};

const ANON_DOC_MINIMAL = {
  id: 'anon-2',
  name: 'Minimal Doc',
  caseId: 'case-2',
  sourceDocId: 'doc-2',
  aiTask: null,
  rehydrationStatus: null,
  rehydratedAt: null,
  createdAt: new Date('2025-02-01'),
  updatedAt: null,
  patternCount: null,
  content: null,
  redactedItems: null,
  customPrompt: null,
  rehydratedContent: null,
  aiResponseText: null,
  rehydrationWarnings: null,
  originalDocId: null,
};

// ---------------------------------------------------------------------------
// Summary DTO
// ---------------------------------------------------------------------------

describe('SEC-0B1 P1: Summary DTO', () => {
  it('contains no redactedItems', () => {
    const summary = toSummary(ANON_DOC_WITH_PII);
    expect(summary).not.toHaveProperty('redactedItems');
    expect(summary).not.toHaveProperty('redactedText');
  });

  it('contains no customPrompt', () => {
    const summary = toSummary(ANON_DOC_WITH_PII);
    expect(summary).not.toHaveProperty('customPrompt');
  });

  it('contains no original PII', () => {
    const summary = toSummary(ANON_DOC_WITH_PII);
    const json = JSON.stringify(summary);
    expect(json).not.toContain('Kovács Péter');
    expect(json).not.toContain('kovacs.peter@example.hu');
  });

  it('contains no rehydratedContent', () => {
    const summary = toSummary(ANON_DOC_WITH_PII);
    expect(summary).not.toHaveProperty('rehydratedContent');
  });
});

// ---------------------------------------------------------------------------
// Working DTO
// ---------------------------------------------------------------------------

describe('SEC-0B1 P1: Working DTO', () => {
  it('contains no customPrompt', () => {
    const working = toWorking(ANON_DOC_WITH_PII);
    expect(working).not.toHaveProperty('customPrompt');
  });

  it('contains no original PII in redactedItems', () => {
    const working = toWorking(ANON_DOC_WITH_PII);
    const items = working.redactedItems as any[];
    expect(items).toBeDefined();
    expect(Array.isArray(items)).toBe(true);

    for (const item of items) {
      expect(item).not.toHaveProperty('original');
      // Ensure safe fields ARE present
      expect(item).toHaveProperty('type');
      expect(item).toHaveProperty('replacement');
      expect(item).toHaveProperty('position');
    }
  });

  it('redactedItems does not contain PII string values', () => {
    const working = toWorking(ANON_DOC_WITH_PII);
    const json = JSON.stringify(working);
    expect(json).not.toContain('Kovács Péter');
    expect(json).not.toContain('kovacs.peter@example.hu');
  });

  it('redactedText IS present in Working', () => {
    const working = toWorking(ANON_DOC_WITH_PII);
    expect(working.redactedText).toBe('A szerződés aláírása [TOKEN_1] napon történt.');
  });

  it('strips original from items with null fields gracefully', () => {
    const docWithPartial = {
      ...ANON_DOC_WITH_PII,
      redactedItems: [
        { type: 'PERSON_NAME', original: 'Test', replacement: '[T]' },
        { type: 'EMAIL' }, // missing all fields
        null,
        'not-an-object',
      ],
    };
    const working = toWorking(docWithPartial);
    const items = working.redactedItems as any[];
    expect(items).toHaveLength(4);
    expect(items[0]).toEqual({ type: 'PERSON_NAME', replacement: '[T]' });
    expect(items[1]).toEqual({ type: 'EMAIL' });
    expect(items[2]).toBeNull();
    expect(items[3]).toBe('not-an-object');
  });

  it('returns null redactedItems when source is null', () => {
    const working = toWorking(ANON_DOC_MINIMAL);
    expect(working.redactedItems).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// Sensitive DTO
// ---------------------------------------------------------------------------

describe('SEC-0B1 P1: Sensitive DTO', () => {
  it('contains full redactedItems with original PII', () => {
    const sensitive = toSensitive(ANON_DOC_WITH_PII);
    const fullItems = (sensitive as any).redactedItemsFull;
    expect(fullItems).toBeDefined();
    expect(Array.isArray(fullItems)).toBe(true);
    expect(fullItems[0]).toHaveProperty('original', 'Kovács Péter');
    expect(fullItems[1]).toHaveProperty('original', 'kovacs.peter@example.hu');
  });

  it('contains customPrompt', () => {
    const sensitive = toSensitive(ANON_DOC_WITH_PII);
    expect((sensitive as any).customPrompt).toBe(
      'Kérjük, anonymizálja a személyneveket és email címeket.'
    );
  });

  it('contains rehydratedContent', () => {
    const sensitive = toSensitive(ANON_DOC_WITH_PII);
    expect(sensitive.rehydratedContent).toBe('A szerződés aláírása Kovács Péter napon történt.');
  });

  it('Working-level redactedItems are still sanitized in Sensitive', () => {
    const sensitive = toSensitive(ANON_DOC_WITH_PII);
    const items = sensitive.redactedItems as any[];
    for (const item of items) {
      expect(item).not.toHaveProperty('original');
    }
  });
});

// ---------------------------------------------------------------------------
// Sanitize edge cases
// ---------------------------------------------------------------------------

describe('SEC-0B1 P1: sanitizeRedactedItems edge cases', () => {
  it('handles empty array', () => {
    const working = toWorking({ ...ANON_DOC_WITH_PII, redactedItems: [] });
    expect(working.redactedItems).toEqual([]);
  });

  it('handles items with no safe fields', () => {
    const working = toWorking({
      ...ANON_DOC_WITH_PII,
      redactedItems: [{ original: 'PII', unknownField: 'test' }],
    });
    const items = working.redactedItems as any[];
    expect(items[0]).toEqual({});
  });

  it('handles nested objects in position field', () => {
    const working = toWorking({
      ...ANON_DOC_WITH_PII,
      redactedItems: [
        {
          type: 'PERSON_NAME',
          original: 'Secret',
          replacement: '[T]',
          position: { start: 0, end: 6, line: 1 },
        },
      ],
    });
    const items = working.redactedItems as any[];
    expect(items[0].position).toEqual({ start: 0, end: 6, line: 1 });
  });

  it('does not mutate the original document object', () => {
    const doc = { ...ANON_DOC_WITH_PII };
    toWorking(doc);
    const items = doc.redactedItems as any[];
    expect(items[0]).toHaveProperty('original', 'Kovács Péter');
  });
});
