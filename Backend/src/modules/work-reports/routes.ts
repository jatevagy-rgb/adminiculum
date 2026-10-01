import { savedOwnerPersonId } from '../case-workspace/owner.service';
// ============================================================================
// WORK REPORTS — rate-free client work-report routes.
// ============================================================================

import { Router, Request, Response, NextFunction } from 'express';
import { authenticate } from '../../middleware/auth';
import { requireWorkforceUser } from '../../middleware/workforceAuthorization';
import { requireCaseReadAccess } from '../cases/authorization';
import { canReadClientIdentity } from '../clients/routes';
import { prisma } from '../../prisma/prisma.service';
import {
  buildCaseReport,
  listReportCases,
  listReportOwnerCandidates,
  parsePeriodQuery,
  projectClientWorkReportExport,
  resolveWorkReportIssuer,
  resolveWorkReportOwner,
} from './service';
import { renderClientWorkReportPdf } from './pdf';

const router = Router();

function safeFileStem(value: string): string {
  return String(value || 'ugy').replace(/[^\w\-]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 80) || 'ugy';
}

function ownerPersonIdOf(req: Request): string | null {
  const raw = String(req.query.ownerPersonId ?? '').trim();
  return raw || null;
}

// Same established client-read scope as the internal client identity API:
// identity managers (ADMIN/PARTNER) or a workforce user with a related case on
// the client. Workforce-role validation alone is not client access.
async function requireWorkReportClientReadAccess(req: Request, res: Response, next: NextFunction): Promise<void> {
  const clientId = String(req.params.clientId ?? '').trim();
  if (!clientId) {
    res.status(400).json({ status: 400, code: 'WORK_REPORT_CLIENT_REQUIRED', message: 'clientId is required' });
    return;
  }
  try {
    const access = await canReadClientIdentity(req, clientId);
    if (!access) {
      res.status(403).json({ status: 403, code: 'CLIENT_IDENTITY_ACCESS_FORBIDDEN', message: 'You do not have access to client identity data.' });
      return;
    }
    next();
  } catch {
    res.status(500).json({ status: 500, code: 'CLIENT_IDENTITY_AUTHORIZATION_ERROR', message: 'Client identity access could not be verified.' });
  }
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

// GET /api/v1/work-reports/clients/:clientId/owners
// Report-level client-side owner candidates: people of one client. A selection
// made from this list applies to the report only, never to the case.
router.get('/clients/:clientId/owners', authenticate, requireWorkforceUser, requireWorkReportClientReadAccess, async (req: Request, res: Response) => {
  try {
    const clientId = String(req.params.clientId ?? '').trim();
    if (!clientId) {
      return res.status(400).json({ status: 400, code: 'WORK_REPORT_CLIENT_REQUIRED', message: 'clientId is required' });
    }
    const result = await listReportOwnerCandidates(prisma, { clientId });
    if (!result) {
      return res.status(404).json({ status: 404, code: 'WORK_REPORT_CLIENT_NOT_FOUND', message: 'Client not found' });
    }
    res.json(result);
  } catch (error) {
    console.error('Work report owner candidates error:', error);
    res.status(500).json({ status: 500, code: 'INTERNAL_ERROR', message: 'Internal server error' });
  }
});

// GET /api/v1/work-reports/cases/:caseId?startDate=&endDate=&ownerPersonId=
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
    const ownerResolution = await resolveWorkReportOwner(prisma, { clientId: report.client.id, ownerPersonId: ownerPersonIdOf(req) || await savedOwnerPersonId(prisma, String(req.params.caseId), report.client.id) });
    if ('invalid' in ownerResolution) {
      return res.status(422).json({ status: 422, code: 'WORK_REPORT_OWNER_NOT_IN_CLIENT', message: 'A kiválasztott ügygazda nem tartozik az ügy ügyfeléhez.' });
    }
    const issuerResolution = await resolveWorkReportIssuer(prisma);
    const exportPreview = projectClientWorkReportExport(report, { issuer: issuerResolution.issuer, owner: ownerResolution.owner });
    res.set('Cache-Control', 'no-store').json({
      ...report,
      owner: ownerResolution.owner,
      issuer: issuerResolution.issuer,
      issuerMissing: issuerResolution.missingEssential,
      officeIdentifierNote: issuerResolution.officeIdentifierNote,
      exportPreview,
    });
  } catch (error) {
    console.error('Work report build error:', error);
    res.status(500).json({ status: 500, code: 'INTERNAL_ERROR', message: 'Internal server error' });
  }
});

// GET /api/v1/work-reports/cases/:caseId/pdf?startDate=&endDate=&ownerPersonId=
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
    const ownerResolution = await resolveWorkReportOwner(prisma, { clientId: report.client.id, ownerPersonId: ownerPersonIdOf(req) || await savedOwnerPersonId(prisma, String(req.params.caseId), report.client.id) });
    if ('invalid' in ownerResolution) {
      return res.status(422).json({ status: 422, code: 'WORK_REPORT_OWNER_NOT_IN_CLIENT', message: 'A kiválasztott ügygazda nem tartozik az ügy ügyfeléhez.' });
    }
    const issuerResolution = await resolveWorkReportIssuer(prisma);
    if (issuerResolution.missingEssential.length > 0) {
      return res.status(422).json({
        status: 422,
        code: 'WORK_REPORT_ISSUER_CONFIGURATION_REQUIRED',
        message: `A PDF exportálásához hiányosak a kiállítói adatok: ${issuerResolution.missingEssential.join(', ')}.`,
        missing: issuerResolution.missingEssential,
      });
    }
    const pdf = await renderClientWorkReportPdf(projectClientWorkReportExport(report, { issuer: issuerResolution.issuer, owner: ownerResolution.owner }));
    res.set('Cache-Control', 'no-store').type('application/pdf');
    res.attachment(`munkaora-jelentes-${safeFileStem(report.case.caseNumber || report.case.caseId)}.pdf`);
    res.send(pdf);
  } catch (error) {
    console.error('Work report PDF error:', error);
    res.status(500).json({ status: 500, code: 'INTERNAL_ERROR', message: 'Internal server error' });
  }
});

export default router;
