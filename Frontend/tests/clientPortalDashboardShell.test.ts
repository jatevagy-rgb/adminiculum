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
  assert.match(source, /getCases\(1, 100, undefined, clientId\)/);
  assert.match(source, /getClient\(clientId\)/);
  // Cases tile goes to the dedicated client-scoped cases surface.
  assert.match(source, /\/clients\/\$\{encodeURIComponent\(clientId\)\}\/cases/);
  // Communications tile preserves the existing clientId scope param.
  assert.match(source, /\/communications\?clientId=\$\{encodeURIComponent\(clientId\)\}/);
  // Work hours tile preserves the existing clientId deep-link param.
  assert.match(source, /\/time-entries\?clientId=\$\{encodeURIComponent\(clientId\)\}/);
  // No cross-client bare /cases or /communications or /time-entries links.
  const hrefs = [...source.matchAll(/href="(\/[^"]+)"/g)].map((m) => m[1]);
  for (const bare of ["/cases", "/communications", "/time-entries", "/client-portal-admin"]) {
    if (bare === "/client-portal-admin") continue; // global admin entry point is intentional
    assert.ok(!hrefs.includes(bare), `unscoped destination ${bare} must not be linked`);
  }
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

test("calendar tile is a truthful deep-link with no fabricated count", () => {
  // No client-filtered calendar API exists; /deadlines is the proven surface.
  assert.match(source, /href="\/deadlines"/);
  assert.match(source, /Naptár/);
  const tileStart = order("Naptár tile", source.indexOf("Naptár"));
  const tileEnd = source.indexOf("</Link>", tileStart);
  const tile = source.slice(tileStart, tileEnd);
  assert.doesNotMatch(tile, /\{[^}]*Count[^}]*\}|\d{4,}/, "calendar tile must not render a fabricated numeric count");
});

test("closed-this-month tile is non-numeric — no fabricated closure metric", () => {
  const tileStart = order("Lezárt ebben a hónapban tile", source.indexOf("Lezárt ebben a hónapban"));
  const tileEnd = source.indexOf("</Link>", tileStart);
  const tile = source.slice(tileStart, tileEnd);
  assert.match(tile, /Lezárt ügyek megnyitása/);
  assert.doesNotMatch(tile, /\{[^}]*[Cc]ount[^}]*\}|\{[^}]*\.length[^}]*\}/, "closed-this-month must not render a numeric metric");
  // No closure-timestamp invention: updatedAt must not stand in for closedAt.
  assert.ok(!source.includes("closedAt"), "case list has no authoritative closedAt — do not fabricate it");
  assert.doesNotMatch(source, /updatedAt.*month|month.*updatedAt/i);
});

test("open-cases count is derived only from the authoritative status field", () => {
  assert.match(source, /cases\.filter\(\(item\) => item\.status !== "CLOSED"\)\.length/);
  assert.match(source, /Nyitott ügyek/);
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
