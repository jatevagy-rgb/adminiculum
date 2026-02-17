"use strict";
/**
 * Documents Service V2 - Integrated with Case + Timeline
 * Document management with SharePoint integration + automatic workflow
 */
Object.defineProperty(exports, "__esModule", { value: true });
const prisma_service_1 = require("../../prisma/prisma.service");
const sharepoint_1 = require("../sharepoint");
const types_1 = require("./types");
const DEFAULT_FOLDER = 'Drafts';
// Map document types to SpFolder enum values
const FOLDER_MAP = {
    'Contracts': 'DRAFTS',
    'Correspondence': 'DRAFTS',
    'CourtDocuments': 'DRAFTS',
    'Internal': 'INTERNAL_NOTES',
    'ClientInput': 'CLIENT_INPUT',
    'Drafts': 'DRAFTS',
    'Review': 'REVIEW',
    'Approved': 'APPROVED',
    'Final': 'FINAL',
};
// Map folder to CaseStatus
const STATUS_MAP = {
    'DRAFTS': 'DRAFT',
    'REVIEW': 'IN_REVIEW',
    'APPROVED': 'APPROVED',
    'FINAL': 'FINAL',
    'CLIENT_INPUT': 'CLIENT_INPUT',
};
class DocumentsService {
    /**
     * Create document with SharePoint upload + TimelineEvent + Case update
     */
    async createDocument(input) {
        try {
            // 1. Verify case exists
            const caseData = await prisma_service_1.prisma.case.findUnique({
                where: { id: input.caseId }
            });
            if (!caseData) {
                throw new Error('Case not found');
            }
            // 2. Determine SharePoint folder
            const folderType = input.folder || types_1.FOLDER_BY_DOCUMENT_TYPE[input.documentType] || DEFAULT_FOLDER;
            const prismaFolder = (FOLDER_MAP[folderType] || 'DRAFTS');
            // 3. Upload to SharePoint
            const uploadResult = await sharepoint_1.driveService.uploadDocument({
                caseId: input.caseId,
                fileName: input.fileName,
                content: input.fileContent,
                mimeType: input.mimeType,
                folder: folderType
            });
            if (!uploadResult.success || !uploadResult.item) {
                throw new Error(uploadResult.error || 'SharePoint upload failed');
            }
            // 4. Create CaseDocument record in database
            const document = await prisma_service_1.prisma.document.create({
                data: {
                    caseId: input.caseId,
                    spItemId: uploadResult.item.id,
                    spDriveId: '',
                    spPath: uploadResult.webUrl || '',
                    fileName: input.fileName,
                    folder: prismaFolder,
                    version: uploadResult.version || '1',
                    documentType: input.documentType,
                    isLatest: true
                }
            });
            // 5. Create TimelineEvent for document creation
            await prisma_service_1.prisma.timelineEvent.create({
                data: {
                    caseId: input.caseId,
                    userId: input.createdById,
                    eventType: 'DOCUMENT_UPLOADED',
                    type: 'DOCUMENT_UPLOADED',
                    payload: {
                        documentId: document.id,
                        fileName: input.fileName,
                        documentType: input.documentType,
                        spItemId: uploadResult.item.id,
                        spPath: uploadResult.webUrl,
                        folder: folderType,
                        version: uploadResult.version
                    }
                }
            });
            // 6. Update Case status to DRAFT
            await prisma_service_1.prisma.case.update({
                where: { id: input.caseId },
                data: { status: 'DRAFT' }
            });
            return {
                id: document.id,
                caseId: document.caseId,
                fileName: document.fileName,
                documentType: document.documentType || 'OTHER',
                spItemId: document.spItemId,
                spWebUrl: document.spPath,
                version: document.version || '1',
                status: 'DRAFT',
                createdAt: document.createdAt,
                updatedAt: document.updatedAt,
                createdBy: {
                    id: input.createdById,
                    name: ''
                }
            };
        }
        catch (error) {
            console.error('Error creating document:', error);
            return null;
        }
    }
    /**
     * Get all documents for a case
     */
    async getCaseDocuments(caseId) {
        const documents = await prisma_service_1.prisma.document.findMany({
            where: { caseId },
            orderBy: { createdAt: 'desc' }
        });
        return documents.map((doc) => ({
            id: doc.id,
            fileName: doc.fileName,
            documentType: doc.documentType || 'OTHER',
            version: doc.version || '1',
            status: doc.folder,
            spWebUrl: doc.spPath,
            createdAt: doc.createdAt,
            updatedAt: doc.updatedAt
        }));
    }
    /**
     * Upload new version of document
     */
    async uploadNewVersion(documentId, fileContent, userId, comment) {
        try {
            const document = await prisma_service_1.prisma.document.findUnique({
                where: { id: documentId }
            });
            if (!document) {
                throw new Error('Document not found');
            }
            // Upload new version to SharePoint
            const uploadResult = await sharepoint_1.driveService.uploadNewVersion(document.spItemId, fileContent);
            if (!uploadResult.success) {
                throw new Error(uploadResult.error || 'Version upload failed');
            }
            // Update document record
            const updatedDoc = await prisma_service_1.prisma.document.update({
                where: { id: documentId },
                data: {
                    version: uploadResult.version || document.version || '1',
                    updatedAt: new Date()
                }
            });
            // Create TimelineEvent for version
            await prisma_service_1.prisma.timelineEvent.create({
                data: {
                    caseId: document.caseId,
                    userId: userId,
                    eventType: 'VERSION_CREATED',
                    type: 'VERSION_CREATED',
                    payload: {
                        documentId,
                        fileName: document.fileName,
                        previousVersion: document.version,
                        newVersion: uploadResult.version,
                        comment
                    }
                }
            });
            return {
                id: updatedDoc.id,
                caseId: updatedDoc.caseId,
                fileName: updatedDoc.fileName,
                documentType: updatedDoc.documentType || 'OTHER',
                spItemId: updatedDoc.spItemId,
                spWebUrl: updatedDoc.spPath,
                version: updatedDoc.version || '1',
                status: 'DRAFT',
                createdAt: updatedDoc.createdAt,
                updatedAt: updatedDoc.updatedAt,
                createdBy: {
                    id: userId,
                    name: ''
                }
            };
        }
        catch (error) {
            console.error('Error uploading new version:', error);
            return null;
        }
    }
    /**
     * Move document to review folder - updates Case status to IN_REVIEW
     */
    async submitForReview(documentId, userId) {
        try {
            const document = await prisma_service_1.prisma.document.findUnique({
                where: { id: documentId }
            });
            if (!document) {
                throw new Error('Document not found');
            }
            // Update document folder to REVIEW
            await prisma_service_1.prisma.document.update({
                where: { id: documentId },
                data: { folder: 'REVIEW' }
            });
            // Check out document in SharePoint
            await sharepoint_1.driveService.checkoutDocument(document.spItemId, userId);
            // Create TimelineEvent
            await prisma_service_1.prisma.timelineEvent.create({
                data: {
                    caseId: document.caseId,
                    userId: userId,
                    eventType: 'SENT_TO_REVIEW',
                    type: 'SENT_TO_REVIEW',
                    payload: {
                        documentId,
                        fileName: document.fileName,
                        folder: 'Review'
                    }
                }
            });
            // Update Case status to IN_REVIEW
            await prisma_service_1.prisma.case.update({
                where: { id: document.caseId },
                data: { status: 'IN_REVIEW' }
            });
            return true;
        }
        catch (error) {
            console.error('Error submitting for review:', error);
            return false;
        }
    }
    /**
     * Approve document - moves to APPROVED folder, updates Case status to APPROVED
     */
    async approveDocument(documentId, userId, comment) {
        try {
            const document = await prisma_service_1.prisma.document.findUnique({
                where: { id: documentId }
            });
            if (!document) {
                throw new Error('Document not found');
            }
            // Update document folder to APPROVED
            await prisma_service_1.prisma.document.update({
                where: { id: documentId },
                data: { folder: 'APPROVED' }
            });
            // Check in document in SharePoint
            await sharepoint_1.driveService.checkinDocument(document.spItemId, userId, comment || 'Document approved');
            // Create TimelineEvent
            await prisma_service_1.prisma.timelineEvent.create({
                data: {
                    caseId: document.caseId,
                    userId: userId,
                    eventType: 'CONTRACT_APPROVED',
                    type: 'CONTRACT_APPROVED',
                    payload: {
                        documentId,
                        fileName: document.fileName,
                        comment
                    }
                }
            });
            // Update Case status to APPROVED
            await prisma_service_1.prisma.case.update({
                where: { id: document.caseId },
                data: { status: 'APPROVED' }
            });
            return true;
        }
        catch (error) {
            console.error('Error approving document:', error);
            return false;
        }
    }
    /**
     * Reject document - moves back to DRAFTS folder, updates Case status
     */
    async rejectDocument(documentId, userId, reason) {
        try {
            const document = await prisma_service_1.prisma.document.findUnique({
                where: { id: documentId }
            });
            if (!document) {
                throw new Error('Document not found');
            }
            // Update document folder back to DRAFTS
            await prisma_service_1.prisma.document.update({
                where: { id: documentId },
                data: { folder: 'DRAFTS' }
            });
            // Create TimelineEvent
            await prisma_service_1.prisma.timelineEvent.create({
                data: {
                    caseId: document.caseId,
                    userId: userId,
                    eventType: 'CONTRACT_REJECTED',
                    type: 'CONTRACT_REJECTED',
                    payload: {
                        documentId,
                        fileName: document.fileName,
                        reason
                    }
                }
            });
            // Update Case status to DRAFT (back to drafting)
            await prisma_service_1.prisma.case.update({
                where: { id: document.caseId },
                data: { status: 'DRAFT' }
            });
            return true;
        }
        catch (error) {
            console.error('Error rejecting document:', error);
            return false;
        }
    }
    /**
     * Get document by ID
     */
    async getDocumentById(documentId) {
        const document = await prisma_service_1.prisma.document.findUnique({
            where: { id: documentId }
        });
        if (!document)
            return null;
        return {
            id: document.id,
            caseId: document.caseId,
            fileName: document.fileName,
            documentType: document.documentType,
            spItemId: document.spItemId,
            spWebUrl: document.spPath,
            version: document.version,
            folder: document.folder,
            isLatest: document.isLatest,
            createdAt: document.createdAt,
            updatedAt: document.updatedAt
        };
    }
}
exports.default = new DocumentsService();
//# sourceMappingURL=services.js.map