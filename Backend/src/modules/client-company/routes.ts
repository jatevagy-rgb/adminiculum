/**
 * COMPANY FOUNDATION — internal workforce routes.
 *
 * Mounted at /api/v1/client-company. All routes require workforce auth
 * (authenticate); company record reads are Client-scoped and writes require a
 * client manager (ADMIN/PARTNER). No organizational customer route is exposed
 * in Phase 1.
 */
import { Request, Response, Router } from 'express';
import { authenticate } from '../../middleware/auth';
import { InteractionError } from '../client-interaction/base';
import * as company from './service';

export const clientCompanyRouter = Router();

function actor(req: Request): { userId: string; role?: string | null } {
  return { userId: String(req.user?.userId || ''), role: String(req.user?.role || '') };
}

function fail(res: Response, error: unknown): void {
  if (error instanceof InteractionError) {
    res.status(error.status).json({ status: error.status, code: error.code, message: error.message });
    return;
  }
  res.status(500).json({ status: 500, code: 'COMPANY_INTERNAL_ERROR', message: 'Company request failed.' });
}

clientCompanyRouter.use(authenticate);

// Operating profile
clientCompanyRouter.get('/clients/:clientId/operating-profile', async (req, res) => {
  try { res.json(await company.getOperatingProfile(actor(req), String(req.params.clientId))); } catch (e) { fail(res, e); }
});
clientCompanyRouter.put('/clients/:clientId/operating-profile', async (req, res) => {
  try { res.json(await company.upsertOperatingProfile(actor(req), String(req.params.clientId), req.body || {})); } catch (e) { fail(res, e); }
});

// Facts
clientCompanyRouter.get('/clients/:clientId/facts', async (req, res) => {
  try { res.json(await company.listFacts(actor(req), String(req.params.clientId), { type: req.query.type as string, status: req.query.status as string })); } catch (e) { fail(res, e); }
});
clientCompanyRouter.post('/clients/:clientId/facts', async (req, res) => {
  try { res.status(201).json(await company.createFact(actor(req), String(req.params.clientId), req.body || {})); } catch (e) { fail(res, e); }
});
clientCompanyRouter.patch('/facts/:factId', async (req, res) => {
  try { res.json(await company.updateFact(actor(req), String(req.params.factId), req.body || {})); } catch (e) { fail(res, e); }
});
clientCompanyRouter.post('/facts/:factId/verify', async (req, res) => {
  try { res.json(await company.verifyFact(actor(req), String(req.params.factId), req.body || {})); } catch (e) { fail(res, e); }
});

// Company milestones
clientCompanyRouter.get('/clients/:clientId/milestones', async (req, res) => {
  try { res.json(await company.listMilestones(actor(req), String(req.params.clientId))); } catch (e) { fail(res, e); }
});
clientCompanyRouter.post('/clients/:clientId/milestones', async (req, res) => {
  try { res.status(201).json(await company.createMilestone(actor(req), String(req.params.clientId), req.body || {})); } catch (e) { fail(res, e); }
});
clientCompanyRouter.patch('/milestones/:milestoneId', async (req, res) => {
  try { res.json(await company.updateMilestone(actor(req), String(req.params.milestoneId), req.body || {})); } catch (e) { fail(res, e); }
});

// Assessments
clientCompanyRouter.get('/clients/:clientId/assessments', async (req, res) => {
  try { res.json(await company.listAssessments(actor(req), String(req.params.clientId), { type: req.query.type as string, status: req.query.status as string })); } catch (e) { fail(res, e); }
});
clientCompanyRouter.post('/clients/:clientId/assessments', async (req, res) => {
  try { res.status(201).json(await company.createAssessment(actor(req), String(req.params.clientId), req.body || {})); } catch (e) { fail(res, e); }
});
clientCompanyRouter.get('/assessments/:assessmentId', async (req, res) => {
  try { res.json(await company.getAssessment(actor(req), String(req.params.assessmentId))); } catch (e) { fail(res, e); }
});
for (const action of ['start', 'complete', 'archive'] as const) {
  clientCompanyRouter.post(`/assessments/:assessmentId/${action}`, async (req, res) => {
    try { res.json(await company.transitionAssessment(actor(req), String(req.params.assessmentId), action, req.body || {})); } catch (e) { fail(res, e); }
  });
}
clientCompanyRouter.patch('/assessments/:assessmentId', async (req, res) => {
  try { res.json(await company.updateAssessmentMeta(actor(req), String(req.params.assessmentId), req.body || {})); } catch (e) { fail(res, e); }
});

// Assessment items
clientCompanyRouter.post('/assessments/:assessmentId/items', async (req, res) => {
  try { res.status(201).json(await company.addAssessmentItem(actor(req), String(req.params.assessmentId), req.body || {})); } catch (e) { fail(res, e); }
});
clientCompanyRouter.patch('/items/:itemId', async (req, res) => {
  try { res.json(await company.updateAssessmentItem(actor(req), String(req.params.itemId), req.body || {})); } catch (e) { fail(res, e); }
});

// Findings
clientCompanyRouter.get('/clients/:clientId/findings', async (req, res) => {
  try { res.json(await company.listFindings(actor(req), String(req.params.clientId), { status: req.query.status as string, assessmentId: req.query.assessmentId as string })); } catch (e) { fail(res, e); }
});
clientCompanyRouter.post('/findings', async (req, res) => {
  try { res.status(201).json(await company.createFinding(actor(req), req.body || {})); } catch (e) { fail(res, e); }
});
clientCompanyRouter.post('/findings/:findingId/status', async (req, res) => {
  try { res.json(await company.transitionFinding(actor(req), String(req.params.findingId), req.body?.status)); } catch (e) { fail(res, e); }
});
clientCompanyRouter.post('/findings/:findingId/link-initiative', async (req, res) => {
  try { res.json(await company.linkFindingToInitiative(actor(req), String(req.params.findingId), req.body?.developmentInitiativeId ? String(req.body.developmentInitiativeId) : null)); } catch (e) { fail(res, e); }
});

// Development initiatives
clientCompanyRouter.get('/clients/:clientId/initiatives', async (req, res) => {
  try { res.json(await company.listInitiatives(actor(req), String(req.params.clientId), { status: req.query.status as string })); } catch (e) { fail(res, e); }
});
clientCompanyRouter.post('/clients/:clientId/initiatives', async (req, res) => {
  try { res.status(201).json(await company.createInitiative(actor(req), String(req.params.clientId), req.body || {})); } catch (e) { fail(res, e); }
});
clientCompanyRouter.get('/initiatives/:initiativeId', async (req, res) => {
  try { res.json(await company.getInitiative(actor(req), String(req.params.initiativeId))); } catch (e) { fail(res, e); }
});
clientCompanyRouter.patch('/initiatives/:initiativeId', async (req, res) => {
  try { res.json(await company.updateInitiative(actor(req), String(req.params.initiativeId), req.body || {})); } catch (e) { fail(res, e); }
});
