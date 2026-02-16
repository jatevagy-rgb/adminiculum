"use strict";
/**
 * Documents Routes V2
 * Document management with SharePoint integration
 */
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const services_1 = __importDefault(require("./services"));
const auth_1 = require("../../middleware/auth");
const prisma_service_1 = require("../../prisma/prisma.service");
const router = (0, express_1.Router)();
/**
 * POST /api/v1/documents
 * Upload new document
 */
router.post('/', auth_1.authenticate, async (req, res) => {
    try {
        const userId = req.user?.userId;
        const { caseId, fileName, documentType, folder } = req.body;
        if (!caseId || !fileName) {
            res.status(400).json({
                status: 400,
                code: 'VALIDATION_ERROR',
                message: 'Missing required fields: caseId, fileName'
            });
            return;
        }
        // For now, require file content (multipart form data would be better for production)
        if (!req.body.fileContent) {
            res.status(400).json({
                status: 400,
                code: 'VALIDATION_ERROR',
                message: 'Missing fileContent'
            });
            return;
        }
        const fileContentBuffer = Buffer.from(req.body.fileContent, 'base64');
        const result = await services_1.default.createDocument({
            caseId,
            fileName,
            fileContent: fileContentBuffer,
            mimeType: req.body.mimeType || 'application/octet-stream',
            documentType: documentType || 'OTHER',
            folder,
            createdById: userId
        });
        if (!result) {
            res.status(500).json({
                status: 500,
                code: 'CREATE_FAILED',
                message: 'Failed to create document'
            });
            return;
        }
        // Create TimelineEvent for document upload (AUTOMATIC)
        await prisma_service_1.prisma.timelineEvent.create({
            data: {
                caseId,
                userId,
                documentId: result.id,
                eventType: 'DOCUMENT_UPLOADED',
                description: `Document uploaded: ${fileName}`,
                metadata: {
                    documentId: result.id,
                    documentName: fileName,
                    documentType: documentType || 'OTHER',
                    folder: folder || '01_Client_Input'
                }
            }
        });
        res.status(201).json(result);
    }
    catch (error) {
        console.error('Create document error:', error);
        res.status(500).json({
            status: 500,
            code: 'INTERNAL_ERROR',
            message: error instanceof Error ? error.message : 'Internal server error'
        });
    }
});
/**
 * GET /api/v1/documents/case/:caseId
 * Get all documents for a case
 */
router.get('/case/:caseId', auth_1.authenticate, async (req, res) => {
    try {
        const { caseId } = req.params;
        const documents = await services_1.default.getCaseDocuments(caseId);
        res.json(documents);
    }
    catch (error) {
        console.error('Get case documents error:', error);
        res.status(500).json({
            status: 500,
            code: 'INTERNAL_ERROR',
            message: 'Internal server error'
        });
    }
});
/**
 * GET /api/v1/documents/:id
 * Get document by ID
 */
router.get('/:id', auth_1.authenticate, async (req, res) => {
    try {
        const { id } = req.params;
        const document = await services_1.default.getDocumentById(id);
        if (!document) {
            res.status(404).json({
                status: 404,
                code: 'NOT_FOUND',
                message: 'Document not found'
            });
            return;
        }
        res.json(document);
    }
    catch (error) {
        console.error('Get document error:', error);
        res.status(500).json({
            status: 500,
            code: 'INTERNAL_ERROR',
            message: 'Internal server error'
        });
    }
});
/**
 * POST /api/v1/documents/:id/version
 * Upload new version
 */
router.post('/:id/version', auth_1.authenticate, async (req, res) => {
    try {
        const userId = req.user?.userId;
        const { fileContent, comment } = req.body;
        if (!fileContent) {
            res.status(400).json({
                status: 400,
                code: 'VALIDATION_ERROR',
                message: 'Missing fileContent'
            });
            return;
        }
        const { id } = req.params;
        const fileBuffer = Buffer.from(fileContent, 'base64');
        const result = await services_1.default.uploadNewVersion(id, fileBuffer, userId, comment);
        if (!result) {
            res.status(500).json({
                status: 500,
                code: 'UPLOAD_FAILED',
                message: 'Failed to upload version'
            });
            return;
        }
        res.json(result);
    }
    catch (error) {
        console.error('Upload version error:', error);
        res.status(500).json({
            status: 500,
            code: 'INTERNAL_ERROR',
            message: 'Internal server error'
        });
    }
});
/**
 * POST /api/v1/documents/:id/submit-review
 * Submit document for review
 */
router.post('/:id/submit-review', auth_1.authenticate, async (req, res) => {
    try {
        const userId = req.user?.userId;
        const { id } = req.params;
        const success = await services_1.default.submitForReview(id, userId);
        if (!success) {
            res.status(500).json({
                status: 500,
                code: 'OPERATION_FAILED',
                message: 'Failed to submit for review'
            });
            return;
        }
        res.json({ success: true, message: 'Document submitted for review' });
    }
    catch (error) {
        console.error('Submit for review error:', error);
        res.status(500).json({
            status: 500,
            code: 'INTERNAL_ERROR',
            message: 'Internal server error'
        });
    }
});
/**
 * POST /api/v1/documents/:id/approve
 * Approve document
 */
router.post('/:id/approve', auth_1.authenticate, async (req, res) => {
    try {
        const userId = req.user?.userId;
        const { comment } = req.body;
        const { id } = req.params;
        const success = await services_1.default.approveDocument(id, userId, comment);
        if (!success) {
            res.status(500).json({
                status: 500,
                code: 'OPERATION_FAILED',
                message: 'Failed to approve document'
            });
            return;
        }
        res.json({ success: true, message: 'Document approved' });
    }
    catch (error) {
        console.error('Approve document error:', error);
        res.status(500).json({
            status: 500,
            code: 'INTERNAL_ERROR',
            message: 'Internal server error'
        });
    }
});
/**
 * POST /api/v1/documents/:id/reject
 * Reject document
 */
router.post('/:id/reject', auth_1.authenticate, async (req, res) => {
    try {
        const userId = req.user?.userId;
        const { reason } = req.body;
        if (!reason) {
            res.status(400).json({
                status: 400,
                code: 'VALIDATION_ERROR',
                message: 'Reason is required'
            });
            return;
        }
        const { id } = req.params;
        const success = await services_1.default.rejectDocument(id, userId, reason);
        if (!success) {
            res.status(500).json({
                status: 500,
                code: 'OPERATION_FAILED',
                message: 'Failed to reject document'
            });
            return;
        }
        res.json({ success: true, message: 'Document rejected' });
    }
    catch (error) {
        console.error('Reject document error:', error);
        res.status(500).json({
            status: 500,
            code: 'INTERNAL_ERROR',
            message: 'Internal server error'
        });
    }
});
exports.default = router;
//# sourceMappingURL=routes.js.map