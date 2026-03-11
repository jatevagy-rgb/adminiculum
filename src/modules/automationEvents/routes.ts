import { Request, Response, Router } from 'express';
import { authenticate } from '../../middleware/auth';
import automationEventsService from './services';
import automationSuggestionsService from '../automationSuggestions/services';
import { AutomationEventIngestRequest } from './types';

const router = Router();

router.post('/automation/events', authenticate, async (req: Request, res: Response): Promise<void> => {
  try {
    const userId = (req as any).user?.userId as string | undefined;
    if (!userId) {
      res.status(401).json({ status: 401, code: 'UNAUTHORIZED', message: 'User not authenticated' });
      return;
    }

    const payload = (req.body || {}) as AutomationEventIngestRequest;
    const saved = await automationEventsService.ingest(userId, payload);
    const orchestrationResult = await automationSuggestionsService.generateSuggestionForEventWithAutopilot({
      userId,
      entityType: saved.entityType,
      entityId: saved.entityId,
      contextKey: saved.contextKey,
      actionKey: saved.actionKey,
      source: saved.source,
      actorAuthenticated: true,
    });

    res.status(201).json({
      id: saved.id,
      contextKey: saved.contextKey,
      source: saved.source,
      createdAt: saved.createdAt,
      suggestion: orchestrationResult.suggestion,
      autopilotExecution: orchestrationResult.autopilotExecution,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Internal server error';
    const isValidationError =
      message.includes('required') ||
      message.includes('Invalid') ||
      message.includes('must be') ||
      message.includes('cannot be empty');

    if (isValidationError) {
      res.status(400).json({ status: 400, code: 'VALIDATION_ERROR', message });
      return;
    }

    console.error('Automation event ingestion error:', error);
    res.status(500).json({
      status: 500,
      code: 'INTERNAL_ERROR',
      message: 'Internal server error',
    });
  }
});

export default router;

