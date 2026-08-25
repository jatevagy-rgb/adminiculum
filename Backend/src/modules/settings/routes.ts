/**
 * Settings Routes V2
 * API endpoints for application settings
 *
 * SEC-0A hardening: settings are no longer an unauthenticated key-value dump.
 * Reads require workforce auth (except the presentational UI DTO), writes
 * require ADMIN/PARTNER, and only allowlisted keys are accepted. Unknown keys
 * fail closed. Environment/Key-Vault security flags are never stored here.
 */

import { Router, Request, Response } from 'express';
import settingsService from './settings';
import { authenticate, requireRole } from '../../middleware/auth';

const router = Router();

// Only these presentational/UI keys are reachable through the API. Never expose
// the whole SystemSetting table, and never allow writing non-allowlisted keys.
const READABLE_SETTING_KEYS = ['theme', 'app_config'];
const WRITABLE_SETTING_KEYS = ['theme', 'app_config'];
const PUBLIC_UI_KEYS = ['theme', 'app_config'];

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
 * Get the safe, allowlisted settings (authenticated workforce):
 */
router.get('/', authenticate, async (_req: Request, res: Response) => {
  try {
    const result: Record<string, unknown> = {};
    for (const key of READABLE_SETTING_KEYS) {
      // Silently omit missing keys rather than leaking a null for everything.
      const value = await settingsService.getSetting(key);
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
 * Public-safe presentational DTO (theme/app_config only; no internal values).
 */
router.get('/ui', async (_req: Request, res: Response) => {
  try {
    const settings = await settingsService.getUiSettings();
    // Only carry the presentational subset that is safe pre/post-auth.
    const theme =
      settings && typeof settings === 'object' && 'theme' in settings
        ? (settings as { theme?: unknown }).theme
        : undefined;
    res.json({ theme: theme ?? null });
  } catch (error) {
    console.error('Error fetching UI settings:', error);
    res.status(500).json({ message: 'Failed to fetch UI settings' });
  }
});

/**
 * PATCH /api/v1/settings/ui
 * Update UI settings. This writes GLOBAL UI configuration shared by all users,
 * so it requires ADMIN/PARTNER (not merely an authenticated workforce user).
 * GET /settings/ui remains public-safe read-only.
 */
router.patch('/ui', authenticate, requireRole('ADMIN', 'PARTNER'), async (req: Request, res: Response) => {
  try {
    const updates = req.body || {};
    const allowed: Record<string, unknown> = {};
    for (const key of PUBLIC_UI_KEYS) {
      if (key in updates && updates[key] !== undefined) {
        allowed[key] = updates[key];
      }
    }
    const settings = await settingsService.updateUiSettings(allowed);
    const theme =
      settings && typeof settings === 'object' && 'theme' in settings
        ? (settings as { theme?: unknown }).theme
        : undefined;
    res.json({ theme: theme ?? null });
  } catch (error) {
    console.error('Error updating UI settings:', error);
    res.status(500).json({ message: 'Failed to update UI settings' });
  }
});

/**
 * GET /api/v1/settings/:key
 * Read a single allowlisted setting (authenticated workforce). Unknown keys fail
 * closed with 403 so a non-allowlisted value is never disclosed.
 */
router.get('/:key', authenticate, async (req: Request, res: Response) => {
  try {
    const key = toSingleParam(req.params.key as string | string[] | undefined);
    if (!isReadableKey(key)) {
      res.status(403).json({ status: 403, code: 'SETTINGS_KEY_NOT_ALLOWED', message: 'This setting is not available.' });
      return;
    }
    const value = await settingsService.getSetting(key);
    if (value === undefined) {
      res.status(404).json({ status: 404, code: 'SETTING_NOT_FOUND', message: 'Setting not found.' });
      return;
    }
    res.json({ value });
  } catch (error) {
    console.error('Error fetching setting:', error);
    res.status(500).json({ message: 'Failed to fetch setting' });
  }
});

/**
 * PUT /api/v1/settings/:key
 * Update a single allowlisted setting (ADMIN/PARTNER only). Unknown keys fail
 * closed.
 */
router.put('/:key', authenticate, requireRole('ADMIN', 'PARTNER'), async (req: Request, res: Response) => {
  try {
    const key = toSingleParam(req.params.key as string | string[] | undefined);
    if (!isWritableKey(key)) {
      res.status(403).json({ status: 403, code: 'SETTINGS_KEY_NOT_ALLOWED', message: 'This setting cannot be written.' });
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
