/**
 * Server-side safe topic registry for the organizational client compliance portal.
 *
 * Portal exposition is opt-in. Only requirements whose internal `key` appears
 * in SAFE_TOPICS are eligible for client-facing projection. Unknown internal
 * Requirements are silently omitted — they never leak through the portal.
 *
 * DEMO topics are only visible when `NODE_ENV !== 'production'`.
 */

export interface SafeTopicEntry {
  /** Internal Requirement.key — must match the database value exactly. */
  internalKey: string;
  /** Human-readable label shown on the client portal. */
  portalLabel: string;
  /** Optional short explanation shown alongside the topic. */
  shortExplanation?: string;
  /** If true, only visible in non-production (development/demo) environments. */
  demo?: boolean;
}

/**
 * Canonical registry of client-safe compliance topics.
 *
 * Add new entries here when a Requirement should become portal-visible.
 * The registry is the single source of truth for portal exposition.
 */
const SAFE_TOPICS: SafeTopicEntry[] = [
  {
    internalKey: 'GDPR_DATA_PROCESSING',
    portalLabel: 'Adatvédelmi feldolgozás',
    shortExplanation: 'Az adatvédelmi követelmények teljesítése a személyes adatok feldolgozása során.',
  },
  {
    internalKey: 'GDPR_DATA_SUBJECT_RIGHTS',
    portalLabel: 'Érintetti jogok',
    shortExplanation: 'Az adatvédelmi rendelet szerinti érintetti jogok biztosítása.',
  },
  {
    internalKey: 'LABOR_SAFETY_REGULATION',
    portalLabel: 'Munkavédelmi előírások',
    shortExplanation: 'A munkavédelmi jogszabályoknak való megfelelés.',
  },
  {
    internalKey: 'ANTI_MONEY_LAUNDERING',
    portalLabel: 'Pénzmosás megelőzése',
    shortExplanation: 'A pénzmosás és terrorizmus finanszírozása megelőzési követelmények.',
  },
  {
    internalKey: 'DEMO_SAMPLE_TOPIC',
    portalLabel: 'Demó téma',
    shortExplanation: 'Ez egy demó tartalom, amely csak fejlesztési környezetben jelenik meg.',
    demo: true,
  },
];

const DEMO_TOPIC_KEYS = new Set(SAFE_TOPICS.filter((t) => t.demo).map((t) => t.internalKey));
const PRODUCTION_TOPIC_MAP = new Map(SAFE_TOPICS.filter((t) => !t.demo).map((t) => [t.internalKey, t]));
const ALL_TOPIC_MAP = new Map(SAFE_TOPICS.map((t) => [t.internalKey, t]));

/**
 * Returns the set of internal Requirement.keys that are portal-visible
 * in the given environment. DEMO topics are excluded in production.
 */
export function portalVisibleKeys(isProduction: boolean): Set<string> {
  return isProduction ? new Set(PRODUCTION_TOPIC_MAP.keys()) : new Set(ALL_TOPIC_MAP.keys());
}

/**
 * Look up the safe topic entry for an internal Requirement.key.
 * Returns `null` if the key is not registered or is a DEMO key in production.
 */
export function lookupSafeTopic(internalKey: string, isProduction: boolean): SafeTopicEntry | null {
  if (isProduction && DEMO_TOPIC_KEYS.has(internalKey)) return null;
  const map = isProduction ? PRODUCTION_TOPIC_MAP : ALL_TOPIC_MAP;
  return map.get(internalKey) || null;
}

/**
 * Check whether a given internal Requirement.key is portal-visible
 * in the given environment.
 */
export function isPortalVisible(internalKey: string, isProduction: boolean): boolean {
  return lookupSafeTopic(internalKey, isProduction) !== null;
}
