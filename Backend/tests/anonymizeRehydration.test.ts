import { rehydrateDocument } from '../src/modules/anonymize/rehydration';
import { sanitizeRedactedItems, toWorkingAnonymizationResult } from '../src/modules/anonymize/dto';

describe('rehydrateDocument — reversible pseudonymization', () => {
  it('restores Hungarian accented placeholders (AZONOSÍTÓ, CÍM, SZÜLETÉSI_HELY, KÉPVISELŐ)', () => {
    const items = [
      { replacement: '[AZONOSÍTÓ_1]', original: '12345678' },
      { replacement: '[CÍM_1]', original: 'Budapest, Fő utca 1.' },
      { replacement: '[SZÜLETÉSI_HELY_1]', original: 'Debrecen' },
      { replacement: '[KÉPVISELŐ_1]', original: 'Kovács János' },
    ];
    const result = rehydrateDocument(
      'Azonosító [AZONOSÍTÓ_1], cím [CÍM_1], születési hely [SZÜLETÉSI_HELY_1], képviselő [KÉPVISELŐ_1].',
      items,
    );
    expect(result.rehydrationStatus).toBe('COMPLETE');
    expect(result.resolvedTokens).toBe(4);
    expect(result.unresolvedTokens).toBe(0);
    expect(result.rehydratedContent).toBe(
      'Azonosító 12345678, cím Budapest, Fő utca 1., születési hely Debrecen, képviselő Kovács János.',
    );
  });

  it('restores underscore-free role tokens and space-separated counterparty tokens', () => {
    const items = [
      { replacement: '[MEGBÍZÓ]', original: 'Teszt Elek' },
      { replacement: '[ELLENÉRDEKŰ FÉL]', original: 'Példa Zrt.' },
    ];
    const result = rehydrateDocument('[MEGBÍZÓ] kontra [ELLENÉRDEKŰ FÉL].', items);
    expect(result.rehydrationStatus).toBe('COMPLETE');
    expect(result.rehydratedContent).toBe('Teszt Elek kontra Példa Zrt..');
  });

  it('does not corrupt [SZEMÉLY_1] inside [SZEMÉLY_10]', () => {
    const items = [
      { replacement: '[SZEMÉLY_1]', original: 'Anna' },
      { replacement: '[SZEMÉLY_10]', original: 'Béla' },
    ];
    const result = rehydrateDocument('[SZEMÉLY_1] és [SZEMÉLY_10].', items);
    expect(result.rehydrationStatus).toBe('COMPLETE');
    expect(result.rehydratedContent).toBe('Anna és Béla.');
  });

  it('never substitutes a prefix token into a longer unknown token', () => {
    const items = [{ replacement: '[SZEMÉLY_1]', original: 'Anna' }];
    const result = rehydrateDocument('Csak [SZEMÉLY_10] szerepel.', items);
    expect(result.rehydratedContent).toBe('Csak [SZEMÉLY_10] szerepel.');
    expect(result.rehydrationStatus).toBe('FAILED');
    expect(result.success).toBe(false);
    expect(result.warnings.some((w) => w.token === '[SZEMÉLY_10]')).toBe(true);
  });

  it('resolves repeated placeholders consistently to the same original', () => {
    const items = [{ replacement: '[EMAIL_1]', original: 'secret.person@example.test' }];
    const result = rehydrateDocument('[EMAIL_1] és újra [EMAIL_1].', items);
    expect(result.rehydratedContent).toBe('secret.person@example.test és újra secret.person@example.test.');
    expect(result.totalTokens).toBe(1);
    expect(result.resolvedTokens).toBe(1);
    expect(result.unresolvedTokens).toBe(0);
  });

  it('counts unique tokens, not occurrences, even when redactedItems repeat', () => {
    const items = [
      { replacement: '[EMAIL_1]', original: 'a@b.c' },
      { replacement: '[EMAIL_1]', original: 'a@b.c' },
      { replacement: '[EMAIL_1]', original: 'a@b.c' },
    ];
    const result = rehydrateDocument('[EMAIL_1] [EMAIL_1] [EMAIL_1].', items);
    expect(result.rehydratedContent).toBe('a@b.c a@b.c a@b.c.');
    expect(result.totalTokens).toBe(1);
    expect(result.resolvedTokens).toBe(1);
    expect(result.unresolvedTokens).toBe(0);
  });

  it('restores original values containing $-replacement sequences literally', () => {
    const items = [
      { replacement: '[SZEMÉLY_1]', original: `A $& B` },
      { replacement: '[SZEMÉLY_2]', original: `C $1 D` },
      { replacement: '[SZEMÉLY_3]', original: `E $\` F` },
      { replacement: '[SZEMÉLY_4]', original: `G $' H` },
      { replacement: '[SZEMÉLY_5]', original: `Price $50.00` },
    ];
    const result = rehydrateDocument(
      '[SZEMÉLY_1] | [SZEMÉLY_2] | [SZEMÉLY_3] | [SZEMÉLY_4] | [SZEMÉLY_5]',
      items,
    );
    expect(result.rehydrationStatus).toBe('COMPLETE');
    expect(result.rehydratedContent).toBe(
      `A $& B | C $1 D | E $\` F | G $' H | Price $50.00`,
    );
  });

  it('leaves unknown placeholders visible and reports them instead of deleting', () => {
    const items = [{ replacement: '[EMAIL_1]', original: 'a@b.c' }];
    const result = rehydrateDocument('Ismert [EMAIL_1], ismeretlen [ISMERETLEN_1].', items);
    expect(result.rehydratedContent).toContain('[ISMERETLEN_1]');
    expect(result.rehydrationStatus).toBe('PARTIAL');
    expect(result.warnings.some((w) => w.token === '[ISMERETLEN_1]')).toBe(true);
  });

  it('does not flag arbitrary bracketed text as placeholders', () => {
    const items = [{ replacement: '[EMAIL_1]', original: 'a@b.c' }];
    const result = rehydrateDocument('Lásd [1] és [link]. [EMAIL_1].', items);
    expect(result.rehydratedContent).toBe('Lásd [1] és [link]. a@b.c.');
    expect(result.rehydrationStatus).toBe('COMPLETE');
  });

  it('handles an empty AI response without crashing', () => {
    const result = rehydrateDocument('   ', [{ replacement: '[EMAIL_1]', original: 'a@b.c' }]);
    expect(result.success).toBe(false);
    expect(result.rehydrationStatus).toBe('FAILED');
    expect(result.rehydratedContent).toBeNull();
  });

  it('returns the response unchanged when there are no redactions', () => {
    const result = rehydrateDocument('plain text', []);
    expect(result.success).toBe(true);
    expect(result.rehydratedContent).toBe('plain text');
  });
});

