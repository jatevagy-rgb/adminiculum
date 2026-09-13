import { test } from "node:test";
import assert from "node:assert/strict";
import { organizationGroupStarts, organizationRootPeople, visibleOrganizationPersonIds } from "../src/lib/organizationHierarchy";
import type { OrgPersonDTO } from "../src/lib/clientOrganizationApi";

const person = (id: string, groupId: string | null, managerPersonId: string | null): OrgPersonDTO => ({ id, clientId: "client", organizationGroupId: groupId, managerPersonId, deputyPersonId: null, name: id, jobTitle: null, email: null, phone: null, employmentStatus: "ACTIVE", startDate: null, endDate: null, responsibilitiesSummary: null });

test("CEO, Sales, and Finance reporting tree renders every person exactly once", () => {
  const people = [
    person("ceo", null, null),
    person("sales-manager", "sales", "ceo"),
    person("sales-employee", "sales", "sales-manager"),
    person("finance-employee", "finance", "ceo"),
  ];
  const visible = visibleOrganizationPersonIds(people, ["sales", "finance"]);
  assert.deepEqual(visible, ["ceo", "sales-manager", "sales-employee", "finance-employee"]);
  assert.equal(new Set(visible).size, people.length);
});

test("manager-less grouped people stay in their group and only ungrouped people are global roots", () => {
  const people = [person("hr-lead", "hr", null), person("unassigned-lead", null, null)];
  assert.deepEqual(organizationRootPeople(people).map((item) => item.id), ["unassigned-lead"]);
  assert.deepEqual(organizationGroupStarts(people, "hr").map((item) => item.id), ["hr-lead"]);
});

test("the active chart contract excludes ENDED rows before rendering", () => {
  const people = [person("active", "sales", null), { ...person("ended", "sales", null), employmentStatus: "ENDED" }];
  const active = people.filter((item) => item.employmentStatus !== "ENDED");
  assert.deepEqual(visibleOrganizationPersonIds(active, ["sales"]), ["active"]);
});
