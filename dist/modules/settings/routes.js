/**
 * Settings Routes V2
 * API endpoints for application settings
 */
import { Router } from 'express';
import settingsService from './settings';
const router = Router();
/**
 * GET /api/v1/settings
 * Get all settings
 */
router.get('/', async (_req, res) => {
    try {
        const settings = await settingsService.getAllSettings();
        res.json(settings);
    }
    catch (error) {
        console.error('Error fetching settings:', error);
        res.status(500).json({ message: 'Failed to fetch settings' });
    }
});
/**
 * GET /api/v1/settings/ui
 * Get UI settings
 */
router.get('/ui', async (_req, res) => {
    try {
        const settings = await settingsService.getUiSettings();
        res.json(settings);
    }
    catch (error) {
        console.error('Error fetching UI settings:', error);
        res.status(500).json({ message: 'Failed to fetch UI settings' });
    }
});
/**
 * PATCH /api/v1/settings/ui
 * Update UI settings
 */
router.patch('/ui', async (req, res) => {
    try {
        const updates = req.body;
        const settings = await settingsService.updateUiSettings(updates);
        res.json(settings);
    }
    catch (error) {
        console.error('Error updating UI settings:', error);
        res.status(500).json({ message: 'Failed to update UI settings' });
    }
});
/**
 * GET /api/v1/settings/:key
 * Get single setting
 */
router.get('/:key', async (req, res) => {
    try {
        const key = Array.isArray(req.params.key) ? req.params.key[0] : req.params.key;
        const value = await settingsService.getSetting(key);
        res.json({ value });
    }
    catch (error) {
        console.error('Error fetching setting:', error);
        res.status(500).json({ message: 'Failed to fetch setting' });
    }
});
/**
 * PUT /api/v1/settings/:key
 * Update single setting
 */
router.put('/:key', async (req, res) => {
    try {
        const key = Array.isArray(req.params.key) ? req.params.key[0] : req.params.key;
        await settingsService.updateSetting(key, req.body.value);
        res.json({ success: true });
    }
    catch (error) {
        console.error('Error updating setting:', error);
        res.status(500).json({ message: 'Failed to update setting' });
    }
});
export default router;
//# sourceMappingURL=routes.js.map