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
  /**
   * Format-level truth: whether this version's format supports authoritative
   * text extraction (DOCX/PDF/TXT). Derived from the version's own mimeType /
   * filename only — never from SharePoint or comparison metadata. Actual
   * comparison/reader success additionally requires the exact stored bytes to
   * be downloadable; this flag exists so callers stop guessing comparability
   * from incidental metadata.
   */
  textExtractable: boolean;
}

/**
 * Version-bound extracted text DTO. `text` is derived from the exact immutable
 * DocumentVersion's stored bytes — never from the document workspace text or
 * another version. `reasonCode`/`unavailableReason` are always truthful.
 */
export interface DocumentVersionTextDto {
  documentId: string;
  versionId: string;
  versionNumber: number;
  source: 'UPLOADED';
  text: string;
  format?: string;
  pageCount?: number;
  extractedAt?: string;
  reasonCode?: string;
  unavailableReason?: string;
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
