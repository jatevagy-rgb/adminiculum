import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  buildOrgGraph,
  computeDepths,
  computeFilteredPersonIds,
  matchesFilter,
  type OrgFilter,
} from "../src/lib/orgMapGraph";
import { isOrganizationClient, type OrgMapDTO, type OrgMapPersonDTO } from "../src/lib/orgMapApi";

function person(partial: Partial<OrgMapPersonDTO> & { id: string; name: string }): OrgMapPersonDTO {
  return {
    jobTitle: null,
    employmentStatus: "ACTIVE",
    organizationGroupId: null,
    organizationGroupName: null,
    managerPersonId: null,
    managerName: null,
    deputyPersonId: null,
    deputyName: null,
    responsibilitiesSummary: null,
    portalMembershipId: null,
    portalStatus: "NONE",
    responsibilities: [],
    accessSummary: { casesShared: 0, unitSummaries: 0, organizationSummaries: 0, companySummaryVisible: false },
    ...partial,
  };
}

function map(persons: OrgMapPersonDTO[], groups: OrgMapDTO["groups"] = [], isOrganizational = true): OrgMapDTO {
  return {
    client: { id: "c1", name: "Acme", relationshipMode: "PORTAL_CENTRIC" },
    workspaceModes: isOrganizational ? ["ORGANIZATION"] : ["INDIVIDUAL"],
    isOrganizational,
    groups,
    persons,
  };
}

describe("orgMapGraph — buildOrgGraph", () => {
  it("builds manager edges and detects roots", () => {
    const a = person({ id: "a", name: "A" });
    const b = person({ id: "b", name: "B", managerPersonId: "a", managerName: "A" });
    const c = person({ id: "c", name: "C", managerPersonId: "b", managerName: "B" });
    const g = buildOrgGraph(map([a, b, c]));
    assert.deepEqual(g.roots, ["a"]);
    assert.ok(g.edges.some((e) => e.source === "a" && e.target === "b" && e.kind === "manager"));
    assert.ok(g.edges.some((e) => e.source === "b" && e.target === "c" && e.kind === "manager"));
  });

  it("adds a deputy edge from the person back to their deputy", () => {
    const a = person({ id: "a", name: "A" });
    const d = person({ id: "d", name: "D", deputyPersonId: "a" });
    const g = buildOrgGraph(map([a, d]));
    assert.ok(g.edges.some((e) => e.source === "d" && e.target === "a" && e.kind === "deputy"));
  });

  it("treats a person with a dangling manager as a root (never lost)", () => {
    const orphan = person({ id: "x", name: "X", managerPersonId: "ghost" });
    const g = buildOrgGraph(map([orphan]));
    assert.deepEqual(g.roots, ["x"]);
    assert.equal(g.edges.length, 0);
  });

  it("does not infinite-loop on malformed cyclic manager data", () => {
    const a = person({ id: "a", name: "A", managerPersonId: "b" });
    const b = person({ id: "b", name: "B", managerPersonId: "a" });
    const depths = computeDepths(map([a, b]), buildOrgGraph(map([a, b])));
    // both must get a finite depth
    assert.equal(typeof depths.get("a"), "number");
    assert.equal(typeof depths.get("b"), "number");
  });
});

describe("orgMapGraph — filtering", () => {
  const mgmt = { id: "g1", clientId: "c1", workspaceId: null, name: "Vezetés", descriptionSafe: null, status: "ACTIVE", parentGroupId: null };
  const personA = person({
    id: "a",
    name: "Anna Vezető",
    jobTitle: "Ügyvezető",
    organizationGroupId: "g1",
    organizationGroupName: "Vezetés",
    portalStatus: "ACTIVE",
    responsibilities: [{ id: "r1", type: "MANAGEMENT", label: "Ügyvezetés" }],
  });
  const personB = person({
    id: "b",
    name: "Béla Dolgozó",
    organizationGroupId: "g1",
    organizationGroupName: "Vezetés",
    managerPersonId: "a",
    portalStatus: "NONE",
    responsibilities: [{ id: "r2", type: "OPERATIONS", label: "Operáció" }],
  });

  it("matches by name", () => {
    const filter: OrgFilter = { query: "anna", groupId: null, portalStatus: null, responsibilityType: null };
    assert.equal(matchesFilter(personA, filter), true);
    assert.equal(matchesFilter(personB, filter), false);
  });

  it("matches by portal status", () => {
    const filter: OrgFilter = { query: "", groupId: null, portalStatus: "NONE", responsibilityType: null };
    assert.equal(matchesFilter(personB, filter), true);
    assert.equal(matchesFilter(personA, filter), false);
  });

  it("retains manager-chain ancestors when a deep person matches", () => {
    const c = person({
      id: "c",
      name: "Cecil Beosztott",
      managerPersonId: "b",
      organizationGroupName: "Vezetés",
    });
    const data = map([personA, personB, c], [mgmt]);
    const kept = computeFilteredPersonIds(data, { query: "cecil", groupId: null, portalStatus: null, responsibilityType: null });
    assert.ok(kept.has("c"), "matched person kept");
    assert.ok(kept.has("b"), "direct manager kept for context");
    assert.ok(kept.has("a"), "root manager kept for context");
  });

  it("empty filter keeps everyone", () => {
    const data = map([personA, personB], [mgmt]);
    const kept = computeFilteredPersonIds(data, { query: "", groupId: null, portalStatus: null, responsibilityType: null });
    assert.equal(kept.size, 2);
  });
});

describe("orgMapApi — INDIVIDUAL / ORGANIZATION guard", () => {
  it("treats a client with an ORGANIZATION workspace as organizational", () => {
    assert.equal(isOrganizationClient(map([], [], true)), true);
  });

  it("treats an INDIVIDUAL-only client as not organizational (even with people)", () => {
    const m = map([person({ id: "a", name: "A" })], [], false);
    assert.equal(isOrganizationClient(m), false);
  });

  it("returns false for null/undefined map", () => {
    assert.equal(isOrganizationClient(null), false);
  });
});