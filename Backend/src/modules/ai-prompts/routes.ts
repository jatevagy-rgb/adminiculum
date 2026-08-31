import { Router, type Request, type Response } from 'express';
import { authenticate } from '../../middleware/auth';
import { requireWorkforceUser } from '../../middleware/workforceAuthorization';
import { requireCaseManageAccess, requireCaseReadAccess } from '../cases/authorization';
import {
  approvePromptDraft,
  createPromptTemplateVersion,
  getPromptDraft,
  importPromptResponse,
  listPromptDraftsForCase,
  listPromptTemplates,
  preparePromptDraft,
  rejectPromptDraft,
  returnPromptDraft,
  toPublicPromptDraft,
  verifyPromptDraft,
} from './service';

const router = Router();
router.use(authenticate, requireWorkforceUser);

function actor(req: Request): { userId: string; role?: string | null } {
  return { userId: req.user?.userId || '', role: req.user?.role };
}

function handle(res: Response, error: unknown): void {
  const typed = error as { status?: number; code?: string; message?: string };
  const status = typeof typed.status === 'number' ? typed.status : 500;
  if (status >= 500) {
    console.error('AI prompt error:', error);
  }
  res.status(status).json({
    status,
    code: typed.code || 'AI_PROMPT_ERROR',
    message: status >= 500 ? 'Internal server error' : typed.message || typed.code || 'AI prompt operation failed',
  });
}

router.get('/templates', async (req, res) => {
  try {
    res.json({
      items: await listPromptTemplates({
        caseTypeKey: typeof req.query.caseTypeKey === 'string' ? req.query.caseTypeKey : null,
        workPackageModuleKey: typeof req.query.workPackageModuleKey === 'string' ? req.query.workPackageModuleKey : null,
        taskType: typeof req.query.taskType === 'string' ? req.query.taskType : null,
      }),
    });
  } catch (error) {
    handle(res, error);
  }
});

router.post('/templates', async (req, res) => {
  try {
    res.status(201).json(await createPromptTemplateVersion({
      ...req.body,
      createdById: actor(req).userId,
    }));
  } catch (error) {
    handle(res, error);
  }
});

router.post('/cases/:caseId/prepare', requireCaseManageAccess, async (req, res) => {
  try {
    res.status(201).json(toPublicPromptDraft(await preparePromptDraft(actor(req), {
      ...req.body,
      caseId: String(req.params.caseId),
    })));
  } catch (error) {
    handle(res, error);
  }
});

router.get('/cases/:caseId/drafts', requireCaseReadAccess, async (req, res) => {
  try {
    res.json({ items: (await listPromptDraftsForCase(req, String(req.params.caseId))).map(toPublicPromptDraft) });
  } catch (error) {
    handle(res, error);
  }
});

router.get('/drafts/:draftId', async (req, res) => {
  try {
    res.json(toPublicPromptDraft(await getPromptDraft(req, String(req.params.draftId))));
  } catch (error) {
    handle(res, error);
  }
});

router.post('/drafts/:draftId/import', async (req, res) => {
  try {
    const importedResponse = typeof req.body?.importedResponse === 'string' ? req.body.importedResponse : '';
    if (!importedResponse.trim()) {
      res.status(400).json({ status: 400, code: 'AI_RESPONSE_REQUIRED', message: 'Imported AI response is required.' });
      return;
    }
    res.json(toPublicPromptDraft(await importPromptResponse(actor(req), String(req.params.draftId), importedResponse)));
  } catch (error) {
    handle(res, error);
  }
});

router.post('/drafts/:draftId/verify', async (req, res) => {
  try {
    res.json(toPublicPromptDraft(await verifyPromptDraft(actor(req), String(req.params.draftId), req.body?.notes ?? null)));
  } catch (error) {
    handle(res, error);
  }
});

router.post('/drafts/:draftId/approve', async (req, res) => {
  try {
    res.json(toPublicPromptDraft(await approvePromptDraft(actor(req), String(req.params.draftId), req.body?.notes ?? null)));
  } catch (error) {
    handle(res, error);
  }
});

router.post('/drafts/:draftId/return', async (req, res) => {
  try {
    res.json(toPublicPromptDraft(await returnPromptDraft(actor(req), String(req.params.draftId), req.body?.notes ?? null)));
  } catch (error) {
    handle(res, error);
  }
});

router.post('/drafts/:draftId/reject', async (req, res) => {
  try {
    res.json(toPublicPromptDraft(await rejectPromptDraft(actor(req), String(req.params.draftId), req.body?.notes ?? null)));
  } catch (error) {
    handle(res, error);
  }
});

export default router;
