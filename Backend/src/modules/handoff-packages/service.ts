/**
 * Handoff Packages Service — v1A
 * Lawyer handoff package CRUD + review workflow.
 * References existing records without duplicating content.
 */

import { prisma } from '../../prisma/prisma.service';
import { isDatabaseFoundationEnabled } from '../../middleware/featureAvailability';

export type LawyerHandoffPackageType = 'STANDARD' | 'FINAL_APPROVAL';
export type LawyerHandoffStatus = 'DRAFT' | 'PREPARED' | 'SUBMITTED' | 'IN_REVIEW' | 'APPROVED' | 'REJECTED' | 'ARCHIVED';
export type LawyerHandoffDecision = 'APPROVED' | 'REJECTED_NEEDS_REVISION' | 'REJECTED_BLOCKING';

const VALID_STATUSES: LawyerHandoffStatus[] = [
  'DRAFT', 'PREPARED', 'SUBMITTED', 'IN_REVIEW', 'APPROVED', 'REJECTED', 'ARCHIVED',
];
const VALID_PACKAGE_TYPES: LawyerHandoffPackageType[] = ['STANDARD', 'FINAL_APPROVAL'];
const VALID_DECISIONS: LawyerHandoffDecision[] = ['APPROVED', 'REJECTED_NEEDS_REVISION', 'REJECTED_BLOCKING'];

export interface LawyerHandoffPackageResult {
  id: string;
  caseId: string;
  status: LawyerHandoffStatus;
  packageType: LawyerHandoffPackageType;
  sourceDocumentId: string | null;
  anonymizedDocumentId: string | null;
  generatedContractId: string | null;
  legalAnalysisId: string | null;
  reviewNotesId: string | null;
  preparerSummary: string | null;
  preparedById: string | null;
  submittedAt: Date | null;
  reviewedById: string | null;
  reviewedAt: Date | null;
  reviewDecision: LawyerHandoffDecision | null;
  reviewComment: string | null;
  createdAt: Date;
  updatedAt: Date;
}

export interface CreateHandoffPackageParams {
  caseId: string;
  sourceDocumentId?: string;
  anonymizedDocumentId?: string;
  generatedContractId?: string;
  legalAnalysisId?: string;
  reviewNotesId?: string;
  preparerSummary?: string;
  packageType?: LawyerHandoffPackageType;
  userId?: string;
}

export interface UpdateHandoffPackageParams {
  sourceDocumentId?: string | null;
  anonymizedDocumentId?: string | null;
  generatedContractId?: string | null;
  legalAnalysisId?: string | null;
  reviewNotesId?: string | null;
  preparerSummary?: string | null;
  status?: LawyerHandoffStatus;
  userId?: string;
}

export interface ReviewHandoffPackageParams {
  decision: LawyerHandoffDecision;
  reviewComment?: string;
  userId?: string;
}

export class HandoffPackageServiceError extends Error {
  constructor(
    public statusCode: number,
    public code: string,
    message: string,
  ) {
    super(message);
    this.name = 'HandoffPackageServiceError';
  }
}

function assertStatus(value: string | undefined): LawyerHandoffStatus {
  if (!value || !VALID_STATUSES.includes(value as LawyerHandoffStatus)) {
    throw new HandoffPackageServiceError(400, 'INVALID_STATUS', 'Invalid handoff package status');
  }
  return value as LawyerHandoffStatus;
}

function assertPackageType(value: string | undefined): LawyerHandoffPackageType {
  if (!value || !VALID_PACKAGE_TYPES.includes(value as LawyerHandoffPackageType)) {
    throw new HandoffPackageServiceError(400, 'INVALID_PACKAGE_TYPE', 'Invalid handoff package type');
  }
  return value as LawyerHandoffPackageType;
}

function assertDecision(value: string | undefined): LawyerHandoffDecision {
  if (!value || !VALID_DECISIONS.includes(value as LawyerHandoffDecision)) {
    throw new HandoffPackageServiceError(400, 'INVALID_DECISION', 'Invalid review decision');
  }
  return value as LawyerHandoffDecision;
}

function assertEditableStatusTransition(currentValue: string, nextValue: LawyerHandoffStatus): void {
  const current = currentValue as LawyerHandoffStatus;
  if (current === nextValue) return;

  const allowed: Partial<Record<LawyerHandoffStatus, LawyerHandoffStatus[]>> = {
    DRAFT: ['PREPARED', 'SUBMITTED'],
    PREPARED: ['DRAFT', 'SUBMITTED'],
    REJECTED: ['DRAFT', 'PREPARED'],
  };
  if (!(allowed[current] || []).includes(nextValue)) {
    throw new HandoffPackageServiceError(
      409,
      'HANDOFF_TRANSITION_REQUIRES_EXPLICIT_ROUTE',
      'The requested handoff status transition is not available through the generic update route.'
    );
  }
}

