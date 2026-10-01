import { buildSafeAnonymizationContext } from '../src/modules/anonymize/safeContext';

const FULL_INPUT = {
  sourceId: 'src-doc-1',
  caseId: 'case-1',
  clientId: 'client-1',
  documentId: 'anon-1',
  versionId: 'ver-3',
  anonymizedDocumentId: 'anon-1',
  name: '[ANONYMIZED] szerzodes.docx',
  redactedText: 'A [ÜGYFÉL] szerződése [AZONOSÍTÓ_1] azonosítóval.',
  rehydrationStatus: 'PENDING',
};

describe('buildSafeAnonymizationContext — WF04 sanitized handoff', () => {
  it('echoes exact provenance ids (source, case, client, document, version)', () => {
    const ctx = buildSafeAnonymizationContext(FULL_INPUT);
    expect(ctx.provenance).toEqual({
      sourceId: 'src-doc-1',
      caseId: 'case-1',
      clientId: 'client-1',
      documentId: 'anon-1',
      versionId: 'ver-3',
    });
  });

  it('marks availability and readiness from actual sanitized text and artifact id', () => {
    const ctx = buildSafeAnonymizationContext(FULL_INPUT);
    expect(ctx.artifact.available).toBe(true);
    expect(ctx.readiness.isReady).toBe(true);
    expect(ctx.readiness.reasons).toEqual([]);
  });

  it('is not ready when sanitized text is missing', () => {
    const ctx = buildSafeAnonymizationContext({
      sourceId: 'src-doc-1',
      anonymizedDocumentId: 'anon-1',
      redactedText: '   ',
    });
    expect(ctx.artifact.available).toBe(false);
    expect(ctx.readiness.isReady).toBe(false);
    expect(ctx.readiness.reasons).toContain('Sanitized text is not available.');
  });

  it('is not ready when the artifact identity is missing', () => {
    const ctx = buildSafeAnonymizationContext({
      sourceId: 'src-doc-1',
      redactedText: 'szöveg',
    });
    expect(ctx.readiness.isReady).toBe(false);
    expect(ctx.readiness.reasons).toContain('Anonymized artifact identity is missing.');
  });

  it('is not ready when rehydration status is FAILED', () => {
    const ctx = buildSafeAnonymizationContext({
      ...FULL_INPUT,
      rehydrationStatus: 'FAILED',
    });
    expect(ctx.artifact.available).toBe(true);
    expect(ctx.readiness.isReady).toBe(false);
    expect(ctx.readiness.reasons).toContain('Rehydration status is FAILED.');
  });

  it('never serializes the rehydration map, raw originals or prompts', () => {
    const ctx = buildSafeAnonymizationContext(FULL_INPUT);
    const keys = collectObjectKeys(JSON.parse(JSON.stringify(ctx)));
    for (const forbidden of ['redactedItems', 'original', 'rehydratedContent', 'aiResponseText', 'customPrompt', 'aiReadyPrompt']) {
      expect(keys).not.toContain(forbidden);
    }
  });

  it('drops unknown input fields instead of forwarding them', () => {
    const ctx = buildSafeAnonymizationContext({
      ...FULL_INPUT,
      redactedItems: [{ original: 'Titok', replacement: '[ÜGYFÉL]' }],
      rehydratedContent: 'Titok',
    } as never);
    const serialized = JSON.stringify(ctx);
    expect(serialized).not.toContain('Titok');
    expect(serialized).not.toContain('redactedItems');
  });

  it('describes server-side association verification without claiming safety', () => {
    const ctx = buildSafeAnonymizationContext(FULL_INPUT);
    expect(ctx.serverAssociation.mechanism).toBe('anonymous-document-row');
    expect(ctx.serverAssociation.fields).toContain('sourceDocId');
    expect(ctx.serverAssociation.fields).toContain('caseId');
    expect(ctx.safetyNotes.join(' ')).toContain('isReady describes availability');
  });
});

function collectObjectKeys(value: unknown, keys: string[] = []): string[] {
  if (Array.isArray(value)) {
    for (const item of value) collectObjectKeys(item, keys);
  } else if (value && typeof value === 'object') {
    for (const [key, child] of Object.entries(value as Record<string, unknown>)) {
      keys.push(key);
      collectObjectKeys(child, keys);
    }
  }
  return keys;
}
