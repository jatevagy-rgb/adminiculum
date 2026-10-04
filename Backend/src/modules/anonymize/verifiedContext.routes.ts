import { Router } from 'express';
import { authenticate } from '../../middleware/auth';
import { requireWorkforceUser } from '../../middleware/workforceAuthorization';
import { workspaceFailure } from '../case-workspace/routes';
import { createVerifiedArtifact, verifiedContext } from './verifiedContext.service';
export const verifiedContextRouter = Router();
verifiedContextRouter.use(['/documents/:documentId/versions/:versionId/anonymize-verified', '/anonymous-documents/:artifactId/verified-context'], authenticate, requireWorkforceUser, (req, res, next) => {
    if (process.env.ENABLE_VERSION_BOUND_AI_CONTEXT !== 'true' || process.env.ENABLE_AI_ANONYMIZATION !== 'true') {
        res.status(503).json({ code: 'VERIFIED_CONTEXT_CAPABILITY_UNAVAILABLE' });
        return;
    }
    res.set('Cache-Control', 'no-store');
    next();
});
verifiedContextRouter.post('/documents/:documentId/versions/:versionId/anonymize-verified', async (req, res) => {
    try {
        res.json(await createVerifiedArtifact(req, String(req.params.documentId), String(req.params.versionId), req.body));
    }
    catch (e) {
        workspaceFailure(e, res);
    }
});
verifiedContextRouter.post('/anonymous-documents/:artifactId/verified-context', async (req, res) => {
    try {
        res.json(await verifiedContext(req, String(req.params.artifactId), req.body));
    }
    catch (e) {
        workspaceFailure(e, res);
    }
});
