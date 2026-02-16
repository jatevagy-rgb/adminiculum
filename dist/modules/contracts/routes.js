"use strict";
/**
 * Contracts Routes
 * API endpoints for contract template management and document generation
 */
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const services_1 = __importDefault(require("./services"));
const auth_1 = require("../../middleware/auth");
const prisma_service_1 = require("../../prisma/prisma.service");
const types_1 = require("./types");
const multer_1 = __importDefault(require("multer"));
const router = (0, express_1.Router)();
// Configure multer for file uploads
const upload = (0, multer_1.default)({
    storage: multer_1.default.memoryStorage(),
    limits: {
        fileSize: 10 * 1024 * 1024, // 10MB limit
    },
    fileFilter: (req, file, cb) => {
        if (file.mimetype === 'application/vnd.openxmlformats-officedocument.wordprocessingml.document') {
            cb(null, true);
        }
        else {
            cb(new Error('Only .docx files are allowed'));
        }
    },
});
/**
 * GET /api/v1/contracts/templates
 * List all contract templates
 */
router.get('/templates', auth_1.authenticate, async (req, res) => {
    try {
        const category = req.query.category;
        const templates = await services_1.default.getTemplates(category);
        res.json(templates);
    }
    catch (error) {
        console.error('Get templates error:', error);
        res.status(500).json({
            status: 500,
            code: 'INTERNAL_ERROR',
            message: 'Internal server error'
        });
    }
});
/**
 * GET /api/v1/contracts/templates/:id
 * Get template by ID with variables
 */
router.get('/templates/:id', auth_1.authenticate, async (req, res) => {
    try {
        const { id } = req.params;
        const template = await services_1.default.getTemplateById(id);
        if (!template) {
            res.status(404).json({
                status: 404,
                code: 'NOT_FOUND',
                message: 'Template not found'
            });
            return;
        }
        res.json(template);
    }
    catch (error) {
        console.error('Get template error:', error);
        res.status(500).json({
            status: 500,
            code: 'INTERNAL_ERROR',
            message: 'Internal server error'
        });
    }
});
/**
 * GET /api/v1/contracts/templates/adasvetel/variables
 * Get predefined variables for adásvételi contract
 */
router.get('/templates/adasvetel/variables', auth_1.authenticate, async (req, res) => {
    res.json({
        category: 'ADASVETEL',
        variables: types_1.ADASVETEL_VARIABLES
    });
});
/**
 * POST /api/v1/contracts/templates
 * Upload and register new template
 */
router.post('/templates', auth_1.authenticate, upload.single('template'), async (req, res) => {
    try {
        const userId = req.user?.userId;
        const { name, description, category, variables } = req.body;
        if (!req.file) {
            res.status(400).json({
                status: 400,
                code: 'VALIDATION_ERROR',
                message: 'Template file is required'
            });
            return;
        }
        if (!name || !category) {
            res.status(400).json({
                status: 400,
                code: 'VALIDATION_ERROR',
                message: 'Name and category are required'
            });
            return;
        }
        // Save template file
        const templatePath = await services_1.default.saveTemplateFile({
            name: req.file.originalname,
            data: req.file.buffer
        });
        // Parse variables (JSON string or use defaults)
        let parsedVariables = [];
        if (variables) {
            try {
                parsedVariables = JSON.parse(variables);
            }
            catch {
                parsedVariables = [];
            }
        }
        const template = await services_1.default.createTemplate({
            name,
            description,
            category: category,
            templatePath,
            originalFileName: req.file.originalname,
            variables: parsedVariables,
            isDefault: req.body.isDefault === 'true'
        });
        if (!template) {
            res.status(500).json({
                status: 500,
                code: 'CREATE_FAILED',
                message: 'Failed to create template'
            });
            return;
        }
        res.status(201).json(template);
    }
    catch (error) {
        console.error('Create template error:', error);
        res.status(500).json({
            status: 500,
            code: 'INTERNAL_ERROR',
            message: error instanceof Error ? error.message : 'Internal server error'
        });
    }
});
/**
 * POST /api/v1/contracts/generate
 * Generate contract document
 */
