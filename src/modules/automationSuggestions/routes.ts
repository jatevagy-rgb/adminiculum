import { Request, Response, Router } from 'express';
import { authenticate } from '../../middleware/auth';
import { AUTOMATION_ENTITY_TYPES, AutomationEntityType } from '../automationEvents/types';
import automationSuggestionsService from './services';
import { SuggestionAcceptRequest } from './types';

const router = Router();
const STATS_ALLOWED_ROLES = new Set(['ADMIN', 'PARTNER']);
const DEFAULT_PROCESSING_MAX_AGE_MINUTES = 30;

function getUserId(req: Request): string | null {
  return ((req as any).user?.userId as string | undefined) || null;
}

function normalizeEntityType(value: unknown): AutomationEntityType | null {
  if (typeof value !== 'string') return null;
  const normalized = value.trim().toUpperCase();
  if (!AUTOMATION_ENTITY_TYPES.includes(normalized as AutomationEntityType)) {
    return null;
  }
  return normalized as AutomationEntityType;
}

function hasStatsAccess(req: Request): boolean {
  const role = String((req as any).user?.role || '').toUpperCase();
  return STATS_ALLOWED_ROLES.has(role);
}

function parseMaxAgeMinutes(raw: unknown): number {
  const value = Number(raw);
  if (!Number.isFinite(value) || value <= 0) {
    return DEFAULT_PROCESSING_MAX_AGE_MINUTES;
  }
  return Math.floor(value);
}

function parseWindowHours(raw: unknown): number {
  const value = Number(raw);
  if (!Number.isFinite(value) || value <= 0) {
    return 24;
  }
  return Math.floor(value);
}

router.get('/automation/suggestions/current', authenticate, async (req: Request, res: Response): Promise<void> => {
  try {
    const userId = getUserId(req);
    if (!userId) {
      res.status(401).json({ status: 401, code: 'UNAUTHORIZED', message: 'User not authenticated' });
      return;
    }

    const entityType = normalizeEntityType(req.query.entityType);
    const entityId = String(req.query.entityId || '').trim();

    if (!entityType || !entityId) {
      res.status(400).json({
        status: 400,
        code: 'VALIDATION_ERROR',
        message: 'entityType and entityId are required',
      });
      return;
    }

    const current = await automationSuggestionsService.getCurrentOfferedSuggestion(userId, entityType, entityId);
    res.status(200).json({ suggestion: current });
  } catch (error) {
    console.error('Get current suggestion error:', error);
    res.status(500).json({ status: 500, code: 'INTERNAL_ERROR', message: 'Internal server error' });
  }
});

router.post('/automation/suggestions/:id/dismiss', authenticate, async (req: Request, res: Response): Promise<void> => {
  try {
    const userId = getUserId(req);
    if (!userId) {
      res.status(401).json({ status: 401, code: 'UNAUTHORIZED', message: 'User not authenticated' });
      return;
    }

    const id = String(req.params.id || '').trim();
    if (!id) {
      res.status(400).json({ status: 400, code: 'VALIDATION_ERROR', message: 'Suggestion id is required' });
      return;
    }

    const dismissed = await automationSuggestionsService.dismissSuggestion(userId, id);
    if (!dismissed) {
      res.status(404).json({ status: 404, code: 'NOT_FOUND', message: 'Suggestion not found' });
      return;
    }

    res.status(200).json({ success: true, id, state: 'DISMISSED' });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Internal server error';
    if (message === 'FORBIDDEN_SUGGESTION_ACCESS') {
      res.status(403).json({ status: 403, code: 'FORBIDDEN', message: 'Insufficient permissions' });
      return;
    }

    console.error('Dismiss suggestion error:', error);
    res.status(500).json({ status: 500, code: 'INTERNAL_ERROR', message: 'Internal server error' });
  }
});

