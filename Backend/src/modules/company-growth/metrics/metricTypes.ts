/**
 * GROW WITH US V2 — T2A Deterministic Process Metric Types & Contracts.
 *
 * Strongly-typed, versioned, deterministic DTOs and narrow input contracts.
 * Independent of database entities and Prisma models.
 */

export const GROW_PROCESS_METRICS_V1 = 'GROW_PROCESS_METRICS_V1' as const;

export type ProcessMetricCode =
  | 'TOTAL_ACTIVE_MINUTES'
  | 'TOTAL_WAITING_MINUTES'
  | 'TOTAL_CYCLE_MINUTES'
  | 'WAITING_SHARE'
  | 'APPROVAL_STEP_COUNT'
  | 'DATA_ENTRY_STEP_COUNT'
  | 'HANDOFF_STEP_COUNT'
  | 'RESPONSIBLE_PERSON_CHANGE_COUNT'
  | 'SYSTEM_COUNT'
  | 'SYSTEM_SWITCH_COUNT'
  | 'UNASSIGNED_STEP_COUNT'
  | 'PROCESS_OWNER_PRESENT';

export type ProcessMetricUnit = 'MINUTES' | 'COUNT' | 'RATIO' | 'BOOLEAN';

export interface ProcessMetricValue {
  code: ProcessMetricCode;
  value: number | boolean | null;
  unit: ProcessMetricUnit;
  metricVersion: string;
}

/**
 * Narrow typed input contract for a process step.
 * Allows pure calculations without coupling to database or Prisma entities.
 */
export interface ProcessMetricStepInput {
  id?: string | null;
  position: number;
  name?: string | null;
  stepType?: string | null;
  responsiblePersonId?: string | null;
  systemId?: string | null;
  estimatedActiveMinutes?: number | null;
  estimatedWaitingMinutes?: number | null;
  isApproval?: boolean | null;
}

/**
 * Narrow typed input contract for a business process.
 */
export interface ProcessMetricInput {
  id?: string | null;
  ownerPersonId?: string | null;
  steps?: ProcessMetricStepInput[] | null;
}
