import { Prisma } from '@prisma/client';
import type { Request } from 'express';
import { prisma as defaultPrisma } from '../../prisma/prisma.service';
import { detectCandidates, runAnonymization, type SanitizedExternalPackage } from '../anonymization';
import { userCanManageCase, userCanReadCase } from '../cases/authorization';

export const AI_PROMPT_DRAFT_STATUS = [
  'PREPARED',
  'AI_DRAFT',
  'JUNIOR_VERIFIED',
  'LAWYER_APPROVED',
  'RETURNED_FOR_CORRECTION',
  'REJECTED',
] as const;

export type AiPromptDraftStatus = (typeof AI_PROMPT_DRAFT_STATUS)[number];

export const LEGAL_WORK_CATEGORIES = [
  'CONTRACT_REVIEW',
  'CONTRACT_DRAFTING',
  'LEGAL_RESEARCH',
  'CASE_SUMMARY',
  'DUE_DILIGENCE',
  'COMPLIANCE_REVIEW',
  'CLIENT_EXPLANATION',
  'CLAUSE_ANALYSIS',
  'GENERAL_LEGAL_ANALYSIS',
] as const;

export type LegalWorkCategory = (typeof LEGAL_WORK_CATEGORIES)[number];

export type PromptBlock = {
  key: string;
  label: string;
  content: string;
};

export type PromptTemplateSnapshot = {
  stableKey: string;
  version: number;
  title: string;
  description: string | null;
  legalWorkCategory: LegalWorkCategory | string;
  caseTypeKeys: string[];
  workPackageModuleKeys: string[];
  taskTypes: string[];
  blocks: PromptBlock[];
  requiredContext: string[];
  optionalContext: string[];
  outputInstructions: string;
  verificationChecklist: string[];
  isActive: boolean;
};

export type PromptTemplateRecord = {
  id: string;
  stableKey: string;
  version: number;
  title: string;
  description: string | null;
  legalWorkCategory: string;
  caseTypeKeys: Prisma.JsonValue;
  workPackageModuleKeys: Prisma.JsonValue;
  taskTypes: Prisma.JsonValue;
  blocks: Prisma.JsonValue;
  requiredContext: Prisma.JsonValue;
  optionalContext: Prisma.JsonValue;
  outputInstructions: string;
  verificationChecklist: Prisma.JsonValue;
  isActive: boolean;
  createdById: string | null;
  createdAt: Date;
};

export type PreparedSourceDocument = {
  documentId: string;
  versionId?: string | null;
  label: string;
  title: string;
  selectedText: string;
};

export type PromptPrepareInput = {
  caseId: string;
  promptTemplateId: string;
  sourceDocumentIds?: string[];
  sourceDocumentVersionIds?: string[];
  sourceTaskId?: string | null;
  sourceWorkPackageItemId?: string | null;
  lawyerInstruction?: string | null;
  startingSituation?: string | null;
  selectedAnnotations?: string[] | null;
  selectedCommunications?: string[] | null;
  additionalContext?: string | null;
  selectedDocumentTexts?: Array<{ documentId: string; versionId?: string | null; text: string; title?: string | null }>;
  knownEntities?: {
    persons?: string[];
    organizations?: string[];
    emails?: string[];
    phones?: string[];
    identifiers?: string[];
    addresses?: string[];
  };
};

export type PromptDraftRecord = {
  id: string;
  caseId: string;
  promptTemplateId: string;
  promptTemplateStableKey: string;
  promptTemplateVersion: number;
  promptTemplateSnapshot: PromptTemplateSnapshot;
  sourceDocumentIds: string[];
  sourceDocumentVersionIds: string[];
  sourceTaskId: string | null;
  sourceWorkPackageItemId: string | null;
  selectedContext: Record<string, unknown>;
  anonymizedPreview: string;
  externalPromptText: string;
  rehydrationMap: Array<{ category: string; original: string; replacement: string }>;
  anonymizationSnapshot: SanitizedExternalPackage;
  importedResponse: string | null;
  rehydratedResponse: string | null;
  rehydrationWarnings: string[];
  status: AiPromptDraftStatus;
  reviewerNotes: string | null;
  preparedById: string;
  importedById: string | null;
  verifiedById: string | null;
  verifiedAt: Date | null;
  approvedById: string | null;
  approvedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
};

