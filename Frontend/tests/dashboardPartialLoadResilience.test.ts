import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  deriveDashboardAvailability,
  getDashboardGlobalFailure,
  getDashboardSectionFailure,
  UNAVAILABLE,
  type DashboardEndpointResults,
} from "../src/lib/dashboardLoadState";

const OK = { data: [] };
const FAIL = null;

function allOk(): DashboardEndpointResults {
  return {
    taskResult: OK,
    caseResult: OK,
    agendaResult: OK,
    statsResult: OK,
    communicationResult: OK,
    operationalResult: OK,
  };
}

describe("deriveDashboardAvailability", () => {
  it("all OK → all available", () => {
    const avail = deriveDashboardAvailability(allOk());
    assert.deepEqual(avail, {
      tasks: true,
      cases: true,
      agenda: true,
      stats: true,
      communications: true,
      operational: true,
    });
  });

  it("all FAIL → all unavailable", () => {
    const avail = deriveDashboardAvailability({
      taskResult: FAIL,
      caseResult: FAIL,
      agendaResult: FAIL,
      statsResult: FAIL,
      communicationResult: FAIL,
      operationalResult: FAIL,
    });
    assert.deepEqual(avail, UNAVAILABLE);
  });

  it("single failure → only that field false", () => {
    const avail = deriveDashboardAvailability({ ...allOk(), operationalResult: FAIL });
    assert.equal(avail.operational, false);
    assert.equal(avail.tasks, true);
    assert.equal(avail.cases, true);
    assert.equal(avail.agenda, true);
    assert.equal(avail.stats, true);
    assert.equal(avail.communications, true);
  });
});

describe("getDashboardGlobalFailure — criticality contract", () => {
  it("1. all succeed → no global failure", () => {
    assert.equal(getDashboardGlobalFailure(allOk()), false);
  });

  it("2. only tasks fail → no global failure", () => {
    assert.equal(getDashboardGlobalFailure({ ...allOk(), taskResult: FAIL }), false);
  });

  it("3. only cases fail → no global failure", () => {
    assert.equal(getDashboardGlobalFailure({ ...allOk(), caseResult: FAIL }), false);
  });

  it("4. tasks AND cases fail → global failure", () => {
    assert.equal(getDashboardGlobalFailure({ ...allOk(), taskResult: FAIL, caseResult: FAIL }), true);
  });

  it("5. only agenda fails → no global failure", () => {
    assert.equal(getDashboardGlobalFailure({ ...allOk(), agendaResult: FAIL }), false);
  });

  it("6. only stats fails → no global failure", () => {
    assert.equal(getDashboardGlobalFailure({ ...allOk(), statsResult: FAIL }), false);
  });

  it("7. only operational fails → no global failure", () => {
    assert.equal(getDashboardGlobalFailure({ ...allOk(), operationalResult: FAIL }), false);
  });

  it("8. only communications fails → no global failure", () => {
    assert.equal(getDashboardGlobalFailure({ ...allOk(), communicationResult: FAIL }), false);
  });

  it("9. all fail → global failure (tasks AND cases both null)", () => {
    assert.equal(getDashboardGlobalFailure({
      taskResult: FAIL,
      caseResult: FAIL,
      agendaResult: FAIL,
      statsResult: FAIL,
      communicationResult: FAIL,
      operationalResult: FAIL,
    }), true);
  });

  it("10. cases + agenda + operational fail, tasks OK → no global failure", () => {
    assert.equal(getDashboardGlobalFailure({
      ...allOk(),
      caseResult: FAIL,
      agendaResult: FAIL,
      operationalResult: FAIL,
    }), false);
  });

  it("11. tasks + operational fail → no global failure (cases still OK)", () => {
    assert.equal(getDashboardGlobalFailure({
      ...allOk(),
      taskResult: FAIL,
      operationalResult: FAIL,
    }), false);
  });
});

describe("getDashboardSectionFailure — section failure banner", () => {
  it("all available → no section failure", () => {
    const avail = deriveDashboardAvailability(allOk());
    assert.equal(getDashboardSectionFailure(avail, false, false), false);
  });

  it("one section unavailable → section failure shown", () => {
    const avail = deriveDashboardAvailability({ ...allOk(), agendaResult: FAIL });
    assert.equal(getDashboardSectionFailure(avail, false, false), true);
  });

  it("suppressed during loading", () => {
    const avail = deriveDashboardAvailability({ ...allOk(), agendaResult: FAIL });
    assert.equal(getDashboardSectionFailure(avail, false, true), false);
  });

  it("suppressed when critical failure active", () => {
    const avail = deriveDashboardAvailability({ ...allOk(), taskResult: FAIL, caseResult: FAIL });
    assert.equal(getDashboardSectionFailure(avail, true, false), false);
  });

  it("multiple sections unavailable → section failure shown", () => {
    const avail = deriveDashboardAvailability({
      ...allOk(),
      agendaResult: FAIL,
      statsResult: FAIL,
    });
    assert.equal(getDashboardSectionFailure(avail, false, false), true);
  });
});

describe("failure vs empty state distinction", () => {
  it("communications failed → availability.communications is false (distinct from empty)", () => {
    const avail = deriveDashboardAvailability({ ...allOk(), communicationResult: FAIL });
    assert.equal(avail.communications, false);
  });

  it("communications successful empty → availability.communications is true", () => {
    const avail = deriveDashboardAvailability({
      ...allOk(),
      communicationResult: { communications: [] },
    });
    assert.equal(avail.communications, true);
  });

  it("agenda failed → availability.agenda is false (distinct from empty)", () => {
    const avail = deriveDashboardAvailability({ ...allOk(), agendaResult: FAIL });
    assert.equal(avail.agenda, false);
  });

  it("agenda successful empty → availability.agenda is true", () => {
    const avail = deriveDashboardAvailability({
      ...allOk(),
      agendaResult: { days: [], summary: { total: 0, overdue: 0 } },
    });
    assert.equal(avail.agenda, true);
  });

  it("operational failed → availability.operational is false (distinct from empty)", () => {
    const avail = deriveDashboardAvailability({ ...allOk(), operationalResult: FAIL });
    assert.equal(avail.operational, false);
  });

  it("operational successful empty → availability.operational is true", () => {
    const avail = deriveDashboardAvailability({
      ...allOk(),
      operationalResult: { resume: { item: null }, groups: [], summary: { openCaseCount: 0 } },
    });
    assert.equal(avail.operational, true);
  });

  it("stats failed → availability.stats is false", () => {
    const avail = deriveDashboardAvailability({ ...allOk(), statsResult: FAIL });
    assert.equal(avail.stats, false);
  });

  it("stats successful empty → availability.stats is true", () => {
    const avail = deriveDashboardAvailability({
      ...allOk(),
      statsResult: { recentActivity: [] },
    });
    assert.equal(avail.stats, true);
  });
});
