/**
 * Server-side safe topic registry for the organizational client compliance portal.
 *
 * Portal exposition is opt-in. Only requirements whose internal `key` appears
 * in SAFE_TOPICS are eligible for client-facing projection. Unknown internal
 * Requirements are silently omitted — they never leak through the portal.
 *
 * DEMO topics require BOTH non-production environment AND explicit
 * PORTAL_DEMO_ENABLED=true. Production hard-denies DEMO content.
 */

export interface SafeTopicEntry {
  /** Internal Requirement.key — must match the database value exactly. */
  internalKey: string;
  /** Opaque product topic identity shown on the client portal (never a DB id). */
  topicKey: string;
  /** Human-readable label shown on the client portal. */
  portalLabel: string;
  /** Optional short explanation shown alongside the topic. */
  shortExplanation?: string;
  /** If true, only visible when PORTAL_DEMO_ENABLED=true AND non-production. */
  demo?: boolean;
}

/**
 * Canonical registry of client-safe compliance topics.
 *
 * Add new entries here when a Requirement should become portal-visible.
 * The registry is the single source of truth for portal exposition.
 *
 * `topicKey` is the opaque product identity returned as topicId.
 * It must be stable, unique, and never encode internal DB identifiers.
 */
const SAFE_TOPICS: SafeTopicEntry[] = [
  {
    internalKey: 'GDPR_DATA_PROCESSING',
    topicKey: 'portal/gdpr-data-processing',
    portalLabel: 'Adatvédelmi feldolgozás',
    shortExplanation: 'Az adatvédelmi követelmények teljesítése a személyes adatok feldolgozása során.',
  },
  {
    internalKey: 'GDPR_DATA_SUBJECT_RIGHTS',
    topicKey: 'portal/gdpr-data-subject-rights',
    portalLabel: 'Érintetti jogok',
    shortExplanation: 'Az adatvédelmi rendelet szerinti érintetti jogok biztosítása.',
  },
  {
    internalKey: 'LABOR_SAFETY_REGULATION',
    topicKey: 'portal/labor-safety-regulation',
    portalLabel: 'Munkavédelmi előírások',
    shortExplanation: 'A munkavédelmi jogszabályoknak való megfelelés.',
  },
  {
    internalKey: 'ANTI_MONEY_LAUNDERING',
    topicKey: 'portal/anti-money-laundering',
    portalLabel: 'Pénzmosás megelőzése',
    shortExplanation: 'A pénzmosás és terrorizmus finanszírozása megelőzési követelmények.',
  },
  {
    internalKey: 'DEMO_SAMPLE_TOPIC',
    topicKey: 'portal/demo-sample-topic',
    portalLabel: 'Demó téma',
    shortExplanation: 'Ez egy demó tartalom, amely csak fejlesztési környezetben jelenik meg.',
    demo: true,
  },
];

const DEMO_TOPIC_KEYS = new Set(SAFE_TOPICS.filter((t) => t.demo).map((t) => t.internalKey));
const PRODUCTION_TOPIC_MAP = new Map(SAFE_TOPICS.filter((t) => !t.demo).map((t) => [t.internalKey, t]));
const ALL_TOPIC_MAP = new Map(SAFE_TOPICS.map((t) => [t.internalKey, t]));
const KEY_TO_ENTRY = new Map(SAFE_TOPICS.map((t) => [t.internalKey, t]));

/**
 * Returns the set of internal Requirement.keys that are portal-visible
 * in the given environment. DEMO topics are excluded in production
 * or when demo mode is not explicitly enabled.
 */
export function portalVisibleKeys(isProduction: boolean, demoEnabled = false): Set<string> {
  if (isProduction || !demoEnabled) return new Set(PRODUCTION_TOPIC_MAP.keys());
  return new Set(ALL_TOPIC_MAP.keys());
}

/**
 * Look up the safe topic entry for an internal Requirement.key.
 * Returns `null` if the key is not registered, is a DEMO key in production,
 * or is a DEMO key when demo mode is not explicitly enabled.
 */
export function lookupSafeTopic(internalKey: string, isProduction: boolean, demoEnabled = false): SafeTopicEntry | null {
  if (isProduction || !demoEnabled) {
    if (DEMO_TOPIC_KEYS.has(internalKey)) return null;
    return PRODUCTION_TOPIC_MAP.get(internalKey) || null;
  }
  return ALL_TOPIC_MAP.get(internalKey) || null;
}

/**
 * Check whether a given internal Requirement.key is portal-visible
 * in the given environment.
 */
export function isPortalVisible(internalKey: string, isProduction: boolean, demoEnabled = false): boolean {
  return lookupSafeTopic(internalKey, isProduction, demoEnabled) !== null;
}