export type PublicPromptDraftRecord = Omit<PromptDraftRecord, 'rehydrationMap'>;

export function toPublicPromptDraft(draft: PromptDraftRecord): PublicPromptDraftRecord {
  const { rehydrationMap: _rehydrationMap, ...publicDraft } = draft;
  return publicDraft;
}

type PrismaLike = typeof defaultPrisma | Prisma.TransactionClient;

const DEFAULT_PROMPT_CHECKLIST = [
  'Sources checked',
  'Facts checked',
  'Legal references checked',
  'Names/entities rehydrated correctly',
  'No unsupported conclusion',
  'Output matches requested format',
  'Sensitive information handled correctly',
];

function jsonArrayOfStrings(value: Prisma.JsonValue, fallback: string[] = []): string[] {
  return Array.isArray(value) ? value.map((item) => String(item)) : fallback;
}

function templateSnapshot(record: PromptTemplateRecord): PromptTemplateSnapshot {
  return {
    stableKey: record.stableKey,
    version: record.version,
    title: record.title,
    description: record.description,
    legalWorkCategory: record.legalWorkCategory,
    caseTypeKeys: jsonArrayOfStrings(record.caseTypeKeys),
    workPackageModuleKeys: jsonArrayOfStrings(record.workPackageModuleKeys),
    taskTypes: jsonArrayOfStrings(record.taskTypes),
    blocks: Array.isArray(record.blocks)
      ? record.blocks.map((block) => ({
        key: String((block as Record<string, unknown>).key ?? ''),
        label: String((block as Record<string, unknown>).label ?? ''),
        content: String((block as Record<string, unknown>).content ?? ''),
      }))
      : [],
    requiredContext: jsonArrayOfStrings(record.requiredContext),
    optionalContext: jsonArrayOfStrings(record.optionalContext),
    outputInstructions: record.outputInstructions,
    verificationChecklist: jsonArrayOfStrings(record.verificationChecklist, [...DEFAULT_PROMPT_CHECKLIST]),
    isActive: record.isActive,
  };
}

function buildPromptText(snapshot: PromptTemplateSnapshot, sections: Array<{ label: string; content: string }>): string {
  const blocks = snapshot.blocks.map((block) => `${block.label}\n${block.content.trim()}`.trim());
  const selectedSections = sections
    .filter((section) => section.content.trim().length > 0)
    .map((section) => `${section.label}\n${section.content.trim()}`.trim());
  return [
    `Prompt: ${snapshot.title}`,
    `Prompt ID: ${snapshot.stableKey}`,
    `Prompt Version: ${snapshot.version}`,
    `Legal Work Category: ${snapshot.legalWorkCategory}`,
    '',
    ...blocks,
    ...selectedSections,
    '',
    'Output instructions',
    snapshot.outputInstructions.trim(),
    '',
    'Verification checklist',
    ...snapshot.verificationChecklist.map((item) => `- ${item}`),
  ].join('\n');
}

function buildCaseContext(c: {
  id: string;
  caseTypeDefinitionId: string | null;
  caseTypeDefinition?: { slug: string | null; name: string | null } | null;
  client?: { name: string } | null;
  title?: string | null;
  description?: string | null;
  assignedLawyer?: { name: string | null } | null;
}): string {
  return [
    c.caseTypeDefinition?.name ? `Case type: ${c.caseTypeDefinition.name}` : null,
    c.caseTypeDefinition?.slug ? `Case type key: ${c.caseTypeDefinition.slug}` : null,
    c.client?.name ? `Client: ${c.client.name}` : null,
    c.title ? `Case title: ${c.title}` : null,
    c.description ? `Case description: ${c.description}` : null,
    c.assignedLawyer?.name ? `Assigned lawyer: ${c.assignedLawyer.name}` : null,
  ].filter(Boolean).join('\n');
}

