import { GROW_ASSESSMENT_SCHEMA, evaluateAssessmentAnswers } from '../assessments/registry';

/**
 * GROW — fail-closed Observation → GrowSignal normalization boundary.
 *
 * The Company Observatory stores canonical observations (tenant scope, source
 * connection, discovery run, canonical digest, idempotency, raw payload,
 * observation type, provenance). Grow research must consume that canonical
 * storage WITHOUT owning source-specific parsing logic. This module is that
 * single, reusable, pure boundary.
 *
 * Contract:
 * - PURE: no database, no clock, no side effects. Callers pass a plain
 *   observation-shaped record and receive zero or more GrowSignals.
 * - FAIL-CLOSED: anything the current canonical producer contract does not
 *   explicitly support yields NO signal. Never guess business meaning from
 *   arbitrary JSON.
 * - NO PERSISTENCE: there is deliberately no GrowSignal table and no schema
 *   change. A GrowSignal is an internal, reconstructible projection.
 * - Single source of truth for the survey category → problem domain mapping.
 *   The research service re-exports SURVEY_CATEGORY_TO_DOMAIN for backward
 *   compatibility; there is exactly one map.
 */

/**
 * The only source that is authoritative today. DECLARED_SURVEY observations are
 * produced by the canonical survey intake (company-observatory/intake.ts) with a
 * deterministic payload shape. Every other ObservationType is intentionally not
 * normalized here:
 * - GENERIC_RECORD / PERSON_RECORD / VENDOR_RECORD / DOCUMENT_RECORD /
 *   SYSTEM_RECORD / FACT_RECORD have no trustworthy Grow semantics and must not
 *   be inferred from arbitrary JSON.
 * - PROCESS_RECORD / PROCESS_STEP_RECORD are not normalized because no
 *   deterministic producer contract exists yet; measured process state flows
 *   through ProcessObservationSnapshot instead.
 */
export const DECLARED_SURVEY_OBSERVATION_TYPE = 'DECLARED_SURVEY';

/** Marker written by the canonical structured survey intake producer. */
export const GROW_PAIN_INTAKE_KIND = 'GROW_PAIN_INTAKE';

/**
 * Marker written by the customer Grow assessment intake producer.
 *
 * Assessment observations are normalized ONLY through explicit, registry-owned
 * finding rules whose `surveyCategoryKey` references the canonical map below.
 * There is no raw-payload guessing and no GENERAL_FLOW fallback: an assessment
 * finding without a canonical category never produces a Grow signal.
 */
export { GROW_ASSESSMENT_SCHEMA };

/**
 * Canonical declared-survey category keys. This is the single, exhaustive
 * vocabulary the fail-closed normalizer accepts; assessment finding rules may
 * only reference one of these keys (see assessments/registry.ts).
 */
export const SURVEY_CATEGORY_KEYS = [
  'MANUAL_ADMIN',
  'SLOW_APPROVAL',
  'DUPLICATE_DATA',
  'TOO_MANY_SYSTEMS',
  'UNCLEAR_OWNERSHIP',
  'REWORK',
  'UNMEASURED_COST',
  'GENERAL_CONCERN',
] as const;
export type SurveyCategoryKey = (typeof SURVEY_CATEGORY_KEYS)[number];

/**
 * Canonical survey category → Grow problem domain.
 *
 * This is the exact mapping already used by the Grow research engine, moved
 * here so the normalizer is the single owner. Keys not present in this map are
 * UNKNOWN and produce no signal (fail-closed); there is no silent GENERAL_FLOW
 * fallback.
 */
export const SURVEY_CATEGORY_TO_DOMAIN: Readonly<Record<string, string>> = Object.freeze({
  MANUAL_ADMIN: 'MANUAL_ADMIN_LOAD',
  SLOW_APPROVAL: 'APPROVAL_DELAY',
  DUPLICATE_DATA: 'DUPLICATE_DATA_ENTRY',
  TOO_MANY_SYSTEMS: 'SYSTEM_SWITCHING',
  UNCLEAR_OWNERSHIP: 'UNCLEAR_OWNERSHIP',
  REWORK: 'REWORK',
  UNMEASURED_COST: 'UNMEASURED_COST',
  GENERAL_CONCERN: 'GENERAL_FLOW',
});

/** Bounded, safe metadata only. No raw payload, tokens or secrets. */
export interface GrowSignalProvenance {
  /** Canonical survey category key (e.g. REWORK), when applicable. */
  categoryKey?: string;
  /** Provenance channel declared by the producer, when present. */
  channel?: string | null;
  /** Canonical source record reference, when present. */
  sourceRecordId?: string | null;
}

