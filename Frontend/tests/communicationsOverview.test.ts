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
    assert.match(src, /fixture\.invalid/);
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