function assertAdjacentFoundationAvailable(
  value: string | null | undefined,
  environmentVariable: string,
  code: string,
  message: string
): void {
  if (value && !isDatabaseFoundationEnabled(environmentVariable)) {
    throw new HandoffPackageServiceError(501, code, message);
  }
}

function toResult(record: any): LawyerHandoffPackageResult {
  return {
    id: record.id,
    caseId: record.caseId,
    status: record.status as LawyerHandoffStatus,
    packageType: record.packageType as LawyerHandoffPackageType,
    sourceDocumentId: record.sourceDocumentId,
    anonymizedDocumentId: record.anonymizedDocumentId,
    generatedContractId: record.generatedContractId,
    legalAnalysisId: record.legalAnalysisId,
    reviewNotesId: record.reviewNotesId,
    preparerSummary: record.preparerSummary,
    preparedById: record.preparedById,
    submittedAt: record.submittedAt,
    reviewedById: record.reviewedById,
    reviewedAt: record.reviewedAt,
    reviewDecision: record.reviewDecision as LawyerHandoffDecision | null,
    reviewComment: record.reviewComment,
    createdAt: record.createdAt,
    updatedAt: record.updatedAt,
  };
}

async function createTimelineEvent(params: {
  caseId: string;
  userId?: string | null;
  action: 'CREATED' | 'SUBMITTED' | 'REVIEWED';
  packageId: string;
  status: LawyerHandoffStatus;
  sourceDocumentId?: string | null;
  anonymizedDocumentId?: string | null;
  generatedContractId?: string | null;
  legalAnalysisId?: string | null;
  reviewDecision?: LawyerHandoffDecision | null;
}): Promise<void> {
  const payload = {
    handoffPackageId: params.packageId,
    caseId: params.caseId,
    sourceDocumentId: params.sourceDocumentId || null,
    anonymizedDocumentId: params.anonymizedDocumentId || null,
    generatedContractId: params.generatedContractId || null,
    legalAnalysisId: params.legalAnalysisId || null,
    status: params.status,
    reviewDecision: params.reviewDecision || null,
  };

  await prisma.timelineEvent.create({
    data: {
      caseId: params.caseId,
      userId: params.userId || undefined,
      eventType: 'CUSTOM' as any,
      type: `HANDOFF_PACKAGE_${params.action}`,
      payload,
      metadata: payload,
      description: `Handoff package ${params.action.toLowerCase()}`,
    } as any,
  });
}

class HandoffPackagesService {
  private getRepo(): any | null {
    return (prisma as any).lawyerHandoffPackage || null;
  }

  private isRepoUnavailableError(error: unknown): boolean {
    const message = error instanceof Error ? error.message.toLowerCase() : '';
    return (
      message.includes('lawyerhandoffpackage') ||
      message.includes('unknown field') ||
      message.includes('unknown arg') ||
      message.includes('does not exist') ||
      message.includes('does not contain a definition')
    );
  }

  private assertRepoAvailable(): any {
    const repo = this.getRepo();
    if (!repo) {
      throw new HandoffPackageServiceError(
        501,
        'HANDOFF_FEATURE_UNAVAILABLE',
        'Handoff package feature is not available in this environment.'
      );
    }
    return repo;
  }

  async listHandoffPackages(caseId: string): Promise<LawyerHandoffPackageResult[]> {
    const repo = this.getRepo();
    if (!repo) {
      return [];
    }
    try {
      const records = await repo.findMany({
        where: {
          caseId,
          status: { not: 'ARCHIVED' },
        },
        orderBy: { updatedAt: 'desc' },
      });
      return records.map(toResult);
    } catch (error) {
      if (this.isRepoUnavailableError(error)) {
        return [];
      }
      throw error;
    }
  }

  async getHandoffPackage(id: string): Promise<LawyerHandoffPackageResult | null> {
    const repo = this.getRepo();
    if (!repo) {
      return null;
    }
    let record: any;
    try {
      record = await repo.findUnique({ where: { id } });
    } catch (error) {
      if (this.isRepoUnavailableError(error)) {
        return null;
      }
      throw error;
    }
    return record ? toResult(record) : null;
  }

