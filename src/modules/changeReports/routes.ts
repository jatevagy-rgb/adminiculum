import { Router, Request, Response } from 'express';
import { authenticate } from '../../middleware/auth';
import { requireDocumentAccess } from '../../middleware/access';
import { prisma } from '../../prisma/prisma.service';
import auditService from '../../services/audit.service';
import changeReportsService from './services';

const router = Router();

function canGenerate(role?: string): boolean {
  return role === 'TRAINEE' || role === 'LAWYER';
}

function canView(role?: string): boolean {
  return role === 'LAWYER' || role === 'PARTNER';
}

router.post('/change-reports/generate', authenticate, requireDocumentAccess({ source: 'body', field: 'documentId' }), async (req: Request, res: Response): Promise<void> => {
  try {
    const userId = (req as any).user?.userId as string | undefined;
    if (!userId) {
      res.status(401).json({ status: 401, code: 'UNAUTHORIZED', message: 'User not authenticated' });
      return;
    }

    const user = await prisma.user.findUnique({ where: { id: userId }, select: { role: true } });
    if (!canGenerate(user?.role)) {
      res.status(403).json({ status: 403, code: 'FORBIDDEN', message: 'Insufficient permissions' });
      return;
    }

    const { documentId, fromVersionInt, toVersionInt } = req.body || {};
    if (!documentId || !Number.isInteger(fromVersionInt) || !Number.isInteger(toVersionInt)) {
      res.status(400).json({
        status: 400,
        code: 'VALIDATION_ERROR',
        message: 'documentId, fromVersionInt, toVersionInt are required',
      });
      return;
    }

    const report = await changeReportsService.generate({
      documentId,
      fromVersionInt,
      toVersionInt,
      createdById: userId,
    });

    await auditService.logAction(userId, 'CHANGE_REPORT_GENERATED', 'ChangeReport', report.id, {
      documentId,
      fromVersionInt,
      toVersionInt,
    });

    res.status(201).json(report);
  } catch (error) {
    console.error('Generate change report error:', error);
    res.status(500).json({
      status: 500,
      code: 'INTERNAL_ERROR',
      message: error instanceof Error ? error.message : 'Internal server error',
    });
  }
});

router.get('/change-reports/:id', authenticate, async (req: Request, res: Response): Promise<void> => {
  try {
    const userId = (req as any).user?.userId as string | undefined;
    if (!userId) {
      res.status(401).json({ status: 401, code: 'UNAUTHORIZED', message: 'User not authenticated' });
      return;
    }

    const user = await prisma.user.findUnique({ where: { id: userId }, select: { role: true } });
    if (!canView(user?.role)) {
      res.status(403).json({ status: 403, code: 'FORBIDDEN', message: 'Insufficient permissions' });
      return;
    }

    const { id } = req.params as { id: string };
    const report = await changeReportsService.getById(id);
    if (!report) {
      res.status(404).json({ status: 404, code: 'NOT_FOUND', message: 'Change report not found' });
      return;
    }

    res.json(report);
  } catch (error) {
    console.error('Get change report error:', error);
    res.status(500).json({
      status: 500,
      code: 'INTERNAL_ERROR',
      message: error instanceof Error ? error.message : 'Internal server error',
    });
  }
});

export default router;

