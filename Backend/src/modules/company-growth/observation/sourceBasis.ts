import { GROW_PROCESS_METRICS_V1 } from '../metrics/metricTypes';

export type SourceBasis = 'DECLARED' | 'ESTIMATED' | 'DERIVED' | 'MEASURED' | 'EXTERNAL';

const METRIC_FIELDS: Record<string, string[]> = {
  TOTAL_ACTIVE_MINUTES: ['steps.estimatedActiveMinutes'],
  TOTAL_WAITING_MINUTES: ['steps.estimatedWaitingMinutes'],
  TOTAL_CYCLE_MINUTES: ['steps.estimatedActiveMinutes', 'steps.estimatedWaitingMinutes'],
  WAITING_SHARE: ['steps.estimatedActiveMinutes', 'steps.estimatedWaitingMinutes'],
  APPROVAL_STEP_COUNT: ['steps.isApproval', 'steps.stepType'],
  DATA_ENTRY_STEP_COUNT: ['steps.stepType'],
  HANDOFF_STEP_COUNT: ['steps.stepType'],
  RESPONSIBLE_PERSON_CHANGE_COUNT: ['steps.responsiblePersonId', 'steps.position'],
  SYSTEM_COUNT: ['steps.systemId'],
  SYSTEM_SWITCH_COUNT: ['steps.systemId', 'steps.position'],
  UNASSIGNED_STEP_COUNT: ['steps.responsiblePersonId'],
  PROCESS_OWNER_PRESENT: ['ownerPersonId'],
};

/** Read projection only: never add these fields to hashed or persisted metrics. */
export function projectSnapshotSourceBasis(provenance: unknown, metrics: unknown) {
  const record = provenance && typeof provenance === 'object' && !Array.isArray(provenance)
    ? provenance as Record<string, unknown> : {};
  const inventory = Array.isArray(record.inputFieldInventory)
    ? record.inputFieldInventory.filter((field): field is string => typeof field === 'string') : [];
  const canonical = record.calculatedBy === GROW_PROCESS_METRICS_V1;
  // The inventory describes input fields, not whether historical nulls were
  // replaced by zero. Completeness cannot be reconstructed from it or a digest.
  const metricSourceBasis = (Array.isArray(metrics) ? metrics : []).flatMap((metric) => {
    if (!metric || typeof metric !== 'object' || typeof metric.code !== 'string') return [];
    const required = canonical ? METRIC_FIELDS[metric.code] ?? [] : [];
    const sourceFields = required.filter(field => inventory.includes(field));
    const sourceBasis: SourceBasis | null = required.length && sourceFields.length === required.length
      ? (sourceFields.some(field => field.includes('estimated')) ? 'ESTIMATED' : 'DERIVED') : null;
    return [{ code: metric.code as string, sourceBasis, sourceFields }];
  });
  const sourceBasis: SourceBasis | null = metricSourceBasis.some(metric => metric.sourceBasis === 'ESTIMATED')
    ? 'ESTIMATED'
    : metricSourceBasis.length && metricSourceBasis.every(metric => metric.sourceBasis === 'DERIVED') ? 'DERIVED' : null;
  return { sourceBasis, metricSourceBasis };
}

export type SnapshotSourceProjection = ReturnType<typeof projectSnapshotSourceBasis>;
