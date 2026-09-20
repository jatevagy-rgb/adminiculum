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

  it('keeps the legacy operational surface independent from Data Room availability', () => {
    const src = component();
    const dataRoomGateEnd = src.indexOf('</> : null}');
    const legacySection = src.indexOf('data-testid="legacy-operational-overview"');
    assert.ok(dataRoomGateEnd >= 0, 'Data Room success gate should remain explicit');
    assert.ok(legacySection > dataRoomGateEnd, 'legacy operations must render outside the Data Room success gate');
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
    assert.match(src, /fact\.factDefinition\?\.labelHu/);
    assert.match(src, /companyFactTypeLabel\(technicalKey\)/);
    assert.doesNotMatch(src, /OPEN_IMPORTANT_FINDINGS|CONTRACTS_WITHOUT_OWNER/);
  });

  it('exposes the cockpit convergence concepts over existing data only', () => {
    const src = component() + api();
    for (const label of ["Vállalati profil", "Adatminőség", "Eredmények", "Dokumentumok és bizonyítékok"]) {
      assert.match(src, new RegExp(label));
    }
    // The three cockpit questions must be answerable from canonical fields.
    for (const question of ["Honnan tudjuk?", "Mikor állapítottuk meg?", "Ez még érvényes?"]) {
      assert.match(src, new RegExp(question.replace("?", "\\?")));
    }
  });

  it('reports fact provenance only from canonical fields and keeps unknown provenance unknown', () => {
    const src = component() + api();
    assert.match(src, /CLIENT_PORTAL_ANSWER/);
    assert.match(src, /Ügyfélportál válasz/);
    assert.match(src, /Belső rögzítés/);
    assert.match(src, /Ismeretlen eredet/);
    assert.match(src, /factSourceLabels\[provenance\?\.sourceKind \?\? "UNKNOWN"\]/);
    assert.match(src, /provenance\??\.evidenceCount/);
    assert.match(src, /provenance\??\.hasSourceDocument/);
  });

  it('never fabricates freshness and only reports a rule the canonical model defines', () => {
    const src = component() + api();
    assert.match(src, /Nincs meghatározott frissességi szabály\./);
    assert.match(src, /factFreshnessLabel\(freshness\?\.state \?\? "NO_RULE", Boolean\(freshness\?\.ruleDefined\)\)/);
    assert.match(src, /factFreshnessText/);
    // No day-based staleness arithmetic anywhere in the convergence UI.
    assert.doesNotMatch(src, /86400000/);
    assert.doesNotMatch(src, /\d+ ?\* ?24 ?\* ?60/);
    assert.doesNotMatch(src, /Date\.now/);
  });

  it('surfaces conflicting facts for review instead of silently selecting one', () => {
    const src = component() + api();
    assert.match(src, /conflicts\??\.reviewRequired/);
    assert.match(src, /Felülvizsgálat szükséges/);
    assert.match(src, /sameSubjectCurrentFactCount/);
    assert.match(src, /hasCanonicalSelection/);
    // The UI must not pick a winner by recency, verification level or source type.
    assert.doesNotMatch(src, /legfrissebb|legmagasabb bizonyosság|elsőbbség ad/i);
  });

  it('keeps estimated step timing distinct from the recorded canonical snapshot', () => {
    const src = component();
    assert.match(src, /estimatedTotals/);
    assert.match(src, /stepsWithActiveEstimate/);
    assert.match(src, /nem mért időadatok/);
    assert.match(src, /metric\.nameHu \|\| metric\.code/);
    assert.match(src, /snapshotDigest/);
    assert.match(src, /provenanceSource/);
  });

  it('does not bypass the canonical controlled editing path with raw fact writes', () => {
    const src = component();
    const workspaceApi = api();
    assert.doesNotMatch(src, /clientFact/);
    assert.doesNotMatch(src, /answerPortalCompanyProfile|answerCompanyProfileQuestion|answerCompanyProfileScreen/);
    assert.doesNotMatch(workspaceApi, /answerPortalCompanyProfile|answerCompanyProfileQuestion|answerCompanyProfileScreen/);
    assert.doesNotMatch(src, /fetch\(|axios/);
  });
});
