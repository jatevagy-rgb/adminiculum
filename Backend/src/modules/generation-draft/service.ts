/**
 * Generation Draft Service
 * Handles persistence of user-entered generation field data
 * 
 * API:
 * - GET /api/v1/generation-drafts/:caseId?templateId=xxx - Get draft by caseId + optional templateId
 * - PUT /api/v1/generation-drafts/:caseId - Upsert draft (create or update)
 * - DELETE /api/v1/generation-drafts/:caseId?templateId=xxx - Delete draft
 */

import { prisma } from '../../prisma/prisma.service';

interface DraftData {
  [key: string]: any;
}

interface UpsertDraftParams {
  caseId: string;
  templateId?: string;
  templateName?: string;
  documentFamily?: string;
  draftData: DraftData;
  userId?: string;
}

class GenerationDraftService {
  /**
   * Get draft by caseId and optional templateId
   */
  async getDraft(caseId: string, templateId?: string): Promise<any | null> {
    const where: any = { caseId };
    if (templateId) {
      where.templateId = templateId;
    }

    const draft = await prisma.generationDraft.findFirst({
      where,
      orderBy: { updatedAt: 'desc' }
    });

    if (!draft) return null;

    return {
      id: draft.id,
      caseId: draft.caseId,
      templateId: draft.templateId,
      templateName: draft.templateName,
      documentFamily: draft.documentFamily,
      draftData: draft.draftData,
      createdAt: draft.createdAt,
      updatedAt: draft.updatedAt,
      createdById: draft.createdById,
      lastEditedById: draft.lastEditedById
    };
  }

  /**
   * Get all drafts for a case
   */
  async getDraftsByCase(caseId: string): Promise<any[]> {
    const drafts = await prisma.generationDraft.findMany({
      where: { caseId },
      orderBy: { updatedAt: 'desc' }
    });

    return drafts.map(draft => ({
      id: draft.id,
      caseId: draft.caseId,
      templateId: draft.templateId,
      templateName: draft.templateName,
      documentFamily: draft.documentFamily,
      draftData: draft.draftData,
      createdAt: draft.createdAt,
      updatedAt: draft.updatedAt,
      createdById: draft.createdById,
      lastEditedById: draft.lastEditedById
    }));
  }

  /**
   * Upsert (create or update) draft
   */
  async upsertDraft(params: UpsertDraftParams): Promise<any> {
    const { caseId, templateId, templateName, documentFamily, draftData, userId } = params;

    // Try to find existing draft
    const existing = await prisma.generationDraft.findFirst({
      where: {
        caseId,
        ...(templateId ? { templateId } : {})
      }
    });

    if (existing) {
      // Update existing
      const updated = await prisma.generationDraft.update({
        where: { id: existing.id },
        data: {
          draftData,
          templateName: templateName || existing.templateName,
          documentFamily: documentFamily || existing.documentFamily,
          lastEditedById: userId || existing.lastEditedById
        }
      });

      return {
        id: updated.id,
        caseId: updated.caseId,
        templateId: updated.templateId,
        templateName: updated.templateName,
        documentFamily: updated.documentFamily,
        draftData: updated.draftData,
        createdAt: updated.createdAt,
        updatedAt: updated.updatedAt,
        createdById: updated.createdById,
        lastEditedById: updated.lastEditedById,
        isNew: false
      };
    } else {
      // Create new
      const created = await prisma.generationDraft.create({
        data: {
          caseId,
          templateId,
          templateName,
          documentFamily,
          draftData,
          createdById: userId,
          lastEditedById: userId
        }
      });

      return {
        id: created.id,
        caseId: created.caseId,
        templateId: created.templateId,
        templateName: created.templateName,
        documentFamily: created.documentFamily,
        draftData: created.draftData,
        createdAt: created.createdAt,
        updatedAt: created.updatedAt,
        createdById: created.createdById,
        lastEditedById: created.lastEditedById,
        isNew: true
      };
    }
  }

  /**
   * Delete draft by caseId + templateId
   */
  async deleteDraft(caseId: string, templateId?: string): Promise<boolean> {
    const where: any = { caseId };
    if (templateId) {
      where.templateId = templateId;
    }

    const result = await prisma.generationDraft.deleteMany({ where });
    return result.count > 0;
  }

  /**
   * Delete all drafts for a case
   */
  async deleteAllDraftsForCase(caseId: string): Promise<number> {
    const result = await prisma.generationDraft.deleteMany({ 
      where: { caseId } 
    });
    return result.count;
  }
}

export default new GenerationDraftService();