/**
 * Centralized portal view support mapping per mode.
 *
 * Every portal view (route) maps to the set of modes that support it.
 * INDIVIDUAL must NOT support contracts, company, leadership, intakes, or
 * new-intake. ORGANIZATION supports everything. CASE_RELAY supports a subset.
 *
 * This module is the single source of truth — tests and guards import from here.
 */

export type PortalMode = 'INDIVIDUAL' | 'ORGANIZATION' | 'CASE_RELAY';

export type PortalView =
  | 'home'
  | 'matters'
  | 'tasks'
  | 'documents'
  | 'messages'
  | 'matter'
  | 'document'
  | 'action'
  | 'intakes'
  | 'new-intake'
  | 'leadership'
  | 'contracts'
  | 'company';

/**
 * The set of views each mode supports.
 *
 * - INDIVIDUAL: core views only (home, matters, tasks, documents, messages,
 *   matter, document, action). No contracts, company, leadership, intakes.
 * - ORGANIZATION: all views.
 * - CASE_RELAY: home (conditional), matters, documents, messages, leadership,
 *   matter, document, action. No contracts, company, intakes, new-intake.
 */
export const VIEWS_BY_MODE: Record<PortalMode, ReadonlySet<PortalView>> = {
  INDIVIDUAL: new Set<PortalView>([
    'home',
    'matters',
    'tasks',
    'documents',
    'messages',
    'matter',
    'document',
    'action',
  ]),
  ORGANIZATION: new Set<PortalView>([
    'home',
    'matters',
    'tasks',
    'documents',
    'messages',
    'matter',
    'document',
    'action',
    'intakes',
    'new-intake',
    'leadership',
    'contracts',
    'company',
  ]),
  CASE_RELAY: new Set<PortalView>([
    'home',
    'matters',
    'documents',
    'messages',
    'matter',
    'document',
    'action',
    'leadership',
  ]),
};

/**
 * Returns true if the given mode supports the given view.
 */
export function isViewSupported(mode: PortalMode, view: PortalView): boolean {
  return VIEWS_BY_MODE[mode].has(view);
}