function buildDocumentSection(doc: PreparedSourceDocument): string {
  return [
    `${doc.label}`,
    `Title: ${doc.title}`,
    doc.selectedText ? `Text:\n${doc.selectedText}` : 'Text: [no selected text]',
  ].filter(Boolean).join('\n');
}

function normalizeKnownTerms(known: PromptPrepareInput['knownEntities'], sourceContext: string): Array<{ term: string; category: 'PERSON' | 'ORGANIZATION' | 'EMAIL' | 'PHONE' | 'IDENTIFIER' | 'ADDRESS' }> {
  const terms: Array<{ term: string; category: 'PERSON' | 'ORGANIZATION' | 'EMAIL' | 'PHONE' | 'IDENTIFIER' | 'ADDRESS' }> = [];
  for (const term of known?.persons ?? []) terms.push({ term, category: 'PERSON' });
  for (const term of known?.organizations ?? []) terms.push({ term, category: 'ORGANIZATION' });
  for (const term of known?.emails ?? []) terms.push({ term, category: 'EMAIL' });
  for (const term of known?.phones ?? []) terms.push({ term, category: 'PHONE' });
  for (const term of known?.identifiers ?? []) terms.push({ term, category: 'IDENTIFIER' });
  for (const term of known?.addresses ?? []) terms.push({ term, category: 'ADDRESS' });
  if (sourceContext.includes('@')) {
    // sourceContext itself is already selected data; no implicit broadening beyond exact terms.
  }
  return terms.filter((item) => item.term.trim().length > 1);
}

async function requireCaseAccess(req: Request, caseId: string, level: 'read' | 'manage'): Promise<void> {
  const access = level === 'read' ? await userCanReadCase(req, caseId) : await userCanManageCase(req, caseId);
  if (access === null) throw Object.assign(new Error('CASE_NOT_FOUND'), { status: 404, code: 'CASE_NOT_FOUND' });
  if (!access) throw Object.assign(new Error('CASE_ACCESS_FORBIDDEN'), { status: 403, code: 'CASE_ACCESS_FORBIDDEN' });
}

export async function listPromptTemplates(params: {
  caseTypeKey?: string | null;
  workPackageModuleKey?: string | null;
  taskType?: string | null;
}, prismaClient: PrismaLike = defaultPrisma): Promise<PromptTemplateRecord[]> {
  const records = await prismaClient.aiPromptTemplateVersion.findMany({
    where: { isActive: true },
    orderBy: [{ stableKey: 'asc' }, { version: 'desc' }],
  }) as PromptTemplateRecord[];
  return records.filter((record) => {
    const caseTypeMatch = !params.caseTypeKey || jsonArrayOfStrings(record.caseTypeKeys).includes(params.caseTypeKey);
    const moduleMatch = !params.workPackageModuleKey || jsonArrayOfStrings(record.workPackageModuleKeys).includes(params.workPackageModuleKey);
    const taskMatch = !params.taskType || jsonArrayOfStrings(record.taskTypes).includes(params.taskType);
    return caseTypeMatch && moduleMatch && taskMatch;
  });
}

