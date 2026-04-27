/**
 * Review Notes Service — Patch 6A
 * Persisted review-note layer for contract revisions.
 * Additive only — does NOT affect existing approve/reject/back-to-review workflow.
 */

import { prisma } from '../../prisma/prisma.service';

export type ReviewOverallStatus = 'NEEDS_REVISION' | 'APPROVED_FOR_NEXT_STEP' | 'FLAGGED';
export type BlockReviewStatus = 'OK' | 'REVIEW_NEEDED' | 'RISK_ISSUE';

export interface BlockNoteInput {
  blockKey: string;
  blockOrderIndex?: number;
  sourceClauseId?: string;
  status: BlockReviewStatus;
  title?: string;
  note?: string;
}

export interface UpsertReviewNotesInput {
  overallStatus: ReviewOverallStatus;
  overallTitle?: string;
  overallNote?: string;
  authorId?: string;
  blockNotes?: BlockNoteInput[];
}

export interface ReviewNotesResult {
  id: string;
  generationId: string;
  overallStatus: ReviewOverallStatus;
  overallTitle: string | null;
  overallNote: string | null;
  authorId: string | null;
  createdAt: Date;
  updatedAt: Date;
  blockNotes: Array<{
    id: string;
    blockKey: string;
    blockOrderIndex: number | null;
    sourceClauseId: string | null;
    status: BlockReviewStatus;
    title: string | null;
    note: string | null;
    createdAt: Date;
    updatedAt: Date;
  }>;
}

class ReviewNotesService {
  /**
   * Get all review notes for a contract generation (by generationId)
   */
  async getReviewNotes(generationId: string): Promise<ReviewNotesResult | null> {
    const record = await prisma.contractReviewRecord.findUnique({
      where: { generationId },
      include: {
        blockNotes: {
          orderBy: { blockOrderIndex: 'asc' }
        }
      }
    });

    if (!record) return null;

    return {
      id: record.id,
      generationId: record.generationId,
      overallStatus: record.overallStatus as ReviewOverallStatus,
      overallTitle: record.overallTitle,
      overallNote: record.overallNote,
      authorId: record.authorId,
      createdAt: record.createdAt,
      updatedAt: record.updatedAt,
      blockNotes: record.blockNotes.map(bn => ({
        id: bn.id,
        blockKey: bn.blockKey,
        blockOrderIndex: bn.blockOrderIndex,
        sourceClauseId: bn.sourceClauseId,
        status: bn.status as BlockReviewStatus,
        title: bn.title,
        note: bn.note,
        createdAt: bn.createdAt,
        updatedAt: bn.updatedAt
      }))
    };
  }

  /**
   * Upsert overall review record + block notes in one transaction.
   * If blockNotes is provided, replaces all existing block notes for this record.
   */
  async upsertReviewNotes(generationId: string, input: UpsertReviewNotesInput): Promise<ReviewNotesResult> {
    return prisma.$transaction(async (tx) => {
      // Upsert the main record
      const record = await tx.contractReviewRecord.upsert({
        where: { generationId },
        update: {
          overallStatus: input.overallStatus,
          overallTitle: input.overallTitle ?? null,
          overallNote: input.overallNote ?? null,
          authorId: input.authorId ?? null
        },
        create: {
          generationId,
          overallStatus: input.overallStatus,
          overallTitle: input.overallTitle ?? null,
          overallNote: input.overallNote ?? null,
          authorId: input.authorId ?? null
        }
      });

      // If blockNotes provided, replace all existing block notes
      if (input.blockNotes !== undefined) {
        // Delete existing
        await tx.blockReviewNote.deleteMany({
          where: { reviewRecordId: record.id }
        });

        // Create new ones
        if (input.blockNotes.length > 0) {
          await tx.blockReviewNote.createMany({
            data: input.blockNotes.map(bn => ({
              reviewRecordId: record.id,
              blockKey: bn.blockKey,
              blockOrderIndex: bn.blockOrderIndex ?? null,
              sourceClauseId: bn.sourceClauseId ?? null,
              status: bn.status,
              title: bn.title ?? null,
              note: bn.note ?? null
            }))
          });
        }
      }

      // Return the full record with block notes
      const fullRecord = await tx.contractReviewRecord.findUnique({
        where: { id: record.id },
        include: {
          blockNotes: {
            orderBy: { blockOrderIndex: 'asc' }
          }
        }
      });

      return {
        id: fullRecord!.id,
        generationId: fullRecord!.generationId,
        overallStatus: fullRecord!.overallStatus as ReviewOverallStatus,
        overallTitle: fullRecord!.overallTitle,
        overallNote: fullRecord!.overallNote,
        authorId: fullRecord!.authorId,
        createdAt: fullRecord!.createdAt,
        updatedAt: fullRecord!.updatedAt,
        blockNotes: fullRecord!.blockNotes.map(bn => ({
          id: bn.id,
          blockKey: bn.blockKey,
          blockOrderIndex: bn.blockOrderIndex,
          sourceClauseId: bn.sourceClauseId,
          status: bn.status as BlockReviewStatus,
          title: bn.title,
          note: bn.note,
          createdAt: bn.createdAt,
          updatedAt: bn.updatedAt
        }))
      };
    });
  }
}

export default new ReviewNotesService();