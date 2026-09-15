import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import path from 'node:path';

const root = process.cwd();
const read = (rel: string) => readFileSync(path.join(root, rel), 'utf8');

describe('W1C Company Workspace Convergence (structural)', () => {
  const component = () => read('src/components/clients/ClientCompanyWorkspace.tsx');
  const legacy = () => read('src/components/clients/ClientCompanyOperationsLegacy.tsx');
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

  it('uses the canonical Data Room and exposes the requested read-only sections', () => {
    const src = component() + api();
    assert.match(src, /getDataRoom/);
    for (const label of ['Áttekintés', 'Adatok', 'Szervezet', 'Folyamatok', 'Rendszerek', 'Dokumentumok', 'Megfelelőség', 'Fejlesztés']) assert.match(src, new RegExp(label));
    assert.match(src, /dataQuality\.relevantDataCoverage\.available/);
    assert.match(src, /Ismeretlen/);
    assert.match(src, /Nincs még adat/);
    assert.match(src, /Becsült értékek/);
    assert.match(src, /Mért pillanatkép/);
    assert.match(src, /documents\.documentCount/);
    assert.match(src, /complianceSummary\.currentOnly|complianceSummary\.evaluatedCount/);
    assert.match(src, /Feltételezett/);
    assert.doesNotMatch(src, /getOverview\(clientId\)/);
  });

  it('keeps the previously working operational capabilities reachable additively', () => {
    const src = legacy();
    for (const token of ['getOverview', 'Figyelmet igényel', 'Mi változott?', 'Következő lépés', 'Aktív ügyek', 'Határidők', 'Cégprofil', 'Szerződések / kötelezettségek', 'Kulcsszemélyek', 'ComplianceOverviewPanel', 'ComplianceProposalPanel', 'Szervezeti részletek megtekintése']) assert.match(src, new RegExp(token.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')));
    assert.match(component(), /ClientCompanyOperationsLegacy/);
    assert.match(component(), /Operatív áttekintés/);
  });

  it('does not invent change feeds, scores, or temporal heuristics', () => {
    const src = component();
    assert.doesNotMatch(src, /Date.now/);
    assert.doesNotMatch(src, /30 * 24/);
    assert.doesNotMatch(src, /score|percentage|maturity/i);
  });

  it('does not duplicate Organization editing or Contract workspace', () => {
    const src = component();
    // Projection only, no edit dialogs for person/group
    assert.doesNotMatch(src, /Dialog/);
    assert.doesNotMatch(src, /Editor/);
    assert.doesNotMatch(src, /Input/);
    assert.doesNotMatch(src, /Form/);
    assert.doesNotMatch(src, /mutate/);
    
    assert.match(src, /href="\/documents\/compare"/);
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

  it('renders Data Room values without raw technical status codes', () => {
    const src = component();
    assert.match(src, /humanStatus/);
    assert.match(src, /factLabel/);
    assert.doesNotMatch(src, /OPEN_IMPORTANT_FINDINGS|CONTRACTS_WITHOUT_OWNER/);
  });
});