export async function createPromptTemplateVersion(input: {
  stableKey: string;
  title: string;
  description?: string | null;
  legalWorkCategory: LegalWorkCategory | string;
  caseTypeKeys?: string[];
  workPackageModuleKeys?: string[];
  taskTypes?: string[];
  blocks: PromptBlock[];
  requiredContext?: string[];
  optionalContext?: string[];
  outputInstructions: string;
  verificationChecklist?: string[];
  isActive?: boolean;
  createdById?: string | null;
}, prismaClient: PrismaLike = defaultPrisma): Promise<PromptTemplateRecord> {
  const latest = await prismaClient.aiPromptTemplateVersion.findFirst({
    where: { stableKey: input.stableKey },
    orderBy: { version: 'desc' },
    select: { version: true },
  });
  const version = (latest?.version ?? 0) + 1;
  return prismaClient.aiPromptTemplateVersion.create({
    data: {
      stableKey: input.stableKey,
      version,
      title: input.title,
      description: input.description ?? null,
      legalWorkCategory: input.legalWorkCategory,
      caseTypeKeys: input.caseTypeKeys ?? [],
      workPackageModuleKeys: input.workPackageModuleKeys ?? [],
      taskTypes: input.taskTypes ?? [],
      blocks: input.blocks,
      requiredContext: input.requiredContext ?? [],
      optionalContext: input.optionalContext ?? [],
      outputInstructions: input.outputInstructions,
      verificationChecklist: input.verificationChecklist ?? DEFAULT_PROMPT_CHECKLIST,
      isActive: input.isActive ?? true,
      createdById: input.createdById ?? null,
    },
  }) as Promise<PromptTemplateRecord>;
}

async function loadCaseContext(caseId: string, prismaClient: PrismaLike) {
  const caseRecord = await prismaClient.case.findUnique({
    where: { id: caseId },
    select: {
      id: true,
      title: true,
      description: true,
      caseTypeDefinitionId: true,
      assignedLawyer: { select: { name: true } },
      client: { select: { name: true } },
      caseTypeDefinition: { select: { slug: true, name: true } },
      workPackage: {
        select: {
          id: true,
          workPackageTemplateId: true,
          workPackageTemplateVersion: true,
          workPackageTemplate: {
            select: {
              id: true,
              name: true,
            },
          },
        },
      },
    },
  });
  return caseRecord as unknown as {
    id: string;
    title: string;
    description: string | null;
    caseTypeDefinitionId: string | null;
    assignedLawyer: { name: string | null } | null;
    client: { name: string } | null;
    caseTypeDefinition: { slug: string | null; name: string | null } | null;
    workPackage: {
      id: string;
      workPackageTemplateId: string | null;
      workPackageTemplateVersion: number | null;
      workPackageTemplate: { id: string; name: string } | null;
    } | null;
  } | null;
}

async function loadDocuments(
  caseId: string,
  params: Pick<PromptPrepareInput, 'sourceDocumentIds' | 'sourceDocumentVersionIds' | 'selectedDocumentTexts'>,
  prismaClient: PrismaLike,
): Promise<PreparedSourceDocument[]> {
  const byDoc = new Map<string, PreparedSourceDocument>();
  const selectedIds = new Set([...(params.sourceDocumentIds ?? []), ...(params.selectedDocumentTexts ?? []).map((item) => item.documentId)]);
  if (selectedIds.size > 0) {
    const docs = await prismaClient.document.findMany({
      where: { id: { in: [...selectedIds] }, caseId },
      select: { id: true, title: true, name: true, description: true, workspaceText: true, versions: { select: { id: true, version: true, name: true, description: true } } },
    });
    if (docs.length !== selectedIds.size) throw Object.assign(new Error('SOURCE_DOCUMENT_CASE_MISMATCH'), { status: 400, code: 'SOURCE_DOCUMENT_CASE_MISMATCH' });
    for (const doc of docs) {
      const provided = params.selectedDocumentTexts?.find((item) => item.documentId === doc.id);
      const title = provided?.title || doc.title || doc.name || `Document ${byDoc.size + 1}`;
      const text = provided?.text ?? doc.workspaceText ?? doc.description ?? '';
      byDoc.set(doc.id, { documentId: doc.id, title, selectedText: text, label: `Document ${String.fromCharCode(65 + byDoc.size)}` });
    }
  }
  for (const versionId of params.sourceDocumentVersionIds ?? []) {
    const version = await prismaClient.documentVersion.findUnique({
      where: { id: versionId },
      select: { id: true, version: true, name: true, description: true, document: { select: { id: true, caseId: true, title: true, name: true, workspaceText: true } } },
    });
    if (!version || version.document.caseId !== caseId) throw Object.assign(new Error('SOURCE_DOCUMENT_VERSION_CASE_MISMATCH'), { status: 400, code: 'SOURCE_DOCUMENT_VERSION_CASE_MISMATCH' });
    const title = version.name || version.document.title || version.document.name || `Document ${byDoc.size + 1}`;
    const text = version.description ?? version.document.workspaceText ?? '';
    byDoc.set(version.document.id, { documentId: version.document.id, versionId: version.id, title, selectedText: text, label: `Document ${String.fromCharCode(65 + byDoc.size)}` });
  }
  return [...byDoc.values()];
}