router.post('/generate', auth_1.authenticate, async (req, res) => {
    try {
        const userId = req.user?.userId;
        const { templateId, caseId, data, title } = req.body;
        if (!templateId || !data) {
            res.status(400).json({
                status: 400,
                code: 'VALIDATION_ERROR',
                message: 'templateId and data are required'
            });
            return;
        }
        const result = await services_1.default.generateContract({
            templateId,
            caseId,
            data,
            title,
            userId
        });
        if (!result.success) {
            res.status(400).json({
                status: 400,
                code: 'GENERATION_FAILED',
                message: result.error
            });
            return;
        }
        res.status(201).json(result);
    }
    catch (error) {
        console.error('Generate contract error:', error);
        res.status(500).json({
            status: 500,
            code: 'INTERNAL_ERROR',
            message: 'Internal server error'
        });
    }
});
/**
 * POST /api/v1/contracts/preview
 * Generate preview (temporary, auto-deleted after 24h)
 */
router.post('/preview', auth_1.authenticate, async (req, res) => {
    try {
        const { templateId, data } = req.body;
        if (!templateId || !data) {
            res.status(400).json({
                status: 400,
                code: 'VALIDATION_ERROR',
                message: 'templateId and data are required'
            });
            return;
        }
        const result = await services_1.default.generatePreview({
            templateId,
            data
        });
        if (!result.success) {
            res.status(400).json({
                status: 400,
                code: 'PREVIEW_FAILED',
                message: result.error
            });
            return;
        }
        res.json(result);
    }
    catch (error) {
        console.error('Preview generation error:', error);
        res.status(500).json({
            status: 500,
            code: 'INTERNAL_ERROR',
            message: 'Internal server error'
        });
    }
});
/**
 * GET /api/v1/contracts/case/:caseId
 * Get generated contracts for a case
 */
router.get('/case/:caseId', auth_1.authenticate, async (req, res) => {
    try {
        const { caseId } = req.params;
        const contracts = await services_1.default.getCaseContracts(caseId);
        res.json(contracts);
    }
    catch (error) {
        console.error('Get case contracts error:', error);
        res.status(500).json({
            status: 500,
            code: 'INTERNAL_ERROR',
            message: 'Internal server error'
        });
    }
});
/**
 * GET /api/v1/contracts/:id/download
 * Download generated contract
 */
router.get('/:id/download', auth_1.authenticate, async (req, res) => {
    try {
        const { id } = req.params;
        const generation = await prisma_service_1.prisma.contractGeneration.findUnique({
            where: { id }
        });
        if (!generation) {
            res.status(404).json({
                status: 404,
                code: 'NOT_FOUND',
                message: 'Generated contract not found'
            });
            return;
        }
        // Check if file exists
        const fs = await import('fs');
        if (!fs.existsSync(generation.filePath)) {
            res.status(404).json({
                status: 404,
                code: 'FILE_NOT_FOUND',
                message: 'File no longer exists'
            });
            return;
        }
        res.download(generation.filePath, generation.fileName);
    }
    catch (error) {
        console.error('Download contract error:', error);
        res.status(500).json({
            status: 500,
            code: 'INTERNAL_ERROR',
            message: 'Internal server error'
        });
    }
});
/**
 * POST /api/v1/contracts/:id/upload-sharepoint
 * Upload generated contract to SharePoint
 */
router.post('/:id/upload-sharepoint', auth_1.authenticate, async (req, res) => {
    try {
        const { id } = req.params;
        const result = await services_1.default.uploadToSharePoint(id);
        if (!result.success) {
            res.status(400).json({
                status: 400,
                code: 'UPLOAD_FAILED',
                message: result.error || 'Upload to SharePoint failed'
            });
            return;
        }
        res.json({
            success: true,
            spItemId: result.spItemId,
            spWebUrl: result.spWebUrl
        });
    }
    catch (error) {
        console.error('SharePoint upload error:', error);
        res.status(500).json({
            status: 500,
            code: 'INTERNAL_ERROR',
            message: 'Internal server error'
        });
    }
});
/**
 * POST /api/v1/contracts/cleanup
 * Cleanup expired previews (admin only)
 */
router.post('/cleanup', auth_1.authenticate, async (req, res) => {
    try {
        const userId = req.user?.userId;
        // Verify admin role
        const user = await prisma_service_1.prisma.user.findUnique({
            where: { id: userId }
        });
        if (user?.role !== 'ADMIN') {
            res.status(403).json({
                status: 403,
                code: 'FORBIDDEN',
                message: 'Admin access required'
            });
            return;
        }
        const count = await services_1.default.cleanupExpiredPreviews();
        res.json({
            success: true,
            deletedCount: count
        });
    }
    catch (error) {
        console.error('Cleanup error:', error);
        res.status(500).json({
            status: 500,
            code: 'INTERNAL_ERROR',
            message: 'Internal server error'
        });
    }
});
exports.default = router;
//# sourceMappingURL=routes.js.map