describe('anonymize DTO sanitization — mapping never leaves the safe DTO', () => {
  it('strips `original` (PII) from redactedItems', () => {
    const items = [
      { type: 'client.name', original: 'Teszt Elek', replacement: '[ÜGYFÉL]', position: 0 },
    ];
    const sanitized = sanitizeRedactedItems(items) as Array<Record<string, unknown>>;
    expect(sanitized[0]).not.toHaveProperty('original');
    expect(sanitized[0].replacement).toBe('[ÜGYFÉL]');
    expect(sanitized[0].type).toBe('client.name');
  });

  it('working anonymization result excludes the mapping and the AI-ready prompt', () => {
    const result = toWorkingAnonymizationResult({
      success: true,
      anonymizedDocumentId: 'anon-1',
      redactedText: 'Szöveg [ÜGYFÉL].',
      redactedItems: [
        { type: 'client.name', original: 'Teszt Elek', replacement: '[ÜGYFÉL]', position: 0 },
        { type: 'EMAIL', original: 'secret.person@example.test', replacement: '[EMAIL_1]', position: 1 },
      ],
    });
    const serialized = JSON.stringify(result);
    expect(serialized).not.toContain('Teszt Elek');
    expect(serialized).not.toContain('secret.person@example.test');
    expect(result).not.toHaveProperty('aiReadyPrompt');
  });
});
