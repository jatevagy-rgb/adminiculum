/**
 * Workgroup Routes
 * Client workload tracking API endpoints
 *
 * AUTHORIZATION (P0 IDOR repair)
 * ------------------------------
 * Workgroups and workload belong to a Client. Every endpoint below is gated by
 * the repository's canonical Client authorization model from
 * `client-interaction/base` instead of bare `authenticate`:
 *
 *   READ  endpoints: assertClientReadAccess(actor, owningClientId)
 *   WRITE endpoints: assertClientReadAccess(actor, owningClientId)
 *                    + requireClientManager(actor)
 *
 * `assertClientReadAccess` is the single canonical client read gate (ADMIN /
 * PARTNER read any client; LAWYER / COLLAB_LAWYER are limited to clients where
 * they have Case access). There is no shared generic "manage client" helper in
 * the repository, so the closest established workforce mutation rule is reused
 * verbatim: the ADMIN/PARTNER manager guard implemented locally in the
 * canonical client-scoped modules (`client-company/service.ts`,
 * `client-contracts/service.ts`, both `MANAGER_ROLES = new Set(['ADMIN',
 * 'PARTNER'])`). This is the same rule asserted by the existing route test
 * `tests/aiPromptRoutes.test.ts` (only ADMIN/PARTNER may mutate).
 *
 * Workgroup → client ownership is always resolved from the persisted
 * ClientWorkgroup row BEFORE authorizing, so a caller can never authorize a
 * workgroup mutation with an unrelated client id. Unknown workgroups return the
 * same 404 `NOT_FOUND` / `Workgroup not found` shape as before.
 *
 * NOTE: this tightens previously unenforced write access. The module README
 * documented "Lawyer: record workload" as a soft intention; writes (including
 * workload recording) now require the canonical client-management capability,
 * matching the sibling client-scoped modules.
 */

import { Router, Request, Response } from 'express';
import { authenticate } from '../../middleware/auth';
import { prisma } from '../../prisma/prisma.service';
import { InteractionError, InternalActor, assertClientReadAccess } from '../client-interaction/base';
import { workgroupService, workloadService, isValidPeriodFormat } from './services';

const router = Router();

/** Established client-management roles (mirrors client-company / client-contracts). */
const CLIENT_MANAGER_ROLES = new Set(['ADMIN', 'PARTNER']);

function actor(req: Request): InternalActor {
  return { userId: String(req.user?.userId || ''), role: String(req.user?.role || '') };
}

/**
 * Reused client-management rule: only ADMIN/PARTNER may mutate client-scoped
 * workgroup records. Non-managers with legitimate client read access may read.
 */
function requireClientManager(current: InternalActor): void {
  if (!current?.userId || !CLIENT_MANAGER_ROLES.has(String(current.role || ''))) {
    throw new InteractionError(403, 'CLIENT_MANAGE_FORBIDDEN', 'Only client managers may modify client workgroups.');
  }
}

/**
 * Resolve the persisted owning client for a workgroup id. The result — never a
 * caller-supplied id — is what authorization is evaluated against.
 */
async function resolveOwningClientId(workgroupId: string): Promise<string> {
  const workgroup = await prisma.clientWorkgroup.findUnique({
    where: { id: workgroupId },
    select: { clientId: true },
  });
  if (!workgroup) {
    throw new InteractionError(404, 'NOT_FOUND', 'Workgroup not found');
  }
  return workgroup.clientId;
}

function fail(res: Response, error: unknown, fallbackCode: string): void {
  if (error instanceof InteractionError) {
    res.status(error.status).json({ status: error.status, code: error.code, message: error.message });
    return;
  }
  const message = error instanceof Error ? error.message : 'Internal server error';
  if (message === 'Client not found' || message === 'Workgroup not found') {
    res.status(404).json({ status: 404, code: 'NOT_FOUND', message });
    return;
  }
  if (message.includes('Invalid period format')) {
    res.status(400).json({ status: 400, code: 'VALIDATION_ERROR', message });
    return;
  }
  res.status(500).json({ status: 500, code: fallbackCode, message: 'Internal server error' });
}

// ============================================================================
// Workgroup CRUD Endpoints
// ============================================================================

// POST /clients/:clientId/workgroups - Create new workgroup
router.post('/clients/:clientId/workgroups', authenticate, async (req: Request, res: Response): Promise<void> => {
  try {
    const { clientId } = req.params as { clientId: string };
    const { name, description } = req.body;

    if (!name) {
      res.status(400).json({ status: 400, code: 'VALIDATION_ERROR', message: 'Missing required field: name' });
      return;
    }

    const current = actor(req);
    await assertClientReadAccess(current, clientId);
    requireClientManager(current);

    const workgroup = await workgroupService.createWorkgroup(clientId, { name, description });
    res.status(201).json(workgroup);
  } catch (error) {
    console.error('Create workgroup error:', error);
    fail(res, error, 'INTERNAL_ERROR');
  }
});

