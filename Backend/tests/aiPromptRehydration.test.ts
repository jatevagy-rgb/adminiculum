/**
 * Prompt System 2.0 response import — canonical rehydration regression.
 *
 * `importPromptResponse` must reuse the repaired canonical rehydrator
 * (`Backend/src/modules/anonymize/rehydration.ts`) instead of the removed local
 * split/join implementation. These tests prove BOTH halves of that repair:
 *
 *  - canonical semantics are now inherited (normalized placeholder map,
 *    `$`-safe literal insertion, accented and space-bearing tokens, unresolved
 *    mapped-token detection, COMPLETE / PARTIAL / FAILED);
 *  - the persisted Prompt System contract is unchanged (`importedResponse`,
 *    `rehydratedResponse`, `rehydrationWarnings` as human-readable strings, and
 *    the AI_DRAFT transition with its transition guards).
 */

jest.mock('../src/prisma/prisma.service', () => ({
  prisma: {
    aiPromptDraft: {
      findUnique: jest.fn(),
      findMany: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
    },
    aiPromptTemplateVersion: {
      findFirst: jest.fn(),
      findUnique: jest.fn(),
      findMany: jest.fn(),
      create: jest.fn(),
    },
    case: { findUnique: jest.fn() },
    task: { findUnique: jest.fn() },
    caseWorkPackageItem: { findUnique: jest.fn() },
    document: { findMany: jest.fn() },
    documentVersion: { findUnique: jest.fn() },
  },
  default: {},
}));

jest.mock('../src/modules/cases/authorization', () => ({
  userCanManageCase: jest.fn().mockResolvedValue(true),
  userCanReadCase: jest.fn().mockResolvedValue(true),
}));

import { prisma } from '../src/prisma/prisma.service';
import {
  importPromptResponse,
  rehydratePromptResponse,
} from '../src/modules/ai-prompts/service';

const PERSON = { category: 'PERSON', original: 'Dr. John Smith', replacement: '[SZEMÉLY_1]' };

function mockDraft(overrides: Record<string, unknown> = {}) {
  const draft: Record<string, unknown> = {
    id: 'draft-1',
    caseId: 'case-1',
    rehydrationMap: [PERSON],
    status: 'PREPARED',
    preparedById: 'preparer-1',
    importedById: null,
    reviewerNotes: null,
    ...overrides,
  };
  (prisma.aiPromptDraft.findUnique as jest.Mock).mockResolvedValue(draft);
  (prisma.aiPromptDraft.update as jest.Mock).mockImplementation(
    async ({ data }: { data: Record<string, unknown> }) => Object.assign(draft, data),
  );
  return draft;
}

