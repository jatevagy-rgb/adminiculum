import { PrismaClient } from '@prisma/client';

const databaseUrl = process.env.AI_PROMPT_TEST_DATABASE_URL || process.env.MIGRATION_REPLAY_DATABASE_URL;
const describeWithDatabase = databaseUrl ? describe : describe.skip;

describeWithDatabase('AI prompt handoff PostgreSQL persistence', () => {
  let db: PrismaClient;
  const templateId = 'a1000000-0000-4000-8000-000000000001';
  const draftId = 'a2000000-0000-4000-8000-000000000001';

  beforeAll(async () => {
    db = new PrismaClient({ datasources: { db: { url: databaseUrl } } });
    await db.$connect();
  });

  afterAll(async () => {
    await db.aiPromptDraft.deleteMany({ where: { id: draftId } });
    await db.aiPromptTemplateVersion.deleteMany({ where: { id: templateId } });
    await db.$disconnect();
  });

  it('stores immutable template and draft provenance without an external rehydration map', async () => {
    await db.aiPromptTemplateVersion.create({
      data: {
        id: templateId,
        stableKey: 'integration-contract-review',
        version: 1,
        title: 'Integration contract review',
        legalWorkCategory: 'CONTRACT_REVIEW',
        blocks: [{ key: 'role', label: 'ROLE / TASK', content: 'Review safely.' }],
        outputInstructions: 'Return sourced findings.',
        verificationChecklist: ['Sources checked'],
      },
    });
    await db.aiPromptDraft.create({
      data: {
        id: draftId,
        caseId: 'a3000000-0000-4000-8000-000000000001',
        promptTemplateId: templateId,
        promptTemplateStableKey: 'integration-contract-review',
        promptTemplateVersion: 1,
        promptTemplateSnapshot: { stableKey: 'integration-contract-review', version: 1 },
        sourceDocumentIds: ['a4000000-0000-4000-8000-000000000001'],
        sourceDocumentVersionIds: ['a5000000-0000-4000-8000-000000000001'],
        selectedContext: { source: 'explicit-selection' },
        anonymizedPreview: 'Review [SZEMÉLY_1].',
        externalPromptText: 'Review [SZEMÉLY_1].',
        rehydrationMap: [{ category: 'PERSON', original: 'Private Person', replacement: '[SZEMÉLY_1]' }],
        anonymizationSnapshot: { contentType: 'anonymized-work-package', schemaVersion: 1 },
        preparedById: 'a6000000-0000-4000-8000-000000000001',
      },
    });
    const draft = await db.aiPromptDraft.findUniqueOrThrow({ where: { id: draftId } });
    expect(draft.externalPromptText).not.toContain('Private Person');
    expect(draft.sourceDocumentVersionIds).toEqual(['a5000000-0000-4000-8000-000000000001']);
    expect(draft.promptTemplateVersion).toBe(1);
  });
});