async function validateCaseProvenance(input: PromptPrepareInput, caseId: string, prismaClient: PrismaLike): Promise<void> {
  if (input.sourceTaskId) {
    const task = await prismaClient.task.findUnique({ where: { id: input.sourceTaskId }, select: { caseId: true } });
    if (!task || task.caseId !== caseId) {
      throw Object.assign(new Error('SOURCE_TASK_CASE_MISMATCH'), { status: 400, code: 'SOURCE_TASK_CASE_MISMATCH' });
    }
  }
  if (input.sourceWorkPackageItemId) {
    const item = await prismaClient.caseWorkPackageItem.findUnique({
      where: { id: input.sourceWorkPackageItemId },
      select: { caseWorkPackage: { select: { caseId: true } } },
    });
    if (!item || item.caseWorkPackage.caseId !== caseId) {
      throw Object.assign(new Error('SOURCE_WORK_PACKAGE_ITEM_CASE_MISMATCH'), { status: 400, code: 'SOURCE_WORK_PACKAGE_ITEM_CASE_MISMATCH' });
    }
  }
}

function buildSourceText(
  caseContext: string,
  documents: PreparedSourceDocument[],
  body: Omit<PromptPrepareInput, 'caseId' | 'sourceDocumentIds' | 'sourceDocumentVersionIds' | 'selectedDocumentTexts' | 'knownEntities'>,
): string {
  const sections = [
    { label: 'Case context', content: caseContext },
    { label: 'Lawyer instruction', content: body.lawyerInstruction ?? '' },
    { label: 'Starting situation', content: body.startingSituation ?? '' },
    { label: 'Selected annotations', content: (body.selectedAnnotations ?? []).join('\n') },
    { label: 'Selected communications', content: (body.selectedCommunications ?? []).join('\n') },
    { label: 'Additional context', content: body.additionalContext ?? '' },
    ...documents.map((doc) => ({ label: doc.label, content: buildDocumentSection(doc) })),
  ];
  return sections.map((section) => `${section.label}\n${section.content.trim()}`.trim()).join('\n\n');
}

