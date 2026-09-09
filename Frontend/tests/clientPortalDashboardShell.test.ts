import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

// Client-scoped portal administration regression contract for
// /clients/[clientId]/portal. Operational dashboard tiles belong on the
// client overview; this page must remain focused on portal administration.

const source = readFileSync("src/app/clients/[clientId]/portal/page.tsx", "utf8");

test("portal shell is admin-scoped and contains no operational dashboard tiles", () => {
  assert.match(source, /listAdminWorkspaces\(clientId\)/);
  assert.match(source, /getClient\(clientId\)/);
  assert.doesNotMatch(
    source,
    /getCases|caseScope|openCasesCount|Naptár|\/deadlines|scope=ACTIVE|scope=CLOSED|communications\?clientId|time-entries\?clientId/,
  );
});

test("portal control plane has no case KPI dependency", () => {
  assert.match(source, /Promise\.all\(\[getClient\(clientId\), listAdminWorkspaces\(clientId\)\]\)/);
  assert.ok(
    !source.includes("Promise.all([getClient(clientId), listAdminWorkspaces(clientId), getCases"),
    "getCases must not be a hard dependency of the portal control plane load",
  );
  assert.doesNotMatch(source, /getCases|caseScopeFailed|caseScopeComplete/);
});

test("ClientWorkspaceTabs and client name remain visible", () => {
  assert.match(source, /<ClientWorkspaceTabs clientId=\{client\.id\} active="portal"/);
  assert.match(source, /<h1[^>]*>\{client\.name\}<\/h1>/);
});

test("portal status and workspace mode are visible at the top", () => {
  assert.match(source, /Portál előkészítve/);
  assert.match(source, /Portál hozzáférés kikapcsolva/);
  assert.match(source, /statusLabels\[workspace\.status\]/);
  assert.match(source, /modeLabels\[workspace\.mode\]/);
});

test("organizationMode derivation covers ORGANIZATION and CASE_RELAY", () => {
  assert.match(source, /workspace\?\.mode === "ORGANIZATION" \|\| workspace\?\.mode === "CASE_RELAY"/);
});

test("portal page has no operational calendar tile", () => {
  assert.doesNotMatch(source, /Naptár|\/deadlines/);
});

test("portal page has no closed-case operational tile", () => {
  assert.doesNotMatch(source, /Lezárt ebben a hónapban|Lezárt ügyek megnyitása/);
});

test("portal page has no open-case count machinery", () => {
  assert.doesNotMatch(source, /isClosedCase|caseScope|openCasesCount|Nyitott ügyek/);
});

test("existing portal controls remain reachable under Portál beállításai", () => {
  assert.match(source, /Portál beállításai/);
  assert.match(source, /relationshipMode/);
  assert.match(source, /PORTAL_CENTRIC/);
  assert.match(source, /EMAIL_CENTRIC/);
  assert.match(source, /CONNECTED_SYSTEM/);
  assert.match(source, /savePortalSettings\(\{ relationshipMode:/);
  assert.match(source, /savePortalSettings\(\{ portalAccessEnabled:/);
  assert.match(source, /savePortalSettings\(\{ connectedSystemState:/);
  assert.match(source, /updateClient\(client\.id, patch\)/);
});

test("global /client-portal-admin remains reachable", () => {
  assert.match(source, /href="\/client-portal-admin"/);
  assert.match(source, /Portál adminisztráció megnyitása/);
});

test("workspace status, mode and membership counts remain", () => {
  assert.match(source, /activeMembershipCount/);
  assert.match(source, /Ehhez az ügyfélhez még nincs létrehozott portál\./);
});

test("no billing/invoice/customer-portal concerns enter this workforce admin page", () => {
  assert.ok(!source.includes("invoice"), "portal administration must not touch invoice logic");
  assert.ok(!source.includes("szamlatervezet"), "portal administration must not touch invoice drafts");
  assert.ok(!source.includes('from "@/components/portal/'), "must not import customer-facing portal components");
});
