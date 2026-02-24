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
export declare const SHAREPOINT_FOLDERS: {
    readonly CONTRACTS: "Contracts";
    readonly CORRESPONDENCE: "Correspondence";
    readonly COURT_DOCUMENTS: "CourtDocuments";
    readonly INTERNAL: "Internal";
    readonly CLIENT_INPUT: "ClientInput";
    readonly DRAFTS: "Drafts";
    readonly REVIEW: "Review";
    readonly APPROVED: "Approved";
    readonly FINAL: "Final";
    readonly WORKFLOW_CLIENT_INPUT: "01_Client_Input";
    readonly WORKFLOW_DRAFTS: "02_Drafts";
    readonly WORKFLOW_REVIEW: "03_Review";
    readonly WORKFLOW_APPROVED: "04_Approved";
    readonly WORKFLOW_SENT_TO_CLIENT: "05_Sent_to_Client";
    readonly WORKFLOW_CLIENT_FEEDBACK: "06_Client_Feedback";
    readonly WORKFLOW_FINAL: "07_Final";
    readonly WORKFLOW_ANONYMIZED: "08_Anonymized";
};
export type SharePointFolderType = typeof SHAREPOINT_FOLDERS[keyof typeof SHAREPOINT_FOLDERS];
export declare const WorkflowToSPFolder: Record<string, string>;
export declare const SPFolderToWorkflow: Record<string, string>;
//# sourceMappingURL=types.d.ts.map