export async function preparePromptDraft(
  actor: { userId: string; role?: string | null },
  input: PromptPrepareInput,
  prismaClient: PrismaLike = defaultPrisma,
): Promise<PromptDraftRecord> {
  if (!actor.userId) {
    throw Object.assign(new Error('AUTH_REQUIRED'), { status: 401, code: 'AUTH_REQUIRED' });
  }
  await requireCaseAccess({ user: actor } as Request, input.caseId, 'manage');
  const template = await prismaClient.aiPromptTemplateVersion.findUnique({ where: { id: input.promptTemplateId } }) as PromptTemplateRecord | null;
  if (!template || !template.isActive) throw Object.assign(new Error('PROMPT_TEMPLATE_NOT_FOUND'), { status: 404, code: 'PROMPT_TEMPLATE_NOT_FOUND' });
  const caseContextRecord = await loadCaseContext(input.caseId, prismaClient);
  if (!caseContextRecord) throw Object.assign(new Error('CASE_NOT_FOUND'), { status: 404, code: 'CASE_NOT_FOUND' });
  await validateCaseProvenance(input, input.caseId, prismaClient);
  const documents = await loadDocuments(input.caseId, input, prismaClient);
  const caseContext = buildCaseContext(caseContextRecord);
  const sourceText = buildSourceText(caseContext, documents, input);
  const knownTerms = normalizeKnownTerms(input.knownEntities, sourceText);
  const anonymizationOptions = {
    manualTerms: [
      ...knownTerms.map((term) => ({ term: term.term, category: term.category })),
      ...(caseContextRecord.client?.name ? [{ term: caseContextRecord.client.name, category: 'ORGANIZATION' as const }] : []),
      ...(caseContextRecord.assignedLawyer?.name ? [{ term: caseContextRecord.assignedLawyer.name, category: 'PERSON' as const }] : []),
      ...(caseContextRecord.title ? [{ term: caseContextRecord.title, category: 'PROJECT' as const }] : []),
    ],
  };
  const detected = detectCandidates(sourceText, anonymizationOptions);
  const anonymization = runAnonymization(sourceText, anonymizationOptions, detected.candidates.map((candidate) => candidate.id));
  const snapshot = templateSnapshot(template);
  const externalPayload: SanitizedExternalPackage = {
    contentType: 'anonymized-work-package',
    schemaVersion: 1,
    algorithmRevision: anonymization.result.algorithmRevision,
    isPseudonymized: true,
    sanitizedText: anonymization.result.anonymizedText,
    appliedCount: anonymization.result.appliedCount,
    categoryCounts: anonymization.result.categoryCounts,
    sourceHash: anonymization.result.sourceHash,
    resultHash: anonymization.result.resultHash,
    warnings: anonymization.result.warnings,
  };
  const selectedContext = {
    caseId: input.caseId,
    promptTemplateId: input.promptTemplateId,
    sourceTaskId: input.sourceTaskId ?? null,
    sourceWorkPackageItemId: input.sourceWorkPackageItemId ?? null,
    sourceDocumentIds: input.sourceDocumentIds ?? [],
    sourceDocumentVersionIds: input.sourceDocumentVersionIds ?? [],
    lawyerInstruction: input.lawyerInstruction ?? null,
    startingSituation: input.startingSituation ?? null,
    selectedAnnotations: input.selectedAnnotations ?? [],
    selectedCommunications: input.selectedCommunications ?? [],
    additionalContext: input.additionalContext ?? null,
  };
  const draft = await prismaClient.aiPromptDraft.create({
    data: {
      caseId: input.caseId,
      promptTemplateId: template.id,
      promptTemplateStableKey: template.stableKey,
      promptTemplateVersion: template.version,
      promptTemplateSnapshot: snapshot as unknown as Prisma.InputJsonValue,
      sourceDocumentIds: input.sourceDocumentIds ?? [],
      sourceDocumentVersionIds: input.sourceDocumentVersionIds ?? [],
      sourceTaskId: input.sourceTaskId ?? null,
      sourceWorkPackageItemId: input.sourceWorkPackageItemId ?? null,
      selectedContext: selectedContext as unknown as Prisma.InputJsonValue,
      anonymizedPreview: anonymization.result.anonymizedText,
      externalPromptText: buildPromptText(snapshot, [
        { label: 'Prepared anonymized context', content: anonymization.result.anonymizedText },
      ]),
      rehydrationMap: anonymization.mapping.mapping as unknown as Prisma.InputJsonValue,
      anonymizationSnapshot: externalPayload as unknown as Prisma.InputJsonValue,
      importedResponse: null,
      rehydratedResponse: null,
      rehydrationWarnings: [],
      status: 'PREPARED',
      reviewerNotes: null,
      preparedById: actor.userId,
      importedById: null,
      verifiedById: null,
      verifiedAt: null,
      approvedById: null,
      approvedAt: null,
    },
  });
  return draft as unknown as PromptDraftRecord;
}