  async createHandoffPackage(params: CreateHandoffPackageParams): Promise<LawyerHandoffPackageResult> {
    const caseId = String(params.caseId || '').trim();
    if (!caseId) {
      throw new HandoffPackageServiceError(400, 'CASE_ID_REQUIRED', 'caseId is required');
    }

    assertAdjacentFoundationAvailable(
      params.legalAnalysisId,
      'ENABLE_LEGAL_ANALYSES',
      'LEGAL_ANALYSIS_FEATURE_UNAVAILABLE',
      'Legal analysis references are not available in this environment.'
    );
    assertAdjacentFoundationAvailable(
      params.reviewNotesId,
      'ENABLE_CONTRACT_REVIEW_NOTES',
      'REVIEW_NOTES_FEATURE_UNAVAILABLE',
      'Review note references are not available in this environment.'
    );

    const caseRecord = await prisma.case.findUnique({ where: { id: caseId }, select: { id: true } });
    if (!caseRecord) {
      throw new HandoffPackageServiceError(404, 'CASE_NOT_FOUND', 'Case not found');
    }

    if (params.sourceDocumentId) {
      const doc = await prisma.document.findUnique({ where: { id: params.sourceDocumentId }, select: { id: true } });
      if (!doc) {
        throw new HandoffPackageServiceError(404, 'SOURCE_DOCUMENT_NOT_FOUND', 'Source document not found');
      }
    }

    if (params.anonymizedDocumentId) {
      const anonDoc = await prisma.anonymousDocument.findUnique({ where: { id: params.anonymizedDocumentId }, select: { id: true } });
      if (!anonDoc) {
        throw new HandoffPackageServiceError(404, 'ANONYMOUS_DOCUMENT_NOT_FOUND', 'Anonymous document not found');
      }
    }

    if (params.generatedContractId) {
      const contract = await prisma.contractGeneration.findUnique({ where: { id: params.generatedContractId }, select: { id: true } });
      if (!contract) {
        throw new HandoffPackageServiceError(404, 'GENERATED_CONTRACT_NOT_FOUND', 'Generated contract not found');
      }
    }

    if (params.legalAnalysisId) {
      const analysis = await prisma.legalAnalysis.findUnique({ where: { id: params.legalAnalysisId }, select: { id: true } });
      if (!analysis) {
        throw new HandoffPackageServiceError(404, 'LEGAL_ANALYSIS_NOT_FOUND', 'Legal analysis not found');
      }
    }

    if (params.reviewNotesId) {
      const reviewNotes = await prisma.contractReviewRecord.findUnique({ where: { id: params.reviewNotesId }, select: { id: true } });
      if (!reviewNotes) {
        throw new HandoffPackageServiceError(404, 'REVIEW_NOTES_NOT_FOUND', 'Review notes not found');
      }
    }

    const packageType = params.packageType ? assertPackageType(params.packageType) : 'STANDARD';

    const repo = this.assertRepoAvailable();
    const record = await repo.create({
      data: {
        caseId,
        packageType,
        sourceDocumentId: params.sourceDocumentId || null,
        anonymizedDocumentId: params.anonymizedDocumentId || null,
        generatedContractId: params.generatedContractId || null,
        legalAnalysisId: params.legalAnalysisId || null,
        reviewNotesId: params.reviewNotesId || null,
        preparerSummary: params.preparerSummary || null,
        preparedById: params.userId || null,
        status: 'DRAFT',
      },
    });

    const result = toResult(record);
    await createTimelineEvent({
      action: 'CREATED',
      packageId: result.id,
      caseId: result.caseId,
      userId: params.userId,
      status: result.status,
      sourceDocumentId: result.sourceDocumentId,
      anonymizedDocumentId: result.anonymizedDocumentId,
      generatedContractId: result.generatedContractId,
      legalAnalysisId: result.legalAnalysisId,
    });
    return result;
  }

