/**
 * Settings Routes V2
 * API endpoints for application settings
 */

import { Router, Request, Response } from 'express';
import settingsService from './settings';
import { authenticate, requireRole } from '../../middleware/auth';

const router = Router();
const READABLE_SETTING_KEYS = ['theme', 'app_config'];
const WRITABLE_SETTING_KEYS = ['theme', 'app_config'];
const PUBLIC_UI_KEYS = ['theme'];

function toSingleParam(value: string | string[] | undefined): string {
  return Array.isArray(value) ? value[0] : (value || '');
}

/**
 * GET /api/v1/settings
 * Get all settings
 */
router.get('/', authenticate, async (_req: Request, res: Response) => {
  try {
    const settings: Record<string, unknown> = {};
    for (const key of READABLE_SETTING_KEYS) {
      const value = await settingsService.getSetting(key);
      if (value !== undefined && value !== null) settings[key] = value;
    }
    res.json(settings);
  } catch (error) {
    console.error('Error fetching settings:', error);
    res.status(500).json({ message: 'Failed to fetch settings' });
  }
});

/**
 * GET /api/v1/settings/ui
 * Get UI settings
 */
router.get('/ui', async (_req: Request, res: Response) => {
  try {
    const settings = await settingsService.getUiSettings();
    res.json({
      theme: settings.theme,
      language: settings.language,
      dateFormat: settings.dateFormat,
    });
  } catch (error) {
    console.error('Error fetching UI settings:', error);
    res.status(500).json({ message: 'Failed to fetch UI settings' });
  }
});

/**
 * PATCH /api/v1/settings/ui
 * Update UI settings
 */
router.patch('/ui', authenticate, requireRole('ADMIN', 'PARTNER'), async (req: Request, res: Response) => {
  try {
    const updates = (req.body || {}) as Record<string, unknown>;
    const allowed: Record<string, unknown> = {};
    for (const key of PUBLIC_UI_KEYS) {
      if (key in updates && updates[key] !== undefined) allowed[key] = updates[key];
    }
    const settings = await settingsService.updateUiSettings(allowed);
    res.json(settings);
  } catch (error) {
    console.error('Error updating UI settings:', error);
    res.status(500).json({ message: 'Failed to update UI settings' });
  }
});

/**
 * GET /api/v1/settings/:key
 * Get single setting
 */
router.get('/:key', authenticate, async (req: Request, res: Response) => {
  try {
    const key = toSingleParam(req.params.key);
    if (!READABLE_SETTING_KEYS.includes(key)) {
      res.status(403).json({ code: 'SETTINGS_KEY_NOT_ALLOWED', message: 'Setting key is not readable.' });
      return;
    }
    const value = await settingsService.getSetting(key);
    res.json({ value });
  } catch (error) {
    console.error('Error fetching setting:', error);
    res.status(500).json({ message: 'Failed to fetch setting' });
  }
});

/**
 * PUT /api/v1/settings/:key
 * Update single setting
 */
router.put('/:key', authenticate, requireRole('ADMIN', 'PARTNER'), async (req: Request, res: Response) => {
  try {
    const key = toSingleParam(req.params.key);
    if (!WRITABLE_SETTING_KEYS.includes(key)) {
      res.status(403).json({ code: 'SETTINGS_KEY_NOT_ALLOWED', message: 'Setting key is not writable.' });
      return;
    }
    await settingsService.updateSetting(key, req.body.value);
    res.json({ success: true });
  } catch (error) {
    console.error('Error updating setting:', error);
    res.status(500).json({ message: 'Failed to update setting' });
  }
});

export default router;
