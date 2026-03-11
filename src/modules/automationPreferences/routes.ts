import { Request, Response, Router } from 'express';
import { authenticate } from '../../middleware/auth';
import automationPreferencesService from './services';
import {
  CreateAutomationSuppressionRequest,
  UpdateAutomationPreferencesRequest,
} from './types';

const router = Router();

function getAuthenticatedUserId(req: Request): string | null {
  return ((req as any).user?.userId as string | undefined) || null;
}

router.get('/automation/preferences', authenticate, async (req: Request, res: Response): Promise<void> => {
  try {
    const userId = getAuthenticatedUserId(req);
    if (!userId) {
      res.status(401).json({ status: 401, code: 'UNAUTHORIZED', message: 'User not authenticated' });
      return;
    }

    const preferences = await automationPreferencesService.getPreferences(userId);
    res.status(200).json(preferences);
  } catch (error) {
    console.error('Get automation preferences error:', error);
    res.status(500).json({ status: 500, code: 'INTERNAL_ERROR', message: 'Internal server error' });
  }
});

router.put('/automation/preferences', authenticate, async (req: Request, res: Response): Promise<void> => {
  try {
    const userId = getAuthenticatedUserId(req);
    if (!userId) {
      res.status(401).json({ status: 401, code: 'UNAUTHORIZED', message: 'User not authenticated' });
      return;
    }

    const payload = (req.body || {}) as UpdateAutomationPreferencesRequest;
    const updated = await automationPreferencesService.updatePreferences(userId, payload);
    res.status(200).json(updated);
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Internal server error';
    if (message.includes('must be a boolean')) {
      res.status(400).json({ status: 400, code: 'VALIDATION_ERROR', message });
      return;
    }

    console.error('Update automation preferences error:', error);
    res.status(500).json({ status: 500, code: 'INTERNAL_ERROR', message: 'Internal server error' });
  }
});

router.post('/automation/preferences/suppress', authenticate, async (req: Request, res: Response): Promise<void> => {
  try {
    const userId = getAuthenticatedUserId(req);
    if (!userId) {
      res.status(401).json({ status: 401, code: 'UNAUTHORIZED', message: 'User not authenticated' });
      return;
    }

    const payload = (req.body || {}) as CreateAutomationSuppressionRequest;
    const result = await automationPreferencesService.createSuppression(userId, payload);

    res.status(result.created ? 201 : 200).json({
      created: result.created,
      suppression: result.suppression,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Internal server error';
    const validationError =
      message.includes('suppressionType') || message.includes('value is required') || message.includes('cannot be empty');

    if (validationError) {
      res.status(400).json({ status: 400, code: 'VALIDATION_ERROR', message });
      return;
    }

    console.error('Create suppression error:', error);
    res.status(500).json({ status: 500, code: 'INTERNAL_ERROR', message: 'Internal server error' });
  }
});

router.get('/automation/preferences/suppressions', authenticate, async (req: Request, res: Response): Promise<void> => {
  try {
    const userId = getAuthenticatedUserId(req);
    if (!userId) {
      res.status(401).json({ status: 401, code: 'UNAUTHORIZED', message: 'User not authenticated' });
      return;
    }

    const suppressions = await automationPreferencesService.listSuppressions(userId);
    res.status(200).json(suppressions);
  } catch (error) {
    console.error('List suppressions error:', error);
    res.status(500).json({ status: 500, code: 'INTERNAL_ERROR', message: 'Internal server error' });
  }
});

router.delete('/automation/preferences/suppressions/:id', authenticate, async (req: Request, res: Response): Promise<void> => {
  try {
    const userId = getAuthenticatedUserId(req);
    if (!userId) {
      res.status(401).json({ status: 401, code: 'UNAUTHORIZED', message: 'User not authenticated' });
      return;
    }

    const suppressionId = String(req.params.id || '').trim();
    if (!suppressionId) {
      res.status(400).json({ status: 400, code: 'VALIDATION_ERROR', message: 'Suppression id is required' });
      return;
    }

    const deleted = await automationPreferencesService.deleteSuppression(userId, suppressionId);
    if (!deleted) {
      res.status(404).json({ status: 404, code: 'NOT_FOUND', message: 'Suppression not found' });
      return;
    }

    res.status(200).json({ success: true, id: suppressionId });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Internal server error';
    if (message.includes('Forbidden suppression access')) {
      res.status(403).json({ status: 403, code: 'FORBIDDEN', message: 'Insufficient permissions' });
      return;
    }

    console.error('Delete suppression error:', error);
    res.status(500).json({ status: 500, code: 'INTERNAL_ERROR', message: 'Internal server error' });
  }
});

export default router;