  async updateHandoffPackage(id: string, params: UpdateHandoffPackageParams): Promise<LawyerHandoffPackageResult> {
    assertAdjacentFoundationAvailable(
      params.legalAnalysisId,
      'ENABLE_LEGAL_ANALYSES',
      'LEGAL_ANALYSIS_FEATURE_UNAVAILABLE',
      'Legal analysis references are not available in this environment.'
    );
    assertAdjacentFoundationAvailable(
      params.reviewNotesId,
      'ENABLE_CONTRACT_REVIEW_NOTES',
      'REVIEW_NOTES_FEATURE_UNAVAILABLE',
      'Review note references are not available in this environment.'
    );

    const repo = this.assertRepoAvailable();
    const existing = await repo.findUnique({ where: { id } });
    if (!existing) {
      throw new HandoffPackageServiceError(404, 'HANDOFF_PACKAGE_NOT_FOUND', 'Handoff package not found');
    }

    const updateData: Record<string, any> = {};

    if (params.sourceDocumentId !== undefined) {
      updateData.sourceDocumentId = params.sourceDocumentId;
    }
    if (params.anonymizedDocumentId !== undefined) {
      updateData.anonymizedDocumentId = params.anonymizedDocumentId;
    }
    if (params.generatedContractId !== undefined) {
      updateData.generatedContractId = params.generatedContractId;
    }
    if (params.legalAnalysisId !== undefined) {
      updateData.legalAnalysisId = params.legalAnalysisId;
    }
    if (params.reviewNotesId !== undefined) {
      updateData.reviewNotesId = params.reviewNotesId;
    }
    if (params.preparerSummary !== undefined) {
      updateData.preparerSummary = params.preparerSummary;
    }

    if (params.status !== undefined) {
      const newStatus = assertStatus(params.status);
      assertEditableStatusTransition(existing.status, newStatus);
      updateData.status = newStatus;

      if (newStatus === 'SUBMITTED' && !existing.submittedAt) {
        updateData.submittedAt = new Date();
      }

      if ((newStatus === 'APPROVED' || newStatus === 'REJECTED') && params.userId) {
        updateData.reviewDecision = newStatus === 'APPROVED' ? 'APPROVED' : 'REJECTED_BLOCKING';
      }
    }

    const record = await repo.update({
      where: { id },
      data: updateData,
    });

    const result = toResult(record);
    if (params.status === 'SUBMITTED' && existing.status !== 'SUBMITTED') {
      await createTimelineEvent({
        action: 'SUBMITTED',
        packageId: result.id,
        caseId: result.caseId,
        userId: params.userId,
        status: result.status,
        sourceDocumentId: result.sourceDocumentId,
        anonymizedDocumentId: result.anonymizedDocumentId,
        generatedContractId: result.generatedContractId,
        legalAnalysisId: result.legalAnalysisId,
      });
    }
    return result;
  }

  async archiveHandoffPackage(id: string): Promise<LawyerHandoffPackageResult> {
    const repo = this.assertRepoAvailable();
    const existing = await repo.findUnique({ where: { id } });
    if (!existing) {
      throw new HandoffPackageServiceError(404, 'HANDOFF_PACKAGE_NOT_FOUND', 'Handoff package not found');
    }

    if (existing.status === 'ARCHIVED') {
      return toResult(existing);
    }

    const record = await repo.update({
      where: { id },
      data: { status: 'ARCHIVED' },
    });

    return toResult(record);
  }

  async reviewHandoffPackage(id: string, params: ReviewHandoffPackageParams): Promise<LawyerHandoffPackageResult> {
    const repo = this.assertRepoAvailable();
    const existing = await repo.findUnique({ where: { id } });
    if (!existing) {
      throw new HandoffPackageServiceError(404, 'HANDOFF_PACKAGE_NOT_FOUND', 'Handoff package not found');
    }

    const decision = assertDecision(params.decision);
    if (existing.status === 'APPROVED' || existing.status === 'REJECTED') {
      throw new HandoffPackageServiceError(409, 'REVIEW_ALREADY_DECIDED', 'The handoff review has already been decided.');
    }
    if (existing.status !== 'SUBMITTED' && existing.status !== 'IN_REVIEW') {
      throw new HandoffPackageServiceError(409, 'HANDOFF_NOT_READY', 'The handoff must be submitted before review.');
    }
    const reviewComment = String(params.reviewComment || '').trim();
    if (decision !== 'APPROVED' && !reviewComment) {
      throw new HandoffPackageServiceError(400, 'REVIEW_COMMENT_REQUIRED', 'A reviewer note is required when returning a handoff.');
    }
    const newStatus: LawyerHandoffStatus = decision === 'APPROVED' ? 'APPROVED' : 'REJECTED';

    const record = await repo.update({
      where: { id },
      data: {
        status: newStatus,
        reviewedById: params.userId || null,
        reviewedAt: new Date(),
        reviewDecision: decision,
        reviewComment: reviewComment || null,
      },
    });

    const result = toResult(record);
    await createTimelineEvent({
      action: 'REVIEWED',
      packageId: result.id,
      caseId: result.caseId,
      userId: params.userId,
      status: result.status,
      sourceDocumentId: result.sourceDocumentId,
      anonymizedDocumentId: result.anonymizedDocumentId,
      generatedContractId: result.generatedContractId,
      legalAnalysisId: result.legalAnalysisId,
      reviewDecision: decision,
    });
    return result;
  }
}

export default new HandoffPackagesService();
