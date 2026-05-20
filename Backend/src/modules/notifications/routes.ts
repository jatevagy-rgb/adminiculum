import { Router, Request, Response } from 'express';
import { authenticate } from '../../middleware/auth';
import notificationsService from './services';

const router = Router();

function getUserId(req: Request): string | null {
  const userId = (req as any).user?.userId;
  return typeof userId === 'string' && userId.trim().length > 0 ? userId : null;
}

router.get('/', authenticate, async (req: Request, res: Response): Promise<void> => {
  try {
    const userId = getUserId(req);
    if (!userId) {
      res.status(401).json({ status: 401, code: 'UNAUTHORIZED', message: 'Unauthorized' });
      return;
    }

    const limit = Number(req.query.limit || 50);
    const offset = Number(req.query.offset || 0);
    const result = await notificationsService.listNotifications({ userId, limit, offset });

    res.json({
      notifications: result.items,
      pagination: {
        total: result.total,
        limit: result.limit,
        offset: result.offset,
      },
    });
  } catch (error) {
    console.error('listNotifications error:', error);
    res.status(500).json({ status: 500, code: 'INTERNAL_ERROR', message: 'Internal server error' });
  }
});

router.get('/unread-count', authenticate, async (req: Request, res: Response): Promise<void> => {
  try {
    const userId = getUserId(req);
    if (!userId) {
      res.status(401).json({ status: 401, code: 'UNAUTHORIZED', message: 'Unauthorized' });
      return;
    }

    const result = await notificationsService.getUnreadCount(userId);
    res.json(result);
  } catch (error) {
    console.error('getUnreadCount error:', error);
    res.status(500).json({ status: 500, code: 'INTERNAL_ERROR', message: 'Internal server error' });
  }
});

router.patch('/:id/read', authenticate, async (req: Request, res: Response): Promise<void> => {
  try {
    const userId = getUserId(req);
    if (!userId) {
      res.status(401).json({ status: 401, code: 'UNAUTHORIZED', message: 'Unauthorized' });
      return;
    }

    const notificationId = String(req.params.id || '').trim();
    if (!notificationId) {
      res.status(400).json({ status: 400, code: 'VALIDATION_ERROR', message: 'Missing notification id' });
      return;
    }

    const updated = await notificationsService.markAsRead(userId, notificationId);
    if (!updated) {
      res.status(404).json({ status: 404, code: 'NOT_FOUND', message: 'Notification not found' });
      return;
    }

    res.json(updated);
  } catch (error) {
    console.error('markAsRead error:', error);
    res.status(500).json({ status: 500, code: 'INTERNAL_ERROR', message: 'Internal server error' });
  }
});

router.patch('/read-all', authenticate, async (req: Request, res: Response): Promise<void> => {
  try {
    const userId = getUserId(req);
    if (!userId) {
      res.status(401).json({ status: 401, code: 'UNAUTHORIZED', message: 'Unauthorized' });
      return;
    }

    const result = await notificationsService.markAllAsRead(userId);
    res.json(result);
  } catch (error) {
    console.error('markAllAsRead error:', error);
    res.status(500).json({ status: 500, code: 'INTERNAL_ERROR', message: 'Internal server error' });
  }
});

export default router;

