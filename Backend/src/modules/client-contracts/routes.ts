/**
 * CONTRACT LIBRARY (Phase 2) — internal workforce routes.
 * Mounted at /api/v1/client-contracts. Workforce auth + Client-scoped reads;
 * writes require a client manager (ADMIN/PARTNER). No organizational-customer
 * route is exposed in Phase 2 (see projector.ts).
 */
import { Request, Response, Router } from 'express';
import { authenticate } from '../../middleware/auth';
import { InteractionError } from '../client-interaction/base';
import * as contracts from './service';

export const clientContractsRouter = Router();

function actor(req: Request): { userId: string; role?: string | null } {
  return { userId: String(req.user?.userId || ''), role: String(req.user?.role || '') };
}

function fail(res: Response, error: unknown): void {
  if (error instanceof InteractionError) {
    res.status(error.status).json({ status: error.status, code: error.code, message: error.message });
    return;
  }
  res.status(500).json({ status: 500, code: 'CONTRACTS_INTERNAL_ERROR', message: 'Contract library request failed.' });
}

clientContractsRouter.use(authenticate);

// ContractRecord
clientContractsRouter.get('/clients/:clientId/contracts', async (req, res) => {
  try { res.json(await contracts.listContracts(actor(req), String(req.params.clientId), { status: req.query.status as string, type: req.query.type as string })); } catch (e) { fail(res, e); }
});
clientContractsRouter.post('/clients/:clientId/contracts', async (req, res) => {
  try { res.status(201).json(await contracts.createContract(actor(req), String(req.params.clientId), req.body || {})); } catch (e) { fail(res, e); }
});
clientContractsRouter.get('/contracts/:contractId', async (req, res) => {
  try { res.json(await contracts.getContract(actor(req), String(req.params.contractId))); } catch (e) { fail(res, e); }
});
clientContractsRouter.patch('/contracts/:contractId', async (req, res) => {
  try { res.json(await contracts.updateContract(actor(req), String(req.params.contractId), req.body || {})); } catch (e) { fail(res, e); }
});
clientContractsRouter.post('/contracts/:contractId/status', async (req, res) => {
  try { res.json(await contracts.transitionContract(actor(req), String(req.params.contractId), req.body?.status)); } catch (e) { fail(res, e); }
});
clientContractsRouter.post('/contracts/:contractId/canonical-document', async (req, res) => {
  try { res.json(await contracts.setCanonicalDocument(actor(req), String(req.params.contractId), req.body?.documentVersionId ? String(req.body.documentVersionId) : null)); } catch (e) { fail(res, e); }
});
clientContractsRouter.get('/contracts/:contractId/family', async (req, res) => {
  try { res.json(await contracts.getContractFamily(actor(req), String(req.params.contractId))); } catch (e) { fail(res, e); }
});

// ContractParty
clientContractsRouter.post('/contracts/:contractId/parties', async (req, res) => {
  try { res.status(201).json(await contracts.addParty(actor(req), String(req.params.contractId), req.body || {})); } catch (e) { fail(res, e); }
});
clientContractsRouter.patch('/parties/:partyId', async (req, res) => {
  try { res.json(await contracts.updateParty(actor(req), String(req.params.partyId), req.body || {})); } catch (e) { fail(res, e); }
});
clientContractsRouter.delete('/parties/:partyId', async (req, res) => {
  try { res.json(await contracts.removeParty(actor(req), String(req.params.partyId))); } catch (e) { fail(res, e); }
});

// ClientObligation
clientContractsRouter.get('/clients/:clientId/obligations', async (req, res) => {
  try { res.json(await contracts.listObligations(actor(req), String(req.params.clientId), { status: req.query.status as string, contractId: req.query.contractId as string })); } catch (e) { fail(res, e); }
});
clientContractsRouter.post('/clients/:clientId/obligations', async (req, res) => {
  try { res.status(201).json(await contracts.createObligation(actor(req), String(req.params.clientId), req.body || {})); } catch (e) { fail(res, e); }
});
clientContractsRouter.patch('/obligations/:obligationId', async (req, res) => {
  try { res.json(await contracts.updateObligation(actor(req), String(req.params.obligationId), req.body || {})); } catch (e) { fail(res, e); }
});
clientContractsRouter.post('/obligations/:obligationId/status', async (req, res) => {
  try { res.json(await contracts.transitionObligation(actor(req), String(req.params.obligationId), req.body?.status)); } catch (e) { fail(res, e); }
});

// ContractEntitlement
clientContractsRouter.get('/contracts/:contractId/entitlements', async (req, res) => {
  try { res.json(await contracts.listEntitlements(actor(req), String(req.params.contractId), { status: req.query.status as string })); } catch (e) { fail(res, e); }
});
clientContractsRouter.post('/contracts/:contractId/entitlements', async (req, res) => {
  try { res.status(201).json(await contracts.createEntitlement(actor(req), String(req.params.contractId), req.body || {})); } catch (e) { fail(res, e); }
});
clientContractsRouter.patch('/entitlements/:entitlementId', async (req, res) => {
  try { res.json(await contracts.updateEntitlement(actor(req), String(req.params.entitlementId), req.body || {})); } catch (e) { fail(res, e); }
});
clientContractsRouter.post('/entitlements/:entitlementId/status', async (req, res) => {
  try { res.json(await contracts.transitionEntitlement(actor(req), String(req.params.entitlementId), req.body?.status)); } catch (e) { fail(res, e); }
});
