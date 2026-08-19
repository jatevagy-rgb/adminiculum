/**
 * ORGANIZATION (Phase 3) — internal workforce routes.
 * Mounted at /api/v1/client-organization. Workforce auth + Client-scoped reads;
 * writes require a client manager (ADMIN/PARTNER). No organizational-customer
 * route is exposed in Phase 3 (customer-safe projector is dormant).
 */
import { Request, Response, Router } from 'express';
import { authenticate } from '../../middleware/auth';
import { InteractionError } from '../client-interaction/base';
import * as org from './service';

export const clientOrganizationRouter = Router();

function actor(req: Request): { userId: string; role?: string | null } {
  return { userId: String(req.user?.userId || ''), role: String(req.user?.role || '') };
}

function fail(res: Response, error: unknown): void {
  if (error instanceof InteractionError) {
    res.status(error.status).json({ status: error.status, code: error.code, message: error.message });
    return;
  }
  res.status(500).json({ status: 500, code: 'ORGANIZATION_INTERNAL_ERROR', message: 'Organization request failed.' });
}

clientOrganizationRouter.use(authenticate);

// Groups (reuse ClientOrganizationGroup)
clientOrganizationRouter.get('/clients/:clientId/groups', async (req, res) => {
  try { res.json(await org.listGroups(actor(req), String(req.params.clientId))); } catch (e) { fail(res, e); }
});
clientOrganizationRouter.post('/clients/:clientId/groups', async (req, res) => {
  try { res.status(201).json(await org.createGroup(actor(req), String(req.params.clientId), req.body || {})); } catch (e) { fail(res, e); }
});
clientOrganizationRouter.patch('/groups/:groupId', async (req, res) => {
  try { res.json(await org.updateGroup(actor(req), String(req.params.groupId), req.body || {})); } catch (e) { fail(res, e); }
});

// Persons
clientOrganizationRouter.get('/clients/:clientId/persons', async (req, res) => {
  try { res.json(await org.listPersons(actor(req), String(req.params.clientId), { status: req.query.status as string, groupId: req.query.groupId as string })); } catch (e) { fail(res, e); }
});
clientOrganizationRouter.post('/clients/:clientId/persons', async (req, res) => {
  try { res.status(201).json(await org.createPerson(actor(req), String(req.params.clientId), req.body || {})); } catch (e) { fail(res, e); }
});
clientOrganizationRouter.get('/persons/:personId', async (req, res) => {
  try { res.json(await org.getPerson(actor(req), String(req.params.personId))); } catch (e) { fail(res, e); }
});
clientOrganizationRouter.patch('/persons/:personId', async (req, res) => {
  try { res.json(await org.updatePerson(actor(req), String(req.params.personId), req.body || {})); } catch (e) { fail(res, e); }
});
clientOrganizationRouter.post('/persons/:personId/status', async (req, res) => {
  try { res.json(await org.transitionPerson(actor(req), String(req.params.personId), req.body?.employmentStatus)); } catch (e) { fail(res, e); }
});

// Responsibilities
clientOrganizationRouter.post('/persons/:personId/responsibilities', async (req, res) => {
  try { res.status(201).json(await org.addResponsibility(actor(req), String(req.params.personId), req.body || {})); } catch (e) { fail(res, e); }
});
clientOrganizationRouter.delete('/responsibilities/:responsibilityId', async (req, res) => {
  try { res.json(await org.removeResponsibility(actor(req), String(req.params.responsibilityId))); } catch (e) { fail(res, e); }
});

// Person documents (HR-confidential gated)
clientOrganizationRouter.get('/persons/:personId/documents', async (req, res) => {
  try { res.json(await org.listPersonDocuments(actor(req), String(req.params.personId))); } catch (e) { fail(res, e); }
});
clientOrganizationRouter.post('/persons/:personId/documents', async (req, res) => {
  try { res.status(201).json(await org.linkPersonDocument(actor(req), String(req.params.personId), req.body || {})); } catch (e) { fail(res, e); }
});
clientOrganizationRouter.delete('/person-documents/:linkId', async (req, res) => {
  try { res.json(await org.unlinkPersonDocument(actor(req), String(req.params.linkId))); } catch (e) { fail(res, e); }
});

// Owner linkage
clientOrganizationRouter.post('/contracts/:contractId/business-owner', async (req, res) => {
  try { res.json(await org.setContractBusinessOwner(actor(req), String(req.params.contractId), req.body?.personId ? String(req.body.personId) : null)); } catch (e) { fail(res, e); }
});
clientOrganizationRouter.post('/obligations/:obligationId/owner', async (req, res) => {
  try { res.json(await org.setObligationOwner(actor(req), String(req.params.obligationId), req.body?.personId ? String(req.body.personId) : null)); } catch (e) { fail(res, e); }
});
clientOrganizationRouter.post('/initiatives/:initiativeId/client-owner', async (req, res) => {
  try { res.json(await org.setInitiativeClientOwner(actor(req), String(req.params.initiativeId), req.body?.personId ? String(req.body.personId) : null)); } catch (e) { fail(res, e); }
});

// Responsibility gaps
clientOrganizationRouter.get('/clients/:clientId/gaps', async (req, res) => {
  try { res.json(await org.responsibilityGaps(actor(req), String(req.params.clientId))); } catch (e) { fail(res, e); }
});
