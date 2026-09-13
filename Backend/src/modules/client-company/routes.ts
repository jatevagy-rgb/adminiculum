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
import { InteractionError, assertClientReadAccess } from '../client-interaction/base';
import { prisma as defaultPrisma } from '../../prisma/prisma.service';
import * as company from './service';
import * as research from '../company-growth/research/service';
import { listEvidence } from '../company-growth/research/corpus';
import {
  getLatestProcessObservation,
  getProcessObservationHistory,
  captureProcessObservation,
} from '../company-growth/observation/processObservationService';
import { submitSurveyIntake, listSurveyIntakes } from '../company-observatory/intake';
import { ObservatoryIngestionService } from '../company-observatory/ingestion/service';

const observatory = new ObservatoryIngestionService();

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

// Business systems (T1)
clientCompanyRouter.get('/clients/:clientId/systems', async (req, res) => {
  try { res.json(await company.listBusinessSystems(actor(req), String(req.params.clientId), { status: req.query.status as string })); } catch (e) { fail(res, e); }
});
clientCompanyRouter.post('/clients/:clientId/systems', async (req, res) => {
  try { res.status(201).json(await company.createBusinessSystem(actor(req), String(req.params.clientId), req.body || {})); } catch (e) { fail(res, e); }
});
clientCompanyRouter.get('/systems/:systemId', async (req, res) => {
  try { res.json(await company.getBusinessSystem(actor(req), String(req.params.systemId))); } catch (e) { fail(res, e); }
});
clientCompanyRouter.patch('/systems/:systemId', async (req, res) => {
  try { res.json(await company.updateBusinessSystem(actor(req), String(req.params.systemId), req.body || {})); } catch (e) { fail(res, e); }
});
clientCompanyRouter.delete('/systems/:systemId', async (req, res) => {
  try { res.json(await company.deleteBusinessSystem(actor(req), String(req.params.systemId))); } catch (e) { fail(res, e); }
});

// Business processes (T1)
clientCompanyRouter.get('/clients/:clientId/processes', async (req, res) => {
  try { res.json(await company.listBusinessProcesses(actor(req), String(req.params.clientId), { status: req.query.status as string, category: req.query.category as string })); } catch (e) { fail(res, e); }
});
clientCompanyRouter.post('/clients/:clientId/processes', async (req, res) => {
  try { res.status(201).json(await company.createBusinessProcess(actor(req), String(req.params.clientId), req.body || {})); } catch (e) { fail(res, e); }
});
clientCompanyRouter.get('/processes/:processId', async (req, res) => {
  try { res.json(await company.getBusinessProcess(actor(req), String(req.params.processId))); } catch (e) { fail(res, e); }
});
clientCompanyRouter.patch('/processes/:processId', async (req, res) => {
  try { res.json(await company.updateBusinessProcess(actor(req), String(req.params.processId), req.body || {})); } catch (e) { fail(res, e); }
});
clientCompanyRouter.delete('/processes/:processId', async (req, res) => {
  try { res.json(await company.deleteBusinessProcess(actor(req), String(req.params.processId))); } catch (e) { fail(res, e); }
});

// Process steps (T1)
clientCompanyRouter.post('/processes/:processId/steps', async (req, res) => {
  try { res.status(201).json(await company.addProcessStep(actor(req), String(req.params.processId), req.body || {})); } catch (e) { fail(res, e); }
});
clientCompanyRouter.patch('/steps/:stepId', async (req, res) => {
  try { res.json(await company.updateProcessStep(actor(req), String(req.params.stepId), req.body || {})); } catch (e) { fail(res, e); }
});
clientCompanyRouter.post('/processes/:processId/reorder-steps', async (req, res) => {
  try { res.json(await company.reorderProcessSteps(actor(req), String(req.params.processId), req.body?.stepIds || [])); } catch (e) { fail(res, e); }
});
clientCompanyRouter.delete('/steps/:stepId', async (req, res) => {
  try { res.json(await company.removeProcessStep(actor(req), String(req.params.stepId))); } catch (e) { fail(res, e); }
});

// ---------------------------------------------------------------------------
// OBSERVATORY — survey intake + observation provenance (additive)
// ---------------------------------------------------------------------------

clientCompanyRouter.post('/clients/:clientId/observatory/survey-intake', async (req, res) => {
  try {
    const result = await submitSurveyIntake(actor(req), String(req.params.clientId), {
      categories: Array.isArray(req.body?.categories) ? req.body.categories.map(String) : [],
      freeText: req.body?.freeText,
      processId: req.body?.processId,
      idempotencyKey: String(req.body?.idempotencyKey || ''),
    });
    res.status(201).json(result);
  } catch (e) { fail(res, e); }
});
clientCompanyRouter.get('/clients/:clientId/observatory/survey-intake', async (req, res) => {
  try { res.json({ items: await listSurveyIntakes(actor(req), String(req.params.clientId)) }); } catch (e) { fail(res, e); }
});
clientCompanyRouter.get('/clients/:clientId/observatory/sources', async (req, res) => {
  try {
    const clientId = String(req.params.clientId);
    await assertClientReadAccess(actor(req), clientId, defaultPrisma);
    const rows = await defaultPrisma.externalSourceConnection.findMany({
      where: { clientId },
      orderBy: { createdAt: 'asc' },
    });
    res.json({ items: rows });
  } catch (e) { fail(res, e); }
});
clientCompanyRouter.get('/clients/:clientId/observatory/runs/:runId/observations', async (req, res) => {
  try {
    res.json({ items: await observatory.listObservationsForRun(actor(req), { clientId: String(req.params.clientId), runId: String(req.params.runId) }) });
  } catch (e) { fail(res, e); }
});

