/**
 * GROW WITH US V2 — T2A Deterministic Process Metric Calculator.
 *
 * Pure, deterministic functions computing the 12 canonical process metrics
 * over a typed BusinessProcess + BusinessProcessStep input.
 *
 * SEMANTIC SAFEGUARDS:
 * 1. Step ordering is deterministic: primary sort by position (ascending),
 *    secondary tie-breaker by id (ascending).
 * 2. SYSTEM_SWITCH_COUNT evaluates strictly adjacent consecutive steps in the
 *    ordered process sequence. It does NOT filter out null-system steps prior
 *    to comparison (e.g. CRM -> null -> ERP produces 0 switches).
 * 3. RESPONSIBLE_PERSON_CHANGE_COUNT evaluates strictly adjacent consecutive steps
 *    in the ordered process sequence. It does NOT filter out unassigned steps
 *    prior to comparison (e.g. Person A -> null -> Person B produces 0 changes).
 * 4. WAITING_SHARE returns null when totalCycleMinutes === 0 (never zero).
 */

import {
  GROW_PROCESS_METRICS_V1,
  ProcessMetricCode,
  ProcessMetricInput,
  ProcessMetricStepInput,
  ProcessMetricValue,
} from './metricTypes';

/**
 * Sorts steps deterministically:
 * Primary: position ascending
 * Tie-breaker: id ascending (localeCompare)
 */
export function sortStepsDeterministically(
  steps: readonly ProcessMetricStepInput[],
): ProcessMetricStepInput[] {
  return [...steps].sort((a, b) => {
    if (a.position !== b.position) {
      return a.position - b.position;
    }
    const idA = String(a.id ?? '');
    const idB = String(b.id ?? '');
    return idA.localeCompare(idB);
  });
}

/**
 * Calculates all 12 canonical metrics for a given process and returns them
 * as an array of versioned ProcessMetricValue DTOs.
 */
