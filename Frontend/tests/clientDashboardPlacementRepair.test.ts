import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";

const overview = fs.readFileSync("src/app/clients/[clientId]/page.tsx", "utf8");
const portal = fs.readFileSync("src/app/clients/[clientId]/portal/page.tsx", "utf8");

test("operational links remain client scoped on overview without a second main navigation", () => {
  // Canonical module destinations are owned by ClientWorkspaceTabs.
  assert.match(overview, /<ClientWorkspaceTabs clientId=\{clientId\} active="overview"/);

  // Non-canonical operational shortcuts remain available on the dossier.
  assert.match(overview, /cases\?clientId=.*scope=ACTIVE/);
  assert.match(overview, /cases\?clientId=.*scope=CLOSED/);
  assert.match(overview, /time-entries\?clientId=/);

  // The duplicate main navigation grid is gone; canonical destinations are not
  // repeated as dossier tiles.
  assert.doesNotMatch(overview, /client-overview-heading/);
  assert.doesNotMatch(overview, /organizationMode \? <Link/);
  assert.doesNotMatch(overview, />Naptár →</);
  assert.doesNotMatch(overview, />Grow with us/);
  assert.doesNotMatch(overview, />Compliance →</);
  assert.doesNotMatch(overview, /Szervezeti felépítés →/);
  assert.doesNotMatch(overview, /communications\?clientId=/);
  assert.doesNotMatch(overview, /vallalati-mukodes#compliance/);
  assert.doesNotMatch(overview, /<ClientControlCenter/);
});

test("portal contains settings only and no orphaned case KPI machinery", () => {
  assert.doesNotMatch(portal, /getCases|CaseListItem|isClosedCase|caseScope|openCasesCount/);
  assert.match(portal, /ClientWorkspaceTabs/);
  assert.match(portal, /Portál beállításai/);
  assert.match(portal, /Portál adminisztráció megnyitása/);
});