router.post('/automation/suggestions/:id/accept', authenticate, async (req: Request, res: Response): Promise<void> => {
  try {
    const userId = getUserId(req);
    if (!userId) {
      res.status(401).json({ status: 401, code: 'UNAUTHORIZED', message: 'User not authenticated' });
      return;
    }

    const id = String(req.params.id || '').trim();
    if (!id) {
      res.status(400).json({ status: 400, code: 'VALIDATION_ERROR', message: 'Suggestion id is required' });
      return;
    }

    const payload = (req.body || {}) as SuggestionAcceptRequest;
    const result = await automationSuggestionsService.acceptSuggestion(userId, id, payload);
    res.status(200).json(result);
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Internal server error';

    if (
      message === 'SUGGESTION_NOT_OFFERED' ||
      message === 'SUGGESTION_EXPIRED' ||
      message === 'SUGGESTION_TYPE_NOT_SUPPORTED' ||
      message === 'LEVEL1_DISABLED' ||
      message === 'LEVEL2_DISABLED' ||
      message === 'ACTION_SUPPRESSED' ||
      message === 'UNSUPPORTED_ACTION_KEY' ||
      message === 'BUNDLE_PREVIEW_INVALID' ||
      message === 'ACTION_ENTITY_TYPE_MISMATCH' ||
      message === 'UNSUPPORTED_ENTITY_TYPE' ||
      message.includes('required') ||
      message.includes('valid') ||
      message.includes('Unsupported')
    ) {
      res.status(400).json({ status: 400, code: 'VALIDATION_ERROR', message });
      return;
    }

    if (message === 'SUGGESTION_NOT_FOUND' || message === 'ENTITY_NOT_FOUND') {
      res.status(404).json({ status: 404, code: 'NOT_FOUND', message: 'Suggestion or entity not found' });
      return;
    }

    if (
      message === 'OPERATION_IN_PROGRESS' ||
      message === 'OPERATION_ALREADY_FAILED' ||
      message === 'OPERATION_TOKEN_CONFLICT' ||
      message === 'SUGGESTION_ALREADY_PROCESSING' ||
      message === 'SUGGESTION_ALREADY_PROCESSED' ||
      message === 'SUGGESTION_LOCK_FAILED'
    ) {
      res.status(409).json({ status: 409, code: 'CONFLICT', message });
      return;
    }

    if (
      message === 'FORBIDDEN_SUGGESTION_ACCESS' ||
      message === 'FORBIDDEN_ENTITY_ACCESS' ||
      message === 'FORBIDDEN_ASSIGNMENT'
    ) {
      res.status(403).json({ status: 403, code: 'FORBIDDEN', message: 'Insufficient permissions' });
      return;
    }

    console.error('Accept suggestion error:', error);
    res.status(500).json({ status: 500, code: 'INTERNAL_ERROR', message: 'Internal server error' });
  }
});

router.get('/automation/stats/level1', authenticate, async (req: Request, res: Response): Promise<void> => {
  try {
    const userId = getUserId(req);
    if (!userId) {
      res.status(401).json({ status: 401, code: 'UNAUTHORIZED', message: 'User not authenticated' });
      return;
    }

    if (!hasStatsAccess(req)) {
      res.status(403).json({ status: 403, code: 'FORBIDDEN', message: 'Insufficient permissions' });
      return;
    }

    const stats = await automationSuggestionsService.getLevel1Stats();
    res.status(200).json(stats);
  } catch (error) {
    console.error('Get level1 automation stats error:', error);
    res.status(500).json({ status: 500, code: 'INTERNAL_ERROR', message: 'Internal server error' });
  }
});

router.get('/automation/stats/stuck-processing', authenticate, async (req: Request, res: Response): Promise<void> => {
  try {
    const userId = getUserId(req);
    if (!userId) {
      res.status(401).json({ status: 401, code: 'UNAUTHORIZED', message: 'User not authenticated' });
      return;
    }

    if (!hasStatsAccess(req)) {
      res.status(403).json({ status: 403, code: 'FORBIDDEN', message: 'Insufficient permissions' });
      return;
    }

    const maxAgeMinutes = parseMaxAgeMinutes(req.query.maxAgeMinutes);
    const stats = await automationSuggestionsService.getStuckProcessingSuggestions(maxAgeMinutes);
    res.status(200).json(stats);
  } catch (error) {
    console.error('Get stuck processing stats error:', error);
    res.status(500).json({ status: 500, code: 'INTERNAL_ERROR', message: 'Internal server error' });
  }
});

router.get('/automation/stats/operability', authenticate, async (req: Request, res: Response): Promise<void> => {
  try {
    const userId = getUserId(req);
    if (!userId) {
      res.status(401).json({ status: 401, code: 'UNAUTHORIZED', message: 'User not authenticated' });
      return;
    }

    if (!hasStatsAccess(req)) {
      res.status(403).json({ status: 403, code: 'FORBIDDEN', message: 'Insufficient permissions' });
      return;
    }

    const windowHours = parseWindowHours(req.query.windowHours);
    const maxAgeMinutes = parseMaxAgeMinutes(req.query.maxAgeMinutes);
    const stats = await automationSuggestionsService.getOperabilityStats(windowHours, maxAgeMinutes);
    res.status(200).json(stats);
  } catch (error) {
    console.error('Get operability stats error:', error);
    res.status(500).json({ status: 500, code: 'INTERNAL_ERROR', message: 'Internal server error' });
  }
});

router.post('/automation/reconcile-processing', authenticate, async (req: Request, res: Response): Promise<void> => {
  try {
    const userId = getUserId(req);
    if (!userId) {
      res.status(401).json({ status: 401, code: 'UNAUTHORIZED', message: 'User not authenticated' });
      return;
    }

    if (!hasStatsAccess(req)) {
      res.status(403).json({ status: 403, code: 'FORBIDDEN', message: 'Insufficient permissions' });
      return;
    }

    const body = (req.body || {}) as { maxAgeMinutes?: unknown; apply?: unknown };
    const maxAgeMinutes = parseMaxAgeMinutes(body.maxAgeMinutes);
    const apply = Boolean(body.apply);
    const result = await automationSuggestionsService.reconcileStuckProcessing(maxAgeMinutes, apply);
    res.status(200).json(result);
  } catch (error) {
    console.error('Reconcile stuck processing error:', error);
    res.status(500).json({ status: 500, code: 'INTERNAL_ERROR', message: 'Internal server error' });
  }
});

export default router;