// GET /clients/:clientId/workgroups - List client workgroups
router.get('/clients/:clientId/workgroups', authenticate, async (req: Request, res: Response): Promise<void> => {
  try {
    const { clientId } = req.params as { clientId: string };

    await assertClientReadAccess(actor(req), clientId);

    const workgroups = await workgroupService.getWorkgroupsByClient(clientId);
    res.json(workgroups);
  } catch (error) {
    console.error('Get workgroups error:', error);
    fail(res, error, 'INTERNAL_ERROR');
  }
});

// GET /workgroups/:id - Get single workgroup
router.get('/workgroups/:id', authenticate, async (req: Request, res: Response): Promise<void> => {
  try {
    const { id } = req.params as { id: string };

    const owningClientId = await resolveOwningClientId(id);
    await assertClientReadAccess(actor(req), owningClientId);

    const workgroup = await workgroupService.getWorkgroupById(id);

    if (!workgroup) {
      res.status(404).json({ status: 404, code: 'NOT_FOUND', message: 'Workgroup not found' });
      return;
    }

    res.json(workgroup);
  } catch (error) {
    console.error('Get workgroup error:', error);
    fail(res, error, 'INTERNAL_ERROR');
  }
});

// PATCH /workgroups/:id - Update workgroup
router.patch('/workgroups/:id', authenticate, async (req: Request, res: Response): Promise<void> => {
  try {
    const { id } = req.params as { id: string };
    const { name, description, isActive } = req.body;

    const owningClientId = await resolveOwningClientId(id);
    const current = actor(req);
    await assertClientReadAccess(current, owningClientId);
    requireClientManager(current);

    const workgroup = await workgroupService.updateWorkgroup(id, { name, description, isActive });
    res.json(workgroup);
  } catch (error) {
    console.error('Update workgroup error:', error);
    fail(res, error, 'INTERNAL_ERROR');
  }
});

// DELETE /workgroups/:id - Soft delete workgroup
router.delete('/workgroups/:id', authenticate, async (req: Request, res: Response): Promise<void> => {
  try {
    const { id } = req.params as { id: string };

    const owningClientId = await resolveOwningClientId(id);
    const current = actor(req);
    await assertClientReadAccess(current, owningClientId);
    requireClientManager(current);

    await workgroupService.deleteWorkgroup(id);
    res.status(204).send();
  } catch (error) {
    console.error('Delete workgroup error:', error);
    fail(res, error, 'INTERNAL_ERROR');
  }
});

// ============================================================================
// Workload Recording Endpoints
// ============================================================================

// POST /workgroups/:id/workload - Record workload
router.post('/workgroups/:id/workload', authenticate, async (req: Request, res: Response): Promise<void> => {
  try {
    const { id } = req.params as { id: string };
    const { period, reportedHours, note } = req.body;

    if (!period || reportedHours === undefined) {
      res.status(400).json({ 
        status: 400, 
        code: 'VALIDATION_ERROR', 
        message: 'Missing required fields: period, reportedHours' 
      });
      return;
    }

    // Validate period format
    if (!isValidPeriodFormat(period)) {
      res.status(400).json({ 
        status: 400, 
        code: 'VALIDATION_ERROR', 
        message: 'Invalid period format. Expected YYYY-MM' 
      });
      return;
    }

    const owningClientId = await resolveOwningClientId(id);
    const current = actor(req);
    await assertClientReadAccess(current, owningClientId);
    requireClientManager(current);

    const record = await workloadService.recordWorkload(id, { period, reportedHours, note });
    res.status(201).json(record);
  } catch (error) {
    console.error('Record workload error:', error);
    fail(res, error, 'INTERNAL_ERROR');
  }
});

// GET /workgroups/:id/workload - Get workload records for workgroup
router.get('/workgroups/:id/workload', authenticate, async (req: Request, res: Response): Promise<void> => {
  try {
    const { id } = req.params as { id: string };

    const owningClientId = await resolveOwningClientId(id);
    await assertClientReadAccess(actor(req), owningClientId);

    const records = await workloadService.getWorkloadByWorkgroup(id);
    res.json(records);
  } catch (error) {
    console.error('Get workload error:', error);
    fail(res, error, 'INTERNAL_ERROR');
  }
});

// ============================================================================
// Workload Summary Endpoints
// ============================================================================

// GET /clients/:clientId/workload-summary - Get workload summary for client
router.get('/clients/:clientId/workload-summary', authenticate, async (req: Request, res: Response): Promise<void> => {
  try {
    const { clientId } = req.params as { clientId: string };
    const { period } = req.query as { period?: string };

    if (!period) {
      res.status(400).json({ 
        status: 400, 
        code: 'VALIDATION_ERROR', 
        message: 'Missing required query parameter: period' 
      });
      return;
    }

    // Validate period format
    if (!isValidPeriodFormat(period)) {
      res.status(400).json({ 
        status: 400, 
        code: 'VALIDATION_ERROR', 
        message: 'Invalid period format. Expected YYYY-MM' 
      });
      return;
    }

    await assertClientReadAccess(actor(req), clientId);

    const summary = await workloadService.getClientWorkloadSummary(clientId, period);
    res.json(summary);
  } catch (error) {
    console.error('Get workload summary error:', error);
    fail(res, error, 'INTERNAL_ERROR');
  }
});

export default router;
