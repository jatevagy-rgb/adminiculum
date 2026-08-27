/**
 * Review Notes Routes — Patch 6A
 * GET /api/v1/contracts/:id/review-notes
 * PUT /api/v1/contracts/:id/review-notes
 */

import { Router } from 'express';
import reviewNotesService from './service';
import { prisma } from '../../prisma/prisma.service';
import { authenticate } from '../../middleware/auth';
import { requireWorkforceUser } from '../../middleware/workforceAuthorization';
import {
  requireContractGenerationReadAccess,
  requireContractGenerationManageAccess,
} from '../contracts/contractAuthorization';
import {
  isDatabaseFoundationEnabled,
  requireDatabaseFoundation,
} from '../../middleware/featureAvailability';

const router = Router();
const requireReviewNotesFoundation = requireDatabaseFoundation({
  feature: 'CONTRACT_REVIEW_NOTES',
  enabled: () => isDatabaseFoundationEnabled('ENABLE_CONTRACT_REVIEW_NOTES'),
  message: 'Contract review-note persistence is not available in this environment.',
  nextStep: 'Complete the contract review database reconciliation before enabling this feature.',
});

router.use(authenticate, requireWorkforceUser, requireReviewNotesFoundation);

// GET /api/v1/contracts/:id/review-notes
router.get('/:generationId/review-notes', requireContractGenerationReadAccess, async (req, res) => {
  try {
    const generationId = String(req.params.generationId);
    const result = await reviewNotesService.getReviewNotes(generationId);
    res.json(result);
  } catch (err) {
    console.error('getReviewNotes error:', err);
    res.status(500).json({ error: 'Failed to load review notes' });
  }
});

// PUT /api/v1/contracts/:id/review-notes
router.put('/:generationId/review-notes', requireContractGenerationManageAccess, async (req, res) => {
  try {
    const generationId = String(req.params.generationId);
    const { overallStatus, overallTitle, overallNote, blockNotes } = req.body;

    if (!overallStatus) {
      res.status(400).json({ error: 'overallStatus is required' });
      return;
    }

    const authorId = req.user?.userId;

    const result = await reviewNotesService.upsertReviewNotes(generationId, {
      overallStatus,
      overallTitle,
      overallNote,
      authorId,
      blockNotes,
    });

    res.json(result);
  } catch (err) {
    console.error('upsertReviewNotes error:', err);
    res.status(500).json({ error: 'Failed to save review notes' });
  }
});

// GET /api/v1/contracts/:id/review-summary.txt
router.get('/:generationId/review-summary.txt', requireContractGenerationReadAccess, async (req, res) => {
  try {
    const generationId = String(req.params.generationId);

    const [reviewNotes, contract] = await Promise.all([
      reviewNotesService.getReviewNotes(generationId),
      prisma.contractGeneration.findUnique({
        where: { id: generationId },
        select: {
          id: true,
          title: true,
          fileName: true,
          revisionNumber: true,
          status: true,
          generatedAt: true,
          parentRevisionId: true
        }
      })
    ]);

    if (!contract) {
      res.status(404).json({ error: 'Contract revision not found' });
      return;
    }

    const toIso = (value: Date | string | null | undefined) => (value ? new Date(value).toISOString() : '');
    const escapeLine = (value: unknown) => String(value ?? '').replace(/\r?\n/g, ' ').trim();

    const lines: string[] = [];
    lines.push('ADMINICULUM REVIEW SUMMARY');
    lines.push('');
    lines.push('[DOCUMENT]');
    lines.push(`generationId: ${contract.id}`);
    lines.push(`title: ${escapeLine(contract.title)}`);
    lines.push(`fileName: ${escapeLine(contract.fileName)}`);
    lines.push(`revisionNumber: ${contract.revisionNumber ?? ''}`);
    lines.push(`status: ${escapeLine(contract.status)}`);
    lines.push(`generatedAt: ${toIso(contract.generatedAt)}`);
    lines.push(`parentRevisionId: ${escapeLine(contract.parentRevisionId)}`);
    lines.push('');
    lines.push('[OVERALL_REVIEW]');
    lines.push(`overallStatus: ${escapeLine(reviewNotes?.overallStatus ?? 'NOT_REVIEWED')}`);
    lines.push(`overallTitle: ${escapeLine(reviewNotes?.overallTitle)}`);
    lines.push(`overallNote: ${escapeLine(reviewNotes?.overallNote)}`);
    lines.push(`reviewCreatedAt: ${toIso(reviewNotes?.createdAt)}`);
    lines.push(`reviewUpdatedAt: ${toIso(reviewNotes?.updatedAt)}`);
    lines.push('');
    lines.push('[BLOCK_NOTES]');

    const blockNotes = reviewNotes?.blockNotes ?? [];
    if (blockNotes.length === 0) {
      lines.push('none');
    } else {
      blockNotes.forEach((block, index) => {
        lines.push(`- item: ${index + 1}`);
        lines.push(`  blockKey: ${escapeLine(block.blockKey)}`);
        lines.push(`  blockOrderIndex: ${block.blockOrderIndex ?? ''}`);
        lines.push(`  sourceClauseId: ${escapeLine(block.sourceClauseId)}`);
        lines.push(`  status: ${escapeLine(block.status)}`);
        lines.push(`  title: ${escapeLine(block.title)}`);
        lines.push(`  note: ${escapeLine(block.note)}`);
        lines.push(`  createdAt: ${toIso(block.createdAt)}`);
        lines.push(`  updatedAt: ${toIso(block.updatedAt)}`);
      });
    }

    const body = lines.join('\n') + '\n';
    const safeRevision = String(contract.revisionNumber ?? 'unknown').replace(/[^a-zA-Z0-9_-]/g, '');
    const filename = `review-summary-${contract.id}-rev${safeRevision}.txt`;

    res.setHeader('Content-Type', 'text/plain; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    res.status(200).send(body);
  } catch (err) {
    console.error('exportReviewSummary error:', err);
    res.status(500).json({ error: 'Failed to export review summary' });
  }
});

export default router;