export function calculateProcessMetrics(input: ProcessMetricInput): ProcessMetricValue[] {
  const steps = input.steps ? sortStepsDeterministically(input.steps) : [];

  // 1. TOTAL_ACTIVE_MINUTES
  let totalActiveMinutes = 0;
  for (const s of steps) {
    if (s.estimatedActiveMinutes != null && Number.isFinite(s.estimatedActiveMinutes)) {
      totalActiveMinutes += s.estimatedActiveMinutes;
    }
  }

  // 2. TOTAL_WAITING_MINUTES
  let totalWaitingMinutes = 0;
  for (const s of steps) {
    if (s.estimatedWaitingMinutes != null && Number.isFinite(s.estimatedWaitingMinutes)) {
      totalWaitingMinutes += s.estimatedWaitingMinutes;
    }
  }

  // 3. TOTAL_CYCLE_MINUTES
  const totalCycleMinutes = totalActiveMinutes + totalWaitingMinutes;

  // 4. WAITING_SHARE
  const waitingShare: number | null =
    totalCycleMinutes === 0 ? null : totalWaitingMinutes / totalCycleMinutes;

  // 5. APPROVAL_STEP_COUNT
  let approvalStepCount = 0;
  for (const s of steps) {
    if (s.isApproval === true) {
      approvalStepCount += 1;
    }
  }

  // 6. DATA_ENTRY_STEP_COUNT
  let dataEntryStepCount = 0;
  for (const s of steps) {
    if (s.stepType === 'DATA_ENTRY') {
      dataEntryStepCount += 1;
    }
  }

  // 7. HANDOFF_STEP_COUNT
  let handoffStepCount = 0;
  for (const s of steps) {
    if (s.stepType === 'HANDOFF') {
      handoffStepCount += 1;
    }
  }

  // 8. RESPONSIBLE_PERSON_CHANGE_COUNT
  // Strict adjacent process step comparison. Do NOT filter out unassigned steps.
  let responsiblePersonChangeCount = 0;
  for (let i = 0; i < steps.length - 1; i++) {
    const prev = steps[i];
    const curr = steps[i + 1];
    const prevPerson = prev.responsiblePersonId != null && prev.responsiblePersonId !== '' ? prev.responsiblePersonId : null;
    const currPerson = curr.responsiblePersonId != null && curr.responsiblePersonId !== '' ? curr.responsiblePersonId : null;

    if (prevPerson !== null && currPerson !== null && prevPerson !== currPerson) {
      responsiblePersonChangeCount += 1;
    }
  }

  // 9. SYSTEM_COUNT
  const distinctSystems = new Set<string>();
  for (const s of steps) {
    if (s.systemId != null && s.systemId !== '') {
      distinctSystems.add(s.systemId);
    }
  }
  const systemCount = distinctSystems.size;

  // 10. SYSTEM_SWITCH_COUNT
  // Strict adjacent process step comparison. Do NOT filter out null-system steps.
  let systemSwitchCount = 0;
  for (let i = 0; i < steps.length - 1; i++) {
    const prev = steps[i];
    const curr = steps[i + 1];
    const prevSystem = prev.systemId != null && prev.systemId !== '' ? prev.systemId : null;
    const currSystem = curr.systemId != null && curr.systemId !== '' ? curr.systemId : null;

    if (prevSystem !== null && currSystem !== null && prevSystem !== currSystem) {
      systemSwitchCount += 1;
    }
  }

  // 11. UNASSIGNED_STEP_COUNT
  let unassignedStepCount = 0;
  for (const s of steps) {
    if (s.responsiblePersonId == null || s.responsiblePersonId === '') {
      unassignedStepCount += 1;
    }
  }

  // 12. PROCESS_OWNER_PRESENT
  const processOwnerPresent = Boolean(input.ownerPersonId != null && input.ownerPersonId !== '');

  return [
    {
      code: 'TOTAL_ACTIVE_MINUTES',
      value: totalActiveMinutes,
      unit: 'MINUTES',
      metricVersion: GROW_PROCESS_METRICS_V1,
    },
    {
      code: 'TOTAL_WAITING_MINUTES',
      value: totalWaitingMinutes,
      unit: 'MINUTES',
      metricVersion: GROW_PROCESS_METRICS_V1,
    },
    {
      code: 'TOTAL_CYCLE_MINUTES',
      value: totalCycleMinutes,
      unit: 'MINUTES',
      metricVersion: GROW_PROCESS_METRICS_V1,
    },
    {
      code: 'WAITING_SHARE',
      value: waitingShare,
      unit: 'RATIO',
      metricVersion: GROW_PROCESS_METRICS_V1,
    },
    {
      code: 'APPROVAL_STEP_COUNT',
      value: approvalStepCount,
      unit: 'COUNT',
      metricVersion: GROW_PROCESS_METRICS_V1,
    },
    {
      code: 'DATA_ENTRY_STEP_COUNT',
      value: dataEntryStepCount,
      unit: 'COUNT',
      metricVersion: GROW_PROCESS_METRICS_V1,
    },
    {
      code: 'HANDOFF_STEP_COUNT',
      value: handoffStepCount,
      unit: 'COUNT',
      metricVersion: GROW_PROCESS_METRICS_V1,
    },
    {
      code: 'RESPONSIBLE_PERSON_CHANGE_COUNT',
      value: responsiblePersonChangeCount,
      unit: 'COUNT',
      metricVersion: GROW_PROCESS_METRICS_V1,
    },
    {
      code: 'SYSTEM_COUNT',
      value: systemCount,
      unit: 'COUNT',
      metricVersion: GROW_PROCESS_METRICS_V1,
    },
    {
      code: 'SYSTEM_SWITCH_COUNT',
      value: systemSwitchCount,
      unit: 'COUNT',
      metricVersion: GROW_PROCESS_METRICS_V1,
    },
    {
      code: 'UNASSIGNED_STEP_COUNT',
      value: unassignedStepCount,
      unit: 'COUNT',
      metricVersion: GROW_PROCESS_METRICS_V1,
    },
    {
      code: 'PROCESS_OWNER_PRESENT',
      value: processOwnerPresent,
      unit: 'BOOLEAN',
      metricVersion: GROW_PROCESS_METRICS_V1,
    },
  ];
}

/**
 * Calculates process metrics and returns a dictionary indexed by ProcessMetricCode.
 */
export function calculateProcessMetricsMap(
  input: ProcessMetricInput,
): Record<ProcessMetricCode, ProcessMetricValue> {
  const list = calculateProcessMetrics(input);
  const result = {} as Record<ProcessMetricCode, ProcessMetricValue>;
  for (const m of list) {
    result[m.code] = m;
  }
  return result;
}
