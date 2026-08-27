/**
 * Settings Routes V2
 * API endpoints for application settings
 *
 * SEC-0A hardening: settings are no longer an unauthenticated key-value dump.
 * Reads require workforce auth (except the presentational UI DTO, which is
 * public-safe theme-only), writes require ADMIN/PARTNER, and only allowlisted
 * keys are accepted. Unknown keys fail closed. The whole SystemSetting table is
 * never exposed, and environment/Key-Vault security flags are never stored or
 * served here.
 */

import { Router, Request, Response } from 'express';
import settingsService from './settings';
import { authenticate, requireRole } from '../../middleware/auth';

const router = Router();

// Only these presentational/UI keys are reachable through the API. Never expose
// the whole SystemSetting table, and never allow writing non-allowlisted keys.
const READABLE_SETTING_KEYS = ['theme', 'app_config'];
const WRITABLE_SETTING_KEYS = ['theme', 'app_config'];
const PUBLIC_UI_KEYS = ['theme'];

function isReadableKey(key: string): boolean {
  return READABLE_SETTING_KEYS.includes(key);
}

function isWritableKey(key: string): boolean {
  return WRITABLE_SETTING_KEYS.includes(key);
}

function toSingleParam(value: string | string[] | undefined): string {
  return Array.isArray(value) ? value[0] : (value || '');
}

/**
 * GET /api/v1/settings
 * Return only the safe, allowlisted settings (authenticated workforce).
 */
router.get('/', authenticate, async (_req: Request, res: Response) => {
  try {
    const result: Record<string, unknown> = {};
    for (const key of READABLE_SETTING_KEYS) {
      const value = await settingsService.getSetting(key);
      // Silently omit missing keys rather than leaking a null for everything.
      if (value !== undefined && value !== null) {
        result[key] = value;
      }
    }
    res.json(result);
  } catch (error) {
    console.error('Error fetching settings:', error);
    res.status(500).json({ message: 'Failed to fetch settings' });
  }
});

/**
 * GET /api/v1/settings/ui
 * Public-safe presentational DTO (theme only; no internal values). This is used
 * pre-auth for theming and must never carry non-presentational configuration.
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
 * Writes GLOBAL UI configuration shared by all users, so it requires
 * ADMIN/PARTNER. Only allowlisted presentational keys are accepted.
 */
router.patch('/ui', authenticate, requireRole('ADMIN', 'PARTNER'), async (req: Request, res: Response) => {
  try {
    const updates = (req.body || {}) as Record<string, unknown>;
    const allowed: Record<string, unknown> = {};
    for (const key of PUBLIC_UI_KEYS) {
      if (key in updates && updates[key] !== undefined) {
        allowed[key] = updates[key];
      }
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
 * Read a single allowlisted setting (authenticated workforce).
 */
router.get('/:key', authenticate, async (req: Request, res: Response) => {
  try {
    const key = toSingleParam(req.params.key);
    if (!isReadableKey(key)) {
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
 * Update a single allowlisted setting (ADMIN/PARTNER only).
 */
router.put('/:key', authenticate, requireRole('ADMIN', 'PARTNER'), async (req: Request, res: Response) => {
  try {
    const key = toSingleParam(req.params.key);
    if (!isWritableKey(key)) {
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
