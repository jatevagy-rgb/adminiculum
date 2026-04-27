/**
 * News Feed Routes — Backend proxy for external RSS feeds
 * GET /api/v1/news-feed/:category  (legal | ecofin)
 */

import { Router, Request, Response } from 'express';
import { fetchNewsFeed } from './service';
import { authenticate } from '../../middleware/auth';

const router = Router();

// ============================================================================
// FEATURE FLAG GUARD — News Feed
// ============================================================================
const isNewsFeedEnabled = process.env.ENABLE_NEWS_FEED !== 'false';

function requireNewsFeedEnabled(req: Request, res: Response, next: () => void) {
  if (!isNewsFeedEnabled) {
    return res.status(501).json({
      error: 'Not Implemented',
      message: 'News Feed feature is disabled. Set ENABLE_NEWS_FEED=true to enable.',
    });
  }
  next();
}

router.get('/:category', authenticate, requireNewsFeedEnabled, async (req: Request, res: Response): Promise<void> => {
  const { category } = req.params;

  if (category !== 'legal' && category !== 'ecofin') {
    res.status(400).json({ status: 400, code: 'INVALID_CATEGORY', message: 'Category must be "legal" or "ecofin"' });
    return;
  }

  try {
    const result = await fetchNewsFeed(category as 'legal' | 'ecofin');
    res.json(result);
  } catch (error) {
    console.error('News feed error:', error);
    res.status(500).json({ status: 500, code: 'INTERNAL_ERROR', message: 'Internal server error' });
  }
});

export default router;