function rehydrateResponse(text: string, mapping: Array<{ original: string; replacement: string }>): { text: string; warnings: string[] } {
  const warnings: string[] = [];
  let out = text;
  for (const entry of mapping) {
    out = out.split(entry.replacement).join(entry.original);
  }
  const placeholderPattern = /\[[^\]\r\n]+\]/g;
  for (const match of out.matchAll(placeholderPattern)) {
    const token = match[0];
    if (!mapping.some((entry) => entry.replacement === token)) warnings.push(`unknown placeholder retained: ${token}`);
  }
  return { text: out, warnings };
}

async function loadDraftOrFail(id: string, prismaClient: PrismaLike): Promise<PromptDraftRecord | null> {
  const draft = await prismaClient.aiPromptDraft.findUnique({ where: { id } });
  return draft as unknown as PromptDraftRecord | null;
}

function requireDraftStatus(draft: PromptDraftRecord, allowed: AiPromptDraftStatus[]): void {
  if (!allowed.includes(draft.status)) {
    throw Object.assign(new Error('INVALID_AI_DRAFT_TRANSITION'), { status: 409, code: 'INVALID_AI_DRAFT_TRANSITION' });
  }
}

export async function importPromptResponse(
  actor: { userId: string; role?: string | null },
  draftId: string,
  importedResponse: string,
  prismaClient: PrismaLike = defaultPrisma,
): Promise<PromptDraftRecord> {
  if (!actor.userId) throw Object.assign(new Error('AUTH_REQUIRED'), { status: 401, code: 'AUTH_REQUIRED' });
  const draft = await loadDraftOrFail(draftId, prismaClient);
  if (!draft) throw Object.assign(new Error('PROMPT_DRAFT_NOT_FOUND'), { status: 404, code: 'PROMPT_DRAFT_NOT_FOUND' });
  await requireCaseAccess({ user: actor } as Request, draft.caseId, 'manage');
  requireDraftStatus(draft, ['PREPARED', 'RETURNED_FOR_CORRECTION']);
  const rehydrated = rehydrateResponse(importedResponse, draft.rehydrationMap);
  const saved = await prismaClient.aiPromptDraft.update({
    where: { id: draftId },
    data: {
      importedResponse,
      rehydratedResponse: rehydrated.text,
      rehydrationWarnings: rehydrated.warnings,
      status: 'AI_DRAFT',
      importedById: actor.userId,
      reviewerNotes: draft.reviewerNotes,
    },
  });
  return saved as unknown as PromptDraftRecord;
}

export async function verifyPromptDraft(
  actor: { userId: string; role?: string | null },
  draftId: string,
  notes?: string | null,
  prismaClient: PrismaLike = defaultPrisma,
): Promise<PromptDraftRecord> {
  const draft = await loadDraftOrFail(draftId, prismaClient);
  if (!draft) throw Object.assign(new Error('PROMPT_DRAFT_NOT_FOUND'), { status: 404, code: 'PROMPT_DRAFT_NOT_FOUND' });
  await requireCaseAccess({ user: actor } as Request, draft.caseId, 'manage');
  requireDraftStatus(draft, ['AI_DRAFT']);
  if (draft.importedById === actor.userId || draft.preparedById === actor.userId) {
    throw Object.assign(new Error('AI_CANNOT_SELF_APPROVE'), { status: 400, code: 'AI_CANNOT_SELF_APPROVE' });
  }
  const saved = await prismaClient.aiPromptDraft.update({
    where: { id: draftId },
    data: {
      status: 'JUNIOR_VERIFIED',
      verifiedById: actor.userId,
      verifiedAt: new Date(),
      reviewerNotes: notes ?? draft.reviewerNotes,
    },
  });
  return saved as unknown as PromptDraftRecord;
}

