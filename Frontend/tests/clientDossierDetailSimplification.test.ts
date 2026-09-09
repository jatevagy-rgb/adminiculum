import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";

const source = fs.readFileSync("src/app/clients/[clientId]/page.tsx", "utf8");
const controlCenterExists = fs.existsSync("src/components/clients/ClientControlCenter.tsx");

const order = (label: string, index: number) => {
  assert.notEqual(index, -1, `${label} missing from dossier page`);
  return index;
};

test("client dossier has identity-first header, canonical color and portal entry", () => {
  assert.match(source, /<h1[^>]*>\{client\.name\}<\/h1>/);
  assert.match(source, /getClientColorDefinition\(client\.colorKey\)/);
  assert.match(source, /clientColorDef\.borderClass/);
  assert.match(source, /clients\/\$\{encodeURIComponent\(clientId\)\}\/portal/);
  assert.match(source, /Ügyfélportál kezelése/);
});

test("dossier keeps detailed identity editing and secondary House Style access", () => {
  assert.match(source, /Ügyfélazonosság és kapcsolódó adatok/);
  for (const field of ["client.email", "client.phone", "client.address", "client.taxNumber", "client.companyRegistrationNumber"]) assert.match(source, new RegExp(field.replace(".", "\\.")));
  assert.match(source, /onClick=\{openEditClient\}/);
  assert.match(source, /id="house-style"/);
  assert.match(source, /ClientHouseStylePanel/);
});

test("ClientControlCenter is not rendered but the component source is preserved", () => {
  assert.ok(!source.includes("ClientControlCenter"), "dossier page must not render/import ClientControlCenter");
  assert.ok(controlCenterExists, "ClientControlCenter.tsx source file must still exist");
});

test("ClientWorkspaceTabs is rendered client-scoped below the header", () => {
  const headerEnd = source.indexOf("</header>");
  const tabsIdx = order("ClientWorkspaceTabs", source.indexOf("<ClientWorkspaceTabs clientId={clientId}"));
  assert.ok(headerEnd !== -1 && tabsIdx > headerEnd, "ClientWorkspaceTabs must render after the header");
  assert.match(source, /active="overview" organizationMode=\{organizationMode\}/);
});

test("primary order: identity → Kapcsolt ügyek → További eszközök → secondary config → corporate modules", () => {
  const iIdentity = order("Ügyfélazonosság", source.indexOf("Ügyfélazonosság és kapcsolódó adatok"));
  const iCases = order("Kapcsolt ügyek", source.indexOf(">Kapcsolt ügyek<"));
  const iTools = order("További eszközök", source.indexOf('aria-label="További eszközök"'));
  const iRate = order("HourlyRateCard", source.indexOf("<HourlyRateCard"));
  const iHouse = order("House style", source.indexOf('id="house-style"'));
  const iCorp = order("Vállalati modulok", source.indexOf("Vállalati governance és háttér"));

  assert.ok(iIdentity < iCases, "identity must come before related cases");
  assert.ok(iCases < iTools, "Kapcsolt ügyek must come before secondary tools");
  assert.ok(iTools < iRate && iTools < iHouse, "secondary tools must come before HourlyRate/House Style");
  assert.ok(iRate < iCorp && iHouse < iCorp, "secondary config must come before corporate modules");
  // House Style + HourlyRateCard stay secondary (after related cases).
  assert.ok(iCases < iRate && iCases < iHouse, "House Style and HourlyRateCard must appear after related cases");
});

test("the removed large Gyors műveletek card stays removed — no dashboard/card wall returns", () => {
  assert.ok(!source.includes("Gyors műveletek"), "the large 'Gyors műveletek' card must not be reintroduced");
  assert.ok(!source.includes("Műveleti központ"), "the old quick-actions container styling must not return");
});

test("Munkaórák, Számlázás előkészítése, Dokumentum hozzáadása destinations are preserved", () => {
  // Exact original destinations recovered from the pre-repair implementation.
  assert.match(source, /\/time-entries\?clientId=\$\{encodeURIComponent\(clientId\)\}/);
  assert.match(source, />Munkaórák</);
  assert.match(source, /\/clients\/\$\{encodeURIComponent\(clientId\)\}\/szamlazas/);
  assert.match(source, />Számlázás előkészítése</);
  assert.match(source, />Dokumentum hozzáadása</);
  // Original routing recovered verbatim: active (non-CLOSED) case documents
  // page, else client-filtered cases fallback.
  assert.match(source, /cases\.find\(\(item\) => item\.status !== "CLOSED"\)/);
  assert.match(source, /\/cases\/\$\{cases\.find\(\(item\) => item\.status !== "CLOSED"\)\?\.id\}\/documents/);
  assert.match(source, /\/cases\?clientId=\$\{encodeURIComponent\(clientId\)\}/);
});

test("organization-only tool stays organization-gated; individual empty corporate clutter stays suppressed", () => {
  assert.match(
    source,
    /\{organizationMode && \(\s*<Link[\s\S]*?\/workgroups`\}[\s\S]*?Munkacsoportok[\s\S]*?<\/Link>\s*\)\}/,
    "Munkacsoportok in the secondary tools must remain organizationMode-gated",
  );
  // Individual-mode suppression of empty corporate identity fields is preserved.
  assert.match(source, /organizationMode \|\| client\.taxNumber/);
  assert.match(source, /organizationMode \|\| client\.companyRegistrationNumber/);
  assert.match(source, /organizationMode \|\| client\.authorizedRepresentative/);
  // Populated legacy values remain renderable for individuals too.
  assert.match(source, /client\.taxNumber \|\| "—"/);
  assert.match(source, /\{organizationMode && \([\s\S]*?<ClientOrganizationPreview/);
});

test("client scoping and working data fetches are unchanged", () => {
  assert.match(source, /getCases\(1, 100, undefined, clientId\)/);
  assert.match(source, /listAdminWorkspaces\(clientId\)/);
  assert.match(source, /getCaseDocuments\(item\.id\)/);
  assert.match(source, /getClientCommunicationSummary\(clientId, 15\)/);
  // Case links remain client-scoped via the fetched list.
  assert.match(source, /\/cases\/\$\{item\.id\}/);
  // New case + editing remain reachable.
  assert.match(source, /setShowNewCaseModal\(true\)/);
  assert.match(source, /<CompactNewCaseDialog/);
  assert.match(source, /showEditModal &&/);
  assert.match(source, /Ügyfél szerkesztése/);
});

test("no backend/billing/invoice implementation concerns exist in the dossier page", () => {
  assert.ok(!source.includes("invoice"), "dossier page must not touch invoice logic");
  assert.ok(!source.includes("billing-prep"), "dossier page must not touch billing-preparation internals");
});
