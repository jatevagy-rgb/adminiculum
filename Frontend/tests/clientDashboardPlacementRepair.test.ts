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
  // The calendar placeholder was replaced by the real client-scoped calendar route.
  assert.match(overview, /\/clients\/\$\{encodeURIComponent\(clientId\)\}\/calendar/);
  assert.match(overview, />Naptár →</);
  assert.match(overview, /organizationMode \? <Link[\s\S]*szervezet/);
  assert.match(overview, /organizationMode \? <Link[^>]+vallalati-mukodes[^>]*>[\s\S]*?Grow with us/);
  assert.match(overview, /organizationMode \? <Link[^>]+vallalati-mukodes#compliance[^>]*>[\s\S]*?Compliance/);
  assert.doesNotMatch(overview, /<ClientControlCenter/);
});

test("portal contains settings only and no orphaned case KPI machinery", () => {
  assert.doesNotMatch(portal, /getCases|CaseListItem|isClosedCase|caseScope|openCasesCount/);
  assert.match(portal, /ClientWorkspaceTabs/);
  assert.match(portal, /Portál beállításai/);
  assert.match(portal, /Portál adminisztráció megnyitása/);
});