/**
 * Internal, non-persisted projection of a canonical observation into a Grow
 * signal. `measured` is always false here: measured inputs arrive through the
 * ProcessObservationSnapshot path and must never be collapsed with declared
 * provenance.
 */
export interface GrowSignal {
  domainKey: string;
  observationId: string;
  sourceKind: string;
  businessProcessId: string | null;
  observedAt: Date;
  declared: boolean;
  measured: boolean;
  provenance: GrowSignalProvenance;
}

/** Minimal observation-shaped input; decoupled from the Prisma model type. */
export interface NormalizableObservation {
  id: string;
  observationType: string;
  rawPayload: unknown;
  observedAt: Date;
  sourceRecordId?: string | null;
}

function readProvenanceChannel(record: Record<string, unknown>): string | null {
  const provenance = record.provenance;
  if (provenance === null || typeof provenance !== 'object' || Array.isArray(provenance)) return null;
  const channel = (provenance as Record<string, unknown>).channel;
  return typeof channel === 'string' && channel.trim() !== '' ? channel.trim() : null;
}

/**
 * Normalizes a GROW_ASSESSMENT_V1 declared observation.
 *
 * Fail-closed:
 * - Unknown pack / unsupported version / invalid or non-exact answer set →
 *   the registry evaluator returns null → [].
 * - Only findings with an explicit canonical `surveyCategoryKey` produce a
 *   signal; the domain is derived from the single SURVEY_CATEGORY_TO_DOMAIN map.
 * - Findings without a canonical category (e.g. strategy/leadership/culture)
 *   remain assessment-level and NEVER enter Grow research. There is no
 *   GENERAL_FLOW fallback.
 * - One signal per canonical category per observation (deterministic dedupe).
 */
function assessmentObservationToGrowSignals(
  observation: NormalizableObservation,
  record: Record<string, unknown>,
): GrowSignal[] {
  const packKey = typeof record.packKey === 'string' ? record.packKey : '';
  const packVersion =
    typeof record.packVersion === 'number' ? record.packVersion : Number(record.packVersion);
  const rawAnswers = record.answers;
  if (!packKey || !Number.isFinite(packVersion) || !Array.isArray(rawAnswers)) return [];

  const answers = rawAnswers
    .filter((a): a is Record<string, unknown> => a !== null && typeof a === 'object' && !Array.isArray(a))
    .map((a) => ({ questionKey: String(a.questionKey ?? ''), answer: String(a.answer ?? '') }));

  const evaluation = evaluateAssessmentAnswers(packKey, packVersion, answers);
  if (!evaluation) return [];

  const businessProcessId =
    typeof record.processId === 'string' && record.processId.trim() !== ''
      ? record.processId.trim()
      : null;
  const channel = readProvenanceChannel(record);

  const signals: GrowSignal[] = [];
  const seenCategories = new Set<string>();
  for (const finding of evaluation.findings) {
    const categoryKey = finding.surveyCategoryKey;
    if (!categoryKey || seenCategories.has(categoryKey)) continue;
    const domainKey = SURVEY_CATEGORY_TO_DOMAIN[categoryKey];
    if (!domainKey) continue; // fail-closed: never guess a domain
    seenCategories.add(categoryKey);
    signals.push({
      domainKey,
      observationId: observation.id,
      sourceKind: DECLARED_SURVEY_OBSERVATION_TYPE,
      businessProcessId,
      observedAt: observation.observedAt,
      declared: true,
      measured: false,
      provenance: {
        categoryKey,
        channel,
        sourceRecordId: observation.sourceRecordId ?? null,
      },
    });
  }

  return signals;
}

/**
 * Normalizes a canonical observation into zero or more Grow signals.
 *
 * Fail-closed rules:
 * - Non-DECLARED_SURVEY observation types → [].
 * - Payload that is not a plain object → [].
 * - GROW_ASSESSMENT_V1 payloads normalize ONLY through the assessments registry
 *   (see assessmentObservationToGrowSignals).
 * - Otherwise the payload must carry the canonical GROW_PAIN_INTAKE marker and
 *   an array `categories`; unknown category keys are skipped (never mapped to
 *   GENERAL_FLOW).
 * - A business process reference is carried only when it is a non-empty string;
 *   tenant validation is the caller's responsibility (see executing research).
 */
