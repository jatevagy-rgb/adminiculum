/**
 * GROW WITH US V2 — T2A Process Metric Unit Tests.
 *
 * Tests the 19 required deterministic metric scenarios:
 *  1. empty process
 *  2. all-null time values
 *  3. active only
 *  4. waiting only
 *  5. mixed active/waiting
 *  6. zero denominator => WAITING_SHARE null
 *  7. explicit approval count
 *  8. DATA_ENTRY count
 *  9. explicit HANDOFF count
 * 10. responsible: A -> A
 * 11. responsible: A -> B
 * 12. responsible: A -> null -> B
 * 13. system: CRM -> CRM
 * 14. system: CRM -> ERP
 * 15. system: CRM -> null -> ERP
 * 16. distinct SYSTEM_COUNT
 * 17. unassigned steps
 * 18. owner present / owner absent
 * 19. deterministic ordering
 */

import {
  calculateProcessMetrics,
  calculateProcessMetricsMap,
  sortStepsDeterministically,
} from '../src/modules/company-growth/metrics/calculateProcessMetrics';
import {
  GROW_PROCESS_METRICS_V1,
  ProcessMetricInput,
  ProcessMetricStepInput,
} from '../src/modules/company-growth/metrics/metricTypes';
import { PROCESS_METRIC_REGISTRY } from '../src/modules/company-growth/metrics/metricRegistry';

