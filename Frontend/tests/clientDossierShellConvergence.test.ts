/**
 * Client dossier information-density + shell convergence contract.
 *
 * Locks the repaired dossier composition:
 *   canonical client navigation -> dossier hero -> real dossier content ->
 *   compact secondary tools -> one collapsed legacy/detail area.
 *
 * No second main navigation grid, no duplicate hero "Haladó", no lost actions.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';

const root = process.cwd();
const read = (rel: string) => readFileSync(path.join(root, rel), 'utf8');

const DOSSIER = 'src/app/clients/[clientId]/page.tsx';
const TABS = 'src/components/clients/ClientWorkspaceTabs.tsx';

const dossier = () => read(DOSSIER);
const tabs = () => read(TABS);

const at = (src: string, needle: string) => {
  const index = src.indexOf(needle);
  assert.notEqual(index, -1, `expected dossier source to contain: ${needle}`);
  return index;
};

test('SHELL_ORDER: canonical ClientWorkspaceTabs renders before the dossier hero', () => {
  const src = dossier();
  const tabsIndex = at(src, '<ClientWorkspaceTabs clientId={clientId} active="overview"');
  const heroIndex = at(src, '<header className="adm-board-hero');
  assert.ok(tabsIndex < heroIndex, 'ClientWorkspaceTabs must be the first module-level navigation element');
  assert.match(src, /active="overview" organizationMode=\{organizationMode\}/);
});

test('SECOND_MAIN_NAV: the duplicate "Ügyfél áttekintés" navigation grid is gone', () => {
  const src = dossier();
  assert.doesNotMatch(src, /client-overview-heading/);
  assert.ok(!src.includes('Ügyfél áttekintés'), 'the second navigation grid heading must not return');
  for (const duplicateTile of ['>Naptár →<', '>Grow with us →<', '>Compliance →<', '>Szervezeti felépítés →<', '>Kommunikáció →<', '>Munkaórák →<']) {
    assert.ok(!src.includes(duplicateTile), `duplicate canonical tile must be removed: ${duplicateTile}`);
  }
  // Canonical destinations stay owned by the shared client navigation.
  assert.match(tabs(), /\["grow", "Grow", "\/grow"\]/);
  assert.match(tabs(), /\["compliance", "Megfelelés", "\/compliance"\]/);
  assert.match(tabs(), /\["calendar", "Naptár", "\/calendar"\]/);
  assert.match(tabs(), /\["organization", "Szervezet", "\/szervezet"\]/);
});

test('HERO_DUPLICATE_HALADO: the hero has one distinct admin control, not a second Haladó', () => {
  const src = dossier();
  const heroStart = at(src, '<header className="adm-board-hero');
  const heroEnd = src.indexOf('</header>', heroStart);
  const hero = src.slice(heroStart, heroEnd);
  assert.match(hero, /Ügyfélműveletek/);
  assert.doesNotMatch(hero, /••• Haladó/);
  assert.doesNotMatch(src, /••• Haladó/);
  // The canonical Haladó remains on the shared navigation.
  assert.match(tabs(), /••• Haladó/);
  assert.match(tabs(), /Munkacsoportok/);
  assert.match(tabs(), /Dokumentumstílus/);
});

test('LIFECYCLE / NEW_CASE / PORTAL: dossier admin actions are preserved', () => {
  const src = dossier();
  assert.match(src, /<ClientLifecycleControls client=\{client\} onArchived=\{\(\) => router\.push\("\/clients"\)\} \/>/);
  assert.match(src, /setShowNewCaseModal\(true\)/);
  assert.match(src, /<CompactNewCaseDialog/);
  assert.match(src, /initialClientId=\{client\?\.id\}/);
  assert.match(src, /Ügyfélportál kezelése/);
  assert.match(src, /\/clients\/\$\{encodeURIComponent\(clientId\)\}\/portal/);
});

test('LEGACY_DETAIL: legacy dossier surfaces are preserved behind one collapsed area', () => {
  const src = dossier();
  const detailsIndex = at(src, 'id="reszletes-dosszie-adatok"');
  assert.match(src, /const \[legacyDetailsOpen, setLegacyDetailsOpen\] = useState\(false\);/);
  assert.match(src, /open=\{legacyDetailsOpen\}/);
  // Legacy deep-link anchors still resolve and auto-open the collapsed area.
  assert.match(src, /"vallalati-mukodes", "szerzodes-tar", "szervezet"/);
  assert.match(src, /window\.addEventListener\("hashchange", syncFromHash\)/);
  for (const anchor of ['id="vallalati-mukodes"', 'id="szerzodes-tar"', 'id="szervezet"']) {
    assert.ok(at(src, anchor) > detailsIndex, `${anchor} must live inside the collapsed detail area`);
  }
  for (const component of ['<ClientCompanyFoundation', '<ClientContractLibrary', '<ClientOrganizationPreview']) {
    assert.ok(at(src, component) > detailsIndex, `${component} must live inside the collapsed detail area`);
  }
  assert.match(src, /Részletes dosszié-adatok/);
});

test('NO_FAKE_TOTALS: no fabricated KPI counts and bounded list lengths stay non-authoritative', () => {
  const src = dossier();
  assert.doesNotMatch(src, /dossierStats|caseTotalCount|isCasesComplete/);
  assert.doesNotMatch(src, /Összes ügy|Összes dokumentum|Összes kommunikáció/);
  // Existing honest, bounded-list wording is retained (not promoted to totals).
  assert.match(src, /friss dokumentum/);
  assert.match(src, /esemény/);
});

test('WORKING_LINKS: operational destinations remain intact', () => {
  const src = dossier();
  assert.match(src, /cases\?clientId=\$\{encodeURIComponent\(clientId\)\}&scope=ACTIVE/);
  assert.match(src, /cases\?clientId=\$\{encodeURIComponent\(clientId\)\}&scope=CLOSED/);
  assert.match(src, /\/time-entries\?clientId=\$\{encodeURIComponent\(clientId\)\}/);
  assert.match(src, /\/clients\/\$\{encodeURIComponent\(clientId\)\}\/szamlazas/);
  assert.match(src, /\/cases\/\$\{doc\.caseId\}\/documents/);
  assert.match(src, /\/cases\/\$\{item\.id\}/);
  assert.match(src, /id="house-style"/);
  assert.match(src, /<ClientHouseStylePanel/);
  assert.match(src, /<HourlyRateCard/);
});

test('INDIVIDUAL_MODE: organization-only surfaces stay capability-gated', () => {
  const src = dossier();
  assert.match(src, /portalWorkspaces\.some\(/);
  assert.match(src, /item\.mode === "ORGANIZATION" \|\| item\.mode === "CASE_RELAY"/);
  assert.match(src, /const organizationMode = hasOrganizationCapability;/);
  assert.match(src, /organizationMode \|\| client\.taxNumber/);
  assert.match(src, /organizationMode \|\| client\.companyRegistrationNumber/);
  assert.match(src, /organizationMode \|\| client\.authorizedRepresentative/);
  // Workgroups and the organization preview stay organization-only.
  assert.match(src, /\{organizationMode && \(\s*<Link href=\{`\/clients\/\$\{encodeURIComponent\(clientId\)\}\/workgroups`\}/);
  assert.match(src, /\{organizationMode && \([\s\S]*?<ClientOrganizationPreview/);
});

test('HASH_DEEPLINK_SCROLL: the opened detail area scrolls to the requested legacy anchor', () => {
  const src = dossier();
  // The pending anchor is set only from the existing hash, never a new route.
  assert.match(src, /const \[pendingLegacyAnchor, setPendingLegacyAnchor\] = useState<string \| null>\(null\);/);
  assert.match(src, /const anchor = window\.location\.hash\.replace\("#", ""\);/);
  assert.match(src, /setLegacyDetailsOpen\(true\);\s*setPendingLegacyAnchor\(anchor\);/);
  // The scroll runs only once the detail area is actually open, re-corrects while
  // the async dossier lists settle, scrolls only when the target is off-screen,
  // then clears the pending anchor.
  assert.match(src, /if \(!legacyDetailsOpen \|\| !pendingLegacyAnchor\) return;/);
  assert.match(src, /const target = document\.getElementById\(anchor\);/);
  assert.match(src, /if \(rect\.top < 0 \|\| rect\.top >= window\.innerHeight\) target\.scrollIntoView\(\{ block: "start" \}\)/);
  assert.match(src, /attempts < 10/);
  assert.match(src, /setPendingLegacyAnchor\(null\)/);
  // No new routing was invented for the deep link.
  assert.doesNotMatch(src, /router\.(push|replace)\(`\/clients\/\$\{encodeURIComponent\(clientId\)\}#/);
});

test('LOADING_AND_DATA: client loading, editing, color and fetches are unchanged', () => {
  const src = dossier();
  assert.match(src, /getClient\(clientId\)/);
  assert.match(src, /getCases\(page, CLIENT_CASE_PAGE_SIZE, undefined, clientId\)/);
  assert.match(src, /listAdminWorkspaces\(clientId\)/);
  assert.match(src, /getCaseDocuments\(item\.id\)/);
  assert.match(src, /getClientCommunicationSummary\(clientId, 15\)/);
  assert.match(src, /updateClient\(clientId,/);
  assert.match(src, /onClick=\{openEditClient\}/);
  assert.match(src, /showEditModal &&/);
  assert.match(src, /<ClientColorSelector/);
  assert.match(src, /getClientColorDefinition\(client\.colorKey\)/);
  // Responsive hero layout preserved.
  assert.match(src, /flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between/);
});
