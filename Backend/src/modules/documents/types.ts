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
  fileName: string | null;
  documentType: string;
  spItemId: string | null;
  spWebUrl: string | null;
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
  fileName: string | null;
  documentType: string;
  version: string;
  status: string;
  spWebUrl: string | null;
  createdAt: Date;
  updatedAt: Date;
  securityScanStatus: 'PENDING_SCAN' | 'CLEAN' | 'SCAN_FAILED' | 'INFECTED';
}

export interface DocumentVersionDto {
  id: string;
  documentId: string;
  versionNumber: number;
  uploadedBy: {
    id: string;
    name: string;
  };
  uploadedAt: Date;
  originalFileName: string;
  mimeType: string | null;
  size: number | null;
  storageReference: string | null;
  previousVersionId: string | null;
  isCurrent: boolean;
  reviewStatus: string;
  publicationStatus: string;
  uploadSource: string;
  versionType: string;
  securityScanStatus: 'PENDING_SCAN' | 'CLEAN' | 'SCAN_FAILED' | 'INFECTED';
  spItemId: string | null;
  spWebUrl: string | null;
}

export interface DocumentSearchItem {
  id: string;
  caseId: string;
  fileName: string;
  documentType: string;
  caseNumber: string;
  caseTitle: string;
  clientId: string;
  clientName: string;
  updatedAt: Date;
  createdAt: Date;
}

export type DocumentType = 
  | 'CONTRACT'           // Szerződés
  | 'AGREEMENT'          // Megállapodás
  | 'LETTER'            // Levél
  | 'MOTION'            // Beadvány
  | 'RULING'            // Határozat
  | 'EVIDENCE'          // Bizonyíték
  | 'POWER_OF_ATTORNEY' // Meghatalmazás
  | 'OTHER';            // Egyéb

export const DOCUMENT_TYPES = {
  CONTRACT: 'CONTRACT',
  AGREEMENT: 'AGREEMENT',
  LETTER: 'LETTER',
  MOTION: 'MOTION',
  RULING: 'RULING',
  EVIDENCE: 'EVIDENCE',
  POWER_OF_ATTORNEY: 'POWER_OF_ATTORNEY',
  OTHER: 'OTHER',
} as const;

export type SharePointFolderType = 
  | 'Contracts'
  | 'Correspondence'
  | 'CourtDocuments'
  | 'Internal'
  | 'ClientInput'
  | 'Drafts'
  | 'Review'
  | 'Approved'
  | 'Final';

export const FOLDER_BY_DOCUMENT_TYPE: Record<DocumentType, SharePointFolderType> = {
  CONTRACT: 'Contracts',
  AGREEMENT: 'Contracts',
  LETTER: 'Correspondence',
  MOTION: 'CourtDocuments',
  RULING: 'CourtDocuments',
  EVIDENCE: 'CourtDocuments',
  POWER_OF_ATTORNEY: 'Internal',
  OTHER: 'Internal',
};
