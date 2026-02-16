/**
 * Case Workflow Service V2
 * Manages case status transitions
 * Uses V2 CaseStatus values from Prisma Schema
 */
/**
 * Allowed transitions between case statuses (V2)
 */
export const allowedTransitions = {
    GENERATING: ['IN_PROGRESS'],
    IN_PROGRESS: ['REVIEW'],
    REVIEW: ['CLOSED', 'ARCHIVED'],
    CLOSED: ['ARCHIVED'],
    ARCHIVED: [],
};
/**
 * Check if a status transition is allowed
 */
export function canTransition(from, to) {
    return allowedTransitions[from]?.includes(to) ?? false;
}
/**
 * Get available next statuses for a given current status
 */
export function getAvailableTransitions(currentStatus) {
    return allowedTransitions[currentStatus] ?? [];
}
/**
 * Status display names in Hungarian (V2)
 */
export const statusDisplayNames = {
    GENERATING: 'Generálás folyamatban',
    IN_PROGRESS: 'Aktív ügy',
    REVIEW: 'Felülvizsgálat alatt',
    CLOSED: 'Lezárt',
    ARCHIVED: 'Archivált',
};
/**
 * Status colors for UI (V2)
 */
export const statusColors = {
    GENERATING: '#f59e0b', // Amber
    IN_PROGRESS: '#3b82f6', // Blue
    REVIEW: '#8b5cf6', // Violet
    CLOSED: '#22c55e', // Green
    ARCHIVED: '#64748b', // Slate
};
/**
 * Check if status is terminal (no further transitions)
 */
export function isTerminalStatus(status) {
    return status === 'ARCHIVED' || status === 'CLOSED';
}
/**
 * Map transition events to status changes (V2)
 */
export const transitionEventMap = {
    START_CASE: 'IN_PROGRESS',
    SUBMIT_FOR_REVIEW: 'REVIEW',
    APPROVE: 'CLOSED',
    REJECT: 'IN_PROGRESS',
    CLOSE: 'CLOSED',
    ARCHIVE: 'ARCHIVED',
};
/**
 * Transition event messages in Hungarian
 */
export const transitionMessages = {
    START_CASE: 'Ügy elindítva',
    SUBMIT_FOR_REVIEW: 'Felülvizsgálatra beküldve',
    APPROVE: 'Jóváhagyva',
    REJECT: 'Elutasítva, visszaküldve',
    CLOSE: 'Ügy lezárva',
    ARCHIVE: 'Ügy archiválva',
};
/**
 * Allowed roles for each transition event (V2)
 */
export const transitionRoles = {
    START_CASE: ['TRAINEE', 'LEGAL_ASSISTANT'],
    SUBMIT_FOR_REVIEW: ['TRAINEE', 'LEGAL_ASSISTANT'],
    APPROVE: ['LAWYER', 'COLLAB_LAWYER'],
    REJECT: ['LAWYER', 'COLLAB_LAWYER'],
    CLOSE: ['LAWYER', 'ADMIN'],
    ARCHIVE: ['LAWYER', 'ADMIN'],
};
/**
 * Check if a user role can perform a transition event
 */
export function canPerformTransition(event, role) {
    return transitionRoles[event]?.includes(role) ?? false;
}
/**
 * Validate transition event and return next status
 * Throws error if transition is not allowed
 */
export function validateTransition(currentStatus, event, userRole) {
    // Check if event is valid
    const nextStatus = transitionEventMap[event];
    if (!nextStatus) {
        throw new Error(`Érvénytelen esemény: ${event}`);
    }
    // Check RBAC
    if (!canPerformTransition(event, userRole)) {
        throw new Error(`Nincs jogosultság a ${event} művelethez`);
    }
    // Check if transition is allowed from current status
    if (!canTransition(currentStatus, nextStatus)) {
        throw new Error(`Az ${event} átmenet nem megengedett jelenlegi állapotból (${currentStatus})`);
    }
    return nextStatus;
}
/**
 * Get all available transition events for a given status and role
 */
export function getAvailableEvents(currentStatus, userRole) {
    const nextStatuses = getAvailableTransitions(currentStatus);
    return Object.keys(transitionEventMap).filter(event => {
        const nextStatus = transitionEventMap[event];
        return (nextStatuses.includes(nextStatus) &&
            canPerformTransition(event, userRole));
    });
}
/**
 * Map legacy status to V2 status
 */
export function mapLegacyStatus(legacyStatus) {
    const mapping = {
        CLIENT_REGISTERED: 'IN_PROGRESS',
        DOCUMENT_GENERATED: 'IN_PROGRESS',
        IN_REVIEW: 'REVIEW',
        APPROVED_BY_LAWYER: 'CLOSED',
        CORRECTION_NEEDED: 'IN_PROGRESS',
        SENT_TO_CLIENT: 'IN_PROGRESS',
        CLIENT_FEEDBACK_RECEIVED: 'IN_PROGRESS',
        FINALIZED: 'CLOSED',
    };
    return mapping[legacyStatus] || 'IN_PROGRESS';
}
/**
 * Get all possible statuses for dropdowns
 */
export function getAllStatuses() {
    return ['GENERATING', 'IN_PROGRESS', 'REVIEW', 'CLOSED', 'ARCHIVED'];
}
//# sourceMappingURL=workflow.js.map