// ---------------------------------------------------------------------------
// GROW — research runs, opportunities, review, opportunities → initiative
// handoff, outcome measurement (all additive; human review enforced).
// ---------------------------------------------------------------------------

clientCompanyRouter.get('/clients/:clientId/grow/home', async (req, res) => {
  try { res.json(await research.listGrowHome(actor(req), String(req.params.clientId))); } catch (e) { fail(res, e); }
});
clientCompanyRouter.get('/clients/:clientId/grow/evidence', async (req, res) => {
  try { res.json({ items: await listEvidence(actor(req), String(req.params.clientId)) }); } catch (e) { fail(res, e); }
});
clientCompanyRouter.post('/clients/:clientId/grow/research-runs', async (req, res) => {
  try {
    const result = await research.runResearchCycle(actor(req), String(req.params.clientId), {
      businessProcessId: req.body?.businessProcessId ? String(req.body.businessProcessId) : undefined,
      idempotencyKey: req.body?.idempotencyKey ? String(req.body.idempotencyKey) : undefined,
    });
    res.status(201).json(result);
  } catch (e) { fail(res, e); }
});
clientCompanyRouter.get('/clients/:clientId/grow/opportunities', async (req, res) => {
  try { res.json({ items: await research.listGrowOpportunities(actor(req), String(req.params.clientId)) }); } catch (e) { fail(res, e); }
});
clientCompanyRouter.get('/clients/:clientId/grow/opportunities/:recommendationId', async (req, res) => {
  try { res.json(await research.getOpportunityDetail(actor(req), String(req.params.clientId), String(req.params.recommendationId))); } catch (e) { fail(res, e); }
});
clientCompanyRouter.post('/clients/:clientId/grow/opportunities/:recommendationId/review', async (req, res) => {
  try {
    const decision = String(req.body?.decision || '');
    if (!['ACCEPT', 'DECLINE', 'REQUEST_MORE_INFO'].includes(decision)) {
      return res.status(400).json({ status: 400, code: 'REVIEW_DECISION_INVALID', message: 'decision must be ACCEPT, DECLINE or REQUEST_MORE_INFO.' });
    }
    res.json(await research.reviewRecommendation(actor(req), String(req.params.clientId), String(req.params.recommendationId), {
      decision: decision as 'ACCEPT' | 'DECLINE' | 'REQUEST_MORE_INFO',
      note: req.body?.note,
    }));
  } catch (e) { fail(res, e); }
});
clientCompanyRouter.post('/clients/:clientId/grow/opportunities/:opportunityId/start-initiative', async (req, res) => {
  try {
    res.json(await research.startInitiativeFromOpportunity(actor(req), String(req.params.clientId), String(req.params.opportunityId), {
      title: req.body?.title,
      reason: req.body?.reason,
      currentState: req.body?.currentState,
      targetState: req.body?.targetState,
      priority: req.body?.priority,
      caseId: req.body?.caseId,
    }));
  } catch (e) { fail(res, e); }
});
clientCompanyRouter.post('/clients/:clientId/grow/opportunities/:opportunityId/outcomes', async (req, res) => {
  try {
    res.status(201).json(await research.recordOutcomeMeasurement(actor(req), String(req.params.clientId), String(req.params.opportunityId), {
      businessProcessId: String(req.body?.businessProcessId || ''),
      beforeSnapshotId: String(req.body?.beforeSnapshotId || ''),
      afterSnapshotId: req.body?.afterSnapshotId ? String(req.body.afterSnapshotId) : undefined,
      expectedActiveReductionPct: req.body?.expectedActiveReductionPct != null ? Number(req.body.expectedActiveReductionPct) : undefined,
      runsPerMonth: req.body?.runsPerMonth != null ? Number(req.body.runsPerMonth) : undefined,
      hourlyCostHuf: req.body?.hourlyCostHuf,
      peopleAffected: req.body?.peopleAffected != null ? Number(req.body.peopleAffected) : undefined,
      synthetic: req.body?.synthetic === true,
      note: req.body?.note,
    }));
  } catch (e) { fail(res, e); }
});
clientCompanyRouter.get('/clients/:clientId/grow/outcomes', async (req, res) => {
  try { res.json({ items: await research.listOutcomeMeasurements(actor(req), String(req.params.clientId)) }); } catch (e) { fail(res, e); }
});

// Process observation snapshots (T2B) — exposed for before/after measurement.
clientCompanyRouter.post('/clients/:clientId/processes/:processId/observations', async (req, res) => {
  try {
    res.status(201).json(await captureProcessObservation(actor(req), {
      clientId: String(req.params.clientId),
      businessProcessId: String(req.params.processId),
      observedAt: req.body?.observedAt ? String(req.body.observedAt) : undefined,
      provenanceSource: req.body?.provenanceSource ? String(req.body.provenanceSource) : undefined,
    }));
  } catch (e) { fail(res, e); }
});
clientCompanyRouter.get('/clients/:clientId/processes/:processId/observations', async (req, res) => {
  try { res.json({ items: await getProcessObservationHistory(actor(req), String(req.params.clientId), String(req.params.processId)) }); } catch (e) { fail(res, e); }
});
clientCompanyRouter.get('/clients/:clientId/processes/:processId/observations/latest', async (req, res) => {
  try { res.json(await getLatestProcessObservation(actor(req), String(req.params.clientId), String(req.params.processId))); } catch (e) { fail(res, e); }
});