export async function approvePromptDraft(
  actor: { userId: string; role?: string | null },
  draftId: string,
  notes?: string | null,
  prismaClient: PrismaLike = defaultPrisma,
): Promise<PromptDraftRecord> {
  const draft = await loadDraftOrFail(draftId, prismaClient);
  if (!draft) throw Object.assign(new Error('PROMPT_DRAFT_NOT_FOUND'), { status: 404, code: 'PROMPT_DRAFT_NOT_FOUND' });
  await requireCaseAccess({ user: actor } as Request, draft.caseId, 'manage');
  requireDraftStatus(draft, ['JUNIOR_VERIFIED']);
  if (!['LAWYER', 'ADMIN'].includes(String(actor.role || '').toUpperCase())) {
    throw Object.assign(new Error('LAWYER_APPROVAL_REQUIRED'), { status: 403, code: 'LAWYER_APPROVAL_REQUIRED' });
  }
  if (draft.preparedById === actor.userId || draft.importedById === actor.userId) {
    throw Object.assign(new Error('AI_CANNOT_SELF_APPROVE'), { status: 400, code: 'AI_CANNOT_SELF_APPROVE' });
  }
  const saved = await prismaClient.aiPromptDraft.update({
    where: { id: draftId },
    data: {
      status: 'LAWYER_APPROVED',
      approvedById: actor.userId,
      approvedAt: new Date(),
      reviewerNotes: notes ?? draft.reviewerNotes,
    },
  });
  return saved as unknown as PromptDraftRecord;
}

export async function returnPromptDraft(
  actor: { userId: string; role?: string | null },
  draftId: string,
  notes?: string | null,
  prismaClient: PrismaLike = defaultPrisma,
): Promise<PromptDraftRecord> {
  const draft = await loadDraftOrFail(draftId, prismaClient);
  if (!draft) throw Object.assign(new Error('PROMPT_DRAFT_NOT_FOUND'), { status: 404, code: 'PROMPT_DRAFT_NOT_FOUND' });
  await requireCaseAccess({ user: actor } as Request, draft.caseId, 'manage');
  requireDraftStatus(draft, ['AI_DRAFT', 'JUNIOR_VERIFIED']);
  const saved = await prismaClient.aiPromptDraft.update({
    where: { id: draftId },
    data: {
      status: 'RETURNED_FOR_CORRECTION',
      reviewerNotes: notes ?? draft.reviewerNotes,
    },
  });
  return saved as unknown as PromptDraftRecord;
}

export async function rejectPromptDraft(
  actor: { userId: string; role?: string | null },
  draftId: string,
  notes?: string | null,
  prismaClient: PrismaLike = defaultPrisma,
): Promise<PromptDraftRecord> {
  const draft = await loadDraftOrFail(draftId, prismaClient);
  if (!draft) throw Object.assign(new Error('PROMPT_DRAFT_NOT_FOUND'), { status: 404, code: 'PROMPT_DRAFT_NOT_FOUND' });
  await requireCaseAccess({ user: actor } as Request, draft.caseId, 'manage');
  requireDraftStatus(draft, ['AI_DRAFT', 'JUNIOR_VERIFIED', 'RETURNED_FOR_CORRECTION']);
  const saved = await prismaClient.aiPromptDraft.update({
    where: { id: draftId },
    data: {
      status: 'REJECTED',
      reviewerNotes: notes ?? draft.reviewerNotes,
    },
  });
  return saved as unknown as PromptDraftRecord;
}

export async function getPromptDraft(
  req: Request,
  draftId: string,
  prismaClient: PrismaLike = defaultPrisma,
): Promise<PromptDraftRecord> {
  const draft = await loadDraftOrFail(draftId, prismaClient);
  if (!draft) throw Object.assign(new Error('PROMPT_DRAFT_NOT_FOUND'), { status: 404, code: 'PROMPT_DRAFT_NOT_FOUND' });
  await requireCaseAccess(req, draft.caseId, 'read');
  return draft;
}

export async function listPromptDraftsForCase(
  req: Request,
  caseId: string,
  prismaClient: PrismaLike = defaultPrisma,
): Promise<PromptDraftRecord[]> {
  await requireCaseAccess(req, caseId, 'read');
  const drafts = await prismaClient.aiPromptDraft.findMany({
    where: { caseId },
    orderBy: { createdAt: 'desc' },
  });
  return drafts as unknown as PromptDraftRecord[];
}
