import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import path from 'node:path';

const root = process.cwd();
const read = (rel: string) => readFileSync(path.join(root, rel), 'utf8');

describe('Canonical workforce communication workspace', () => {
  const workspace = () => read('src/components/communications/CommunicationWorkspace.tsx');
  const canonicalPage = () => read('src/app/communications/page.tsx');
  const legacyPage = () => read('src/app/notifications/page.tsx');
  const sidebar = () => read('src/components/Sidebar.tsx');
  const navigation = () => read('src/lib/navigation.ts');
  const api = () => read('src/lib/api.ts');

  it('has one canonical page and one global navigation item', () => {
    assert.equal(existsSync(path.join(root, 'src/app/communications/page.tsx')), true);
    assert.equal(existsSync(path.join(root, 'src/components/communications/CommunicationWorkspace.tsx')), true);
    assert.doesNotMatch(canonicalPage(), /CommunicationsOverview/);
    assert.match(canonicalPage(), /CommunicationWorkspace/);
    assert.match(canonicalPage(), /AuthenticatedApp section="communications"/);
    assert.match(navigation(), /id: "communications", label: "Kommunikáció"/);
    assert.doesNotMatch(navigation(), /id: "notifications"/);
    assert.doesNotMatch(sidebar(), /notifications:\s*"\/notifications"/);
  });

  it('redirects the legacy route and preserves supported query state', () => {
    const src = legacyPage();
    assert.match(src, /redirect\(/);
    assert.match(src, /\/communications/);
    for (const key of ['view', 'communicationId', 'clientId', 'caseId']) assert.match(src, new RegExp(key));
  });

  it('keeps canonical API actions and operational filters', () => {
    const src = workspace() + api();
    for (const token of ['getCommunications', 'getOutlookStatus', 'runOutlookSync', 'linkCommunicationToCase', 'linkCommunicationToTask', 'createCaseFromCommunication', 'extractTaskFromCommunication']) assert.match(src, new RegExp(token));
    for (const token of ['Minden ügyfél', 'Minden ügy', 'Bejövő', 'Kimenő', 'Belső', 'Külső', 'Feldolgozásra vár', 'Szinkronizálás most']) assert.match(src, new RegExp(token));
    assert.match(src, /communicationId/);
    assert.doesNotMatch(src, /response\.body/);
  });

  it('states Outlook and provenance truthfully', () => {
    const src = workspace();
    assert.match(src, /Az Outlook nincs összekötve/);
    assert.match(src, /Rögzített kommunikáció/);
    assert.match(src, /Outlook/);
    assert.match(src, /Demo adat/);
    const canonicalDemoFixtureSender = 'demo-kft-uzletvezeto@fixture.invalid';
    assert.match(canonicalDemoFixtureSender, /@fixture\.invalid$/);
    assert.match(src, /endsWith\("@fixture\.invalid"\)/);
    assert.doesNotMatch(src, /mailboxAddress|access_token|Bearer/i);
  });

  it('sanitizes unknown conflicts and keeps only functional quick views', () => {
    const src = workspace();
    assert.doesNotMatch(src, /error\.message \|\| fallback/);
    assert.match(src, /A művelet ütközik a jelenlegi állapottal/);
    assert.doesNotMatch(src, /Válaszra vár|value: "replies"|activeView === "replies"/);
    for (const label of ['Összes', 'Bejövő', 'Kimenő', 'Belső', 'Feldolgozásra vár']) assert.match(src, new RegExp(label));
  });

  it('keeps contextual case communication separate from the global inbox', () => {
    const src = read('src/app/cases/[caseId]/communications/CommunicationsPageContent.tsx');
    assert.match(src, /caseContextId/);
    assert.match(src, /getCommunications/);
    assert.match(src, /Outlook/);
  });
});

describe('Communication context deep-link convergence (Slice 1)', () => {
  const workspace = () => read('src/components/communications/CommunicationWorkspace.tsx');
  const canonicalPage = () => read('src/app/communications/page.tsx');
  const api = () => read('src/lib/api.ts');

  it('initializes client scope from ?clientId and forwards it to the authoritative query', () => {
    const src = workspace();
    assert.match(src, /readScopeParam\("clientId"\)/);
    assert.match(src, /useState\(\(\) => readScopeParam\("clientId"\) \|\| "all"\)/);
    assert.match(src, /commParams\.clientId = clientFilter/);
    assert.match(api(), /params\?\.clientId[\s\S]*?queryParams\.set\('clientId', params\.clientId\)/);
  });

  it('initializes case scope from ?caseId and forwards it server-side — not just client-side page filtering', () => {
    const src = workspace();
    assert.match(src, /readScopeParam\("caseId"\)/);
    assert.match(src, /useState\(\(\) => readScopeParam\("caseId"\) \|\| "all"\)/);
    // caseId is part of the server request params, not only the in-page filter.
    assert.match(src, /commParams\.caseId = caseFilter/);
    assert.match(src, /if \(caseFilter !== "all"\) \{\s*commParams\.caseId = caseFilter;\s*\}/);
    assert.match(api(), /params\?\.caseId[\s\S]*?queryParams\.set\('caseId', params\.caseId\)/);
    // The load effect re-fires on scope changes so pagination total is scope-truthful.
    assert.match(src, /\}, \[clientFilter, caseFilter, offset, pageSize\]\);/);
  });

  it('forwards clientId and caseId together when both are supplied', () => {
    const src = workspace();
    assert.match(src, /if \(clientFilter !== "all"\) \{\s*commParams\.clientId = clientFilter;\s*\}/);
    assert.match(src, /if \(caseFilter !== "all"\) \{\s*commParams\.caseId = caseFilter;\s*\}/);
    assert.match(src, /getCommunications\(commParams\)/);
  });

  it('resets pagination offset when the authoritative scope changes', () => {
    const src = workspace();
    assert.match(src, /prevScope\.client !== clientFilter \|\| prevScope\.case !== caseFilter/);
    assert.match(src, /prevScopeRef\.current = \{ client: clientFilter, case: caseFilter \};/);
    assert.match(src, /if \(offset !== 0\) \{\s*setOffset\(0\);\s*return;\s*\}/);
  });

  it('keeps scope in the URL across refresh without erasing other query state', () => {
    const src = workspace();
    assert.match(src, /params\.set\("clientId", clientFilter\); else params\.delete\("clientId"\)/);
    assert.match(src, /params\.set\("caseId", caseFilter\); else params\.delete\("caseId"\)/);
    // URL sync starts from the live query string, so view/communicationId survive.
    assert.match(src, /new URLSearchParams\(window\.location\.search\)/);
    assert.match(src, /window\.history\.replaceState/);
    // selectView now preserves scope params instead of rebuilding a bare URL.
    const selectViewBody = src.slice(src.indexOf('const selectView'), src.indexOf('const clearScope'));
    assert.match(selectViewBody, /new URLSearchParams\(window\.location\.search\)/);
    assert.doesNotMatch(selectViewBody, /`\/communications\?view=\$\{view\}`/);
  });

  it('unresolved client or case names do not silently disable URL scope', () => {
    const src = workspace();
    // Fallback options keep the select controlled even when the option list
    // (e.g. an empty LAWYER client directory) does not contain the scoped id.
    assert.match(src, /!clientById\.has\(clientFilter\) \? <option value=\{clientFilter\}>/);
    assert.match(src, /!caseById\.has\(caseFilter\) \? <option value=\{caseFilter\}>/);
    // Neutral wording instead of pretending no filter exists.
    assert.match(src, /Ügyfél szerinti szűrés/);
    assert.match(src, /Ügy szerinti szűrés/);
    // No raw id surfaced as the primary label.
    assert.doesNotMatch(src, /scopeTitle.*clientFilter.*join/);
  });

  it('exposes a compact scope banner with a clear-scope action', () => {
    const src = workspace();
    assert.match(src, /data-testid="communication-scope-banner"/);
    assert.match(src, /Szűrés törlése/);
    const clearScope = src.slice(src.indexOf('const clearScope'), src.indexOf('const clearFilters'));
    assert.match(clearScope, /setClientFilter\("all"\)/);
    assert.match(clearScope, /setCaseFilter\("all"\)/);
    assert.match(clearScope, /setOffset\(0\)/);
    assert.doesNotMatch(clearScope, /setSearch|setDirectionFilter|setDateFilter/);
  });

  it('preserves communicationId/view query semantics and all communication actions', () => {
    const src = workspace();
    assert.match(src, /params\.get\("communicationId"\)/);
    assert.match(src, /params\.get\("view"\)/);
    for (const token of ['getOutlookStatus', 'runOutlookSync', 'linkCommunicationToCase', 'extractTaskFromCommunication', 'linkCommunicationToTask', 'CompactNewCaseDialog', 'getCaseTasks']) {
      assert.match(src, new RegExp(token));
    }
  });

  it('leaves the canonical page and the case-scoped route untouched', () => {
    const page = canonicalPage();
    assert.match(page, /CommunicationWorkspace/);
    assert.doesNotMatch(page, /clientId|caseId/);
    const casePage = read('src/app/cases/[caseId]/communications/CommunicationsPageContent.tsx');
    assert.match(casePage, /caseContextId/);
  });
});
