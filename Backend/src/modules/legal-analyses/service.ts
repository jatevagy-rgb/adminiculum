import { prisma } from '../../prisma/prisma.service';

export type LegalAnalysisStatus =
  | 'DRAFT'
  | 'CANDIDATE_REVIEW'
  | 'LAWYER_REVIEW'
  | 'READY_FOR_APPROVAL'
  | 'APPROVED'
  | 'ARCHIVED';

export type LegalAnalysisSourceType = 'PASTED_AI_OUTPUT' | 'MANUAL';

export type LegalAnalysisSourceDocumentType = 'DOCUMENT' | 'CONTRACT_GENERATION' | 'ANONYMOUS_DOCUMENT';

type DetectionFlags = {
  riskMatrixDetected: boolean;
  missingDataDetected: boolean;
  suggestedChangesDetected: boolean;
  lawyerDecisionPointsDetected: boolean;
};

export interface LegalAnalysisResult extends DetectionFlags {
  id: string;
  caseId: string;
  documentId: string | null;
  documentSourceType: LegalAnalysisSourceDocumentType;
  title: string;
  analysisText: string;
  status: LegalAnalysisStatus;
  sourceType: LegalAnalysisSourceType;
  aiToolName: string | null;
  anonymizedInputSnapshot: string | null;
  createdById: string | null;
  reviewedById: string | null;
  reviewedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
}

export interface ListLegalAnalysesParams {
  documentId?: string;
  documentSourceType?: LegalAnalysisSourceDocumentType;
  caseId?: string;
}

export interface CreateLegalAnalysisParams {
  caseId: string;
  documentId?: string | null;
  documentSourceType?: LegalAnalysisSourceDocumentType;
  title?: string;
  analysisText: string;
  status?: LegalAnalysisStatus;
  sourceType?: LegalAnalysisSourceType;
  aiToolName?: string | null;
  anonymizedInputSnapshot?: string | null;
  createdById?: string | null;
}

export interface UpdateLegalAnalysisParams {
  title?: string;
  analysisText?: string;
  status?: LegalAnalysisStatus;
  aiToolName?: string | null;
  anonymizedInputSnapshot?: string | null;
  reviewedById?: string | null;
}

const VALID_STATUSES: LegalAnalysisStatus[] = [
  'DRAFT',
  'CANDIDATE_REVIEW',
  'LAWYER_REVIEW',
  'READY_FOR_APPROVAL',
  'APPROVED',
  'ARCHIVED',
];

const VALID_SOURCE_TYPES: LegalAnalysisSourceType[] = ['PASTED_AI_OUTPUT', 'MANUAL'];
const VALID_DOCUMENT_SOURCE_TYPES: LegalAnalysisSourceDocumentType[] = ['DOCUMENT', 'CONTRACT_GENERATION', 'ANONYMOUS_DOCUMENT'];

export class LegalAnalysisServiceError extends Error {
  constructor(
    public statusCode: number,
    public code: string,
    message: string,
  ) {
    super(message);
    this.name = 'LegalAnalysisServiceError';
  }
}

function normalizeText(value: string): string {
  return value.toLocaleLowerCase('hu-HU');
}

export function detectLegalAnalysisSections(analysisText: string): DetectionFlags {
  const normalized = normalizeText(analysisText || '');

  return {
    riskMatrixDetected: normalized.includes('kockázati mátrix'),
    missingDataDetected: normalized.includes('hiányzó adatok') || normalized.includes('hiányzó iratok'),
    suggestedChangesDetected: normalized.includes('javasolt módosítás') || normalized.includes('módosítási javaslat'),
    lawyerDecisionPointsDetected: normalized.includes('ügyvédi döntési pont'),
  };
}

function assertStatus(value: string | undefined): LegalAnalysisStatus | undefined {
  if (value === undefined) return undefined;
  if (!VALID_STATUSES.includes(value as LegalAnalysisStatus)) {
    throw new LegalAnalysisServiceError(400, 'INVALID_STATUS', 'Invalid legal analysis status');
  }
  return value as LegalAnalysisStatus;
}

function assertSourceType(value: string | undefined): LegalAnalysisSourceType | undefined {
  if (value === undefined) return undefined;
  if (!VALID_SOURCE_TYPES.includes(value as LegalAnalysisSourceType)) {
    throw new LegalAnalysisServiceError(400, 'INVALID_SOURCE_TYPE', 'Invalid legal analysis source type');
  }
  return value as LegalAnalysisSourceType;
}

function assertDocumentSourceType(value: string | undefined): LegalAnalysisSourceDocumentType | undefined {
  if (value === undefined) return undefined;
  if (!VALID_DOCUMENT_SOURCE_TYPES.includes(value as LegalAnalysisSourceDocumentType)) {
    throw new LegalAnalysisServiceError(400, 'INVALID_DOCUMENT_SOURCE_TYPE', 'Invalid document source type');
  }
  return value as LegalAnalysisSourceDocumentType;
}

