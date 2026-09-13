import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  availablePersonFields,
  buildKnownPartyTransfer,
} from "../src/lib/organizationPersonMapping";
import type { OrgPersonDTO } from "../src/lib/clientOrganizationApi";

const person: OrgPersonDTO = {
  id: "p1",
  clientId: "c1",
  organizationGroupId: "g1",
  managerPersonId: "m1",
  deputyPersonId: null,
  name: "Kiss Erzsébet",
  jobTitle: "Ügyvezető igazgató",
  email: "kiss.erzsebet@example.hu",
  phone: "+36 30 555 0000",
  employmentStatus: "ACTIVE",
  startDate: null,
  endDate: null,
  responsibilitiesSummary: "Szerződésgazda",
  portalMembershipId: "pm-9",
  portalMembershipRole: "ADMIN",
};

describe("organizationPersonMapping", () => {
  it("only offers non-empty transferable fields", () => {
    const fields = availablePersonFields(person);
    assert.deepEqual(
      fields.map((f) => f.key).sort(),
      ["contactEmail", "name", "notes", "phone", "role"],
    );
  });

  it("skips empty values", () => {
    const sparse = { ...person, email: null, phone: "  ", responsibilitiesSummary: null };
    const keys = availablePersonFields(sparse).map((f) => f.key);
    assert.equal(keys.includes("contactEmail"), false);
    assert.equal(keys.includes("phone"), false);
    assert.equal(keys.includes("notes"), false);
    assert.deepEqual(keys, ["name", "role"]);
  });

  it("copies only explicitly selected fields", () => {
    const transfer = buildKnownPartyTransfer(person, new Set(["name", "role"]));
    assert.deepEqual(transfer, { name: "Kiss Erzsébet", role: "Ügyvezető igazgató" });
    assert.equal("contactEmail" in transfer, false);
    assert.equal("phone" in transfer, false);
  });

  it("transfers nothing on empty selection (cancel transfers nothing)", () => {
    assert.deepEqual(buildKnownPartyTransfer(person, new Set()), {});
  });

  it("membership and grant data can never be transferred", () => {
    const transfer = buildKnownPartyTransfer(person, new Set(["name", "contactEmail", "phone", "role", "notes"])) as Record<string, unknown>;
    const forbidden = ["portalMembershipId", "portalMembershipRole", "organizationGroupId", "managerPersonId", "deputyPersonId", "employmentStatus"];
    for (const key of forbidden) {
      assert.equal(key in transfer, false, `${key} must not be transferable`);
    }
  });
});
