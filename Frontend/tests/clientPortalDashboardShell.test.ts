import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

// Client-scoped portal administration dashboard shell on
// /clients/[clientId]/portal. Source-level regression contract: every tile
// must use an existing, proven client-scoped destination; no fabricated
// metrics; the existing portal control plane stays intact below the dashboard.

const source = readFileSync("src/app/clients/[clientId]/portal/page.tsx", "utf8");

const order = (label: string, index: number) => {
  assert.notEqual(index, -1, `${label} missing from portal dashboard page`);
  return index;
};

test("dashboard is client-scoped: all fetches and tiles carry client context", () => {
  assert.match(source, /listAdminWorkspaces\(clientId\)/);
  assert.doesNotMatch(source, /getCases|caseScope|openCasesCount/);
  assert.match(source, /getClient\(clientId\)/);
  // Case tiles land on the proven scope-filtered, client-scoped Cases surface.
  assert.match(source, /\/cases\?clientId=\$\{encodeURIComponent\(clientId\)\}&scope=ACTIVE/);
  assert.match(source, /\/cases\?clientId=\$\{encodeURIComponent\(clientId\)\}&scope=CLOSED/);
  // Communications tile preserves the existing clientId scope param.
  assert.match(source, /\/communications\?clientId=\$\{encodeURIComponent\(clientId\)\}/);
  // Work hours tile preserves the existing clientId deep-link param.
  assert.match(source, /\/time-entries\?clientId=\$\{encodeURIComponent\(clientId\)\}/);
  // No cross-client bare /cases, /communications, or /time-entries links.
  const literalHrefs = [...source.matchAll(/href="(\/[^"]+)"/g)].map((m) => m[1]);
  for (const bare of ["/cases", "/communications", "/time-entries"]) {
    assert.ok(!literalHrefs.includes(bare), `unscoped destination ${bare} must not be linked`);
  }
  const templateHrefs = [...source.matchAll(/href=\{`([^`]+)`\}/g)].map((m) => m[1]);
  for (const href of templateHrefs) {
    if (href.startsWith("/cases") || href.startsWith("/communications") || href.startsWith("/time-entries")) {
      assert.ok(href.includes("clientId"), `case/comms/time destination must carry clientId: ${href}`);
    }
  }
});

test("portal control plane has no case KPI dependency", () => {
  // The portal-critical loads must not share a Promise.all with the optional
  // case fetch: a cases failure may not blank the settings/status UI.
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

test("organization tile is gated on organizationMode — hidden for INDIVIDUAL", () => {
  assert.match(
    source,
    /\{organizationMode \? \(\s*<Link[\s\S]*?\/clients\/\$\{encodeURIComponent\(clientId\)\}\/szervezet[\s\S]*?Szervezeti felépítés[\s\S]*?<\/Link>\s*\) : null\}/,
    "Szervezeti felépítés tile must render only when organizationMode",
  );
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
  // Terminal statuses (FINAL/CANCELLED/ARCHIVED) excluded via isClosedCase.
  assert.doesNotMatch(source, /isClosedCase|caseScope|openCasesCount|Nyitott ügyek/);
});

test("existing portal controls remain reachable under a secondary settings section", () => {
  assert.match(source, /Portál beállításai/);
  assert.match(source, /relationshipMode/);
  assert.match(source, /PORTAL_CENTRIC/);
  assert.match(source, /EMAIL_CENTRIC/);
  assert.match(source, /CONNECTED_SYSTEM/);
  assert.match(source, /savePortalSettings\(\{ relationshipMode:/);
  assert.match(source, /savePortalSettings\(\{ portalAccessEnabled:/);
  assert.match(source, /savePortalSettings\(\{ connectedSystemState:/);
  assert.match(source, /updateClient\(client\.id, patch\)/);
  // Dashboard tiles appear before the settings section.
  const iTiles = order("dashboard tiles", source.indexOf("Nyitott ügyek"));
  const iSettings = order("Portál beállításai", source.indexOf("Portál beállításai"));
  assert.ok(iTiles < iSettings, "operational dashboard must come before Portál beállításai");
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
  assert.ok(!source.includes("invoice"), "portal dashboard must not touch invoice logic");
  assert.ok(!source.includes("szamlatervezet"), "portal dashboard must not touch invoice drafts");
  // Customer-facing portal app untouched by definition — this file is the workforce route only.
  assert.ok(!source.includes('from "@/components/portal/'), "must not import customer-facing portal components");
});