describe('Prompt System import reuses the canonical rehydrator', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('canonical rehydration semantics', () => {
    it('restores ordinary placeholders and reports COMPLETE', () => {
      const result = rehydratePromptResponse('Review [SZEMÉLY_1].', [PERSON]);
      expect(result.text).toBe('Review Dr. John Smith.');
      expect(result.rehydrationStatus).toBe('COMPLETE');
      expect(result.warnings).toEqual([]);
      expect(result.totalTokens).toBe(1);
      expect(result.resolvedTokens).toBe(1);
      expect(result.unresolvedTokens).toBe(0);
    });

    it('matches accented Hungarian prefixes and accent-only placeholders', () => {
      const result = rehydratePromptResponse(
        'Adószám: [ADÓSZÁM_1]; megbízó: [MEGBÍZÓ]; cím: [CÍM_1]',
        [
          { category: 'TAX_ID', original: '12345678-1-42', replacement: '[ADÓSZÁM_1]' },
          { category: 'PERSON', original: 'Kovács Anna', replacement: '[MEGBÍZÓ]' },
          { category: 'ADDRESS', original: '1051 Budapest, Fő utca 1.', replacement: '[CÍM_1]' },
        ],
      );
      expect(result.text).toBe('Adószám: 12345678-1-42; megbízó: Kovács Anna; cím: 1051 Budapest, Fő utca 1.');
      expect(result.rehydrationStatus).toBe('COMPLETE');
      expect(result.warnings).toEqual([]);
    });

    it('matches a space-bearing placeholder that the canonical parser accepts', () => {
      const result = rehydratePromptResponse('Ellenérdekű fél: [ELLENÉRDEKŰ FÉL]', [
        { category: 'ORGANIZATION', original: 'Ellenoldali Kft.', replacement: '[ELLENÉRDEKŰ FÉL]' },
      ]);
      expect(result.text).toBe('Ellenérdekű fél: Ellenoldali Kft.');
      expect(result.rehydrationStatus).toBe('COMPLETE');
    });

    it('resolves a lower-cased token through the canonical normalized map', () => {
      const result = rehydratePromptResponse('Review [személy_1].', [PERSON]);
      expect(result.text).toBe('Review Dr. John Smith.');
      expect(result.rehydrationStatus).toBe('COMPLETE');
    });

    it('inserts originals containing $-sequences literally', () => {
      const original = "Cég $& Kft. — díj: $1, minta: $` és $'";
      const result = rehydratePromptResponse('Szerződő: [SZERVEZET_1]', [
        { category: 'ORGANIZATION', original, replacement: '[SZERVEZET_1]' },
      ]);
      expect(result.text).toBe(`Szerződő: ${original}`);
      expect(result.rehydrationStatus).toBe('COMPLETE');
      expect(result.warnings).toEqual([]);
    });

    it('keeps the response untouched when the draft has no mapping', () => {
      expect(rehydratePromptResponse('Nincs itt helyőrző.', [])).toEqual({
        text: 'Nincs itt helyőrző.',
        warnings: [],
        rehydrationStatus: 'COMPLETE',
        totalTokens: 0,
        resolvedTokens: 0,
        unresolvedTokens: 0,
      });
      expect(rehydratePromptResponse('Nincs itt helyőrző.', undefined).text).toBe('Nincs itt helyőrző.');
    });

    it('ignores unusable persisted mapping rows instead of inflating token counts', () => {
      const result = rehydratePromptResponse('Review [SZEMÉLY_1].', [
        { category: 'PERSON', original: 'ignored', replacement: '   ' },
        PERSON,
      ]);
      expect(result.totalTokens).toBe(1);
      expect(result.text).toBe('Review Dr. John Smith.');
    });

    it('retains unknown placeholders with the existing wording and leaves citations alone', () => {
      const result = rehydratePromptResponse('See [ISMERETLEN_9] and [link] plus [1].', [PERSON]);
      expect(result.warnings).toEqual(['unknown placeholder retained: [ISMERETLEN_9]']);
      expect(result.text).toBe('See [ISMERETLEN_9] and [link] plus [1].');
      expect(result.unresolvedTokens).toBe(1);
      expect(result.rehydrationStatus).toBe('FAILED');
    });

    it('reports PARTIAL when some tokens resolve and others do not', () => {
      const result = rehydratePromptResponse('Review [SZEMÉLY_1] with [HIÁNYZÓ_2].', [PERSON]);
      expect(result.text).toBe('Review Dr. John Smith with [HIÁNYZÓ_2].');
      expect(result.rehydrationStatus).toBe('PARTIAL');
      expect(result.resolvedTokens).toBe(1);
      expect(result.unresolvedTokens).toBe(1);
      expect(result.warnings).toEqual(['unknown placeholder retained: [HIÁNYZÓ_2]']);
    });

    it('detects a mapped placeholder still present after the token pass (malformed persisted mapping)', () => {
      // The persisted mapping is arbitrary JSON in the database, so a token the
      // bracketed-token parser cannot match (here: an embedded newline) must be
      // surfaced rather than silently dropped.
      const result = rehydratePromptResponse('Érintett: [EGYÉB\n1]', [
        { category: 'OTHER', original: 'Nagy Zsolt', replacement: '[EGYÉB\n1]' },
      ]);
      expect(result.warnings).toEqual([
        'Placeholder still present in output - could not resolve: [EGYÉB\n1]',
      ]);
      expect(result.text).toBe('Érintett: [EGYÉB\n1]');
      expect(result.rehydrationStatus).toBe('FAILED');
    });

    it('reports FAILED for an empty response without inventing content', () => {
      // The HTTP route already rejects empty imports (AI_RESPONSE_REQUIRED);
      // this pins the service-level canonical semantics.
      const result = rehydratePromptResponse('   ', [PERSON]);
      expect(result.rehydrationStatus).toBe('FAILED');
      expect(result.text).toBe('');
      expect(result.warnings).toEqual(['AI response text is empty']);
      expect(result.resolvedTokens).toBe(0);
      expect(result.unresolvedTokens).toBe(1);
    });
  });

  describe('preserved import contract', () => {
    it('persists the canonical rehydration without changing the draft contract', async () => {
      const draft = mockDraft();
      const imported = await importPromptResponse(
        { userId: 'importer-1', role: 'LAWYER' },
        'draft-1',
        'Finding: [SZEMÉLY_1] is named.',
      );

      expect(imported.importedResponse).toBe('Finding: [SZEMÉLY_1] is named.');
      expect(imported.rehydratedResponse).toBe('Finding: Dr. John Smith is named.');
      expect(imported.rehydrationWarnings).toEqual([]);
      expect(imported.status).toBe('AI_DRAFT');
      expect(imported.importedById).toBe('importer-1');
      expect(draft.rehydratedResponse).toBe('Finding: Dr. John Smith is named.');
    });

    it('persists unresolved warnings as the human-readable strings the review UI renders', async () => {
      mockDraft();
      const imported = await importPromptResponse(
        { userId: 'importer-1' },
        'draft-1',
        'Finding: [SZEMÉLY_1] and [HIÁNYZÓ_2]',
      );

      expect(imported.rehydrationWarnings).toEqual(['unknown placeholder retained: [HIÁNYZÓ_2]']);
      expect(imported.rehydratedResponse).toBe('Finding: Dr. John Smith and [HIÁNYZÓ_2]');
      expect(imported.status).toBe('AI_DRAFT');
    });

    it('still allows re-import after RETURNED_FOR_CORRECTION', async () => {
      mockDraft({ status: 'RETURNED_FOR_CORRECTION' });
      const imported = await importPromptResponse({ userId: 'importer-2' }, 'draft-1', 'Review [személy_1].');
      expect(imported.rehydratedResponse).toBe('Review Dr. John Smith.');
      expect(imported.status).toBe('AI_DRAFT');
    });

    it('keeps the transition guards intact for an already-imported draft', async () => {
      mockDraft({ status: 'AI_DRAFT' });
      await expect(
        importPromptResponse({ userId: 'importer-1' }, 'draft-1', 'again'),
      ).rejects.toMatchObject({ code: 'INVALID_AI_DRAFT_TRANSITION' });
    });
  });
});
