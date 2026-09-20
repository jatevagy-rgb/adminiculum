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
    documentVersion: { findMany: jest.fn(), findUnique: jest.fn() },
  },
  default: {},
}));

jest.mock('../src/modules/cases/authorization', () => ({
  userCanManageCase: jest.fn().mockResolvedValue(true),
  userCanReadCase: jest.fn().mockResolvedValue(true),
}));

import { readFileSync } from 'node:fs';
import path from 'node:path';
import { prisma } from '../src/prisma/prisma.service';
import {
  preparePromptDraft,
  toPublicPromptDraft,
  type PromptDraftRecord,
  AiPromptVersionExtractionError,
} from '../src/modules/ai-prompts/service';

describe('AI Prompt System — authoritative version-pair source text', () => {
  const actor = { userId: 'lawyer-42', role: 'LAWYER' };
  const caseId = 'case-001';

  const template = {
    id: 'template-compare',
    stableKey: 'version-comparison',
    version: 1,
    title: 'Document Version Comparison',
    description: 'Compare two versions of a document.',
    legalWorkCategory: 'CONTRACT_REVIEW',
    caseTypeKeys: ['commercial'],
    workPackageModuleKeys: ['comparison'],
    taskTypes: [],
    blocks: [
      {
        key: 'instructions',
        label: 'COMPARISON INSTRUCTION',
        content: 'Identify what changed from the earlier version to the later version.',
      },
    ],
    requiredContext: ['selectedDocuments'],
    optionalContext: [],
    outputInstructions: 'Group important changes by topic.',
    verificationChecklist: ['Sources checked', 'Facts verified'],
    isActive: true,
    createdById: 'admin-1',
    createdAt: new Date(),
  };

  const caseRecord = {
    id: caseId,
    title: 'Acme Supply Contract Dispute',
    description: 'Contract amendment dispute between Acme Corp and Supplier Ltd.',
    caseTypeDefinitionId: 'case-type-1',
    assignedLawyer: { name: 'Dr. John Smith' },
    client: { name: 'Acme Corp Kft.' },
    caseTypeDefinition: { slug: 'commercial', name: 'Commercial dispute' },
    workPackage: null,
  };

  const version1Record = {
    id: 'v-1',
    version: 1,
    name: 'Supply_Agreement_v1.docx',
    description: 'Legacy description v1 that must NOT be used as body text',
    originalFileName: 'Supply_Agreement.docx',
    mimeType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    size: 2048,
    securityScanStatus: 'CLEAN' as const,
    storageReference: 'sp-storage-ref-v1-secret',
    spItemId: 'sp-item-v1-secret',
    document: {
      id: 'doc-shared',
      caseId,
      title: 'Supply Agreement',
      name: 'Supply_Agreement.docx',
      workspaceText: 'Legacy document workspace text that must NOT be used',
    },
  };

  const version2Record = {
    id: 'v-2',
    version: 2,
    name: 'Supply_Agreement_v2.docx',
    description: 'Legacy description v2 that must NOT be used as body text',
    originalFileName: 'Supply_Agreement.docx',
    mimeType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    size: 3072,
    securityScanStatus: 'CLEAN' as const,
    storageReference: 'sp-storage-ref-v2-secret',
    spItemId: 'sp-item-v2-secret',
    document: {
      id: 'doc-shared',
      caseId,
      title: 'Supply Agreement',
      name: 'Supply_Agreement.docx',
      workspaceText: 'Legacy document workspace text that must NOT be used',
    },
  };

  const textV1 = 'Clause 3.1: Payment is due within 30 days of delivery. Penalty interest is 5% annually.';
  const textV2 = 'Clause 3.1: Payment is due within 60 days of delivery. Penalty interest is 12% annually. Clause 3.2: Supplier must give 14 days advance shipping notice.';

  beforeEach(() => {
    jest.clearAllMocks();
    (prisma.aiPromptTemplateVersion.findUnique as jest.Mock).mockResolvedValue(template);
    (prisma.case.findUnique as jest.Mock).mockResolvedValue(caseRecord);
    (prisma.task.findUnique as jest.Mock).mockResolvedValue(null);
    (prisma.caseWorkPackageItem.findUnique as jest.Mock).mockResolvedValue(null);
    (prisma.aiPromptDraft.create as jest.Mock).mockImplementation(async ({ data }: { data: Record<string, unknown> }) => ({
      id: 'draft-created-1',
      ...data,
      updatedAt: new Date(),
    }));
  });

  // A. Two versions of the same logical document: both appear in prepared prompt context
  it('A. preserves both v1 and v2 of the SAME logical document as separate prompt sections', async () => {
    (prisma.documentVersion.findMany as jest.Mock).mockResolvedValue([version1Record, version2Record]);

    const mockDownload = jest.fn(async (_docId: string, versionId: string) => {
      if (versionId === 'v-1') return { version: version1Record as any, content: Buffer.from('v1-content') };
      if (versionId === 'v-2') return { version: version2Record as any, content: Buffer.from('v2-content') };
      return null;
    });

    const mockResolveText = jest.fn(async (v: { id: string }) => {
      if (v.id === 'v-1') return { supported: true, text: textV1, reasonCode: null, extractionRevision: 2 };
      if (v.id === 'v-2') return { supported: true, text: textV2, reasonCode: null, extractionRevision: 2 };
      return { supported: false, text: null, reasonCode: 'CONTENT_UNAVAILABLE', extractionRevision: 2 };
    });

    const draft = await preparePromptDraft(
      actor,
      {
        caseId,
        promptTemplateId: template.id,
        sourceDocumentVersionIds: ['v-1', 'v-2'],
      },
      {
        prisma,
        downloadDocumentVersion: mockDownload,
        resolveVersionText: mockResolveText,
      },
    );

    expect(draft.sourceDocumentVersionIds).toEqual(['v-1', 'v-2']);
    // Both versions must enter the prompt text as distinct sections
    expect(draft.externalPromptText).toContain('Document A');
    expect(draft.externalPromptText).toContain('Version: v1');
    expect(draft.externalPromptText).toContain('Document B');
    expect(draft.externalPromptText).toContain('Version: v2');
    expect(draft.externalPromptText).toContain('Payment is due within 30 days');
    expect(draft.externalPromptText).toContain('Payment is due within 60 days');
  });

  // B. Real version text: authoritative extracted bodies enter prompt, NOT version.description or workspaceText
  it('B. uses authoritative extracted bodies and never substitutes version.description or Document.workspaceText', async () => {
    (prisma.documentVersion.findMany as jest.Mock).mockResolvedValue([version1Record, version2Record]);

    const mockResolveText = jest.fn(async (v: { id: string }) => {
      if (v.id === 'v-1') return { supported: true, text: textV1, reasonCode: null, extractionRevision: 2 };
      if (v.id === 'v-2') return { supported: true, text: textV2, reasonCode: null, extractionRevision: 2 };
      return { supported: false, text: null, reasonCode: 'CONTENT_UNAVAILABLE', extractionRevision: 2 };
    });

    const draft = await preparePromptDraft(
      actor,
      {
        caseId,
        promptTemplateId: template.id,
        sourceDocumentVersionIds: ['v-1', 'v-2'],
      },
      {
        prisma,
        downloadDocumentVersion: jest.fn(async () => ({ version: {} as any, content: Buffer.from('bytes') })),
        resolveVersionText: mockResolveText,
      },
    );

    // Must contain authoritative extracted bodies
    expect(draft.externalPromptText).toContain(textV1);
    expect(draft.externalPromptText).toContain(textV2);
    // Must NOT contain version descriptions or workspaceText
    expect(draft.externalPromptText).not.toContain('Legacy description v1');
    expect(draft.externalPromptText).not.toContain('Legacy description v2');
    expect(draft.externalPromptText).not.toContain('Legacy document workspace text');
  });

  // C. Input ordering: [v2, v1] remains distinguishable in that caller order
  it('C. preserves caller input ordering when v2 is specified before v1', async () => {
    (prisma.documentVersion.findMany as jest.Mock).mockResolvedValue([version1Record, version2Record]);

    const mockResolveText = jest.fn(async (v: { id: string }) => {
      if (v.id === 'v-1') return { supported: true, text: textV1, reasonCode: null, extractionRevision: 2 };
      if (v.id === 'v-2') return { supported: true, text: textV2, reasonCode: null, extractionRevision: 2 };
      return { supported: false, text: null, reasonCode: 'CONTENT_UNAVAILABLE', extractionRevision: 2 };
    });

    const draft = await preparePromptDraft(
      actor,
      {
        caseId,
        promptTemplateId: template.id,
        sourceDocumentVersionIds: ['v-2', 'v-1'],
      },
      {
        prisma,
        downloadDocumentVersion: jest.fn(async () => ({ version: {} as any, content: Buffer.from('bytes') })),
        resolveVersionText: mockResolveText,
      },
    );

    expect(draft.sourceDocumentVersionIds).toEqual(['v-2', 'v-1']);

    // Document A must be v2 and Document B must be v1
    const idxDocA = draft.externalPromptText.indexOf('Document A');
    const idxDocB = draft.externalPromptText.indexOf('Document B');
    const idxV2 = draft.externalPromptText.indexOf('Version: v2');
    const idxV1 = draft.externalPromptText.indexOf('Version: v1');

    expect(idxDocA).toBeLessThan(idxDocB);
    expect(idxV2).toBeLessThan(idxDocB);
    expect(idxDocB).toBeLessThan(idxV1);
  });

  // D. Wrong-case version: rejected safely with SOURCE_DOCUMENT_VERSION_CASE_MISMATCH
  it('D. rejects a version belonging to a different case', async () => {
    const foreignVersion = {
      ...version1Record,
      id: 'v-foreign',
      document: {
        id: 'doc-foreign',
        caseId: 'case-other-foreign',
        title: 'Foreign Doc',
        name: 'Foreign.docx',
      },
    };
    (prisma.documentVersion.findMany as jest.Mock).mockResolvedValue([foreignVersion]);

    await expect(
      preparePromptDraft(
        actor,
        {
          caseId,
          promptTemplateId: template.id,
          sourceDocumentVersionIds: ['v-foreign'],
        },
        { prisma },
      ),
    ).rejects.toMatchObject({
      status: 400,
      code: 'SOURCE_DOCUMENT_VERSION_CASE_MISMATCH',
    });
  });

  // E. Unsupported / unavailable version text produces safe typed failure, not empty sources
  describe('E. typed safe failures for unextractable / unavailable content', () => {
    it('fails safely when format is unsupported for text extraction', async () => {
      (prisma.documentVersion.findMany as jest.Mock).mockResolvedValue([
        { ...version1Record, mimeType: 'image/png', originalFileName: 'scan.png' },
      ]);

      const mockResolveText = jest.fn(async () => ({
        supported: false,
        text: null,
        reasonCode: 'FORMAT_NOT_TEXT_EXTRACTABLE',
        extractionRevision: 2,
      }));

      await expect(
        preparePromptDraft(
          actor,
          {
            caseId,
            promptTemplateId: template.id,
            sourceDocumentVersionIds: ['v-1'],
          },
          {
            prisma,
            downloadDocumentVersion: jest.fn(),
            resolveVersionText: mockResolveText,
          },
        ),
      ).rejects.toMatchObject({
        status: 400,
        code: 'SOURCE_DOCUMENT_VERSION_UNSUPPORTED',
        reasonCode: 'FORMAT_NOT_TEXT_EXTRACTABLE',
      });
    });

    it('fails safely when version content cannot be downloaded', async () => {
      (prisma.documentVersion.findMany as jest.Mock).mockResolvedValue([version1Record]);

      const mockResolveText = jest.fn(async () => ({
        supported: false,
        text: null,
        reasonCode: 'CONTENT_UNAVAILABLE',
        extractionRevision: 2,
      }));

      await expect(
        preparePromptDraft(
          actor,
          {
            caseId,
            promptTemplateId: template.id,
            sourceDocumentVersionIds: ['v-1'],
          },
          {
            prisma,
            downloadDocumentVersion: jest.fn(async () => null),
            resolveVersionText: mockResolveText,
          },
        ),
      ).rejects.toMatchObject({
        status: 400,
        code: 'SOURCE_DOCUMENT_VERSION_UNAVAILABLE',
        reasonCode: 'CONTENT_UNAVAILABLE',
      });
    });

    it('fails safely when extracted text is empty', async () => {
      (prisma.documentVersion.findMany as jest.Mock).mockResolvedValue([version1Record]);

      const mockResolveText = jest.fn(async () => ({
        supported: false,
        text: '',
        reasonCode: 'NO_EXTRACTABLE_TEXT',
        extractionRevision: 2,
      }));

      await expect(
        preparePromptDraft(
          actor,
          {
            caseId,
            promptTemplateId: template.id,
            sourceDocumentVersionIds: ['v-1'],
          },
          {
            prisma,
            downloadDocumentVersion: jest.fn(async () => ({ version: {} as any, content: Buffer.from('empty') })),
            resolveVersionText: mockResolveText,
          },
        ),
      ).rejects.toMatchObject({
        status: 400,
        code: 'SOURCE_DOCUMENT_VERSION_EMPTY',
        reasonCode: 'NO_EXTRACTABLE_TEXT',
      });
    });

    it('fails safely when content exceeds maximum allowed size', async () => {
      (prisma.documentVersion.findMany as jest.Mock).mockResolvedValue([version1Record]);

      const mockResolveText = jest.fn(async () => ({
        supported: false,
        text: null,
        reasonCode: 'CONTENT_TOO_LARGE',
        extractionRevision: 2,
      }));

      await expect(
        preparePromptDraft(
          actor,
          {
            caseId,
            promptTemplateId: template.id,
            sourceDocumentVersionIds: ['v-1'],
          },
          {
            prisma,
            downloadDocumentVersion: jest.fn(),
            resolveVersionText: mockResolveText,
          },
        ),
      ).rejects.toMatchObject({
        status: 400,
        code: 'SOURCE_DOCUMENT_VERSION_TOO_LARGE',
        reasonCode: 'CONTENT_TOO_LARGE',
      });
    });

    it('fails safely when document security scan is blocked (PENDING_SCAN or INFECTED)', async () => {
      (prisma.documentVersion.findMany as jest.Mock).mockResolvedValue([
        { ...version1Record, securityScanStatus: 'PENDING_SCAN' },
      ]);

      await expect(
        preparePromptDraft(
          actor,
          {
            caseId,
            promptTemplateId: template.id,
            sourceDocumentVersionIds: ['v-1'],
          },
          { prisma },
        ),
      ).rejects.toMatchObject({
        status: 409,
        code: 'DOCUMENT_SECURITY_SCAN_BLOCKED',
      });
    });
  });

  // F. Existing sourceDocumentIds document-level flow remains green
  it('F. keeps existing document-level sourceDocumentIds flow green and functional', async () => {
    (prisma.document.findMany as jest.Mock).mockResolvedValue([
      {
        id: 'doc-legacy',
        title: 'Engagement Letter',
        name: 'engagement.docx',
        description: 'Legacy engagement letter',
        workspaceText: 'Engagement letter text specifying lawyer terms.',
      },
    ]);

    const draft = await preparePromptDraft(
      actor,
      {
        caseId,
        promptTemplateId: template.id,
        sourceDocumentIds: ['doc-legacy'],
      },
      { prisma },
    );

    expect(draft.sourceDocumentIds).toEqual(['doc-legacy']);
    expect(draft.sourceDocumentVersionIds).toEqual([]);
    expect(draft.externalPromptText).toContain('Document A');
    expect(draft.externalPromptText).toContain('Title: Engagement Letter');
    expect(draft.externalPromptText).toContain('Engagement letter text specifying lawyer terms.');
    expect(draft.externalPromptText).not.toContain('Version: v');
  });

  // G. Anonymization still runs over the resulting selected source context
  it('G. applies anonymization across both version texts and case metadata', async () => {
    (prisma.documentVersion.findMany as jest.Mock).mockResolvedValue([version1Record, version2Record]);

    const piiV1 = 'Dr. Alice Kovacs represented Alpha Kft. in negotiating agreement with Acme Corp Kft.';
    const piiV2 = 'Dr. Alice Kovacs amended clause 2 for Alpha Kft., contacting alice@alpha.hu.';

    const mockResolveText = jest.fn(async (v: { id: string }) => {
      if (v.id === 'v-1') return { supported: true, text: piiV1, reasonCode: null, extractionRevision: 2 };
      if (v.id === 'v-2') return { supported: true, text: piiV2, reasonCode: null, extractionRevision: 2 };
      return { supported: false, text: null, reasonCode: 'CONTENT_UNAVAILABLE', extractionRevision: 2 };
    });

    const draft = await preparePromptDraft(
      actor,
      {
        caseId,
        promptTemplateId: template.id,
        sourceDocumentVersionIds: ['v-1', 'v-2'],
        knownEntities: {
          persons: ['Dr. Alice Kovacs'],
          organizations: ['Alpha Kft.'],
          emails: ['alice@alpha.hu'],
        },
      },
      {
        prisma,
        downloadDocumentVersion: jest.fn(async () => ({ version: {} as any, content: Buffer.from('bytes') })),
        resolveVersionText: mockResolveText,
      },
    );

    // Anonymization placeholders must replace the PII
    expect(draft.externalPromptText).toContain('[SZEMÉLY_');
    expect(draft.externalPromptText).toContain('[SZERVEZET_');
    expect(draft.externalPromptText).toContain('[EMAIL_');

    // Real PII must not leak into externalPromptText
    expect(draft.externalPromptText).not.toContain('Dr. Alice Kovacs');
    expect(draft.externalPromptText).not.toContain('Alpha Kft.');
    expect(draft.externalPromptText).not.toContain('alice@alpha.hu');
    expect(draft.externalPromptText).not.toContain('Acme Corp Kft.');
    expect(draft.externalPromptText).not.toContain('Dr. John Smith');
  });

  // H. No storage ids leak into public prompt DTOs
  it('H. ensures no storageReference, spItemId, or internal paths leak into public prompt DTO', async () => {
    (prisma.documentVersion.findMany as jest.Mock).mockResolvedValue([version1Record, version2Record]);

    const mockResolveText = jest.fn(async (v: { id: string }) => {
      if (v.id === 'v-1') return { supported: true, text: textV1, reasonCode: null, extractionRevision: 2 };
      if (v.id === 'v-2') return { supported: true, text: textV2, reasonCode: null, extractionRevision: 2 };
      return { supported: false, text: null, reasonCode: 'CONTENT_UNAVAILABLE', extractionRevision: 2 };
    });

    const draft = await preparePromptDraft(
      actor,
      {
        caseId,
        promptTemplateId: template.id,
        sourceDocumentVersionIds: ['v-1', 'v-2'],
      },
      {
        prisma,
        downloadDocumentVersion: jest.fn(async () => ({ version: {} as any, content: Buffer.from('bytes') })),
        resolveVersionText: mockResolveText,
      },
    );

    const publicDraft = toPublicPromptDraft(draft);
    const serialized = JSON.stringify(publicDraft);

    expect(serialized).not.toContain('sp-storage-ref-v1-secret');
    expect(serialized).not.toContain('sp-storage-ref-v2-secret');
    expect(serialized).not.toContain('sp-item-v1-secret');
    expect(serialized).not.toContain('sp-item-v2-secret');
    expect((publicDraft as unknown as { rehydrationMap?: unknown }).rehydrationMap).toBeUndefined();
  });

  // Source Precedence: explicit version sources supersede generic document-level sources for the same document
  describe('Source precedence: version sources supersede generic document-level sources for the same document', () => {
    it('suppresses generic workspaceText when a single version of that document is also selected', async () => {
      (prisma.document.findMany as jest.Mock).mockResolvedValue([
        {
          id: 'doc-shared',
          title: 'Supply Agreement',
          name: 'Supply_Agreement.docx',
          description: 'Doc description',
          workspaceText: 'Legacy document workspace text that must NOT be used',
        },
      ]);
      (prisma.documentVersion.findMany as jest.Mock).mockResolvedValue([version2Record]);

      const mockResolveText = jest.fn(async () => ({
        supported: true,
        text: textV2,
        reasonCode: null,
        extractionRevision: 2,
      }));

      const draft = await preparePromptDraft(
        actor,
        {
          caseId,
          promptTemplateId: template.id,
          sourceDocumentIds: ['doc-shared'],
          sourceDocumentVersionIds: ['v-2'],
        },
        {
          prisma,
          downloadDocumentVersion: jest.fn(async () => ({ version: {} as any, content: Buffer.from('bytes') })),
          resolveVersionText: mockResolveText,
        },
      );

      // Only ONE source: Document A is v2. No generic source for doc-shared
      expect(draft.externalPromptText).toContain('Document A');
      expect(draft.externalPromptText).not.toContain('Document B');
      expect(draft.externalPromptText).toContain('Version: v2');
      expect(draft.externalPromptText).toContain(textV2);
      expect(draft.externalPromptText).not.toContain('Legacy document workspace text');
    });

    it('suppresses generic workspaceText when multiple versions of the same document are selected', async () => {
      (prisma.document.findMany as jest.Mock).mockResolvedValue([
        {
          id: 'doc-shared',
          title: 'Supply Agreement',
          name: 'Supply_Agreement.docx',
          description: 'Doc description',
          workspaceText: 'Legacy document workspace text that must NOT be used',
        },
      ]);
      (prisma.documentVersion.findMany as jest.Mock).mockResolvedValue([version1Record, version2Record]);

      const mockResolveText = jest.fn(async (v: { id: string }) => {
        if (v.id === 'v-1') return { supported: true, text: textV1, reasonCode: null, extractionRevision: 2 };
        if (v.id === 'v-2') return { supported: true, text: textV2, reasonCode: null, extractionRevision: 2 };
        return { supported: false, text: null, reasonCode: 'CONTENT_UNAVAILABLE', extractionRevision: 2 };
      });

      const draft = await preparePromptDraft(
        actor,
        {
          caseId,
          promptTemplateId: template.id,
          sourceDocumentIds: ['doc-shared'],
          sourceDocumentVersionIds: ['v-1', 'v-2'],
        },
        {
          prisma,
          downloadDocumentVersion: jest.fn(async () => ({ version: {} as any, content: Buffer.from('bytes') })),
          resolveVersionText: mockResolveText,
        },
      );

      // Exactly TWO sources: Document A (v1) and Document B (v2). Generic source suppressed.
      expect(draft.externalPromptText).toContain('Document A');
      expect(draft.externalPromptText).toContain('Version: v1');
      expect(draft.externalPromptText).toContain('Document B');
      expect(draft.externalPromptText).toContain('Version: v2');
      expect(draft.externalPromptText).not.toContain('Document C');
      expect(draft.externalPromptText).not.toContain('Legacy document workspace text');
    });

    it('retains generic source for doc2 while version source supersedes doc1', async () => {
      (prisma.document.findMany as jest.Mock).mockResolvedValue([
        {
          id: 'doc-shared',
          title: 'Supply Agreement',
          name: 'Supply_Agreement.docx',
          description: 'Doc description',
          workspaceText: 'Legacy document workspace text that must NOT be used',
        },
        {
          id: 'doc-other',
          title: 'Other Agreement',
          name: 'other.docx',
          description: null,
          workspaceText: 'Independent doc-other workspace text that MUST be present',
        },
      ]);
      (prisma.documentVersion.findMany as jest.Mock).mockResolvedValue([version2Record]);

      const mockResolveText = jest.fn(async () => ({
        supported: true,
        text: textV2,
        reasonCode: null,
        extractionRevision: 2,
      }));

      const draft = await preparePromptDraft(
        actor,
        {
          caseId,
          promptTemplateId: template.id,
          sourceDocumentIds: ['doc-shared', 'doc-other'],
          sourceDocumentVersionIds: ['v-2'],
        },
        {
          prisma,
          downloadDocumentVersion: jest.fn(async () => ({ version: {} as any, content: Buffer.from('bytes') })),
          resolveVersionText: mockResolveText,
        },
      );

      // Document A is doc-other generic source, Document B is v2
      expect(draft.externalPromptText).toContain('Document A');
      expect(draft.externalPromptText).toContain('Title: Other Agreement');
      expect(draft.externalPromptText).toContain('Independent doc-other workspace text that MUST be present');
      expect(draft.externalPromptText).toContain('Document B');
      expect(draft.externalPromptText).toContain('Version: v2');
      expect(draft.externalPromptText).toContain(textV2);
      expect(draft.externalPromptText).not.toContain('Legacy document workspace text');
    });
  });

  // ---------------------------------------------------------------------------
  // Reconciliation matrix for the refreshed #298 baseline (master f1a90841).
  // These lock the ordering, dedupe, case-boundary, scan-boundary and
  // download-failure-mapping contracts that the review surfaced as untested.
  // ---------------------------------------------------------------------------
  describe('Reconciliation matrix: ordering, dedupe, boundaries and failure mapping', () => {
    const textMime = 'text/plain';
    const cleanVersionText = (v: { id: string }) =>
      v.id === 'v-1' ? textV1 : v.id === 'v-2' ? textV2 : `authoritative body for ${v.id}`;

    const crossDocVersion = (id: string, docId: string, fileName: string) => ({
      id,
      version: 1,
      name: fileName,
      description: `Legacy description ${id} that must NOT be used`,
      originalFileName: fileName,
      mimeType: textMime,
      size: 128,
      securityScanStatus: 'CLEAN' as const,
      storageReference: `sp-ref-${id}-secret`,
      spItemId: `sp-item-${id}-secret`,
      document: {
        id: docId,
        caseId,
        title: `Document ${docId}`,
        name: fileName,
        workspaceText: 'Legacy workspace text that must NOT be used',
      },
    });

    const okResolve = () =>
      jest.fn(async (v: { id: string }) => ({
        supported: true,
        text: cleanVersionText(v),
        reasonCode: null,
        extractionRevision: 2,
      }));

    // Matrix B: versions of two DIFFERENT documents both survive.
    it('B. keeps one version from each of two different documents as separate sources', async () => {
      const docA = crossDocVersion('v-doc-a-1', 'doc-a', 'a_v1.txt');
      const docB = crossDocVersion('v-doc-b-1', 'doc-b', 'b_v1.txt');
      (prisma.documentVersion.findMany as jest.Mock).mockResolvedValue([docA, docB]);

      const draft = await preparePromptDraft(
        actor,
        { caseId, promptTemplateId: template.id, sourceDocumentVersionIds: ['v-doc-a-1', 'v-doc-b-1'] },
        {
          prisma,
          downloadDocumentVersion: jest.fn(async () => ({ version: {} as any, content: Buffer.from('bytes') })),
          resolveVersionText: okResolve(),
        },
      );

      expect(draft.externalPromptText).toContain('authoritative body for v-doc-a-1');
      expect(draft.externalPromptText).toContain('authoritative body for v-doc-b-1');
      expect(draft.externalPromptText).toContain('Document A');
      expect(draft.externalPromptText).toContain('Document B');
      expect(draft.externalPromptText).not.toContain('Document C');
      expect((draft.externalPromptText.match(/Version: v\d/g) ?? []).length).toBe(2);
    });

    // Matrix D: repeated ids are deduped, first-occurrence order is authoritative.
    it('D. deduplicates repeated version ids while preserving first-occurrence order', async () => {
      (prisma.documentVersion.findMany as jest.Mock).mockResolvedValue([version1Record, version2Record]);

      const draft = await preparePromptDraft(
        actor,
        { caseId, promptTemplateId: template.id, sourceDocumentVersionIds: ['v-2', 'v-1', 'v-2'] },
        {
          prisma,
          downloadDocumentVersion: jest.fn(async () => ({ version: {} as any, content: Buffer.from('bytes') })),
          resolveVersionText: okResolve(),
        },
      );

      // Exactly two rendered sources even though three ids were supplied.
      expect((draft.externalPromptText.match(/Version: v\d/g) ?? []).length).toBe(2);
      expect(draft.externalPromptText).not.toContain('Document C');
      const idxV2 = draft.externalPromptText.indexOf('Version: v2');
      const idxV1 = draft.externalPromptText.indexOf('Version: v1');
      expect(idxV2).toBeGreaterThanOrEqual(0);
      expect(idxV1).toBeGreaterThan(idxV2);
    });

    // Case boundary: reject BEFORE any download or extraction.
    it('E2. rejects a foreign-case version before download or extraction is attempted', async () => {
      const foreign = {
        ...version1Record,
        id: 'v-foreign-2',
        document: { ...version1Record.document, id: 'doc-foreign-2', caseId: 'case-other-foreign' },
      };
      (prisma.documentVersion.findMany as jest.Mock).mockResolvedValue([foreign]);
      const downloadSpy = jest.fn();
      const resolveSpy = jest.fn();

      await expect(
        preparePromptDraft(
          actor,
          { caseId, promptTemplateId: template.id, sourceDocumentVersionIds: ['v-foreign-2'] },
          { prisma, downloadDocumentVersion: downloadSpy as any, resolveVersionText: resolveSpy as any },
        ),
      ).rejects.toMatchObject({ status: 400, code: 'SOURCE_DOCUMENT_VERSION_CASE_MISMATCH' });

      expect(downloadSpy).not.toHaveBeenCalled();
      expect(resolveSpy).not.toHaveBeenCalled();
    });

    // Scan boundary: every non-CLEAN status blocks BEFORE download.
    it('F2. blocks PENDING_SCAN, INFECTED and SCAN_FAILED without downloading bytes', async () => {
      for (const status of ['PENDING_SCAN', 'INFECTED', 'SCAN_FAILED'] as const) {
        (prisma.documentVersion.findMany as jest.Mock).mockResolvedValue([
          { ...version1Record, securityScanStatus: status },
        ]);
        const downloadSpy = jest.fn();
        const resolveSpy = jest.fn();

        await expect(
          preparePromptDraft(
            actor,
            { caseId, promptTemplateId: template.id, sourceDocumentVersionIds: ['v-1'] },
            { prisma, downloadDocumentVersion: downloadSpy as any, resolveVersionText: resolveSpy as any },
          ),
        ).rejects.toMatchObject({ status: 409, code: 'DOCUMENT_SECURITY_SCAN_BLOCKED' });

        expect(downloadSpy).not.toHaveBeenCalled();
        expect(resolveSpy).not.toHaveBeenCalled();
      }
    });

    // Download-layer defence in depth: a blocked download must not be downgraded.
    it('G2. propagates a download-layer security block instead of downgrading it', async () => {
      (prisma.documentVersion.findMany as jest.Mock).mockResolvedValue([version1Record]);
      const downloadSpy = jest.fn(async () => ({
        error: 'blocked',
        code: 'DOCUMENT_SECURITY_SCAN_BLOCKED',
        status: 409,
      }));
      // Mirrors the canonical resolver contract: it invokes the supplied download
      // callback and turns a null download into CONTENT_UNAVAILABLE.
      const resolveSpy = jest.fn(async (v: { id: string; documentId: string }, download: (d: string, x: string) => Promise<Buffer | null>) => {
        const buf = await download(v.documentId, v.id);
        return buf
          ? { supported: true, text: buf.toString('utf8'), reasonCode: null, extractionRevision: 2 }
          : { supported: false, text: null, reasonCode: 'CONTENT_UNAVAILABLE', extractionRevision: 2 };
      });

      await expect(
        preparePromptDraft(
          actor,
          { caseId, promptTemplateId: template.id, sourceDocumentVersionIds: ['v-1'] },
          { prisma, downloadDocumentVersion: downloadSpy, resolveVersionText: resolveSpy },
        ),
      ).rejects.toMatchObject({ status: 409, code: 'DOCUMENT_SECURITY_SCAN_BLOCKED' });

      expect(downloadSpy).toHaveBeenCalledWith('doc-shared', 'v-1');
    });

    // Download failure mapping: safe typed unavailable, no provider text leaked.
    it('H2. maps a storage download failure to a safe typed unavailable error without leaking provider text', async () => {
      (prisma.documentVersion.findMany as jest.Mock).mockResolvedValue([version1Record]);
      const downloadSpy = jest.fn(async () => ({
        error: 'SharePoint path /sites/secret/library/file.docx not found',
        code: 'SHAREPOINT_FILE_NOT_FOUND',
        status: 404,
      }));
      // Mirrors the canonical resolver: a failed download surfaces as CONTENT_UNAVAILABLE
      // to the service, which must translate it into a safe typed error.
      const resolveSpy = jest.fn(async (v: { id: string; documentId: string }, download: (d: string, x: string) => Promise<Buffer | null>) => {
        const buf = await download(v.documentId, v.id);
        return buf
          ? { supported: true, text: buf.toString('utf8'), reasonCode: null, extractionRevision: 2 }
          : { supported: false, text: null, reasonCode: 'CONTENT_UNAVAILABLE', extractionRevision: 2 };
      });

      const error: any = await preparePromptDraft(
        actor,
        { caseId, promptTemplateId: template.id, sourceDocumentVersionIds: ['v-1'] },
        { prisma, downloadDocumentVersion: downloadSpy, resolveVersionText: resolveSpy },
      ).catch((e) => e);

      expect(error).toMatchObject({ status: 400, code: 'SOURCE_DOCUMENT_VERSION_UNAVAILABLE' });
      expect(String(error.message)).not.toMatch(/SharePoint|\/sites|file\.docx/);
    });

    // Matrix P: the selectedDocumentTexts-only flow is unchanged.
    it('P. keeps the selectedDocumentTexts-only flow working without version labels', async () => {
      (prisma.document.findMany as jest.Mock).mockResolvedValue([
        {
          id: 'doc-provided',
          title: 'Ignored DB title',
          name: 'provided.txt',
          description: null,
          workspaceText: 'DB workspace text that must NOT be used',
        },
      ]);

      const draft = await preparePromptDraft(
        actor,
        {
          caseId,
          promptTemplateId: template.id,
          selectedDocumentTexts: [
            { documentId: 'doc-provided', title: 'Provided Title', text: 'Provided selected text wins.' },
          ],
        },
        { prisma },
      );

      expect(draft.externalPromptText).toContain('Title: Provided Title');
      expect(draft.externalPromptText).toContain('Provided selected text wins.');
      expect(draft.externalPromptText).not.toContain('DB workspace text that must NOT be used');
      expect(draft.externalPromptText).not.toContain('Version: v');
    });

    // Matrix T: preparation only — no direct external AI or network call.
    it('T. prepares context only and makes no direct external AI or network call', () => {
      const serviceSource = readFileSync(
        path.resolve(__dirname, '../src/modules/ai-prompts/service.ts'),
        'utf8',
      );
      for (const forbidden of ['openai', 'OpenAI', 'api.openai.com', 'axios', 'node-fetch', 'https.request']) {
        expect(serviceSource).not.toContain(forbidden);
      }
    });
  });
});
