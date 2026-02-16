"use strict";
/**
 * Settings Routes V2
 * API endpoints for application settings
 */
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const settings_1 = __importDefault(require("./settings"));
const router = (0, express_1.Router)();
/**
 * GET /api/v1/settings
 * Get all settings
 */
router.get('/', async (_req, res) => {
    try {
        const settings = await settings_1.default.getAllSettings();
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
        const settings = await settings_1.default.getUiSettings();
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
        const settings = await settings_1.default.updateUiSettings(updates);
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
        const value = await settings_1.default.getSetting(key);
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
        await settings_1.default.updateSetting(key, req.body.value);
        res.json({ success: true });
    }
    catch (error) {
        console.error('Error updating setting:', error);
        res.status(500).json({ message: 'Failed to update setting' });
    }
});
exports.default = router;
//# sourceMappingURL=routes.js.map