describe('Grow With Us V2 T2A — Deterministic Process Metrics', () => {
  it('1. empty process returns valid zero/null metrics with stable schema', () => {
    const input: ProcessMetricInput = { id: 'proc-empty', ownerPersonId: null, steps: [] };
    const metrics = calculateProcessMetricsMap(input);

    expect(metrics.TOTAL_ACTIVE_MINUTES.value).toBe(0);
    expect(metrics.TOTAL_WAITING_MINUTES.value).toBe(0);
    expect(metrics.TOTAL_CYCLE_MINUTES.value).toBe(0);
    expect(metrics.WAITING_SHARE.value).toBeNull();
    expect(metrics.APPROVAL_STEP_COUNT.value).toBe(0);
    expect(metrics.DATA_ENTRY_STEP_COUNT.value).toBe(0);
    expect(metrics.HANDOFF_STEP_COUNT.value).toBe(0);
    expect(metrics.RESPONSIBLE_PERSON_CHANGE_COUNT.value).toBe(0);
    expect(metrics.SYSTEM_COUNT.value).toBe(0);
    expect(metrics.SYSTEM_SWITCH_COUNT.value).toBe(0);
    expect(metrics.UNASSIGNED_STEP_COUNT.value).toBe(0);
    expect(metrics.PROCESS_OWNER_PRESENT.value).toBe(false);

    for (const m of Object.values(metrics)) {
      expect(m.metricVersion).toBe(GROW_PROCESS_METRICS_V1);
      expect(PROCESS_METRIC_REGISTRY[m.code]).toBeDefined();
    }
  });

  it('2. all-null time values contribute zero to active and waiting time', () => {
    const input: ProcessMetricInput = {
      steps: [
        { position: 1, estimatedActiveMinutes: null, estimatedWaitingMinutes: null },
        { position: 2, estimatedActiveMinutes: undefined, estimatedWaitingMinutes: undefined },
      ],
    };
    const metrics = calculateProcessMetricsMap(input);

    expect(metrics.TOTAL_ACTIVE_MINUTES.value).toBe(0);
    expect(metrics.TOTAL_WAITING_MINUTES.value).toBe(0);
    expect(metrics.TOTAL_CYCLE_MINUTES.value).toBe(0);
    expect(metrics.WAITING_SHARE.value).toBeNull();
  });

  it('3. active only calculation', () => {
    const input: ProcessMetricInput = {
      steps: [
        { position: 1, estimatedActiveMinutes: 45, estimatedWaitingMinutes: 0 },
        { position: 2, estimatedActiveMinutes: 30, estimatedWaitingMinutes: null },
      ],
    };
    const metrics = calculateProcessMetricsMap(input);

    expect(metrics.TOTAL_ACTIVE_MINUTES.value).toBe(75);
    expect(metrics.TOTAL_WAITING_MINUTES.value).toBe(0);
    expect(metrics.TOTAL_CYCLE_MINUTES.value).toBe(75);
    expect(metrics.WAITING_SHARE.value).toBe(0);
  });

  it('4. waiting only calculation', () => {
    const input: ProcessMetricInput = {
      steps: [
        { position: 1, estimatedActiveMinutes: 0, estimatedWaitingMinutes: 120 },
        { position: 2, estimatedActiveMinutes: null, estimatedWaitingMinutes: 240 },
      ],
    };
    const metrics = calculateProcessMetricsMap(input);

    expect(metrics.TOTAL_ACTIVE_MINUTES.value).toBe(0);
    expect(metrics.TOTAL_WAITING_MINUTES.value).toBe(360);
    expect(metrics.TOTAL_CYCLE_MINUTES.value).toBe(360);
    expect(metrics.WAITING_SHARE.value).toBe(1.0);
  });

  it('5. mixed active and waiting calculation', () => {
    const input: ProcessMetricInput = {
      steps: [
        { position: 1, estimatedActiveMinutes: 100, estimatedWaitingMinutes: 300 },
        { position: 2, estimatedActiveMinutes: 50, estimatedWaitingMinutes: 150 },
      ],
    };
    const metrics = calculateProcessMetricsMap(input);

    expect(metrics.TOTAL_ACTIVE_MINUTES.value).toBe(150);
    expect(metrics.TOTAL_WAITING_MINUTES.value).toBe(450);
    expect(metrics.TOTAL_CYCLE_MINUTES.value).toBe(600);
    expect(metrics.WAITING_SHARE.value).toBe(0.75); // 450 / 600
  });

  it('6. zero denominator produces null WAITING_SHARE without throwing or returning zero', () => {
    const input: ProcessMetricInput = {
      steps: [
        { position: 1, estimatedActiveMinutes: 0, estimatedWaitingMinutes: 0 },
        { position: 2, estimatedActiveMinutes: null, estimatedWaitingMinutes: null },
      ],
    };
    const metrics = calculateProcessMetricsMap(input);

    expect(metrics.TOTAL_CYCLE_MINUTES.value).toBe(0);
    expect(metrics.WAITING_SHARE.value).toBeNull();
  });

  it('7. explicit approval count counts isApproval === true and ignores step name', () => {
    const input: ProcessMetricInput = {
      steps: [
        { position: 1, name: 'Approval by Manager', isApproval: false },
        { position: 2, name: 'Risk Sign-off', isApproval: true },
        { position: 3, name: 'Budget Approval', isApproval: true },
        { position: 4, name: 'Final Review', isApproval: null },
      ],
    };
    const metrics = calculateProcessMetricsMap(input);

    expect(metrics.APPROVAL_STEP_COUNT.value).toBe(2);
  });

  it('8. DATA_ENTRY count strictly counts stepType === "DATA_ENTRY"', () => {
    const input: ProcessMetricInput = {
      steps: [
        { position: 1, stepType: 'DATA_ENTRY' },
        { position: 2, stepType: 'MANUAL' },
        { position: 3, stepType: 'DATA_ENTRY' },
        { position: 4, stepType: 'DECISION' },
      ],
    };
    const metrics = calculateProcessMetricsMap(input);

    expect(metrics.DATA_ENTRY_STEP_COUNT.value).toBe(2);
  });

  it('9. explicit HANDOFF count strictly counts stepType === "HANDOFF"', () => {
    const input: ProcessMetricInput = {
      steps: [
        { position: 1, stepType: 'HANDOFF' },
        { position: 2, stepType: 'MANUAL' },
        { position: 3, stepType: 'DOCUMENT' },
        { position: 4, stepType: 'HANDOFF' },
      ],
    };
    const metrics = calculateProcessMetricsMap(input);

    expect(metrics.HANDOFF_STEP_COUNT.value).toBe(2);
  });

  it('10. responsible: A -> A results in zero person changes', () => {
    const input: ProcessMetricInput = {
      steps: [
        { position: 1, responsiblePersonId: 'person-A' },
        { position: 2, responsiblePersonId: 'person-A' },
      ],
    };
    const metrics = calculateProcessMetricsMap(input);

    expect(metrics.RESPONSIBLE_PERSON_CHANGE_COUNT.value).toBe(0);
  });

  it('11. responsible: A -> B results in exactly one person change', () => {
    const input: ProcessMetricInput = {
      steps: [
        { position: 1, responsiblePersonId: 'person-A' },
        { position: 2, responsiblePersonId: 'person-B' },
      ],
    };
    const metrics = calculateProcessMetricsMap(input);

    expect(metrics.RESPONSIBLE_PERSON_CHANGE_COUNT.value).toBe(1);
  });

  it('12. responsible: A -> null -> B does not bridge across null step and results in zero changes', () => {
    const input: ProcessMetricInput = {
      steps: [
        { position: 1, responsiblePersonId: 'person-A' },
        { position: 2, responsiblePersonId: null },
        { position: 3, responsiblePersonId: 'person-B' },
      ],
    };
    const metrics = calculateProcessMetricsMap(input);

    // Transition 1: person-A -> null (no change, curr is null)
    // Transition 2: null -> person-B (no change, prev is null)
    expect(metrics.RESPONSIBLE_PERSON_CHANGE_COUNT.value).toBe(0);
  });

  it('13. system: CRM -> CRM results in zero system switches', () => {
    const input: ProcessMetricInput = {
      steps: [
        { position: 1, systemId: 'sys-crm' },
        { position: 2, systemId: 'sys-crm' },
      ],
    };
    const metrics = calculateProcessMetricsMap(input);

    expect(metrics.SYSTEM_SWITCH_COUNT.value).toBe(0);
  });

  it('14. system: CRM -> ERP results in exactly one system switch', () => {
    const input: ProcessMetricInput = {
      steps: [
        { position: 1, systemId: 'sys-crm' },
        { position: 2, systemId: 'sys-erp' },
      ],
    };
    const metrics = calculateProcessMetricsMap(input);

    expect(metrics.SYSTEM_SWITCH_COUNT.value).toBe(1);
  });

  it('15. system: CRM -> null -> ERP does not bridge across null step and results in zero switches', () => {
    const input: ProcessMetricInput = {
      steps: [
        { position: 1, systemId: 'sys-crm' },
        { position: 2, systemId: null },
        { position: 3, systemId: 'sys-erp' },
      ],
    };
    const metrics = calculateProcessMetricsMap(input);

    // Transition 1: CRM -> null (0 switches)
    // Transition 2: null -> ERP (0 switches)
    expect(metrics.SYSTEM_SWITCH_COUNT.value).toBe(0);
  });

  it('16. distinct SYSTEM_COUNT counts unique non-null systems', () => {
    const input: ProcessMetricInput = {
      steps: [
        { position: 1, systemId: 'sys-1' },
        { position: 2, systemId: 'sys-2' },
        { position: 3, systemId: 'sys-1' },
        { position: 4, systemId: null },
        { position: 5, systemId: 'sys-3' },
      ],
    };
    const metrics = calculateProcessMetricsMap(input);

    expect(metrics.SYSTEM_COUNT.value).toBe(3);
  });

  it('17. unassigned steps counts steps with null or undefined responsiblePersonId', () => {
    const input: ProcessMetricInput = {
      steps: [
        { position: 1, responsiblePersonId: 'person-1' },
        { position: 2, responsiblePersonId: null },
        { position: 3, responsiblePersonId: undefined },
        { position: 4, responsiblePersonId: '' },
      ],
    };
    const metrics = calculateProcessMetricsMap(input);

    expect(metrics.UNASSIGNED_STEP_COUNT.value).toBe(3);
  });

  it('18. owner present / owner absent evaluation', () => {
    const presentInput: ProcessMetricInput = { ownerPersonId: 'person-lead' };
    expect(calculateProcessMetricsMap(presentInput).PROCESS_OWNER_PRESENT.value).toBe(true);

    const absentInput1: ProcessMetricInput = { ownerPersonId: null };
    expect(calculateProcessMetricsMap(absentInput1).PROCESS_OWNER_PRESENT.value).toBe(false);

    const absentInput2: ProcessMetricInput = { ownerPersonId: '' };
    expect(calculateProcessMetricsMap(absentInput2).PROCESS_OWNER_PRESENT.value).toBe(false);

    const absentInput3: ProcessMetricInput = {};
    expect(calculateProcessMetricsMap(absentInput3).PROCESS_OWNER_PRESENT.value).toBe(false);
  });

  it('19. deterministic ordering: sorts by position ascending with id tie-breaker', () => {
    const steps: ProcessMetricStepInput[] = [
      { id: 'b-step', position: 2, name: 'Step 2' },
      { id: 'z-step', position: 1, name: 'Step 1 Z' },
      { id: 'a-step', position: 1, name: 'Step 1 A' },
      { id: 'c-step', position: 3, name: 'Step 3' },
    ];

    const sorted = sortStepsDeterministically(steps);

    expect(sorted.map((s) => s.id)).toEqual(['a-step', 'z-step', 'b-step', 'c-step']);
    expect(sorted.map((s) => s.position)).toEqual([1, 1, 2, 3]);
  });

  it('Bonus: validates exact vendor onboarding 12-step fixture metrics', () => {
    const vendorOnboardingSteps: ProcessMetricStepInput[] = [
      { id: 's1', position: 1, name: 'Initiate Vendor Onboarding', stepType: 'MANUAL', systemId: 'sys-outlook', responsiblePersonId: 'p-lead', estimatedActiveMinutes: 15, estimatedWaitingMinutes: 0, isApproval: false },
      { id: 's2', position: 2, name: 'Collect & Record Vendor Master Data', stepType: 'DATA_ENTRY', systemId: 'sys-excel', responsiblePersonId: 'p-assistant', estimatedActiveMinutes: 30, estimatedWaitingMinutes: 120, isApproval: false },
      { id: 's3', position: 3, name: 'Assess Legal & Compliance Needs', stepType: 'DECISION', systemId: null, responsiblePersonId: 'p-compliance', estimatedActiveMinutes: 20, estimatedWaitingMinutes: 60, isApproval: false },
      { id: 's4', position: 4, name: 'Execute Non-Disclosure Agreement (NDA)', stepType: 'DOCUMENT', systemId: 'sys-sharepoint', responsiblePersonId: 'p-legal', estimatedActiveMinutes: 45, estimatedWaitingMinutes: 1440, isApproval: false },
      { id: 's5', position: 5, name: 'Execute Data Processing Addendum (DPA)', stepType: 'DOCUMENT', systemId: 'sys-sharepoint', responsiblePersonId: 'p-compliance', estimatedActiveMinutes: 45, estimatedWaitingMinutes: 1440, isApproval: false },
      { id: 's6', position: 6, name: 'Draft Master Services Agreement (MSA)', stepType: 'HANDOFF', systemId: 'sys-adminiculum', responsiblePersonId: 'p-legal', estimatedActiveMinutes: 120, estimatedWaitingMinutes: 2880, isApproval: false },
      { id: 's7', position: 7, name: 'Legal & Compliance Risk Approval', stepType: 'APPROVAL', systemId: 'sys-adminiculum', responsiblePersonId: 'p-legal', estimatedActiveMinutes: 30, estimatedWaitingMinutes: 240, isApproval: true },
      { id: 's8', position: 8, name: 'Financial & Budgetary Approval', stepType: 'APPROVAL', systemId: 'sys-billingo', responsiblePersonId: 'p-cfo', estimatedActiveMinutes: 15, estimatedWaitingMinutes: 480, isApproval: true },
      { id: 's9', position: 9, name: 'Execute Contract Signatures', stepType: 'MANUAL', systemId: 'sys-sharepoint', responsiblePersonId: 'p-lead', estimatedActiveMinutes: 30, estimatedWaitingMinutes: 1440, isApproval: false },
      { id: 's10', position: 10, name: 'Re-key Vendor Master Data into ERP', stepType: 'DATA_ENTRY', systemId: 'sys-billingo', responsiblePersonId: 'p-assistant', estimatedActiveMinutes: 45, estimatedWaitingMinutes: 0, isApproval: false },
      { id: 's11', position: 11, name: 'Register Contract & Assign Contract Obligations', stepType: 'DATA_ENTRY', systemId: 'sys-adminiculum', responsiblePersonId: 'p-legal', estimatedActiveMinutes: 30, estimatedWaitingMinutes: 0, isApproval: false },
      { id: 's12', position: 12, name: 'Complete Vendor Operational Activation', stepType: 'SYSTEM', systemId: 'sys-billingo', responsiblePersonId: 'p-itadmin', estimatedActiveMinutes: 10, estimatedWaitingMinutes: 0, isApproval: false },
    ];

    const input: ProcessMetricInput = {
      id: 'proc-vendor-onboarding',
      ownerPersonId: 'p-lead',
      steps: vendorOnboardingSteps,
    };

    const metrics = calculateProcessMetricsMap(input);

    expect(metrics.TOTAL_ACTIVE_MINUTES.value).toBe(435); // 7.25 hours
    expect(metrics.TOTAL_WAITING_MINUTES.value).toBe(8100); // 135 hours
    expect(metrics.TOTAL_CYCLE_MINUTES.value).toBe(8535);
    expect(metrics.WAITING_SHARE.value).toBeCloseTo(8100 / 8535, 6);
    expect(metrics.APPROVAL_STEP_COUNT.value).toBe(2);
    expect(metrics.DATA_ENTRY_STEP_COUNT.value).toBe(3);
    expect(metrics.HANDOFF_STEP_COUNT.value).toBe(1);
    expect(metrics.SYSTEM_COUNT.value).toBe(5); // outlook, excel, sharepoint, adminiculum, billingo
    expect(metrics.PROCESS_OWNER_PRESENT.value).toBe(true);
    expect(metrics.UNASSIGNED_STEP_COUNT.value).toBe(0);

    // Transitions:
    // s1(outlook) -> s2(excel) : switch 1
    // s2(excel) -> s3(null) : no switch
    // s3(null) -> s4(sharepoint) : no switch
    // s4(sharepoint) -> s5(sharepoint) : no switch
    // s5(sharepoint) -> s6(adminiculum) : switch 2
    // s6(adminiculum) -> s7(adminiculum) : no switch
    // s7(adminiculum) -> s8(billingo) : switch 3
    // s8(billingo) -> s9(sharepoint) : switch 4
    // s9(sharepoint) -> s10(billingo) : switch 5
    // s10(billingo) -> s11(adminiculum) : switch 6
    // s11(adminiculum) -> s12(billingo) : switch 7
    expect(metrics.SYSTEM_SWITCH_COUNT.value).toBe(7);
  });
});
