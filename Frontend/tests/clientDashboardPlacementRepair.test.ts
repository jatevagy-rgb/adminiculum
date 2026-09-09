import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";

const overview = fs.readFileSync("src/app/clients/[clientId]/page.tsx", "utf8");
const portal = fs.readFileSync("src/app/clients/[clientId]/portal/page.tsx", "utf8");

test("operational links live on overview and remain client scoped", () => {
  assert.match(overview, /Ügyfél áttekintés/);
  assert.match(overview, /communications\?clientId=/);
  assert.match(overview, /cases\?clientId=.*scope=ACTIVE/);
  assert.match(overview, /cases\?clientId=.*scope=CLOSED/);
  assert.match(overview, /time-entries\?clientId=/);
  assert.match(overview, /Ügyfélnaptár kialakítás alatt/);
  const calendarStart = overview.indexOf("Naptár");
  const calendar = overview.slice(calendarStart, overview.indexOf("<Link", calendarStart));
  assert.doesNotMatch(calendar, /href/);
  assert.match(overview, /organizationMode \? <Link[\s\S]*szervezet/);
});

test("portal contains settings only and no orphaned case KPI machinery", () => {
  assert.doesNotMatch(portal, /getCases|CaseListItem|isClosedCase|caseScope|openCasesCount/);
  assert.match(portal, /ClientWorkspaceTabs/);
  assert.match(portal, /Portál beállításai/);
  assert.match(portal, /Portál adminisztráció megnyitása/);
});
