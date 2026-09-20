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
    internalKey: 'GDPR_GENERAL_SCOPE',
    topicKey: 'portal/gdpr-general-scope',
    portalLabel: 'Általános adatvédelem',
    shortExplanation: 'A személyes adatok kezelésére vonatkozó alapvető adatvédelmi követelmények.',
  },
  {
    internalKey: 'GDPR_ELEVATED_RISK_DPIA_DPO',
    topicKey: 'portal/gdpr-elevated-risk',
    portalLabel: 'Fokozott adatvédelmi kockázat',
    shortExplanation: 'A magas kockázatú adatkezeléshez kapcsolódó hatásvizsgálati és adatvédelmi tisztviselői követelmények.',
  },
  {
    internalKey: 'WHISTLEBLOWING_INTERNAL_CHANNEL',
    topicKey: 'portal/whistleblowing-internal-channel',
    portalLabel: 'Belső visszaélés-bejelentés',
    shortExplanation: 'A belső visszaélés-bejelentési csatorna működtetésére vonatkozó követelmények.',
  },
  {
    internalKey: 'NIS2_ORGANISATION_SCOPE',
    topicKey: 'portal/nis2-organisation-scope',
    portalLabel: 'Kiberbiztonsági (NIS2) hatály',
    shortExplanation: 'A szervezet kiberbiztonsági szabályozás alá tartozásának vizsgálata.',
  },
  {
    internalKey: 'NIS2_SECURITY_CONTROLS',
    topicKey: 'portal/nis2-security-controls',
    portalLabel: 'Kiberbiztonsági intézkedések',
    shortExplanation: 'A kritikus informatikai rendszerekhez kapcsolódó kockázatkezelési és incidenskezelési intézkedések.',
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
const SAFE_CONTROL_LABELS = new Map<string, string>([
  ['GDPR_DATA_PROCESSING_CONTROL', 'Adatvédelmi intézkedés'],
  ['C-DATA-001', 'Adatkezelési nyilvántartás és jogalap-mátrix'],
  ['C-DATA-002', 'Adatkezelési tájékoztató'],
  ['C-DATA-003', 'Adatvédelmi hatásvizsgálat / DPO'],
  ['C-CYBER-001', 'Kiberkockázat-kezelési keret'],
  ['C-CYBER-002', 'Incidenskezelési folyamat'],
  ['C-WB-001', 'Belső visszaélés-bejelentési csatorna'],
]);

/**
 * Opaque, stable, customer-safe identity for each control that may cross the
 * portal boundary. Mirrors SAFE_TOPICS.topicKey: a product identity that is
 * neither the internal ControlDefinition key nor the customer-visible display
 * label, so canonical identity/dedup can never depend on display text.
 * Every key present in SAFE_CONTROL_LABELS must have exactly one ref.
 */
const SAFE_CONTROL_REFS = new Map<string, string>([
  ['GDPR_DATA_PROCESSING_CONTROL', 'data-processing'],
  ['C-DATA-001', 'processing-register'],
  ['C-DATA-002', 'privacy-notices'],
  ['C-DATA-003', 'impact-assessment'],
  ['C-CYBER-001', 'risk-framework'],
  ['C-CYBER-002', 'incident-response'],
  ['C-WB-001', 'reporting-channel'],
]);

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

export function lookupSafeControlLabel(controlKey: string): string | null {
  return SAFE_CONTROL_LABELS.get(controlKey) || null;
}

/**
 * Opaque, stable customer-safe identity for a control key. Never the internal
 * key and never display text. Returns `null` when the control is not declared
 * customer-safe, so callers can fail closed.
 */
export function lookupSafeControlRef(controlKey: string): string | null {
  return SAFE_CONTROL_REFS.get(controlKey) || null;
}
