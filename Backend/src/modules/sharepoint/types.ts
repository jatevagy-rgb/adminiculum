/**
 * SharePoint Types
 * TypeScript interfaces for SharePoint Graph API responses
 */

export interface SharePointConfig {
  clientId: string;
  clientSecret: string;
  tenantId: string;
  redirectUri: string;
  siteId: string;
  driveId: string;
}

export interface SharePointSite {
  id: string;
  name: string;
  displayName: string;
  webUrl: string;
  description?: string;
}

export interface SharePointDrive {
  id: string;
  name: string;
  webUrl: string;
  driveType: string;
  createdDateTime: string;
  lastModifiedDateTime: string;
}

export interface SharePointItem {
  id: string;
  name: string;
  webUrl: string;
  createdDateTime: string;
  lastModifiedDateTime: string;
  size: number;
  createdBy: {
    user: {
      id: string;
      displayName: string;
      email?: string;
    };
  };
  lastModifiedBy: {
    user: {
      id: string;
      displayName: string;
      email?: string;
    };
  };
  folder?: {
    childCount: number;
  };
  file?: {
    mimeType: string;
    hashes?: {
      sha256Hash: string;
    };
    versions?: {
      count: number;
      current?: {
        id: string;
      };
    };
  };
  checkedOut?: {
    user: {
      id: string;
      displayName: string;
    };
  };
}

export interface SharePointVersion {
  id: string;
  lastModifiedDateTime: string;
  lastModifiedBy: {
    user: {
      displayName: string;
      email?: string;
    };
  };
  size: number;
}

export interface SharePointPermission {
  id: string;
  roles: string[];
  grantedToV2?: {
    users?: Array<{
      id: string;
      displayName: string;
      email?: string;
    }>;
    groups?: Array<{
      id: string;
      displayName: string;
    }>;
  };
  link?: {
    scope: string;
    type: string;
    webUrl: string;
  };
}

export interface UploadOptions {
  caseId: string;
  fileName: string;
  content: Buffer | ReadableStream;
  mimeType: string;
  folder?: string;
  conflictBehavior?: 'fail' | 'rename' | 'replace';
}

export interface CreateFolderOptions {
  caseId: string;
  folderName: string;
  parentPath?: string;
}

export interface DocumentOperationResult {
  success: boolean;
  item?: SharePointItem;
  error?: string;
  version?: string;
  webUrl?: string;
}

export interface CaseFolderStructure {
  caseId: string;
  caseName: string;
  folders: SharePointItem[];
}

export interface CaseFolderResult {
  mainFolder: SharePointItem;
  subfolders: SharePointItem[];
  path: string;
}

export const SHAREPOINT_FOLDERS = {
  CONTRACTS: 'Contracts',
  CORRESPONDENCE: 'Correspondence',
  COURT_DOCUMENTS: 'CourtDocuments',
  INTERNAL: 'Internal',
  CLIENT_INPUT: 'ClientInput',
  DRAFTS: 'Drafts',
  REVIEW: 'Review',
  APPROVED: 'Approved',
  FINAL: 'Final',
  // Workflow-aligned folder names
  WORKFLOW_CLIENT_INPUT: '01_Client_Input',
  WORKFLOW_DRAFTS: '02_Drafts',
  WORKFLOW_REVIEW: '03_Review',
  WORKFLOW_APPROVED: '04_Approved',
  WORKFLOW_SENT_TO_CLIENT: '05_Sent_to_Client',
  WORKFLOW_CLIENT_FEEDBACK: '06_Client_Feedback',
  WORKFLOW_FINAL: '07_Final',
  WORKFLOW_ANONYMIZED: '08_Anonymized',
} as const;

export type SharePointFolderType = typeof SHAREPOINT_FOLDERS[keyof typeof SHAREPOINT_FOLDERS];

// Workflow mapping constants
export const WorkflowToSPFolder: Record<string, string> = {
  'CLIENT_INPUT': '01_Client_Input',
  'DRAFT': '02_Drafts',
  'IN_REVIEW': '03_Review',
  'APPROVED': '04_Approved',
  'SENT_TO_CLIENT': '05_Sent_to_Client',
  'CLIENT_FEEDBACK': '06_Client_Feedback',
  'FINAL': '07_Final',
};

export const SPFolderToWorkflow: Record<string, string> = {
  '01_Client_Input': 'CLIENT_INPUT',
  '02_Drafts': 'DRAFT',
  '03_Review': 'IN_REVIEW',
  '04_Approved': 'APPROVED',
  '05_Sent_to_Client': 'SENT_TO_CLIENT',
  '06_Client_Feedback': 'CLIENT_FEEDBACK',
  '07_Final': 'FINAL',
};
