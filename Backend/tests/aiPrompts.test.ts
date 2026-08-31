jest.mock('../src/prisma/prisma.service', () => ({
  prisma: {
    aiPromptTemplateVersion: {
      findFirst: jest.fn(),
      findUnique: jest.fn(),
      findMany: jest.fn(),
      create: jest.fn(),
    },
    aiPromptDraft: {
      findUnique: jest.fn(),
      findMany: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
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
  approvePromptDraft,
  createPromptTemplateVersion,
  importPromptResponse,
  preparePromptDraft,
  verifyPromptDraft,
} from '../src/modules/ai-prompts/service';

const template = {
  id: 'template-1',
  stableKey: 'contract-review',
  version: 1,
  title: 'Contract review',
  description: 'Review the selected contract.',
  legalWorkCategory: 'CONTRACT_REVIEW',
  caseTypeKeys: ['employment'],
  workPackageModuleKeys: ['document-review'],
  taskTypes: [],
  blocks: [{ key: 'role', label: 'ROLE / TASK', content: 'Act as a legal reviewer.' }],
  requiredContext: ['selectedDocuments'],
  optionalContext: ['additionalContext'],
  outputInstructions: 'Return findings with sources.',
  verificationChecklist: ['Sources checked'],
  isActive: true,
  createdById: 'lawyer-1',
  createdAt: new Date(),
};

const caseRecord = {
  id: 'case-1',
  title: 'Smith employment matter',
  description: 'Review the attached material.',
  caseTypeDefinitionId: 'case-type-1',
  assignedLawyer: { name: 'Dr. John Smith' },
  client: { name: 'Example Corp Kft.' },
  caseTypeDefinition: { slug: 'employment', name: 'Employment dispute' },
  workPackage: null,
};

describe('Prompt System 2.0 provider-neutral handoff', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    (prisma.aiPromptTemplateVersion.findFirst as jest.Mock).mockResolvedValue(null);
    (prisma.aiPromptTemplateVersion.findUnique as jest.Mock).mockResolvedValue(template);
    (prisma.case.findUnique as jest.Mock).mockResolvedValue(caseRecord);
    (prisma.task.findUnique as jest.Mock).mockResolvedValue(null);
    (prisma.caseWorkPackageItem.findUnique as jest.Mock).mockResolvedValue(null);
    (prisma.document.findMany as jest.Mock).mockResolvedValue([
      {
        id: 'doc-1',
        title: 'Employment agreement',
        name: 'employment.docx',
        description: null,
        workspaceText: 'Dr. John Smith wrote to john@example.com about Example Corp Kft.',
        versions: [],
      },
    ]);
  });

  it('creates the next immutable template version', async () => {
    (prisma.aiPromptTemplateVersion.create as jest.Mock).mockResolvedValue(template);
    const created = await createPromptTemplateVersion({
      stableKey: 'contract-review',
      title: 'Contract review',
      legalWorkCategory: 'CONTRACT_REVIEW',
      blocks: template.blocks,
      outputInstructions: template.outputInstructions,
    });
    expect(created).toEqual(template);
    expect(prisma.aiPromptTemplateVersion.create).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({ version: 1, stableKey: 'contract-review' }),
    }));
  });

  it('assembles deterministic anonymized output without exporting the mapping', async () => {
    const createdDraft = {
      id: 'draft-1',
      ...template,
      caseId: 'case-1',
      promptTemplateId: 'template-1',
      promptTemplateStableKey: 'contract-review',
      promptTemplateVersion: 1,
      promptTemplateSnapshot: template,
      sourceDocumentIds: ['doc-1'],
      sourceDocumentVersionIds: [],
      sourceTaskId: null,
      sourceWorkPackageItemId: null,
      selectedContext: {},
      anonymizedPreview: '',
      externalPromptText: '',
      rehydrationMap: [],
      anonymizationSnapshot: {},
      importedResponse: null,
      rehydratedResponse: null,
      rehydrationWarnings: [],
      status: 'PREPARED',
      reviewerNotes: null,
      preparedById: 'lawyer-1',
      importedById: null,
      verifiedById: null,
      verifiedAt: null,
      approvedById: null,
      approvedAt: null,
      updatedAt: new Date(),
    };
    (prisma.aiPromptDraft.create as jest.Mock).mockImplementation(async ({ data }: { data: Record<string, unknown> }) => ({ ...createdDraft, ...data }));
    const draft = await preparePromptDraft(
      { userId: 'lawyer-1', role: 'LAWYER' },
      { caseId: 'case-1', promptTemplateId: 'template-1', sourceDocumentIds: ['doc-1'] },
    );
    expect(draft.externalPromptText).toContain('[SZEMÉLY_1]');
    expect(draft.externalPromptText).toContain('[EMAIL_1]');
    expect(draft.externalPromptText).not.toContain('Dr. John Smith');
    expect(draft.externalPromptText).not.toContain('Example Corp Kft.');
    expect(draft.externalPromptText).not.toContain('case-1');
    expect(draft.externalPromptText).not.toContain('doc-1');
    expect(JSON.stringify(draft.anonymizationSnapshot)).not.toContain('Dr. John Smith');
  });

  it('imports, verifies, and approves only through explicit lifecycle transitions', async () => {
    const draft = {
      id: 'draft-1',
      caseId: 'case-1',
    rehydrationMap: [{ category: 'PERSON', original: 'Dr. John Smith', replacement: '[SZEMÉLY_1]' }],
      status: 'PREPARED',
      preparedById: 'preparer-1',
      importedById: null,
      reviewerNotes: null,
    };
    (prisma.aiPromptDraft.findUnique as jest.Mock).mockImplementation(async () => draft);
    (prisma.aiPromptDraft.update as jest.Mock).mockImplementation(async ({ data }: { data: Record<string, unknown> }) => {
      Object.assign(draft, data);
      return draft;
    });

    const imported = await importPromptResponse({ userId: 'importer-1', role: 'LAWYER' }, 'draft-1', 'Review [SZEMÉLY_1].');
    expect(imported.status).toBe('AI_DRAFT');
    expect(imported.rehydratedResponse).toBe('Review Dr. John Smith.');

    const verified = await verifyPromptDraft({ userId: 'junior-1', role: 'TRAINEE' }, 'draft-1', 'Sources checked');
    expect(verified.status).toBe('JUNIOR_VERIFIED');

    const approved = await approvePromptDraft({ userId: 'lawyer-2', role: 'LAWYER' }, 'draft-1', 'Approved internal draft');
    expect(approved.status).toBe('LAWYER_APPROVED');
    expect(prisma.aiPromptDraft.update).toHaveBeenCalled();
  });
});
