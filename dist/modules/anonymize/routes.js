"use strict";
// ============================================================================
// ANONYMIZE ROUTES - Dokumentum anonimizálás endpointok
// ============================================================================
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const services_js_1 = __importDefault(require("./services.js"));
const auth_js_1 = require("../../middleware/auth.js");
const router = (0, express_1.Router)();
// ============================================================================
// POST /api/v1/documents/:documentId/anonymize
// ============================================================================
router.post('/documents/:documentId/anonymize', auth_js_1.authenticate, async (req, res) => {
    try {
        const { documentId } = req.params;
        const { aiTask, customPrompt, redactionLevel } = req.body;
        const userId = req.user?.userId;
        if (!userId) {
            return res.status(401).json({ error: 'Felhasználó nem azonosított' });
        }
        const result = await services_js_1.default.anonymizeDocument({
            documentId,
            userId,
            aiTask,
            customPrompt,
            redactionLevel
        });
        if (!result.success) {
            return res.status(400).json({ error: result.error });
        }
        res.json(result);
    }
    catch (error) {
        console.error('Anonymize error:', error);
        res.status(500).json({ error: 'Hiba az anonimizálás során' });
    }
});
// ============================================================================
// GET /api/v1/clients/:clientId/redaction-profile
// ============================================================================
router.get('/clients/:clientId/redaction-profile', auth_js_1.authenticate, async (req, res) => {
    try {
        const { clientId } = req.params;
        const profile = await services_js_1.default.getClientRedactionProfile(clientId);
        res.json(profile || { error: 'Nincs redakciós profil' });
    }
    catch (error) {
        console.error('Get profile error:', error);
        res.status(500).json({ error: 'Hiba a profil lekérésekor' });
    }
});
// ============================================================================
// POST /api/v1/clients/:clientId/redaction-profile
// ============================================================================
router.post('/clients/:clientId/redaction-profile', auth_js_1.authenticate, async (req, res) => {
    try {
        const { clientId } = req.params;
        const { fullName, aliases, addresses, taxId, personalId, bankAccounts, phones, emails } = req.body;
        const profile = await services_js_1.default.upsertRedactionProfile({
            clientId,
            fullName,
            aliases,
            addresses,
            taxId,
            personalId,
            bankAccounts,
            phones,
            emails
        });
        res.json(profile);
    }
    catch (error) {
        console.error('Upsert profile error:', error);
        res.status(500).json({ error: 'Hiba a profil mentésekor' });
    }
});
// ============================================================================
// GET /api/v1/anonymous-documents/:id
// ============================================================================
router.get('/anonymous-documents/:id', auth_js_1.authenticate, async (req, res) => {
    try {
        const { id } = req.params;
        const doc = await services_js_1.default.getAnonymousDocument(id);
        if (!doc) {
            return res.status(404).json({ error: 'Anoním dokumentum nem található' });
        }
        res.json(doc);
    }
    catch (error) {
        console.error('Get anonymous doc error:', error);
        res.status(500).json({ error: 'Hiba a dokumentum lekérésekor' });
    }
});
exports.default = router;
//# sourceMappingURL=routes.js.map