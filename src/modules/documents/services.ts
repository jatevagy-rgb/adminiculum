/**
 * Documents Service V2 - Integrated with Case + Timeline
 * Document management with SharePoint integration + automatic workflow
 */

import { prisma } from '../../prisma/prisma.service';
import { driveService } from '../sharepoint';
import { 
  CreateDocumentInput, 
  DocumentResponse, 
  DocumentListItem,
  FOLDER_BY_DOCUMENT_TYPE,
  SharePointFolderType
} from './types';

const DEFAULT_FOLDER: SharePointFolderType = 'Drafts';

// Map document types to SpFolder enum values
const FOLDER_MAP: Record<string, string> = {
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
const STATUS_MAP: Record<string, string> = {
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
  async createDocument(input: CreateDocumentInput): Promise<DocumentResponse | null> {
    try {
      // 1. Verify case exists
      const caseData = await prisma.case.findUnique({
        where: { id: input.caseId }
      });

      if (!caseData) {
        throw new Error('Case not found');
      }

      // 2. Determine SharePoint folder
      const folderType = input.folder || FOLDER_BY_DOCUMENT_TYPE[input.documentType as keyof typeof FOLDER_BY_DOCUMENT_TYPE] || DEFAULT_FOLDER;
      const prismaFolder = (FOLDER_MAP[folderType] || 'DRAFTS') as any;

      // 3. Upload to SharePoint
      const uploadResult = await driveService.uploadDocument({
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
      const document = await prisma.document.create({
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
      await prisma.timelineEvent.create({
        data: {
          caseId: input.caseId,
          userId: input.createdById,
          type: 'DOCUMENT_UPLOADED' as any,
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
      await prisma.case.update({
        where: { id: input.caseId },
        data: { status: 'DRAFT' as any }
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
    } catch (error) {
      console.error('Error creating document:', error);
      return null;
    }
  }

  /**
   * Get all documents for a case
   */
  async getCaseDocuments(caseId: string): Promise<DocumentListItem[]> {
    const documents = await prisma.document.findMany({
      where: { caseId },
      orderBy: { createdAt: 'desc' }
    });

    return documents.map((doc: any) => ({
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
  async uploadNewVersion(
    documentId: string,
    fileContent: Buffer,
    userId: string,
    comment?: string
  ): Promise<DocumentResponse | null> {
    try {
      const document = await prisma.document.findUnique({
        where: { id: documentId }
      });

      if (!document) {
        throw new Error('Document not found');
      }

      // Upload new version to SharePoint
      const uploadResult = await driveService.uploadNewVersion(
        document.spItemId,
        fileContent
      );

      if (!uploadResult.success) {
        throw new Error(uploadResult.error || 'Version upload failed');
      }

      // Update document record
      const updatedDoc = await prisma.document.update({
        where: { id: documentId },
        data: {
          version: uploadResult.version || document.version || '1',
          updatedAt: new Date()
        }
      });

      // Create TimelineEvent for version
      await prisma.timelineEvent.create({
        data: {
          caseId: document.caseId,
          userId: userId,
          type: 'VERSION_CREATED' as any,
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
    } catch (error) {
      console.error('Error uploading new version:', error);
      return null;
    }
  }

  /**
   * Move document to review folder - updates Case status to IN_REVIEW
   */
  async submitForReview(documentId: string, userId: string): Promise<boolean> {
    try {
      const document = await prisma.document.findUnique({
        where: { id: documentId }
      });

      if (!document) {
        throw new Error('Document not found');
      }

      // Update document folder to REVIEW
      await prisma.document.update({
        where: { id: documentId },
        data: { folder: 'REVIEW' as any }
      });

      // Check out document in SharePoint
      await driveService.checkoutDocument(document.spItemId, userId);

      // Create TimelineEvent
      await prisma.timelineEvent.create({
        data: {
          caseId: document.caseId,
          userId: userId,
          type: 'SENT_TO_REVIEW' as any,
          payload: {
            documentId,
            fileName: document.fileName,
            folder: 'Review'
          }
        }
      });

      // Update Case status to IN_REVIEW
      await prisma.case.update({
        where: { id: document.caseId },
        data: { status: 'IN_REVIEW' as any }
      });

      return true;
    } catch (error) {
      console.error('Error submitting for review:', error);
      return false;
    }
  }

  /**
   * Approve document - moves to APPROVED folder, updates Case status to APPROVED
   */
  async approveDocument(
    documentId: string,
    userId: string,
    comment?: string
  ): Promise<boolean> {
    try {
      const document = await prisma.document.findUnique({
        where: { id: documentId }
      });

      if (!document) {
        throw new Error('Document not found');
      }

      // Update document folder to APPROVED
      await prisma.document.update({
        where: { id: documentId },
        data: { folder: 'APPROVED' as any }
      });

      // Check in document in SharePoint
      await driveService.checkinDocument(document.spItemId, userId, comment || 'Document approved');

      // Create TimelineEvent
      await prisma.timelineEvent.create({
        data: {
          caseId: document.caseId,
          userId: userId,
          type: 'CONTRACT_APPROVED' as any,
          payload: {
            documentId,
            fileName: document.fileName,
            comment
          }
        }
      });

      // Update Case status to APPROVED
      await prisma.case.update({
        where: { id: document.caseId },
        data: { status: 'APPROVED' as any }
      });

      return true;
    } catch (error) {
      console.error('Error approving document:', error);
      return false;
    }
  }

  /**
   * Reject document - moves back to DRAFTS folder, updates Case status
   */
  async rejectDocument(
    documentId: string,
    userId: string,
    reason: string
  ): Promise<boolean> {
    try {
      const document = await prisma.document.findUnique({
        where: { id: documentId }
      });

      if (!document) {
        throw new Error('Document not found');
      }

      // Update document folder back to DRAFTS
      await prisma.document.update({
        where: { id: documentId },
        data: { folder: 'DRAFTS' as any }
      });

      // Create TimelineEvent
      await prisma.timelineEvent.create({
        data: {
          caseId: document.caseId,
          userId: userId,
          type: 'CONTRACT_REJECTED' as any,
          payload: {
            documentId,
            fileName: document.fileName,
            reason
          }
        }
      });

      // Update Case status to DRAFT (back to drafting)
      await prisma.case.update({
        where: { id: document.caseId },
        data: { status: 'DRAFT' as any }
      });

      return true;
    } catch (error) {
      console.error('Error rejecting document:', error);
      return false;
    }
  }

  /**
   * Get document by ID
   */
  async getDocumentById(documentId: string): Promise<any | null> {
    const document = await prisma.document.findUnique({
      where: { id: documentId }
    });

    if (!document) return null;

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

export default new DocumentsService();
