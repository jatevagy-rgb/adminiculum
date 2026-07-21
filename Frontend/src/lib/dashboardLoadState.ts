export type DashboardAvailability = {
  tasks: boolean;
  cases: boolean;
  agenda: boolean;
  stats: boolean;
  communications: boolean;
  operational: boolean;
};

export type DashboardEndpointResults = {
  taskResult: unknown | null;
  caseResult: unknown | null;
  agendaResult: unknown | null;
  statsResult: unknown | null;
  communicationResult: unknown | null;
  operationalResult: unknown | null;
};

export type DashboardSectionState = "loading" | "available" | "unavailable";

export const UNAVAILABLE: DashboardAvailability = {
  tasks: false,
  cases: false,
  agenda: false,
  stats: false,
  communications: false,
  operational: false,
};

export function deriveDashboardAvailability(r: DashboardEndpointResults): DashboardAvailability {
  return {
    tasks: r.taskResult !== null,
    cases: r.caseResult !== null,
    agenda: r.agendaResult !== null,
    stats: r.statsResult !== null,
    communications: r.communicationResult !== null,
    operational: r.operationalResult !== null,
  };
}

export function getDashboardGlobalFailure(r: DashboardEndpointResults): boolean {
  return !r.taskResult && !r.caseResult;
}

export function getDashboardSectionFailure(
  availability: DashboardAvailability,
  criticalLoadFailed: boolean,
  loading: boolean,
): boolean {
  return (
    !loading &&
    !criticalLoadFailed &&
    (!availability.tasks ||
      !availability.cases ||
      !availability.agenda ||
      !availability.stats ||
      !availability.operational ||
      !availability.communications)
  );
}

export function getDashboardSectionState(
  available: boolean,
  loading: boolean,
): DashboardSectionState {
  if (loading) return "loading";
  return available ? "available" : "unavailable";
}
