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
