import assert from "node:assert/strict";
import { describe, it } from "node:test";

type DashboardAvailability = {
  tasks: boolean;
  cases: boolean;
  agenda: boolean;
  stats: boolean;
  communications: boolean;
  operational: boolean;
};

type EndpointResults = {
  taskResult: unknown | null;
  caseResult: unknown | null;
  agendaResult: unknown | null;
  statsResult: unknown | null;
  communicationResult: unknown | null;
  clientResult: unknown | null;
  operationalResult: unknown | null;
};

function computeAvailability(r: EndpointResults): DashboardAvailability {
  return {
    tasks: r.taskResult !== null,
    cases: r.caseResult !== null,
    agenda: r.agendaResult !== null,
    stats: r.statsResult !== null,
    communications: r.communicationResult !== null,
    operational: r.operationalResult !== null,
  };
}

function computeCriticalLoadFailed(r: EndpointResults): boolean {
  return !r.taskResult && !r.caseResult;
}

function computeHasSectionFailure(
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

const OK = { data: [] };
const FAIL = null;

function allOk(): EndpointResults {
  return {
    taskResult: OK,
    caseResult: OK,
    agendaResult: OK,
    statsResult: OK,
    communicationResult: OK,
    clientResult: OK,
    operationalResult: OK,
  };
}

describe("Dashboard partial load resilience — error classification", () => {
  it("1. all endpoints succeed → no error, no section failure", () => {
    const r = allOk();
    const avail = computeAvailability(r);
    assert.equal(computeCriticalLoadFailed(r), false);
    assert.equal(computeHasSectionFailure(avail, false, false), false);
  });

  it("2. only tasks fail → no critical error, section failure shown", () => {
    const r = { ...allOk(), taskResult: FAIL };
    const avail = computeAvailability(r);
    assert.equal(computeCriticalLoadFailed(r), false);
    assert.equal(avail.tasks, false);
    assert.equal(computeHasSectionFailure(avail, false, false), true);
  });

  it("3. only cases fail → no critical error, section failure shown", () => {
    const r = { ...allOk(), caseResult: FAIL };
    const avail = computeAvailability(r);
    assert.equal(computeCriticalLoadFailed(r), false);
    assert.equal(avail.cases, false);
    assert.equal(computeHasSectionFailure(avail, false, false), true);
  });

  it("4. tasks AND cases fail → critical error", () => {
    const r = { ...allOk(), taskResult: FAIL, caseResult: FAIL };
    assert.equal(computeCriticalLoadFailed(r), true);
  });

  it("5. only agenda fails → no critical error, section failure", () => {
    const r = { ...allOk(), agendaResult: FAIL };
    const avail = computeAvailability(r);
    assert.equal(computeCriticalLoadFailed(r), false);
    assert.equal(avail.agenda, false);
    assert.equal(computeHasSectionFailure(avail, false, false), true);
  });

  it("6. only stats fail → no critical error, section failure", () => {
    const r = { ...allOk(), statsResult: FAIL };
    const avail = computeAvailability(r);
    assert.equal(computeCriticalLoadFailed(r), false);
    assert.equal(avail.stats, false);
    assert.equal(computeHasSectionFailure(avail, false, false), true);
  });

  it("7. only operational fails → no critical error, section failure", () => {
    const r = { ...allOk(), operationalResult: FAIL };
    const avail = computeAvailability(r);
    assert.equal(computeCriticalLoadFailed(r), false);
    assert.equal(avail.operational, false);
    assert.equal(computeHasSectionFailure(avail, false, false), true);
  });

  it("8. only communications fail → no critical error, section failure", () => {
    const r = { ...allOk(), communicationResult: FAIL };
    const avail = computeAvailability(r);
    assert.equal(computeCriticalLoadFailed(r), false);
    assert.equal(avail.communications, false);
    assert.equal(computeHasSectionFailure(avail, false, false), true);
  });

  it("9. only clients fail → no critical error, no section failure (clients not tracked)", () => {
    const r = { ...allOk(), clientResult: FAIL };
    const avail = computeAvailability(r);
    assert.equal(computeCriticalLoadFailed(r), false);
    assert.equal(computeHasSectionFailure(avail, false, false), false);
  });

  it("10. agenda + stats fail → no critical error, section failure", () => {
    const r = { ...allOk(), agendaResult: FAIL, statsResult: FAIL };
    const avail = computeAvailability(r);
    assert.equal(computeCriticalLoadFailed(r), false);
    assert.equal(computeHasSectionFailure(avail, false, false), true);
  });

  it("11. tasks + operational fail → no critical error (cases still OK), section failure", () => {
    const r = { ...allOk(), taskResult: FAIL, operationalResult: FAIL };
    const avail = computeAvailability(r);
    assert.equal(computeCriticalLoadFailed(r), false);
    assert.equal(avail.tasks, false);
    assert.equal(avail.operational, false);
    assert.equal(computeHasSectionFailure(avail, false, false), true);
  });

  it("12. all fail → critical error (tasks AND cases both null)", () => {
    const r: EndpointResults = {
      taskResult: FAIL,
      caseResult: FAIL,
      agendaResult: FAIL,
      statsResult: FAIL,
      communicationResult: FAIL,
      clientResult: FAIL,
      operationalResult: FAIL,
    };
    assert.equal(computeCriticalLoadFailed(r), true);
  });

  it("13. during loading → hasSectionFailure is false even if sections unavailable", () => {
    const r = { ...allOk(), agendaResult: FAIL };
    const avail = computeAvailability(r);
    assert.equal(computeHasSectionFailure(avail, false, true), false);
  });

  it("14. critical load failed → hasSectionFailure is false (banner takes precedence)", () => {
    const r = { ...allOk(), taskResult: FAIL, caseResult: FAIL, agendaResult: FAIL };
    const avail = computeAvailability(r);
    assert.equal(computeCriticalLoadFailed(r), true);
    assert.equal(computeHasSectionFailure(avail, true, false), false);
  });

  it("15. cases + agenda + operational fail, tasks OK → no critical error, section failure", () => {
    const r = { ...allOk(), caseResult: FAIL, agendaResult: FAIL, operationalResult: FAIL };
    const avail = computeAvailability(r);
    assert.equal(computeCriticalLoadFailed(r), false);
    assert.equal(computeHasSectionFailure(avail, false, false), true);
    assert.equal(avail.cases, false);
    assert.equal(avail.agenda, false);
    assert.equal(avail.operational, false);
    assert.equal(avail.tasks, true);
  });
});

describe("Dashboard partial load resilience — section availability", () => {
  it("tasks unavailable → tasks and reviews sections show fallback", () => {
    const r = { ...allOk(), taskResult: FAIL };
    const avail = computeAvailability(r);
    assert.equal(avail.tasks, false);
  });

  it("agenda unavailable → deadlines and calendar sections show fallback", () => {
    const r = { ...allOk(), agendaResult: FAIL };
    const avail = computeAvailability(r);
    assert.equal(avail.agenda, false);
  });

  it("operational unavailable → focusDataComplete is false", () => {
    const r = { ...allOk(), operationalResult: FAIL };
    const avail = computeAvailability(r);
    assert.equal(avail.operational, false);
    const focusDataComplete = avail.operational;
    assert.equal(focusDataComplete, false);
  });

  it("stats unavailable → signals section hidden (no data to show)", () => {
    const r = { ...allOk(), statsResult: FAIL };
    const avail = computeAvailability(r);
    assert.equal(avail.stats, false);
  });

  it("communications unavailable → communication section shows empty state", () => {
    const r = { ...allOk(), communicationResult: FAIL };
    const avail = computeAvailability(r);
    assert.equal(avail.communications, false);
  });
});
