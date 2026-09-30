// ============================================================================
// WORK REPORTS — rate-free client work-report routes.
// ============================================================================

import { Router, Request, Response } from 'express';
import { authenticate } from '../../middleware/auth';
import { requireWorkforceUser } from '../../middleware/workforceAuthorization';
import { requireCaseReadAccess } from '../cases/authorization';
import { prisma } from '../../prisma/prisma.service';
import { buildCaseReport, listReportCases, parsePeriodQuery, projectClientWorkReportExport } from './service';
import { renderClientWorkReportPdf } from './pdf';

const router = Router();

function safeFileStem(value: string): string {
  return String(value || 'ugy').replace(/[^\w\-]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 80) || 'ugy';
}

// GET /api/v1/work-reports/cases?clientId=&startDate=&endDate=
router.get('/cases', authenticate, requireWorkforceUser, async (req: Request, res: Response) => {
  try {
    const clientId = String(req.query.clientId ?? '').trim();
    if (!clientId) {
      return res.status(400).json({ status: 400, code: 'WORK_REPORT_CLIENT_REQUIRED', message: 'clientId is required' });
    }
    const period = parsePeriodQuery(req.query as Record<string, unknown>);
    if ('invalid' in period) {
      return res.status(400).json({ status: 400, code: 'WORK_REPORT_INVALID_PERIOD', message: 'startDate and endDate must be valid YYYY-MM-DD days.' });
    }
    const result = await listReportCases(prisma, { clientId, period, viewer: { userId: req.user?.userId ?? null, role: req.user?.role ?? null } });
    if (!result) {
      return res.status(404).json({ status: 404, code: 'WORK_REPORT_CLIENT_NOT_FOUND', message: 'Client not found' });
    }
    res.json(result);
  } catch (error) {
    console.error('Work report case list error:', error);
    res.status(500).json({ status: 500, code: 'INTERNAL_ERROR', message: 'Internal server error' });
  }
});

// GET /api/v1/work-reports/cases/:caseId?startDate=&endDate=
router.get('/cases/:caseId', authenticate, requireWorkforceUser, requireCaseReadAccess, async (req: Request, res: Response) => {
  try {
    const period = parsePeriodQuery(req.query as Record<string, unknown>);
    if ('invalid' in period) {
      return res.status(400).json({ status: 400, code: 'WORK_REPORT_INVALID_PERIOD', message: 'startDate and endDate must be valid YYYY-MM-DD days.' });
    }
    const report = await buildCaseReport(prisma, { caseId: String(req.params.caseId), period });
    if (!report) {
      return res.status(404).json({ status: 404, code: 'WORK_REPORT_CASE_NOT_FOUND', message: 'Case not found' });
    }
    res.json(report);
  } catch (error) {
    console.error('Work report build error:', error);
    res.status(500).json({ status: 500, code: 'INTERNAL_ERROR', message: 'Internal server error' });
  }
});

// GET /api/v1/work-reports/cases/:caseId/pdf?startDate=&endDate=
router.get('/cases/:caseId/pdf', authenticate, requireWorkforceUser, requireCaseReadAccess, async (req: Request, res: Response) => {
  try {
    const period = parsePeriodQuery(req.query as Record<string, unknown>);
    if ('invalid' in period) {
      return res.status(400).json({ status: 400, code: 'WORK_REPORT_INVALID_PERIOD', message: 'startDate and endDate must be valid YYYY-MM-DD days.' });
    }
    const report = await buildCaseReport(prisma, { caseId: String(req.params.caseId), period });
    if (!report) {
      return res.status(404).json({ status: 404, code: 'WORK_REPORT_CASE_NOT_FOUND', message: 'Case not found' });
    }
    const pdf = await renderClientWorkReportPdf(projectClientWorkReportExport(report));
    res.type('application/pdf');
    res.attachment(`munkaora-jelentes-${safeFileStem(report.case.caseNumber || report.case.caseId)}.pdf`);
    res.send(pdf);
  } catch (error) {
    console.error('Work report PDF error:', error);
    res.status(500).json({ status: 500, code: 'INTERNAL_ERROR', message: 'Internal server error' });
  }
});

export default router;
