import { Router, Request, Response } from 'express';
import { Prisma } from '@prisma/client';
import { authenticate } from '../../middleware/auth';
import {
  WorkPackageAdminError, listCaseTypes, createCaseType, updateCaseType, setCaseTypeActive,
  listTemplates, listCaseCreationOptions, getTemplate, createTemplate, updateTemplate, activateTemplate,
} from './service';

const router = Router();
router.use(authenticate);

function actor(req: Request) {
  return { userId: req.user?.userId || '', role: req.user?.role };
}

function handle(res: Response, error: unknown): void {
  if (error instanceof WorkPackageAdminError) {
    res.status(error.status).json({ status: error.status, code: error.code, message: error.message });
    return;
  }
  if (error instanceof Prisma.PrismaClientKnownRequestError && (error.code === 'P2002' || error.code === 'P2034')) {
    res.status(409).json({ status: 409, code: error.code === 'P2034' ? 'WORK_PACKAGE_CONCURRENT_UPDATE' : 'WORK_PACKAGE_CONFLICT', message: 'The work package definition changed concurrently.' });
    return;
  }
  if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2025') {
    res.status(404).json({ status: 404, code: 'NOT_FOUND', message: 'The requested definition was not found.' });
    return;
  }
  console.error('Work package admin error:', error);
  res.status(500).json({ status: 500, code: 'INTERNAL_ERROR', message: 'Internal server error' });
}

router.get('/case-types', async (req, res) => { try { res.json({ items: await listCaseTypes(actor(req)) }); } catch (e) { handle(res, e); } });
router.get('/case-types/creation-options', async (req, res) => { try { res.json({ items: await listCaseCreationOptions(actor(req)) }); } catch (e) { handle(res, e); } });
router.post('/case-types', async (req, res) => { try { res.status(201).json(await createCaseType(actor(req), req.body || {})); } catch (e) { handle(res, e); } });
router.patch('/case-types/:id', async (req, res) => { try { res.json(await updateCaseType(actor(req), String(req.params.id), req.body || {})); } catch (e) { handle(res, e); } });
router.post('/case-types/:id/activate', async (req, res) => { try { res.json(await setCaseTypeActive(actor(req), String(req.params.id), true)); } catch (e) { handle(res, e); } });
router.post('/case-types/:id/deactivate', async (req, res) => { try { res.json(await setCaseTypeActive(actor(req), String(req.params.id), false)); } catch (e) { handle(res, e); } });

router.get('/case-types/:caseTypeDefinitionId/templates', async (req, res) => { try { res.json({ items: await listTemplates(String(req.params.caseTypeDefinitionId), actor(req)) }); } catch (e) { handle(res, e); } });
router.post('/templates', async (req, res) => { try { res.status(201).json(await createTemplate(actor(req), req.body || {})); } catch (e) { handle(res, e); } });
router.get('/templates/:id', async (req, res) => { try { res.json(await getTemplate(String(req.params.id), actor(req))); } catch (e) { handle(res, e); } });
router.patch('/templates/:id', async (req, res) => { try { res.json(await updateTemplate(actor(req), String(req.params.id), req.body || {})); } catch (e) { handle(res, e); } });
router.post('/templates/:id/activate', async (req, res) => { try { res.json(await activateTemplate(actor(req), String(req.params.id))); } catch (e) { handle(res, e); } });

export default router;