export function observationToGrowSignals(observation: NormalizableObservation): GrowSignal[] {
  if (!observation || observation.observationType !== DECLARED_SURVEY_OBSERVATION_TYPE) return [];

  const payload = observation.rawPayload;
  if (payload === null || typeof payload !== 'object' || Array.isArray(payload)) return [];
  const record = payload as Record<string, unknown>;

  if (record.schema === GROW_ASSESSMENT_SCHEMA) {
    return assessmentObservationToGrowSignals(observation, record);
  }

  if (record.kind !== GROW_PAIN_INTAKE_KIND) return [];

  const rawCategories = record.categories;
  if (!Array.isArray(rawCategories)) return [];

  const businessProcessId =
    typeof record.processId === 'string' && record.processId.trim() !== ''
      ? record.processId.trim()
      : null;

  let channel: string | null = null;
  const provenance = record.provenance;
  if (provenance !== null && typeof provenance === 'object' && !Array.isArray(provenance)) {
    const ch = (provenance as Record<string, unknown>).channel;
    if (typeof ch === 'string' && ch.trim() !== '') channel = ch.trim();
  }

  const signals: GrowSignal[] = [];
  for (const rawCategory of rawCategories) {
    const categoryKey = typeof rawCategory === 'string' ? rawCategory.trim().toUpperCase() : '';
    const domainKey = categoryKey ? SURVEY_CATEGORY_TO_DOMAIN[categoryKey] : undefined;
    if (!domainKey) continue; // fail-closed: unknown category yields no signal

    signals.push({
      domainKey,
      observationId: observation.id,
      sourceKind: DECLARED_SURVEY_OBSERVATION_TYPE,
      businessProcessId,
      observedAt: observation.observedAt,
      declared: true,
      measured: false,
      provenance: {
        categoryKey,
        channel,
        sourceRecordId: observation.sourceRecordId ?? null,
      },
    });
  }

  return signals;
}

/**
 * Normalizes many observations, dropping empty results. Convenience for the
 * research engine; intentionally does not depend on the DB client.
 */
export function observationsToGrowSignals(
  observations: readonly NormalizableObservation[],
): GrowSignal[] {
  const out: GrowSignal[] = [];
  for (const observation of observations) out.push(...observationToGrowSignals(observation));
  return out;
}

/**
 * Supersede scope for an assessment observation: pack + workspace + optional
 * process.
 *
 * The customer catalogue and result view only ever surface the LATEST
 * submission per pack (within one authorized workspace), so Grow research must
 * reason over the same scope. Without this, a retake that fixes a previously
 * problematic answer keeps emitting the OLD finding from the superseded
 * observation even though the portal already shows the corrected result.
 *
 * Including workspaceId matters: two workspaces of the same client may each
 * legitimately own an assessment of the same pack, and neither may erase the
 * other.
 *
 * Returns null for anything that is not a GROW_ASSESSMENT_V1 observation, and
 * for payloads without a usable pack key, so non-assessment observations
 * (including the generic GROW_PAIN_INTAKE survey) are never affected.
 */
function assessmentSupersedeScopeKey(observation: NormalizableObservation): string | null {
  if (!observation || observation.observationType !== DECLARED_SURVEY_OBSERVATION_TYPE) return null;
  const payload = observation.rawPayload;
  if (payload === null || typeof payload !== 'object' || Array.isArray(payload)) return null;
  const record = payload as Record<string, unknown>;
  if (record.schema !== GROW_ASSESSMENT_SCHEMA) return null;
  const packKey = typeof record.packKey === 'string' ? record.packKey.trim() : '';
  if (!packKey) return null;
  const processId =
    typeof record.processId === 'string' && record.processId.trim() !== '' ? record.processId.trim() : '';
  let workspaceId = '';
  const provenance = record.provenance;
  if (provenance !== null && typeof provenance === 'object' && !Array.isArray(provenance)) {
    const ws = (provenance as Record<string, unknown>).workspaceId;
    if (typeof ws === 'string') workspaceId = ws.trim();
  }
  // Components are non-empty-or-empty strings; the NUL separator avoids
  // accidental key collisions between adjacent components.
  return `${packKey}\u0000${workspaceId}\u0000${processId}`;
}

/**
 * Drops superseded assessment observations, keeping ONLY the newest submission
 * per (packKey, processId) scope. Input order is irrelevant: the newest
 * observedAt wins. Non-assessment observations pass through untouched, and the
 * original relative order is preserved for everything that is kept.
 */
export function supersedeAssessmentObservations<T extends NormalizableObservation>(
  observations: readonly T[],
): T[] {
  const latestByScope = new Map<string, T>();
  for (const observation of observations) {
    const scope = assessmentSupersedeScopeKey(observation);
    if (!scope) continue;
    const current = latestByScope.get(scope);
    if (!current || observation.observedAt.getTime() > current.observedAt.getTime()) {
      latestByScope.set(scope, observation);
    }
  }
  if (latestByScope.size === 0) return [...observations];
  const kept = new Set<T>(latestByScope.values());
  return observations.filter((observation) => {
    const scope = assessmentSupersedeScopeKey(observation);
    if (!scope) return true;
    return kept.has(observation);
  });
}
