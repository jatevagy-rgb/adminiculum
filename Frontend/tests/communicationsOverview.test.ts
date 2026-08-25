import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import path from 'node:path';

const root = process.cwd();
const read = (rel: string) => readFileSync(path.join(root, rel), 'utf8');

describe('Communications live-integration UI (structural)', () => {
  const overview = () => read('src/components/communications/CommunicationsOverview.tsx');
  const page = () => read('src/app/communications/page.tsx');
  const api = () => read('src/lib/api.ts');
  const casePage = () => read('src/app/cases/[caseId]/communications/CommunicationsPageContent.tsx');
  const sidebar = () => read('src/components/Sidebar.tsx');

  it('registers a global communications overview page and nav entry', () => {
    assert.equal(existsSync(path.join(root, 'src/app/communications/page.tsx')), true);
    assert.equal(existsSync(path.join(root, 'src/components/communications/CommunicationsOverview.tsx')), true);
    assert.match(page(), /CommunicationsOverview/);
    assert.match(page(), /AuthenticatedApp section="communications"/);
    assert.match(sidebar(), /communications: "\/communications"/);
    assert.match(sidebar(), /Bejövő kommunikáció/);
  });

  it('offers the bounded Outlook refresh action in Hungarian without technical Graph terms', () => {
    const src = overview();
    assert.match(src, /Bejövő levelezés frissítése/);
    assert.match(src, /Importálva/);
    assert.match(src, /Már ismert/);
    assert.match(src, /Feldolgozásra vár/);
    assert.match(src, /Sikertelen/);
    // No Graph ids / tenant ids / tokens in the normal UI.
    assert.doesNotMatch(src, /graphId|tenantId|access_token|Bearer/i);
  });

  it('shows triage/assignment states and safe assignment + ignore actions', () => {
    const src = overview();
    for (const label of ['Ügyhöz kapcsolva', 'Feldolgozásra vár', 'Nem ügyhöz tartozó', 'Visszaállítás', 'Ügyhöz', 'Ügyfélhez']) {
      assert.match(src, new RegExp(label));
    }
  });

  it('calls the workforce communication endpoints (sync, assignment, triage)', () => {
    const src = api() + overview();
    for (const token of ['/communications/outlook/sync', '/link-client', '/link-case', '/ignore', '/unignore']) {
      assert.match(src, new RegExp(token.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')));
    }
  });

  it('keeps the case workspace showing email/direction/source/thread context', () => {
    const src = casePage();
    assert.match(src, /Bejövő/);
    assert.match(src, /Kimenő/);
    assert.match(src, /Outlook/);
    assert.match(src, /szál/);
    // The case list is no longer scoped to internal notes only (loads all types for the case).
    assert.match(src, /getCommunications\(\{\s*caseId: caseContextId,\s*limit: 50\s*\}\)/);
  });

  it('does not expose the customer portal thread model as a mail replacement', () => {
    // The overview must not claim to be the customer messaging surface.
    assert.doesNotMatch(overview(), /ClientQuestionThread|ClientQuestionMessage/);
  });
});
