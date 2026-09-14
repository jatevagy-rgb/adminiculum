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

/**
 * Normalizes a canonical observation into zero or more Grow signals.
 *
 * Fail-closed rules:
 * - Non-DECLARED_SURVEY observation types → [].
 * - Payload that is not a plain object, or lacks the canonical
 *   GROW_PAIN_INTAKE marker, or whose `categories` is not an array → [].
 * - Unknown category keys → skipped (never mapped to GENERAL_FLOW).
 * - A business process reference is carried only when it is a non-empty string;
 *   tenant validation is the caller's responsibility (see executing research).
 */
export function observationToGrowSignals(observation: NormalizableObservation): GrowSignal[] {
  if (!observation || observation.observationType !== DECLARED_SURVEY_OBSERVATION_TYPE) return [];

  const payload = observation.rawPayload;
  if (payload === null || typeof payload !== 'object' || Array.isArray(payload)) return [];
  const record = payload as Record<string, unknown>;
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
