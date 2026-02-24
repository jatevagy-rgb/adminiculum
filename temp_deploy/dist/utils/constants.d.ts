/**
 * Adminiculum Backend V2 - Constants
 * Role definitions, permissions, and workflow states
 * Matching Prisma schema V2 enums
 */
export declare const ROLES: {
    readonly LAWYER: "LAWYER";
    readonly COLLAB_LAWYER: "COLLAB_LAWYER";
    readonly TRAINEE: "TRAINEE";
    readonly LEGAL_ASSISTANT: "LEGAL_ASSISTANT";
    readonly ADMIN: "ADMIN";
};
export type Role = typeof ROLES[keyof typeof ROLES];
export declare const ROLE_HIERARCHY: Record<Role, number>;
export declare const ROLE_NAMES: Record<Role, string>;
export declare const CASE_STATUS: {
    readonly CLIENT_INPUT: "CLIENT_INPUT";
    readonly DRAFT: "DRAFT";
    readonly IN_REVIEW: "IN_REVIEW";
    readonly APPROVED: "APPROVED";
    readonly SENT_TO_CLIENT: "SENT_TO_CLIENT";
    readonly CLIENT_FEEDBACK: "CLIENT_FEEDBACK";
    readonly FINAL: "FINAL";
    readonly CLOSED: "CLOSED";
    readonly ARCHIVED: "ARCHIVED";
};
export type CaseStatus = typeof CASE_STATUS[keyof typeof CASE_STATUS];
export declare const CASE_WORKFLOW_TRANSITIONS: Record<CaseStatus, CaseStatus[]>;
export declare const CASE_STATUS_NAMES: Record<CaseStatus, string>;
export declare const MATTER_TYPE: {
    readonly REAL_ESTATE_SALE: "REAL_ESTATE_SALE";
    readonly LEASE: "LEASE";
    readonly EMPLOYMENT: "EMPLOYMENT";
    readonly CORPORATE: "CORPORATE";
    readonly LITIGATION: "LITIGATION";
    readonly OTHER: "OTHER";
};
export type MatterType = typeof MATTER_TYPE[keyof typeof MATTER_TYPE];
export declare const MATTER_TYPE_NAMES: Record<MatterType, string>;
export declare const ASSIGNMENT_ROLE: {
    readonly OWNER_LAWYER: "OWNER_LAWYER";
    readonly COLLABORATING_LAWYER: "COLLABORATING_LAWYER";
    readonly TRAINEE: "TRAINEE";
    readonly ASSISTANT: "ASSISTANT";
};
export type AssignmentRole = typeof ASSIGNMENT_ROLE[keyof typeof ASSIGNMENT_ROLE];
export declare const SP_FOLDER: {
    readonly CLIENT_INPUT: "CLIENT_INPUT";
    readonly DRAFTS: "DRAFTS";
    readonly REVIEW: "REVIEW";
    readonly APPROVED: "APPROVED";
    readonly SENT_TO_CLIENT: "SENT_TO_CLIENT";
    readonly CLIENT_FEEDBACK: "CLIENT_FEEDBACK";
    readonly FINAL: "FINAL";
    readonly INTERNAL_NOTES: "INTERNAL_NOTES";
};
export type SpFolder = typeof SP_FOLDER[keyof typeof SP_FOLDER];
export declare const TIMELINE_EVENT: {
    readonly CASE_CREATED: "CASE_CREATED";
    readonly CASE_ASSIGNED: "CASE_ASSIGNED";
    readonly CASE_STATUS_CHANGED: "CASE_STATUS_CHANGED";
    readonly CASE_COMPLETED: "CASE_COMPLETED";
    readonly CASE_REOPENED: "CASE_REOPENED";
    readonly CLIENT_DATA_REGISTERED: "CLIENT_DATA_REGISTERED";
    readonly CONTRACT_GENERATED: "CONTRACT_GENERATED";
    readonly DOCUMENT_UPLOADED: "DOCUMENT_UPLOADED";
    readonly DOCUMENT_MOVED: "DOCUMENT_MOVED";
    readonly SENT_TO_REVIEW: "SENT_TO_REVIEW";
    readonly CONTRACT_APPROVED: "CONTRACT_APPROVED";
    readonly CONTRACT_REJECTED: "CONTRACT_REJECTED";
    readonly SENT_TO_CLIENT: "SENT_TO_CLIENT";
    readonly CLIENT_FEEDBACK_RECEIVED: "CLIENT_FEEDBACK_RECEIVED";
    readonly CHECKED_OUT: "CHECKED_OUT";
    readonly CHECKED_IN: "CHECKED_IN";
    readonly VERSION_CREATED: "VERSION_CREATED";
    readonly PERMISSION_GRANTED: "PERMISSION_GRANTED";
};
export type TimelineEventType = typeof TIMELINE_EVENT[keyof typeof TIMELINE_EVENT];
export declare const MESSAGE_TYPE: {
    readonly SYSTEM_EVENT: "SYSTEM_EVENT";
    readonly USER_MESSAGE: "USER_MESSAGE";
    readonly REVIEW_NOTE: "REVIEW_NOTE";
};
export type MessageType = typeof MESSAGE_TYPE[keyof typeof MESSAGE_TYPE];
export declare const PRIORITY: {
    readonly LOW: "LOW";
    readonly MEDIUM: "MEDIUM";
    readonly HIGH: "HIGH";
    readonly URGENT: "URGENT";
};
export type Priority = typeof PRIORITY[keyof typeof PRIORITY];
export declare const USER_STATUS: {
    readonly ACTIVE: "ACTIVE";
    readonly INACTIVE: "INACTIVE";
    readonly SUSPENDED: "SUSPENDED";
};
export type UserStatus = typeof USER_STATUS[keyof typeof USER_STATUS];
export declare const PERMISSIONS: {
    readonly CASE_CREATE: "case:create";
    readonly CASE_READ: "case:read";
    readonly CASE_UPDATE: "case:update";
    readonly CASE_DELETE: "case:delete";
    readonly CASE_ASSIGN: "case:assign";
    readonly DOCUMENT_GENERATE: "document:generate";
    readonly DOCUMENT_APPROVE: "document:approve";
    readonly DOCUMENT_UPLOAD: "document:upload";
    readonly USER_MANAGE: "user:manage";
    readonly SETTINGS_MANAGE: "settings:manage";
};
export declare const PAGINATION: {
    DEFAULT_PAGE: number;
    DEFAULT_LIMIT: number;
    MAX_LIMIT: number;
};
export declare const SKILLS: {
    readonly LEGAL_ANALYSIS: "legalAnalysis";
    readonly DRAFTING: "drafting";
    readonly CLIENT_COMMUNICATION: "clientCommunication";
    readonly NEGOTIATION: "negotiation";
    readonly COMPLIANCE: "compliance";
    readonly RESEARCH: "research";
};
export type SkillName = typeof SKILLS[keyof typeof SKILLS];
export declare const SKILL_NAMES: Record<SkillName, string>;
//# sourceMappingURL=constants.d.ts.map