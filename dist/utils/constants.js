"use strict";
/**
 * Adminiculum Backend V2 - Constants
 * Role definitions, permissions, and workflow states
 * Matching Prisma schema V2 enums
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.SKILL_NAMES = exports.SKILLS = exports.PAGINATION = exports.PERMISSIONS = exports.USER_STATUS = exports.PRIORITY = exports.MESSAGE_TYPE = exports.TIMELINE_EVENT = exports.SP_FOLDER = exports.ASSIGNMENT_ROLE = exports.MATTER_TYPE_NAMES = exports.MATTER_TYPE = exports.CASE_STATUS_NAMES = exports.CASE_WORKFLOW_TRANSITIONS = exports.CASE_STATUS = exports.ROLE_NAMES = exports.ROLE_HIERARCHY = exports.ROLES = void 0;
// ============================================================================
// USER ROLES
// ============================================================================
exports.ROLES = {
    LAWYER: 'LAWYER', // Ügyvéd
    COLLAB_LAWYER: 'COLLAB_LAWYER', // Együttműködő ügyvéd
    TRAINEE: 'TRAINEE', // Ügyvédjelölt
    LEGAL_ASSISTANT: 'LEGAL_ASSISTANT', // Jogi asszisztens
    ADMIN: 'ADMIN' // Adminisztrátor
};
// Role hierarchy for authorization
exports.ROLE_HIERARCHY = {
    [exports.ROLES.LAWYER]: 4,
    [exports.ROLES.COLLAB_LAWYER]: 3,
    [exports.ROLES.TRAINEE]: 2,
    [exports.ROLES.LEGAL_ASSISTANT]: 1,
    [exports.ROLES.ADMIN]: 5
};
// Role names for display
exports.ROLE_NAMES = {
    [exports.ROLES.LAWYER]: 'Ügyvéd',
    [exports.ROLES.COLLAB_LAWYER]: 'Együttműködő ügyvéd',
    [exports.ROLES.TRAINEE]: 'Ügyvédjelölt',
    [exports.ROLES.LEGAL_ASSISTANT]: 'Jogi asszisztens',
    [exports.ROLES.ADMIN]: 'Adminisztrátor'
};
// ============================================================================
// CASE STATUS (Workflow)
// ============================================================================
exports.CASE_STATUS = {
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
exports.CASE_WORKFLOW_TRANSITIONS = {
    [exports.CASE_STATUS.CLIENT_INPUT]: [exports.CASE_STATUS.DRAFT],
    [exports.CASE_STATUS.DRAFT]: [exports.CASE_STATUS.IN_REVIEW],
    [exports.CASE_STATUS.IN_REVIEW]: [exports.CASE_STATUS.APPROVED, exports.CASE_STATUS.DRAFT],
    [exports.CASE_STATUS.APPROVED]: [exports.CASE_STATUS.SENT_TO_CLIENT, exports.CASE_STATUS.FINAL],
    [exports.CASE_STATUS.SENT_TO_CLIENT]: [exports.CASE_STATUS.CLIENT_FEEDBACK],
    [exports.CASE_STATUS.CLIENT_FEEDBACK]: [exports.CASE_STATUS.DRAFT, exports.CASE_STATUS.APPROVED],
    [exports.CASE_STATUS.FINAL]: [exports.CASE_STATUS.CLOSED],
    [exports.CASE_STATUS.CLOSED]: [],
    [exports.CASE_STATUS.ARCHIVED]: []
};
// Case status names for display
exports.CASE_STATUS_NAMES = {
    [exports.CASE_STATUS.CLIENT_INPUT]: 'Ügyfél adatok',
    [exports.CASE_STATUS.DRAFT]: 'Tervezet',
    [exports.CASE_STATUS.IN_REVIEW]: 'Review',
    [exports.CASE_STATUS.APPROVED]: 'Jóváhagyva',
    [exports.CASE_STATUS.SENT_TO_CLIENT]: 'Ügyfélnek küldve',
    [exports.CASE_STATUS.CLIENT_FEEDBACK]: 'Visszajelzés',
    [exports.CASE_STATUS.FINAL]: 'Végleges',
    [exports.CASE_STATUS.CLOSED]: 'Lezárva',
    [exports.CASE_STATUS.ARCHIVED]: 'Archiválva'
};
// ============================================================================
// MATTER TYPES
// ============================================================================
exports.MATTER_TYPE = {
    REAL_ESTATE_SALE: 'REAL_ESTATE_SALE', // Ingatlan adásvétel
    LEASE: 'LEASE', // Bérlet
    EMPLOYMENT: 'EMPLOYMENT', // Munkaszerződés
    CORPORATE: 'CORPORATE', // Cégjogi
    LITIGATION: 'LITIGATION', // Peres
    OTHER: 'OTHER' // Egyéb
};
exports.MATTER_TYPE_NAMES = {
    [exports.MATTER_TYPE.REAL_ESTATE_SALE]: 'Ingatlan adásvétel',
    [exports.MATTER_TYPE.LEASE]: 'Bérlet',
    [exports.MATTER_TYPE.EMPLOYMENT]: 'Munkaszerződés',
    [exports.MATTER_TYPE.CORPORATE]: 'Cégjogi',
    [exports.MATTER_TYPE.LITIGATION]: 'Peres',
    [exports.MATTER_TYPE.OTHER]: 'Egyéb'
};
// ============================================================================
// ASSIGNMENT ROLES
// ============================================================================
exports.ASSIGNMENT_ROLE = {
    OWNER_LAWYER: 'OWNER_LAWYER', // Ügy tulajdonosa
    COLLABORATING_LAWYER: 'COLLABORATING_LAWYER', // Együttműködő
    TRAINEE: 'TRAINEE', // Ügyvédjelölt
    ASSISTANT: 'ASSISTANT' // Asszisztens
};
// ============================================================================
// DOCUMENT FOLDERS (SharePoint)
// ============================================================================
exports.SP_FOLDER = {
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
exports.TIMELINE_EVENT = {
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
exports.MESSAGE_TYPE = {
    SYSTEM_EVENT: 'SYSTEM_EVENT', // Automatikus esemény
    USER_MESSAGE: 'USER_MESSAGE', // Belső üzenet
    REVIEW_NOTE: 'REVIEW_NOTE' // Review megjegyzés
};
// ============================================================================
// PRIORITY
// ============================================================================
exports.PRIORITY = {
    LOW: 'LOW',
    MEDIUM: 'MEDIUM',
    HIGH: 'HIGH',
    URGENT: 'URGENT'
};
// ============================================================================
// USER STATUS
// ============================================================================
exports.USER_STATUS = {
    ACTIVE: 'ACTIVE',
    INACTIVE: 'INACTIVE',
    SUSPENDED: 'SUSPENDED'
};
// ============================================================================
// PERMISSIONS
// ============================================================================
exports.PERMISSIONS = {
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
exports.PAGINATION = {
    DEFAULT_PAGE: 1,
    DEFAULT_LIMIT: 20,
    MAX_LIMIT: 100
};
// ============================================================================
// SKILL NAMES
// ============================================================================
exports.SKILLS = {
    LEGAL_ANALYSIS: 'legalAnalysis',
    DRAFTING: 'drafting',
    CLIENT_COMMUNICATION: 'clientCommunication',
    NEGOTIATION: 'negotiation',
    COMPLIANCE: 'compliance',
    RESEARCH: 'research'
};
exports.SKILL_NAMES = {
    [exports.SKILLS.LEGAL_ANALYSIS]: 'Jogi elemzés',
    [exports.SKILLS.DRAFTING]: 'Szerződésszerkesztés',
    [exports.SKILLS.CLIENT_COMMUNICATION]: 'Ügyfélkommunikáció',
    [exports.SKILLS.NEGOTIATION]: 'Tárgyalás',
    [exports.SKILLS.COMPLIANCE]: 'Compliance',
    [exports.SKILLS.RESEARCH]: 'Jogszabályfigyelés'
};
//# sourceMappingURL=constants.js.map