function toResult(record: any): LegalAnalysisResult {
  return {
    id: record.id,
    caseId: record.caseId,
    documentId: record.documentId,
    documentSourceType: record.documentSourceType,
    title: record.title,
    analysisText: record.analysisText,
    status: record.status,
    sourceType: record.sourceType,
    aiToolName: record.aiToolName,
    anonymizedInputSnapshot: record.anonymizedInputSnapshot,
    riskMatrixDetected: record.riskMatrixDetected,
    missingDataDetected: record.missingDataDetected,
    suggestedChangesDetected: record.suggestedChangesDetected,
    lawyerDecisionPointsDetected: record.lawyerDecisionPointsDetected,
    createdById: record.createdById,
    reviewedById: record.reviewedById,
    reviewedAt: record.reviewedAt,
    createdAt: record.createdAt,
    updatedAt: record.updatedAt,
  };
}

async function validateSourceDocument(params: {
  caseId: string;
  documentId?: string | null;
  documentSourceType: LegalAnalysisSourceDocumentType;
}): Promise<void> {
  if (!params.documentId) return;

  if (params.documentSourceType === 'DOCUMENT') {
    const document = await prisma.document.findUnique({
      where: { id: params.documentId },
      select: { id: true, caseId: true },
    });
    if (!document) {
      throw new LegalAnalysisServiceError(404, 'SOURCE_DOCUMENT_NOT_FOUND', 'Source document not found');
    }
    if (document.caseId !== params.caseId) {
      throw new LegalAnalysisServiceError(400, 'SOURCE_CASE_MISMATCH', 'Source document does not belong to the provided case');
    }
    return;
  }

  if (params.documentSourceType === 'CONTRACT_GENERATION') {
    const generation = await prisma.contractGeneration.findUnique({
      where: { id: params.documentId },
      select: { id: true, caseId: true },
    });
    if (!generation) {
      throw new LegalAnalysisServiceError(404, 'SOURCE_DOCUMENT_NOT_FOUND', 'Source contract generation not found');
    }
    if (generation.caseId && generation.caseId !== params.caseId) {
      throw new LegalAnalysisServiceError(400, 'SOURCE_CASE_MISMATCH', 'Source contract generation does not belong to the provided case');
    }
    return;
  }

  const anonymousDocument = await prisma.anonymousDocument.findUnique({
    where: { id: params.documentId },
    select: { id: true, caseId: true },
  });
  if (!anonymousDocument) {
    throw new LegalAnalysisServiceError(404, 'SOURCE_DOCUMENT_NOT_FOUND', 'Source anonymous document not found');
  }
  if (anonymousDocument.caseId && anonymousDocument.caseId !== params.caseId) {
    throw new LegalAnalysisServiceError(400, 'SOURCE_CASE_MISMATCH', 'Source anonymous document does not belong to the provided case');
  }
}

async function createTimelineEvent(params: {
  action: 'CREATED' | 'UPDATED' | 'DELETED';
  legalAnalysis: LegalAnalysisResult;
  userId?: string | null;
}): Promise<void> {
  const payload = {
    action: `LEGAL_ANALYSIS_${params.action}`,
    legalAnalysisId: params.legalAnalysis.id,
    caseId: params.legalAnalysis.caseId,
    documentId: params.legalAnalysis.documentId,
    documentSourceType: params.legalAnalysis.documentSourceType,
    status: params.legalAnalysis.status,
    riskMatrixDetected: params.legalAnalysis.riskMatrixDetected,
    missingDataDetected: params.legalAnalysis.missingDataDetected,
    suggestedChangesDetected: params.legalAnalysis.suggestedChangesDetected,
    lawyerDecisionPointsDetected: params.legalAnalysis.lawyerDecisionPointsDetected,
  };

  await prisma.timelineEvent.create({
    data: {
      caseId: params.legalAnalysis.caseId,
      userId: params.userId || undefined,
      documentId: params.legalAnalysis.documentId || undefined,
      eventType: 'CUSTOM',
      type: `LEGAL_ANALYSIS_${params.action}`,
      payload,
      metadata: payload,
      description: `Legal analysis ${params.action.toLowerCase()}`,
    } as any,
  });
}

class LegalAnalysesService {
  async listLegalAnalyses(params: ListLegalAnalysesParams): Promise<LegalAnalysisResult[]> {
    const documentSourceType = assertDocumentSourceType(params.documentSourceType);
    const where: Record<string, any> = {};

    if (params.documentId) where.documentId = params.documentId;
    if (documentSourceType) where.documentSourceType = documentSourceType;
    if (params.caseId) where.caseId = params.caseId;

    const records = await prisma.legalAnalysis.findMany({
      where,
      orderBy: { updatedAt: 'desc' },
    });

    return records.map(toResult);
  }

