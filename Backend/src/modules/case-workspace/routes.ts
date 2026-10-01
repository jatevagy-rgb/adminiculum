import { readOwner, saveOwner } from './owner.service';
import { Router, Request, Response, NextFunction } from 'express';
import { authenticate } from '../../middleware/auth';
import { requireWorkforceUser } from '../../middleware/workforceAuthorization';
import { requireCaseReadAccess } from '../cases/authorization';
import { readTiles, saveTiles, WorkspaceError } from './tiles.service';
export const caseWorkspaceRouter = Router();
export function requireDurableWorkspace(_req: Request, res: Response, next: NextFunction) {
    if (process.env.ENABLE_DURABLE_CASE_WORKSPACE !== 'true') {
        res.status(503).json({ code: 'WORKSPACE_CAPABILITY_UNAVAILABLE' });
        return;
    }
    next();
}
export function workspaceFailure(error: unknown, res: Response) {
    if (error instanceof WorkspaceError)
        return res.status(error.status).json({ code: error.code });
    const code = (error as {
        code?: string;
    })?.code;
    if (code === 'P2034' || code === 'P2002')
        return res.status(409).json({ code: 'WORKSPACE_REVISION_CONFLICT' });
    if (code === 'P2021' || code === 'P2022')
        return res.status(503).json({ code: 'WORKSPACE_CAPABILITY_UNAVAILABLE' });
    return res.status(500).json({ code: 'WORKSPACE_OPERATION_FAILED' });
}
caseWorkspaceRouter.use(authenticate, requireWorkforceUser, requireDurableWorkspace);
caseWorkspaceRouter.get('/cases/:caseId/tiles', requireCaseReadAccess, async (req, res) => {
    try {
        res.set('Cache-Control', 'no-store').json(await readTiles(req, String(req.params.caseId)));
    }
    catch (error) {
        workspaceFailure(error, res);
    }
});
caseWorkspaceRouter.put('/cases/:caseId/tiles', requireCaseReadAccess, async (req, res) => {
    try {
        res.json(await saveTiles(req, String(req.params.caseId), req.body));
    }
    catch (error) {
        workspaceFailure(error, res);
    }
});
caseWorkspaceRouter.get('/cases/:caseId/owner', requireCaseReadAccess, async (req, res) => {
    try {
        res.set('Cache-Control', 'no-store').json(await readOwner(req, String(req.params.caseId)));
    }
    catch (e) {
        workspaceFailure(e, res);
    }
});
caseWorkspaceRouter.put('/cases/:caseId/owner', requireCaseReadAccess, async (req, res) => {
    try {
        res.json(await saveOwner(req, String(req.params.caseId), req.body));
    }
    catch (e) {
        workspaceFailure(e, res);
    }
});
