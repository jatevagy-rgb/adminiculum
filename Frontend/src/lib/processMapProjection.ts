/**
 * Read-only process map projection.
 *
 * Canonical contract: BusinessProcessStep has NO nextStepIds / graph edges.
 * The only honest ordering is position asc, id asc — the same deterministic
 * order the metrics engine uses. This projection produces a linear step flow;
 * it never invents BPMN semantics.
 */

export interface ProcessStepLike {
  id: string;
  position: number;
  name: string;
  stepType: string;
  responsiblePersonId?: string | null;
  responsiblePersonName?: string | null;
  systemId?: string | null;
  systemName?: string | null;
  estimatedActiveMinutes?: number | null;
  estimatedWaitingMinutes?: number | null;
  isApproval?: boolean;
}

export interface ProcessMapStep {
  id: string;
  orderIndex: number;
  name: string;
  stepType: string;
  stepTypeLabel: string;
  responsiblePersonName: string | null;
  systemName: string | null;
  estimatedActiveMinutes: number | null;
  estimatedWaitingMinutes: number | null;
  isApproval: boolean;
  flags: ProcessMapFlag[];
}

export type ProcessMapFlag = "UNASSIGNED" | "APPROVAL" | "WAITING" | "SYSTEM_SWITCH";

export interface ProcessMapProjection {
  steps: ProcessMapStep[];
  stepCount: number;
  approvalCount: number;
  unassignedCount: number;
  systemSwitchCount: number;
  totalEstimatedActiveMinutes: number;
  totalEstimatedWaitingMinutes: number;
}

const STEP_TYPE_LABELS: Record<string, string> = {
  MANUAL: "Kézi lépés",
  DATA_ENTRY: "Adatrögzítés",
  APPROVAL: "Jóváhagyás",
  REVIEW: "Ellenőrzés",
  HANDOFF: "Átadás",
  AUTOMATED: "Automatikus",
  WAITING: "Várakozás",
  OTHER: "Egyéb",
};

export function stepTypeLabel(stepType: string): string {
  return STEP_TYPE_LABELS[String(stepType).toUpperCase()] || stepType;
}

/**
 * Canonical deterministic ordering: position asc, then id asc.
 * Never mutates the input array.
 */
export function sortStepsDeterministically(steps: readonly ProcessStepLike[]): ProcessStepLike[] {
  return [...steps].sort((a, b) => (a.position !== b.position ? a.position - b.position : a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
}

export function projectProcessMap(steps: readonly ProcessStepLike[]): ProcessMapProjection {
  const ordered = sortStepsDeterministically(steps);
  const projected: ProcessMapStep[] = [];
  let previousSystemId: string | null | undefined;
  let systemSwitchCount = 0;
  let approvalCount = 0;
  let unassignedCount = 0;
  let totalActive = 0;
  let totalWaiting = 0;

  for (let i = 0; i < ordered.length; i += 1) {
    const step = ordered[i];
    const flags: ProcessMapFlag[] = [];
    const unassigned = !step.responsiblePersonId;
    const approval = step.isApproval === true || String(step.stepType).toUpperCase() === "APPROVAL";
    const waiting = (step.estimatedWaitingMinutes ?? 0) > 0;
    const systemSwitch =
      step.systemId != null && previousSystemId != null && step.systemId !== previousSystemId;

    if (unassigned) {
      flags.push("UNASSIGNED");
      unassignedCount += 1;
    }
    if (approval) {
      flags.push("APPROVAL");
      approvalCount += 1;
    }
    if (waiting) flags.push("WAITING");
    if (systemSwitch) {
      flags.push("SYSTEM_SWITCH");
      systemSwitchCount += 1;
    }

    projected.push({
      id: step.id,
      orderIndex: i,
      name: step.name,
      stepType: String(step.stepType),
      stepTypeLabel: stepTypeLabel(String(step.stepType)),
      responsiblePersonName: step.responsiblePersonName ?? null,
      systemName: step.systemName ?? null,
      estimatedActiveMinutes: step.estimatedActiveMinutes ?? null,
      estimatedWaitingMinutes: step.estimatedWaitingMinutes ?? null,
      isApproval: approval,
      flags,
    });

    if (step.systemId != null) previousSystemId = step.systemId;
    totalActive += step.estimatedActiveMinutes ?? 0;
    totalWaiting += step.estimatedWaitingMinutes ?? 0;
  }

  return {
    steps: projected,
    stepCount: projected.length,
    approvalCount,
    unassignedCount,
    systemSwitchCount,
    totalEstimatedActiveMinutes: totalActive,
    totalEstimatedWaitingMinutes: totalWaiting,
  };
}

export function processMapFlagLabel(flag: ProcessMapFlag): string {
  const labels: Record<ProcessMapFlag, string> = {
    UNASSIGNED: "Nincs felelős",
    APPROVAL: "Jóváhagyás",
    WAITING: "Várakozással",
    SYSTEM_SWITCH: "Rendszerváltás",
  };
  return labels[flag];
}
