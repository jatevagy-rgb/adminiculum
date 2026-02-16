/**
 * Case Workflow Service V2
 * Manages case status transitions
 * Uses V2 CaseStatus values from Prisma Schema
 */

import { CaseStatus } from '@prisma/client';

// ========================================
// CASE WORKFLOW STATE MACHINE V2
// ========================================

// V2 Case Status values based on the updated schema
export type CaseStatusV2 = 
  | 'GENERATING'
  | 'IN_PROGRESS'
  | 'REVIEW'
  | 'CLOSED'
  | 'ARCHIVED';

/**
 * Allowed transitions between case statuses (V2)
 */
export const allowedTransitions: Record<CaseStatusV2, CaseStatusV2[]> = {
  GENERATING: ['IN_PROGRESS'],
  IN_PROGRESS: ['REVIEW'],
  REVIEW: ['CLOSED', 'ARCHIVED'],
  CLOSED: ['ARCHIVED'],
  ARCHIVED: [],
};

/**
 * Check if a status transition is allowed
 */
export function canTransition(from: CaseStatusV2, to: CaseStatusV2): boolean {
  return allowedTransitions[from]?.includes(to) ?? false;
}

/**
 * Get available next statuses for a given current status
 */
export function getAvailableTransitions(currentStatus: CaseStatusV2): CaseStatusV2[] {
  return allowedTransitions[currentStatus] ?? [];
}

/**
 * Status display names in Hungarian (V2)
 */
export const statusDisplayNames: Record<CaseStatusV2, string> = {
  GENERATING: 'Generálás folyamatban',
  IN_PROGRESS: 'Aktív ügy',
  REVIEW: 'Felülvizsgálat alatt',
  CLOSED: 'Lezárt',
  ARCHIVED: 'Archivált',
};

/**
 * Status colors for UI (V2)
 */
export const statusColors: Record<CaseStatusV2, string> = {
  GENERATING: '#f59e0b',      // Amber
  IN_PROGRESS: '#3b82f6',      // Blue
  REVIEW: '#8b5cf6',           // Violet
  CLOSED: '#22c55e',           // Green
  ARCHIVED: '#64748b',         // Slate
};

/**
 * Check if status is terminal (no further transitions)
 */
export function isTerminalStatus(status: CaseStatusV2): boolean {
  return status === 'ARCHIVED' || status === 'CLOSED';
}

// ========================================
// TRANSITION EVENTS
// ========================================

export type TransitionEvent =
  | 'START_CASE'
  | 'SUBMIT_FOR_REVIEW'
  | 'APPROVE'
  | 'REJECT'
  | 'CLOSE'
  | 'ARCHIVE';

/**
 * Map transition events to status changes (V2)
 */
export const transitionEventMap: Record<TransitionEvent, CaseStatusV2> = {
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
export const transitionMessages: Record<TransitionEvent, string> = {
  START_CASE: 'Ügy elindítva',
  SUBMIT_FOR_REVIEW: 'Felülvizsgálatra beküldve',
  APPROVE: 'Jóváhagyva',
  REJECT: 'Elutasítva, visszaküldve',
  CLOSE: 'Ügy lezárva',
  ARCHIVE: 'Ügy archiválva',
};

// ========================================
// RBAC RULES
// ========================================

export type UserRoleV2 = 'LAWYER' | 'COLLAB_LAWYER' | 'TRAINEE' | 'LEGAL_ASSISTANT' | 'ADMIN';

/**
 * Allowed roles for each transition event (V2)
 */
export const transitionRoles: Record<TransitionEvent, UserRoleV2[]> = {
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
export function canPerformTransition(event: TransitionEvent, role: UserRoleV2): boolean {
  return transitionRoles[event]?.includes(role) ?? false;
}

/**
 * Validate transition event and return next status
 * Throws error if transition is not allowed
 */
export function validateTransition(
  currentStatus: CaseStatusV2,
  event: TransitionEvent,
  userRole: UserRoleV2
): CaseStatusV2 {
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
export function getAvailableEvents(
  currentStatus: CaseStatusV2,
  userRole: UserRoleV2
): TransitionEvent[] {
  const nextStatuses = getAvailableTransitions(currentStatus);
  
  return (Object.keys(transitionEventMap) as TransitionEvent[]).filter(event => {
    const nextStatus = transitionEventMap[event];
    return (
      nextStatuses.includes(nextStatus) &&
      canPerformTransition(event, userRole)
    );
  });
}

/**
 * Map legacy status to V2 status
 */
export function mapLegacyStatus(legacyStatus: string): CaseStatusV2 {
  const mapping: Record<string, CaseStatusV2> = {
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
export function getAllStatuses(): CaseStatusV2[] {
  return ['GENERATING', 'IN_PROGRESS', 'REVIEW', 'CLOSED', 'ARCHIVED'];
}
