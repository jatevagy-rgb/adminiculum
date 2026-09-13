import { test } from "node:test";
import assert from "node:assert/strict";
import { visibleOrganizationPersonIds } from "../src/lib/organizationHierarchy";
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