  async getLegalAnalysis(id: string): Promise<LegalAnalysisResult | null> {
    const record = await prisma.legalAnalysis.findUnique({ where: { id } });
    return record ? toResult(record) : null;
  }

  async createLegalAnalysis(params: CreateLegalAnalysisParams): Promise<LegalAnalysisResult> {
    const caseId = String(params.caseId || '').trim();
    const analysisText = String(params.analysisText || '').trim();
    const documentId = params.documentId ? String(params.documentId).trim() : null;
    const documentSourceType = assertDocumentSourceType(params.documentSourceType) || 'DOCUMENT';
    const status = assertStatus(params.status) || 'DRAFT';
    const sourceType = assertSourceType(params.sourceType) || 'PASTED_AI_OUTPUT';

    if (!caseId) {
      throw new LegalAnalysisServiceError(400, 'CASE_ID_REQUIRED', 'caseId is required');
    }
    if (!analysisText) {
      throw new LegalAnalysisServiceError(400, 'ANALYSIS_TEXT_REQUIRED', 'analysisText is required');
    }

    const caseRecord = await prisma.case.findUnique({ where: { id: caseId }, select: { id: true } });
    if (!caseRecord) {
      throw new LegalAnalysisServiceError(404, 'CASE_NOT_FOUND', 'Case not found');
    }

    await validateSourceDocument({ caseId, documentId, documentSourceType });

    const detectionFlags = detectLegalAnalysisSections(analysisText);
    const title = String(params.title || '').trim() || 'Jogi elemzés';
    const reviewedData = status === 'APPROVED'
      ? { reviewedById: params.createdById || null, reviewedAt: new Date() }
      : { reviewedById: null, reviewedAt: null };

    const record = await prisma.legalAnalysis.create({
      data: {
        caseId,
        documentId,
        documentSourceType,
        title,
        analysisText,
        status,
        sourceType,
        aiToolName: params.aiToolName ?? null,
        anonymizedInputSnapshot: params.anonymizedInputSnapshot ?? null,
        ...detectionFlags,
        createdById: params.createdById ?? null,
        ...reviewedData,
      } as any,
    });

    const result = toResult(record);
    await createTimelineEvent({ action: 'CREATED', legalAnalysis: result, userId: params.createdById });
    return result;
  }

  async updateLegalAnalysis(id: string, params: UpdateLegalAnalysisParams): Promise<LegalAnalysisResult> {
    const existing = await prisma.legalAnalysis.findUnique({ where: { id } });
    if (!existing) {
      throw new LegalAnalysisServiceError(404, 'LEGAL_ANALYSIS_NOT_FOUND', 'Legal analysis not found');
    }

    const updateData: Record<string, any> = {};

    if (params.title !== undefined) {
      const title = String(params.title).trim();
      if (!title) {
        throw new LegalAnalysisServiceError(400, 'TITLE_REQUIRED', 'title cannot be empty');
      }
      updateData.title = title;
    }

    if (params.analysisText !== undefined) {
      const analysisText = String(params.analysisText).trim();
      if (!analysisText) {
        throw new LegalAnalysisServiceError(400, 'ANALYSIS_TEXT_REQUIRED', 'analysisText cannot be empty');
      }
      updateData.analysisText = analysisText;
      Object.assign(updateData, detectLegalAnalysisSections(analysisText));
    }

    if (params.status !== undefined) {
      const status = assertStatus(params.status);
      updateData.status = status;
      if (status === 'APPROVED') {
        updateData.reviewedById = params.reviewedById ?? existing.reviewedById ?? null;
        updateData.reviewedAt = existing.reviewedAt ?? new Date();
      }
    }

    if (params.aiToolName !== undefined) {
      updateData.aiToolName = params.aiToolName;
    }

    if (params.anonymizedInputSnapshot !== undefined) {
      updateData.anonymizedInputSnapshot = params.anonymizedInputSnapshot;
    }

    const record = await prisma.legalAnalysis.update({
      where: { id },
      data: updateData,
    });

    const result = toResult(record);
    await createTimelineEvent({ action: 'UPDATED', legalAnalysis: result, userId: params.reviewedById });
    return result;
  }

  async deleteLegalAnalysis(id: string, userId?: string | null): Promise<LegalAnalysisResult> {
    const existing = await prisma.legalAnalysis.findUnique({ where: { id } });
    if (!existing) {
      throw new LegalAnalysisServiceError(404, 'LEGAL_ANALYSIS_NOT_FOUND', 'Legal analysis not found');
    }

    await prisma.legalAnalysis.delete({ where: { id } });
    const result = toResult(existing);
    await createTimelineEvent({ action: 'DELETED', legalAnalysis: result, userId });
    return result;
  }
}

export default new LegalAnalysesService();
