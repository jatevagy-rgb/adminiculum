import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const dialog = readFileSync("src/components/cases/CompactNewCaseDialog.tsx", "utf8");
const api = readFileSync("src/lib/api.ts", "utf8");

test("new-case dialog offers an optional canonical customer-side owner", () => {
  assert.match(dialog, /Ügygazda az ügyfélnél \(opcionális\)/);
  assert.match(dialog, /ownerCandidates\.map\(\(p\) =>/);
  assert.match(dialog, /Nincs kijelölve/);
  assert.match(dialog, /clientOrganizationApi\.listPersons\(clientId\)/);
  assert.match(dialog, /p\.employmentStatus === "ACTIVE"/);
  assert.match(dialog, /!p\.startDate \|\| new Date\(p\.startDate\) <= now/);
  assert.match(dialog, /!p\.endDate \|\| new Date\(p\.endDate\) >= now/);
});

test("new-case dialog forwards the owner id through case creation", () => {
  assert.match(dialog, /clientOwnerPersonId: ownerPersonId \|\| undefined/);
});

test("createCase API carries clientOwnerPersonId", () => {
  assert.match(api, /clientOwnerPersonId\?: string \| null;/);
  assert.match(api, /if \(clientOwnerPersonId\) payload\.clientOwnerPersonId = clientOwnerPersonId;/);
});
