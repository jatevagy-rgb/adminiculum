import { Router } from 'express';
import { authenticate } from '../../middleware/auth';
import { requireWorkforceUser } from '../../middleware/workforceAuthorization';
import { requireCaseReadAccess } from '../cases/authorization';
import { workspaceFailure } from '../case-workspace/routes';
import { readPolicy, savePolicy, transitionPolicy, previewPolicy } from './policy.service';
export const historyPolicyRouter = Router();
historyPolicyRouter.use('/cases/:caseId/policy', authenticate, requireWorkforceUser, requireCaseReadAccess, (req, res, next) => {
    res.set('Cache-Control', 'no-store');
    if (process.env.ENABLE_CUSTOMER_HISTORY_POLICY !== 'true') {
        res.status(503).json({ code: 'HISTORY_CAPABILITY_UNAVAILABLE' });
        return;
    }
    next();
});
historyPolicyRouter.get('/cases/:caseId/policy', async (req, res) => {
    try {
        res.json(await readPolicy(req, String(req.params.caseId), typeof req.query.grantId === 'string' ? req.query.grantId : undefined, typeof req.query.publicationId === 'string' ? req.query.publicationId : undefined));
    }
    catch (e) {
        workspaceFailure(e, res);
    }
});
historyPolicyRouter.put('/cases/:caseId/policy', async (req, res) => {
    try {
        res.json(await savePolicy(req, String(req.params.caseId), req.body));
    }
    catch (e) {
        workspaceFailure(e, res);
    }
});
historyPolicyRouter.get('/cases/:caseId/policy/preview', async (req, res) => {
    try {
        res.json(await previewPolicy(req, String(req.params.caseId)));
    }
    catch (e) {
        workspaceFailure(e, res);
    }
});
for (const action of ['review', 'publish', 'withdraw'] as const)
    historyPolicyRouter.post(`/cases/:caseId/policy/${action}`, async (req, res) => {
        try {
            res.json(await transitionPolicy(req, String(req.params.caseId), action, req.body?.revision));
        }
        catch (e) {
            workspaceFailure(e, res);
        }
    });
