/**
 * Documents Service V2 - Integrated with Case + Timeline
 * Document management with SharePoint integration + automatic workflow
 */
import { CreateDocumentInput, DocumentResponse, DocumentListItem } from './types';
declare class DocumentsService {
    /**
     * Create document with SharePoint upload + TimelineEvent + Case update
     */
    createDocument(input: CreateDocumentInput): Promise<DocumentResponse | null>;
    /**
     * Get all documents for a case
     */
    getCaseDocuments(caseId: string): Promise<DocumentListItem[]>;
    /**
     * Upload new version of document
     */
    uploadNewVersion(documentId: string, fileContent: Buffer, userId: string, comment?: string): Promise<DocumentResponse | null>;
    /**
     * Move document to review folder - updates Case status to IN_REVIEW
     */
    submitForReview(documentId: string, userId: string): Promise<boolean>;
    /**
     * Approve document - moves to APPROVED folder, updates Case status to APPROVED
     */
    approveDocument(documentId: string, userId: string, comment?: string): Promise<boolean>;
    /**
     * Reject document - moves back to DRAFTS folder, updates Case status
     */
    rejectDocument(documentId: string, userId: string, reason: string): Promise<boolean>;
    /**
     * Get document by ID
     */
    getDocumentById(documentId: string): Promise<any | null>;
}
declare const _default: DocumentsService;
export default _default;
//# sourceMappingURL=services.d.ts.map