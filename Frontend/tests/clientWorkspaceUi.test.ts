import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import path from 'node:path';

const root = process.cwd();
const read = (rel: string) => readFileSync(path.join(root, rel), 'utf8');

describe('W1C Company Workspace Convergence (structural)', () => {
  const component = () => read('src/components/clients/ClientCompanyWorkspace.tsx');
  const api = () => read('src/lib/clientWorkspaceApi.ts');
  const page = () => read('src/app/clients/[clientId]/vallalati-mukodes/page.tsx');
  const tabs = () => read('src/components/clients/ClientWorkspaceTabs.tsx');

  it('maintains exact Organization and Individual tab sets', () => {
    const src = tabs();
    // Org and Individual tab array definition
    assert.match(src, /\["overview", "Áttekintés", ""\]/);
    assert.match(src, /\["cases", "Ügyek", "\/cases"\]/);
    assert.match(src, /\["communications", "Kommunikáció", "\/communications"\]/);
    assert.match(src, /\["organization", "Szervezet", "\/szervezet"\]/);
    assert.match(src, /\["company-operations", "Vállalati működés", "\/vallalati-mukodes"\]/);
    assert.match(src, /\["portal", "Portál", "\/portal"\]/);
    
    // Org mode filtering
    assert.ok(src.includes("organizationMode ? tabs : tabs.filter"));
    assert.match(src, /key !== "organization"/);
    assert.match(src, /key !== "company-operations"/);
  });

  it('keeps client-scoped Communications first-class for every client mode', () => {
    const src = tabs();
    assert.match(src, /key === "communications"/);
    assert.match(src, /\/communications\?clientId=\$\{encodeURIComponent\(clientId\)\}/);
  });

  it('renders Company Ops with first-class active tab shell', () => {
    const src = page();
    assert.match(src, /<ClientWorkspaceTabs clientId={client.id} active="company-operations" organizationMode/);
    assert.match(src, /<ClientCompanyWorkspace clientId={client.id}/);
    // Prevents direct individual access
    assert.match(src, /Ez a vállalati működés felület csak szervezeti ügyfélmódban érhető el/);
  });

  it('keeps Haladó universal while preserving capability-aware secondary navigation', () => {
    const src = tabs();
    assert.match(src, /<details/);
    assert.match(src, /Haladó/);
    assert.match(src, /#house-style/);
    assert.match(src, /Dokumentumstílus/);
    assert.doesNotMatch(src, /\{organizationMode && <details/);
    assert.match(src, /\{organizationMode \? <Link[^>]+\/workgroups/);
    assert.match(src, /Munkacsoportok/);
  });

  it('enforces the exact first viewport section order in Company Ops', () => {
    const src = component();
    const fIdx = src.indexOf('title="Figyelmet igényel"');
    const mIdx = src.indexOf('title="Mi változott?"');
    const kIdx = src.indexOf('title="Következő lépés"');
    const cIdx = src.indexOf('title="Cégprofil"');
    
    assert.ok(fIdx !== -1 && mIdx !== -1 && kIdx !== -1 && cIdx !== -1, 'Required titles missing');
    assert.ok(fIdx < mIdx, 'Figyelmet igényel must be before Mi változott?');
    assert.ok(mIdx < kIdx, 'Mi változott? must be before Következő lépés');
    assert.ok(kIdx < cIdx, 'Következő lépés must be before Cégprofil');
  });

  it('uses canonical change feed, no Date.now 30-day change heuristic', () => {
    const src = component();
    assert.doesNotMatch(src, /Date.now/);
    assert.doesNotMatch(src, /30 * 24/);
    assert.match(src, /Jelenleg nincs külön változás-összesítő adatforrás/);
  });

  it('does not duplicate Organization editing or Contract workspace', () => {
    const src = component();
    // Projection only, no edit dialogs for person/group
    assert.doesNotMatch(src, /Dialog/);
    assert.doesNotMatch(src, /Editor/);
    assert.doesNotMatch(src, /Input/);
    assert.doesNotMatch(src, /Form/);
    assert.doesNotMatch(src, /mutate/);
    
    // Must link to Szervezet for drill-down
    assert.match(src, /\/szervezet"/);
    assert.match(src, /Szervezeti részletek megtekintése/);
  });

  it('never renders raw UUIDs, Prisma enums or projector terminology in the UI', () => {
    const src = component();
    assert.doesNotMatch(src, /employmentStatus={/);
    assert.doesNotMatch(src, /businessOwnerPersonId={/);
    assert.doesNotMatch(src, /ownerPersonId={/);
    assert.doesNotMatch(src, /clientOwnerPersonId={/);
    assert.doesNotMatch(src, /sourceType={/);
  });

  it('renders owner names with the fallback for missing owners from canonical API', () => {
    const src = component() + api();
    assert.match(src, /person.name/);
    assert.match(src, /person.jobTitle/);
    assert.match(api(), /Nincs kijelölt felelős/);
  });

  it('renders the overview attention summary with human wording, never raw codes', () => {
    const src = component() + api();
    assert.match(component(), /attentionItemText/);
    assert.match(api(), /még nincs kijelölt felelős/);
    assert.match(api(), /nyitott, magas vagy kritikus súlyosságú megállapítás/);
  });
});
