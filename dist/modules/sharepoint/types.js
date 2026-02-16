/**
 * SharePoint Types
 * TypeScript interfaces for SharePoint Graph API responses
 */
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
};
// Workflow mapping constants
export const WorkflowToSPFolder = {
    'CLIENT_INPUT': '01_Client_Input',
    'DRAFT': '02_Drafts',
    'IN_REVIEW': '03_Review',
    'APPROVED': '04_Approved',
    'SENT_TO_CLIENT': '05_Sent_to_Client',
    'CLIENT_FEEDBACK': '06_Client_Feedback',
    'FINAL': '07_Final',
};
export const SPFolderToWorkflow = {
    '01_Client_Input': 'CLIENT_INPUT',
    '02_Drafts': 'DRAFT',
    '03_Review': 'IN_REVIEW',
    '04_Approved': 'APPROVED',
    '05_Sent_to_Client': 'SENT_TO_CLIENT',
    '06_Client_Feedback': 'CLIENT_FEEDBACK',
    '07_Final': 'FINAL',
};
//# sourceMappingURL=types.js.map