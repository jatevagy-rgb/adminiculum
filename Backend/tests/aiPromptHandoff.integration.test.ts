import crypto from 'node:crypto';
import { PrismaClient } from '@prisma/client';
import {
  approvePromptDraft,
  createPromptTemplateVersion,
  importPromptResponse,
  preparePromptDraft,
  verifyPromptDraft,
} from '../src/modules/ai-prompts/service';

const databaseUrl = process.env.AI_PROMPT_TEST_DATABASE_URL || process.env.MIGRATION_REPLAY_DATABASE_URL;
const describeWithDatabase = databaseUrl ? describe : describe.skip;

jest.mock('../src/prisma/prisma.service', () => {
  const { PrismaClient: TestPrismaClient } = require('@prisma/client') as typeof import('@prisma/client');
  return {
    prisma: new TestPrismaClient({
      datasources: {
        db: {
          url:
            process.env.AI_PROMPT_TEST_DATABASE_URL ||
            process.env.MIGRATION_REPLAY_DATABASE_URL ||
            'postgresql://localhost/unused',
        },
      },
    }),
  };
});

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

describeWithDatabase('AI prompt handoff PostgreSQL behavior', () => {
  let db: PrismaClient;
  const suffix = crypto.randomUUID();
  const ids = {
    admin: crypto.randomUUID(),
    junior: crypto.randomUUID(),
    lawyer: crypto.randomUUID(),
    client: crypto.randomUUID(),
    otherClient: crypto.randomUUID(),
    case: crypto.randomUUID(),
    otherCase: crypto.randomUUID(),
    document: crypto.randomUUID(),
    otherDocument: crypto.randomUUID(),
    version: crypto.randomUUID(),
    otherVersion: crypto.randomUUID(),
    task: crypto.randomUUID(),
    otherTask: crypto.randomUUID(),
    template: crypto.randomUUID(),
    templateV2: crypto.randomUUID(),
  };

  const adminActor = { userId: ids.admin, role: 'ADMIN' };
  const juniorActor = { userId: ids.junior, role: 'TRAINEE' };
  const lawyerActor = { userId: ids.lawyer, role: 'LAWYER' };
  const createdTemplateIds: string[] = [];

  beforeAll(async () => {
    db = new PrismaClient({ datasources: { db: { url: databaseUrl } } });
    await db.user.createMany({
      data: [
        { id: ids.admin, email: `prompt-admin-${suffix}@example.invalid`, name: 'Prompt Admin', role: 'ADMIN', status: 'ACTIVE', isActive: true, skills: [] },
        { id: ids.junior, email: `prompt-junior-${suffix}@example.invalid`, name: 'Prompt Junior', role: 'TRAINEE', status: 'ACTIVE', isActive: true, skills: [] },
        { id: ids.lawyer, email: `prompt-lawyer-${suffix}@example.invalid`, name: 'Prompt Lawyer', role: 'LAWYER', status: 'ACTIVE', isActive: true, skills: [] },
      ],
    });
    await db.client.createMany({
      data: [
        { id: ids.client, name: `Prompt Client ${suffix}` },
        { id: ids.otherClient, name: `Other Prompt Client ${suffix}` },
      ],
    });
    await db.case.createMany({
      data: [
        { id: ids.case, caseNumber: `PROMPT-${suffix.slice(0, 8)}`, title: 'Prompt case', caseType: 'CONTRACT_REVIEW', clientId: ids.client, createdById: ids.admin, assignedLawyerId: ids.admin },
        { id: ids.otherCase, caseNumber: `PROMPT-X-${suffix.slice(0, 8)}`, title: 'Other prompt case', caseType: 'CONTRACT_REVIEW', clientId: ids.otherClient, createdById: ids.admin, assignedLawyerId: ids.admin },
      ],
    });
    await db.document.createMany({
      data: [
        { id: ids.document, name: 'Selected document', title: 'Selected document', category: 'CONTRACT', caseId: ids.case, clientId: ids.client, workspaceText: 'Dr. John Smith reviewed Prompt Client.' },
        { id: ids.otherDocument, name: 'Foreign document', title: 'Foreign document', category: 'CONTRACT', caseId: ids.otherCase, clientId: ids.otherClient, workspaceText: 'Foreign content.' },
      ] as never,
    });
    await db.documentVersion.createMany({
      data: [
        { id: ids.version, documentId: ids.document, version: 1, name: 'Selected document v1', description: 'Dr. John Smith reviewed Prompt Client.', uploadedById: ids.admin, isCurrent: true },
        { id: ids.otherVersion, documentId: ids.otherDocument, version: 1, name: 'Foreign document v1', description: 'Foreign content.', uploadedById: ids.admin, isCurrent: true },
      ],
    });
    await db.task.createMany({
      data: [
        { id: ids.task, caseId: ids.case, title: 'Prompt task', taskType: 'OTHER', type: 'OTHER', status: 'TODO', priority: 'MEDIUM', assignedById: ids.admin, requiredSkills: [] },
        { id: ids.otherTask, caseId: ids.otherCase, title: 'Foreign task', taskType: 'OTHER', type: 'OTHER', status: 'TODO', priority: 'MEDIUM', assignedById: ids.admin, requiredSkills: [] },
      ] as never,
    });
  });

  afterAll(async () => {
    await db.aiPromptDraft.deleteMany({ where: { caseId: { in: [ids.case, ids.otherCase] } } }).catch(() => {});
    await db.aiPromptTemplateVersion.deleteMany({ where: { id: { in: [ids.template, ids.templateV2] } } }).catch(() => {});
    await db.aiPromptTemplateVersion.deleteMany({ where: { id: { in: createdTemplateIds } } }).catch(() => {});
    await db.task.deleteMany({ where: { id: { in: [ids.task, ids.otherTask] } } }).catch(() => {});
    await db.documentVersion.deleteMany({ where: { id: { in: [ids.version, ids.otherVersion] } } }).catch(() => {});
    await db.document.deleteMany({ where: { id: { in: [ids.document, ids.otherDocument] } } }).catch(() => {});
    await db.case.deleteMany({ where: { id: { in: [ids.case, ids.otherCase] } } }).catch(() => {});
    await db.client.deleteMany({ where: { id: { in: [ids.client, ids.otherClient] } } }).catch(() => {});
    await db.user.deleteMany({ where: { id: { in: [ids.admin, ids.junior, ids.lawyer] } } }).catch(() => {});
    await db.$disconnect();
  });

  async function createTemplate(version = 1) {
    const template = await createPromptTemplateVersion({
      stableKey: 'behavioral-contract-review',
      title: version === 1 ? 'Behavioral review v1' : 'Behavioral review v2',
      legalWorkCategory: 'CONTRACT_REVIEW',
      blocks: [{ key: 'role', label: 'ROLE / TASK', content: 'Review the selected source.' }],
      outputInstructions: 'Return sourced findings.',
      verificationChecklist: ['Sources checked', 'Facts checked'],
      createdById: ids.admin,
    }, db);
    createdTemplateIds.push(template.id);
    return template;
  }

  it('executes authorized preparation, anonymization, import, verification, and approval', async () => {
    const template = await createTemplate();
    const prepared = await preparePromptDraft(adminActor, {
      caseId: ids.case,
      promptTemplateId: template.id,
      sourceDocumentIds: [ids.document],
      sourceDocumentVersionIds: [ids.version],
      sourceTaskId: ids.task,
      lawyerInstruction: 'Review the selected document.',
    }, db);

    expect(prepared.sourceDocumentVersionIds).toEqual([ids.version]);
    expect(prepared.externalPromptText).not.toContain('John Smith');
    expect(prepared.externalPromptText).not.toContain('Prompt Client');
    expect(prepared.anonymizationSnapshot).toMatchObject({ isPseudonymized: true });
    expect((prepared as unknown as { rehydrationMap?: unknown }).rehydrationMap).toBeDefined();
    expect((prepared as unknown as { rehydrationMap: Array<{ replacement: string }> }).rehydrationMap.length).toBeGreaterThan(0);

    const placeholder = (prepared as unknown as { rehydrationMap: Array<{ replacement: string }> }).rehydrationMap[0].replacement;
    const imported = await importPromptResponse(adminActor, prepared.id, `Finding: ${placeholder}`, db);
    expect(imported.status).toBe('AI_DRAFT');
    expect(imported.rehydratedResponse).toContain('John Smith');

    await expect(verifyPromptDraft(adminActor, prepared.id, 'self verification', db)).rejects.toMatchObject({ code: 'AI_CANNOT_SELF_APPROVE' });
    const verified = await verifyPromptDraft(juniorActor, prepared.id, 'Sources and facts checked.', db);
    expect(verified.status).toBe('JUNIOR_VERIFIED');
    const approved = await approvePromptDraft(lawyerActor, prepared.id, 'Approved internal draft.', db);
    expect(approved.status).toBe('LAWYER_APPROVED');
    expect(await db.clientMatterPublication.count({ where: { caseId: ids.case } })).toBe(0);
  });

  it('rejects cross-client documents and cross-case task provenance', async () => {
    const template = await createTemplate();
    await expect(preparePromptDraft(adminActor, {
      caseId: ids.case,
      promptTemplateId: template.id,
      sourceDocumentVersionIds: [ids.otherVersion],
    }, db)).rejects.toMatchObject({ code: 'SOURCE_DOCUMENT_VERSION_CASE_MISMATCH' });
    await expect(preparePromptDraft(adminActor, {
      caseId: ids.case,
      promptTemplateId: template.id,
      sourceTaskId: ids.otherTask,
    }, db)).rejects.toMatchObject({ code: 'SOURCE_TASK_CASE_MISMATCH' });
  });

  it('keeps historical template snapshots when a new version is created', async () => {
    const first = await createTemplate(1);
    const prepared = await preparePromptDraft(adminActor, {
      caseId: ids.case,
      promptTemplateId: first.id,
      additionalContext: 'Historical version test.',
    }, db);
    const second = await createTemplate(2);
    expect(second.version).toBe(first.version + 1);
    const stored = await db.aiPromptDraft.findUniqueOrThrow({ where: { id: prepared.id } });
    expect(stored.promptTemplateId).toBe(first.id);
    expect(stored.promptTemplateVersion).toBe(first.version);
    expect((stored.promptTemplateSnapshot as { title: string }).title).toBe('Behavioral review v1');
  });
});
