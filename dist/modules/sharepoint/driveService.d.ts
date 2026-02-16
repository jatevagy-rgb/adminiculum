/**
 * Drive Service
 * SharePoint document library operations via Graph API
 *
 * This is the unified SharePoint service that consolidates all document
 * and folder operations through Microsoft Graph API.
 */
import { SharePointItem, SharePointVersion, UploadOptions, DocumentOperationResult, CaseFolderResult } from './types';
declare class DriveService {
    private siteId;
    private getSiteId;
    /**
     * Upload document to SharePoint
     */
    uploadDocument(options: UploadOptions): Promise<DocumentOperationResult>;
    /**
     * Download document from SharePoint
     */
    downloadDocument(documentId: string): Promise<Buffer | null>;
    /**
     * Get document metadata
     */
    getDocument(documentId: string): Promise<SharePointItem | null>;
    /**
     * Upload new version of document
     */
    uploadNewVersion(documentId: string, content: Buffer | ReadableStream): Promise<DocumentOperationResult>;
    /**
     * Check out document for editing
     */
    checkoutDocument(documentId: string, userId: string): Promise<boolean>;
    /**
     * Check in document after editing
     */
    checkinDocument(documentId: string, _userId: string, comment: string): Promise<boolean>;
    /**
     * Get document versions
     */
    getDocumentVersions(documentId: string): Promise<SharePointVersion[]>;
    /**
     * Create folder structure for a case with 8 subfolders (workflow-aligned)
     */
    createCaseFolders(caseNumber: string, caseName: string): Promise<CaseFolderResult | null>;
    /**
     * Check if folder exists
     */
    folderExists(relativePath: string): Promise<boolean>;
    /**
     * Move file to another folder
     */
    moveFile(documentId: string, newFolderPath: string): Promise<SharePointItem | null>;
    /**
     * Save anonymized document
     */
    saveAnonymizedDocument(caseNumber: string, originalFileName: string, content: Buffer): Promise<DocumentOperationResult>;
    /**
     * List anonymized documents for a case
     */
    listAnonymizedDocuments(caseNumber: string): Promise<SharePointItem[]>;
    /**
     * Search documents in case folder
     */
    searchDocuments(query: string): Promise<SharePointItem[]>;
    /**
     * Get all documents in case folder
     */
    getCaseDocuments(caseId: string, folder?: string): Promise<SharePointItem[]>;
    /**
     * Delete document from SharePoint
     */
    deleteDocument(documentId: string): Promise<boolean>;
}
declare const _default: DriveService;
export default _default;
//# sourceMappingURL=driveService.d.ts.map