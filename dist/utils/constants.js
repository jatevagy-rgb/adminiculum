/**
 * Adminiculum Backend V2 - Constants
 * Role definitions, permissions, and workflow states
 * Matching Prisma schema V2 enums
 */
// ============================================================================
// USER ROLES
// ============================================================================
export const ROLES = {
    LAWYER: 'LAWYER', // Ügyvéd
    COLLAB_LAWYER: 'COLLAB_LAWYER', // Együttműködő ügyvéd
    TRAINEE: 'TRAINEE', // Ügyvédjelölt
    LEGAL_ASSISTANT: 'LEGAL_ASSISTANT', // Jogi asszisztens
    ADMIN: 'ADMIN' // Adminisztrátor
};
// Role hierarchy for authorization
export const ROLE_HIERARCHY = {
    [ROLES.LAWYER]: 4,
    [ROLES.COLLAB_LAWYER]: 3,
    [ROLES.TRAINEE]: 2,
    [ROLES.LEGAL_ASSISTANT]: 1,
    [ROLES.ADMIN]: 5
};
// Role names for display
export const ROLE_NAMES = {
    [ROLES.LAWYER]: 'Ügyvéd',
    [ROLES.COLLAB_LAWYER]: 'Együttműködő ügyvéd',
    [ROLES.TRAINEE]: 'Ügyvédjelölt',
    [ROLES.LEGAL_ASSISTANT]: 'Jogi asszisztens',
    [ROLES.ADMIN]: 'Adminisztrátor'
};
// ============================================================================
// CASE STATUS (Workflow)
// ============================================================================
export const CASE_STATUS = {
    CLIENT_INPUT: 'CLIENT_INPUT', // Ügyfél adatok regisztrálva
    DRAFT: 'DRAFT', // Tervezet készül
    IN_REVIEW: 'IN_REVIEW', // Review alatt
    APPROVED: 'APPROVED', // Jóváhagyva
    SENT_TO_CLIENT: 'SENT_TO_CLIENT', // Küldve az ügyfélnek
    CLIENT_FEEDBACK: 'CLIENT_FEEDBACK', // Ügyfél visszajelzésére vár
    FINAL: 'FINAL', // Véglegesítve
    CLOSED: 'CLOSED', // Lezárt
    ARCHIVED: 'ARCHIVED' // Archivált
};
// Valid status transitions
export const CASE_WORKFLOW_TRANSITIONS = {
    [CASE_STATUS.CLIENT_INPUT]: [CASE_STATUS.DRAFT],
    [CASE_STATUS.DRAFT]: [CASE_STATUS.IN_REVIEW],
    [CASE_STATUS.IN_REVIEW]: [CASE_STATUS.APPROVED, CASE_STATUS.DRAFT],
    [CASE_STATUS.APPROVED]: [CASE_STATUS.SENT_TO_CLIENT, CASE_STATUS.FINAL],
    [CASE_STATUS.SENT_TO_CLIENT]: [CASE_STATUS.CLIENT_FEEDBACK],
    [CASE_STATUS.CLIENT_FEEDBACK]: [CASE_STATUS.DRAFT, CASE_STATUS.APPROVED],
    [CASE_STATUS.FINAL]: [CASE_STATUS.CLOSED],
    [CASE_STATUS.CLOSED]: [],
    [CASE_STATUS.ARCHIVED]: []
};
// Case status names for display
export const CASE_STATUS_NAMES = {
    [CASE_STATUS.CLIENT_INPUT]: 'Ügyfél adatok',
    [CASE_STATUS.DRAFT]: 'Tervezet',
    [CASE_STATUS.IN_REVIEW]: 'Review',
    [CASE_STATUS.APPROVED]: 'Jóváhagyva',
    [CASE_STATUS.SENT_TO_CLIENT]: 'Ügyfélnek küldve',
    [CASE_STATUS.CLIENT_FEEDBACK]: 'Visszajelzés',
    [CASE_STATUS.FINAL]: 'Végleges',
    [CASE_STATUS.CLOSED]: 'Lezárva',
    [CASE_STATUS.ARCHIVED]: 'Archiválva'
};
// ============================================================================
// MATTER TYPES
// ============================================================================
export const MATTER_TYPE = {
    REAL_ESTATE_SALE: 'REAL_ESTATE_SALE', // Ingatlan adásvétel
    LEASE: 'LEASE', // Bérlet
    EMPLOYMENT: 'EMPLOYMENT', // Munkaszerződés
    CORPORATE: 'CORPORATE', // Cégjogi
    LITIGATION: 'LITIGATION', // Peres
    OTHER: 'OTHER' // Egyéb
};
export const MATTER_TYPE_NAMES = {
    [MATTER_TYPE.REAL_ESTATE_SALE]: 'Ingatlan adásvétel',
    [MATTER_TYPE.LEASE]: 'Bérlet',
    [MATTER_TYPE.EMPLOYMENT]: 'Munkaszerződés',
    [MATTER_TYPE.CORPORATE]: 'Cégjogi',
    [MATTER_TYPE.LITIGATION]: 'Peres',
    [MATTER_TYPE.OTHER]: 'Egyéb'
};
// ============================================================================
// ASSIGNMENT ROLES
// ============================================================================
export const ASSIGNMENT_ROLE = {
    OWNER_LAWYER: 'OWNER_LAWYER', // Ügy tulajdonosa
    COLLABORATING_LAWYER: 'COLLABORATING_LAWYER', // Együttműködő
    TRAINEE: 'TRAINEE', // Ügyvédjelölt
    ASSISTANT: 'ASSISTANT' // Asszisztens
};
// ============================================================================
// DOCUMENT FOLDERS (SharePoint)
// ============================================================================
export const SP_FOLDER = {
    CLIENT_INPUT: 'CLIENT_INPUT', // 01_Client_Input
    DRAFTS: 'DRAFTS', // 02_Drafts
    REVIEW: 'REVIEW', // 03_Review
    APPROVED: 'APPROVED', // 04_Approved
    SENT_TO_CLIENT: 'SENT_TO_CLIENT', // 05_Sent_to_Client
    CLIENT_FEEDBACK: 'CLIENT_FEEDBACK', // 06_Client_Feedback
    FINAL: 'FINAL', // 07_Final
    INTERNAL_NOTES: 'INTERNAL_NOTES' // 08_Internal_Notes
};
// ============================================================================
// TIMELINE EVENT TYPES
// ============================================================================
export const TIMELINE_EVENT = {
    // Case Events
    CASE_CREATED: 'CASE_CREATED',
    CASE_ASSIGNED: 'CASE_ASSIGNED',
    CASE_STATUS_CHANGED: 'CASE_STATUS_CHANGED',
    CASE_COMPLETED: 'CASE_COMPLETED',
    CASE_REOPENED: 'CASE_REOPENED',
    // Document Events
    CLIENT_DATA_REGISTERED: 'CLIENT_DATA_REGISTERED',
    CONTRACT_GENERATED: 'CONTRACT_GENERATED',
    DOCUMENT_UPLOADED: 'DOCUMENT_UPLOADED',
    DOCUMENT_MOVED: 'DOCUMENT_MOVED',
    // Workflow Events
    SENT_TO_REVIEW: 'SENT_TO_REVIEW',
    CONTRACT_APPROVED: 'CONTRACT_APPROVED',
    CONTRACT_REJECTED: 'CONTRACT_REJECTED',
    SENT_TO_CLIENT: 'SENT_TO_CLIENT',
    CLIENT_FEEDBACK_RECEIVED: 'CLIENT_FEEDBACK_RECEIVED',
    // SharePoint Events
    CHECKED_OUT: 'CHECKED_OUT',
    CHECKED_IN: 'CHECKED_IN',
    VERSION_CREATED: 'VERSION_CREATED',
    PERMISSION_GRANTED: 'PERMISSION_GRANTED'
};
// ============================================================================
// MESSAGE TYPES
// ============================================================================
export const MESSAGE_TYPE = {
    SYSTEM_EVENT: 'SYSTEM_EVENT', // Automatikus esemény
    USER_MESSAGE: 'USER_MESSAGE', // Belső üzenet
    REVIEW_NOTE: 'REVIEW_NOTE' // Review megjegyzés
};
// ============================================================================
// PRIORITY
// ============================================================================
export const PRIORITY = {
    LOW: 'LOW',
    MEDIUM: 'MEDIUM',
    HIGH: 'HIGH',
    URGENT: 'URGENT'
};
// ============================================================================
// USER STATUS
// ============================================================================
export const USER_STATUS = {
    ACTIVE: 'ACTIVE',
    INACTIVE: 'INACTIVE',
    SUSPENDED: 'SUSPENDED'
};
// ============================================================================
// PERMISSIONS
// ============================================================================
export const PERMISSIONS = {
    CASE_CREATE: 'case:create',
    CASE_READ: 'case:read',
    CASE_UPDATE: 'case:update',
    CASE_DELETE: 'case:delete',
    CASE_ASSIGN: 'case:assign',
    DOCUMENT_GENERATE: 'document:generate',
    DOCUMENT_APPROVE: 'document:approve',
    DOCUMENT_UPLOAD: 'document:upload',
    USER_MANAGE: 'user:manage',
    SETTINGS_MANAGE: 'settings:manage'
};
// ============================================================================
// PAGINATION
// ============================================================================
export const PAGINATION = {
    DEFAULT_PAGE: 1,
    DEFAULT_LIMIT: 20,
    MAX_LIMIT: 100
};
// ============================================================================
// SKILL NAMES
// ============================================================================
export const SKILLS = {
    LEGAL_ANALYSIS: 'legalAnalysis',
    DRAFTING: 'drafting',
    CLIENT_COMMUNICATION: 'clientCommunication',
    NEGOTIATION: 'negotiation',
    COMPLIANCE: 'compliance',
    RESEARCH: 'research'
};
export const SKILL_NAMES = {
    [SKILLS.LEGAL_ANALYSIS]: 'Jogi elemzés',
    [SKILLS.DRAFTING]: 'Szerződésszerkesztés',
    [SKILLS.CLIENT_COMMUNICATION]: 'Ügyfélkommunikáció',
    [SKILLS.NEGOTIATION]: 'Tárgyalás',
    [SKILLS.COMPLIANCE]: 'Compliance',
    [SKILLS.RESEARCH]: 'Jogszabályfigyelés'
};
//# sourceMappingURL=constants.js.map