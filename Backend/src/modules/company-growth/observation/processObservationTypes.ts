/**
 * GROW WITH US V2 — T2B Process Observation Snapshot Types.
 *
 * Types and DTO contracts for durable, reproducible process observation snapshots.
 */

import { ProcessMetricValue } from '../metrics/metricTypes';

export interface CaptureProcessObservationInput {
  clientId: string;
  businessProcessId: string;
  observedAt?: Date | string | null;
  provenanceSource?: string | null;
}

export interface ProcessObservationProvenance {
  source: string;
  calculatedBy: string;
  stepCount: number;
  inputFieldInventory: string[];
}

export interface ProcessObservationSnapshotDTO {
  id: string;
  clientId: string;
  businessProcessId: string;
  metricVersion: string;
  observedAt: string;
  inputDigest: string;
  snapshotDigest: string;
  metrics: ProcessMetricValue[];
  provenance: ProcessObservationProvenance | null;
  createdAt: string;
}

/**
 * Minimal canonical measured process input representation used for computing inputDigest.
 *
 * Included field rationale:
 * - processId: identity of the measured process (provenance)
 * - ownerPersonId: directly determines PROCESS_OWNER_PRESENT
 * - steps: array of ordered steps sorted deterministically, containing:
 *   - id: step identity and deterministic sort tie-breaker (provenance + ordering)
 *   - position: sequence order, affects transition calculations (determinism)
 *   - name: human-readable step name (provenance)
 *   - stepType: directly determines DATA_ENTRY_STEP_COUNT and HANDOFF_STEP_COUNT
 *   - responsiblePersonId: directly determines RESPONSIBLE_PERSON_CHANGE_COUNT and UNASSIGNED_STEP_COUNT
 *   - systemId: directly determines SYSTEM_COUNT and SYSTEM_SWITCH_COUNT
 *   - estimatedActiveMinutes: directly determines TOTAL_ACTIVE_MINUTES, TOTAL_CYCLE_MINUTES, WAITING_SHARE
 *   - estimatedWaitingMinutes: directly determines TOTAL_WAITING_MINUTES, TOTAL_CYCLE_MINUTES, WAITING_SHARE
 *   - isApproval: directly determines APPROVAL_STEP_COUNT
 */
export interface CanonicalMeasuredProcessInput {
  processId: string;
  ownerPersonId: string | null;
  steps: Array<{
    id: string | null;
    position: number;
    name: string | null;
    stepType: string | null;
    responsiblePersonId: string | null;
    systemId: string | null;
    estimatedActiveMinutes: number | null;
    estimatedWaitingMinutes: number | null;
    isApproval: boolean;
  }>;
}
