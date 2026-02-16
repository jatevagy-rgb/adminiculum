/**
 * Document Types
 * Document management with SharePoint integration
 */
export interface CreateDocumentInput {
    caseId: string;
    fileName: string;
    fileContent: Buffer;
    mimeType: string;
    documentType: DocumentType;
    folder?: SharePointFolderType;
    createdById: string;
}
export interface DocumentResponse {
    id: string;
    caseId: string;
    fileName: string;
    documentType: string;
    spItemId: string;
    spWebUrl: string;
    version: string;
    status: string;
    createdAt: Date;
    updatedAt: Date;
    createdBy: {
        id: string;
        name: string;
    };
}
export interface DocumentListItem {
    id: string;
    fileName: string;
    documentType: string;
    version: string;
    status: string;
    spWebUrl: string;
    createdAt: Date;
    updatedAt: Date;
}
export type DocumentType = 'CONTRACT' | 'AGREEMENT' | 'LETTER' | 'MOTION' | 'RULING' | 'EVIDENCE' | 'POWER_OF_ATTORNEY' | 'OTHER';
export declare const DOCUMENT_TYPES: {
    readonly CONTRACT: "CONTRACT";
    readonly AGREEMENT: "AGREEMENT";
    readonly LETTER: "LETTER";
    readonly MOTION: "MOTION";
    readonly RULING: "RULING";
    readonly EVIDENCE: "EVIDENCE";
    readonly POWER_OF_ATTORNEY: "POWER_OF_ATTORNEY";
    readonly OTHER: "OTHER";
};
export type SharePointFolderType = 'Contracts' | 'Correspondence' | 'CourtDocuments' | 'Internal' | 'ClientInput' | 'Drafts' | 'Review' | 'Approved' | 'Final';
export declare const FOLDER_BY_DOCUMENT_TYPE: Record<DocumentType, SharePointFolderType>;
//# sourceMappingURL=types.d.ts.map