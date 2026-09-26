/**
 * Read-only customer operating projection.
 *
 * Maps the customer-safe Grow process DTO (PortalGrowProcess) into a presentation
 * view model for the interactive operating canvas. This is a pure presentation
 * projection: it introduces NO new business truth, NO new metrics and NO invented
 * values. Anything the DTO does not expose (e.g. responsible persons, active /
 * waiting minutes) stays absent — it is never converted to zero.
 *
 * System count and system-switch semantics are intentionally NOT derived here:
 * the customer DTO exposes only a display name (systemName), not the canonical
 * system identity or a customer-safe count, so names are never treated as an
 * identity and never aggregated into a count or a switch signal.
 *
 * Canonical ordering is the same deterministic rule the rest of Grow uses:
 * position asc, then id asc.
 */
import type { PortalGrowProcess, PortalGrowProcessStep } from "@/lib/clientPortalApi";
import { stepTypeLabel } from "@/lib/processMapProjection";

export type GrowOperatingStepView = {
  id: string;
  position: number;
  orderIndex: number;
  name: string;
  stepType: string;
  stepTypeLabel: string;
  isApproval: boolean;
  systemName: string | null;
  systemCategory: string | null;
};

export type GrowOperatingProcessView = {
  id: string;
  name: string;
  category: string;
  criticality: string;
  frequency: string;
  organizationGroupName: string | null;
  steps: GrowOperatingStepView[];
  stepCount: number;
  approvalCount: number;
};

/** Deterministic step ordering: position asc, then id asc. Never mutates input. */
export function sortGrowStepsDeterministically(
  steps: readonly PortalGrowProcessStep[],
): PortalGrowProcessStep[] {
  return [...steps].sort((a, b) =>
    a.position !== b.position ? a.position - b.position : a.id < b.id ? -1 : a.id > b.id ? 1 : 0,
  );
}

export function projectGrowOperatingProcess(process: PortalGrowProcess): GrowOperatingProcessView {
  const ordered = sortGrowStepsDeterministically(process.steps);
  const steps: GrowOperatingStepView[] = [];

  for (let i = 0; i < ordered.length; i += 1) {
    const step = ordered[i];
    const systemName = step.systemName ?? null;
    const isApproval = step.isApproval === true || String(step.stepType).toUpperCase() === "APPROVAL";

    steps.push({
      id: step.id,
      position: step.position,
      orderIndex: i,
      name: step.name,
      stepType: String(step.stepType),
      stepTypeLabel: stepTypeLabel(String(step.stepType)),
      isApproval,
      systemName,
      systemCategory: step.systemCategory ?? null,
    });
  }

  const approvalCount = steps.reduce((sum, step) => sum + (step.isApproval ? 1 : 0), 0);

  return {
    id: process.id,
    name: process.name,
    category: process.category,
    criticality: process.criticality,
    frequency: process.frequency,
    organizationGroupName: process.organizationGroupName ?? null,
    steps,
    stepCount: steps.length,
    approvalCount,
  };
}
