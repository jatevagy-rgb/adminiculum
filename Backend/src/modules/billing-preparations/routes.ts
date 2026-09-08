import { Router } from 'express';
import { authenticate, requireRole, ROLES } from '../../middleware/auth';
import { InteractionError } from '../client-interaction/base';
import {
  createPreparation,
  getPreparationPdf,
  getPreparation,
  listPreparations,
  patchItem,
  refreshPreparation,
  resyncItem,
  setPreparationStatus,
} from './service';

const router = Router();

// Monetary review surface: same sensitivity class as hourly-rate access.
// Internal workforce only — ADMIN/PARTNER. Never projected to client portal.
router.use(authenticate, requireRole(ROLES.ADMIN, ROLES.PARTNER));

function actor(req: import('express').Request) {
  return { userId: String(req.user!.userId), role: req.user!.role };
}

router.post('/', async (req, res) => {
  try {
    const result = await createPreparation(actor(req), req.body);
    res.status(result.created ? 201 : 200).json(result);
  } catch (error) { respond(error, res); }
});

router.get('/', async (req, res) => {
  try {
    const result = await listPreparations(actor(req), String(req.query.clientId || ''));
    res.json(result);
  } catch (error) { respond(error, res); }
});

router.get('/:preparationId/pdf', async (req, res) => {
  try {
    const preparationId = String(req.params.preparationId);
    const pdf = await getPreparationPdf(actor(req), preparationId);
    const filename = `szamlazasi-osszesito-${preparationId.replace(/[^a-zA-Z0-9_-]/g, '') || 'elokeszites'}.pdf`;
    res.type('application/pdf');
    res.attachment(filename);
    res.send(pdf);
  } catch (error) { respond(error, res); }
});

router.get('/:preparationId', async (req, res) => {
  try {
    res.json(await getPreparation(actor(req), String(req.params.preparationId)));
  } catch (error) { respond(error, res); }
});

router.patch('/:preparationId/items/:itemId', async (req, res) => {
  try {
    res.json(await patchItem(actor(req), String(req.params.preparationId), String(req.params.itemId), req.body));
  } catch (error) { respond(error, res); }
});

router.post('/:preparationId/items/:itemId/resync', async (req, res) => {
  try {
    res.json(await resyncItem(actor(req), String(req.params.preparationId), String(req.params.itemId)));
  } catch (error) { respond(error, res); }
});

router.post('/:preparationId/refresh', async (req, res) => {
  try {
    res.json(await refreshPreparation(actor(req), String(req.params.preparationId)));
  } catch (error) { respond(error, res); }
});

router.post('/:preparationId/close', async (req, res) => {
  try {
    res.json(await setPreparationStatus(actor(req), String(req.params.preparationId), 'CLOSED'));
  } catch (error) { respond(error, res); }
});

router.post('/:preparationId/reopen', async (req, res) => {
  try {
    res.json(await setPreparationStatus(actor(req), String(req.params.preparationId), 'OPEN'));
  } catch (error) { respond(error, res); }
});

function respond(error: unknown, res: import('express').Response) {
  if (error instanceof InteractionError) return res.status(error.status).json({ code: error.code, message: error.message });
  console.error('Billing preparation operation failed', error);
  return res.status(500).json({ code: 'BILLING_PREP_INTERNAL_ERROR', message: 'A számlázási előkészítés most nem érhető el. Próbálja újra később.' });
}

export default router;
