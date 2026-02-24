/**
 * Case Workflow Service V2
 * Manages case status transitions
 * Uses V2 CaseStatus values from Prisma Schema
 */
export type CaseStatusV2 = 'GENERATING' | 'IN_PROGRESS' | 'REVIEW' | 'CLOSED' | 'ARCHIVED';
/**
 * Allowed transitions between case statuses (V2)
 */
export declare const allowedTransitions: Record<CaseStatusV2, CaseStatusV2[]>;
/**
 * Check if a status transition is allowed
 */
export declare function canTransition(from: CaseStatusV2, to: CaseStatusV2): boolean;
/**
 * Get available next statuses for a given current status
 */
export declare function getAvailableTransitions(currentStatus: CaseStatusV2): CaseStatusV2[];
/**
 * Status display names in Hungarian (V2)
 */
export declare const statusDisplayNames: Record<CaseStatusV2, string>;
/**
 * Status colors for UI (V2)
 */
export declare const statusColors: Record<CaseStatusV2, string>;
/**
 * Check if status is terminal (no further transitions)
 */
export declare function isTerminalStatus(status: CaseStatusV2): boolean;
export type TransitionEvent = 'START_CASE' | 'SUBMIT_FOR_REVIEW' | 'APPROVE' | 'REJECT' | 'CLOSE' | 'ARCHIVE';
/**
 * Map transition events to status changes (V2)
 */
export declare const transitionEventMap: Record<TransitionEvent, CaseStatusV2>;
/**
 * Transition event messages in Hungarian
 */
export declare const transitionMessages: Record<TransitionEvent, string>;
export type UserRoleV2 = 'LAWYER' | 'COLLAB_LAWYER' | 'TRAINEE' | 'LEGAL_ASSISTANT' | 'ADMIN';
/**
 * Allowed roles for each transition event (V2)
 */
export declare const transitionRoles: Record<TransitionEvent, UserRoleV2[]>;
/**
 * Check if a user role can perform a transition event
 */
export declare function canPerformTransition(event: TransitionEvent, role: UserRoleV2): boolean;
/**
 * Validate transition event and return next status
 * Throws error if transition is not allowed
 */
export declare function validateTransition(currentStatus: CaseStatusV2, event: TransitionEvent, userRole: UserRoleV2): CaseStatusV2;
/**
 * Get all available transition events for a given status and role
 */
export declare function getAvailableEvents(currentStatus: CaseStatusV2, userRole: UserRoleV2): TransitionEvent[];
/**
 * Map legacy status to V2 status
 */
export declare function mapLegacyStatus(legacyStatus: string): CaseStatusV2;
/**
 * Get all possible statuses for dropdowns
 */
export declare function getAllStatuses(): CaseStatusV2[];
//# sourceMappingURL=workflow.d.ts.map