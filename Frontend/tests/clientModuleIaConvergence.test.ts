import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';

const root = process.cwd();
const read = (rel: string) => readFileSync(path.join(root, rel), 'utf8');

const TABS = 'src/components/clients/ClientWorkspaceTabs.tsx';
const COMPANY_OS = 'src/components/clients/ClientCompanyWorkspace.tsx';
const COMPLIANCE = 'src/app/clients/[clientId]/compliance/page.tsx';
const GROW = 'src/app/clients/[clientId]/grow/page.tsx';
const OPS = 'src/app/clients/[clientId]/vallalati-mukodes/page.tsx';

const tabsArray = (src: string) => src.slice(src.indexOf('const tabs'), src.indexOf('] as const'));
const blockFrom = (src: string, marker: string, end: string) => {
  const start = src.indexOf(marker);
  assert.ok(start >= 0, `${marker} must exist`);
  const stop = src.indexOf(end, start);
  assert.ok(stop > start, `${marker} block must be terminated by ${end}`);
  return src.slice(start, stop);
};

describe('Client-level module information architecture convergence (structural)', () => {
  const tabs = () => read(TABS);
  const companyOs = () => read(COMPANY_OS);
  const compliance = () => read(COMPLIANCE);

  it('1. Organization top navigation contains exactly one Grow entry', () => {
    const entries = tabsArray(tabs()).match(/\["grow", "Grow", "\/grow"\]/g) || [];
    assert.equal(entries.length, 1, 'Grow must appear exactly once in the client top navigation');
  });

  it('2. Organization top navigation contains exactly one Megfelelés entry', () => {
    const entries = tabsArray(tabs()).match(/\["compliance", "Megfelelés", "\/compliance"\]/g) || [];
    assert.equal(entries.length, 1, 'Megfelelés must appear exactly once in the client top navigation');
  });

  it('3. /compliance active="compliance" matches a real navigation entry', () => {
    assert.match(tabs(), /active\?:[^;]*"compliance"/);
    const entry = tabsArray(tabs()).match(/\["compliance", "Megfelelés", "\/compliance"\]/);
    assert.ok(entry, 'A compliance navigation entry must exist for active="compliance" to highlight');
    assert.match(compliance(), /<ClientWorkspaceTabs clientId=\{client\.id\} active="compliance" organizationMode/);
  });

  it('4. Individual mode never gains organization-only modules', () => {
    const src = tabs();
    for (const key of ['organization', 'company-operations', 'grow', 'compliance']) {
      assert.match(src, new RegExp(`key !== "${key}"`), `Individual mode must filter out ${key}`);
    }
    // Calendar and portal remain universal in both modes.
    assert.doesNotMatch(src, /key !== "calendar"/);
    assert.doesNotMatch(src, /key !== "portal"/);
  });

  it('5. Company OS visible local navigation drops the cross-domain duplicates', () => {
    const visible = blockFrom(companyOs(), 'export const VISIBLE_WORKSPACE_SECTIONS', '];');
    for (const key of ['organization', 'compliance', 'development', 'outcomes']) {
      assert.doesNotMatch(visible, new RegExp(`"${key}"`), `Visible Company OS tabs must not contain ${key}`);
    }
    for (const label of ['Szervezet', 'Megfelelőség', 'Fejlesztés', 'Eredmények']) {
      assert.doesNotMatch(visible, new RegExp(label), `Visible Company OS tabs must not contain ${label}`);
    }
    // The visible bar renders the converged list.
    assert.match(companyOs(), /\{VISIBLE_WORKSPACE_SECTIONS\.map\(/);
    assert.doesNotMatch(companyOs(), /\{WORKSPACE_SECTIONS\.map\(/);
  });

  it('5b. Company OS primary tabs are the five operational surfaces and advanced views stay reachable', () => {
    const src = companyOs();
    const primary = blockFrom(src, 'export const VISIBLE_WORKSPACE_SECTIONS', '];');
    const advanced = blockFrom(src, 'export const ADVANCED_WORKSPACE_SECTIONS', '];');
    // Exact primary product navigation, in order.
    assert.match(
      primary,
      /\["overview", "Áttekintés"\][\s\S]*\["company-profile", "Vállalati profil"\][\s\S]*\["processes", "Folyamatok"\][\s\S]*\["systems", "Rendszerek"\][\s\S]*\["documents", "Dokumentumok és bizonyítékok"\]/,
    );
    // The fact-engine audit and legacy views live behind one compact control.
    assert.match(
      advanced,
      /\["data", "Adatok"\][\s\S]*\["data-quality", "Adatminőség"\][\s\S]*\["operational", "Operatív áttekintés"\]/,
    );
    assert.match(src, /Haladó nézetek/);
    assert.match(src, /data-testid="company-os-advanced-views"/);
    assert.match(src, /\{ADVANCED_WORKSPACE_SECTIONS\.map\(/);
    // Every advanced view keeps its panel/data render path (nothing was deleted).
    assert.match(src, /<Panel id="data" title="Adatok">/);
    assert.match(src, /<Panel id="data-quality"/);
    assert.match(src, /data-testid="legacy-operational-overview"/);
    // The advanced control names the open view, including after a legacy deep link.
    assert.match(src, /ADVANCED_WORKSPACE_SECTIONS\.find\(\(\[key\]\) => key === activeSection\)/);
  });

  it('5c. Company OS user-facing copy drops implementation vocabulary', () => {
    const src = companyOs();
    assert.match(src, /Vállalati működés/);
    assert.doesNotMatch(src, /Company OS · Vállalati működés/);
    assert.doesNotMatch(src, /Data Room felülete/);
    assert.doesNotMatch(src, /A Data Room összesített működési kép/);
  });

  it('6. Company OS still keeps the cross-domain summary data and views', () => {
    const src = companyOs();
    assert.match(src, /<Panel id="organization" title="Szervezet">/);
    assert.match(src, /<Panel id="compliance" title="Megfelelőség">/);
    assert.match(src, /<Panel id="development" title="Fejlesztés">/);
    assert.match(src, /<Panel id="outcomes" title="Eredmények">/);
    assert.match(src, /organization\.groupCount/);
    assert.match(src, /organization\.personCount/);
    assert.match(src, /complianceSummary\.evaluatedCount/);
    assert.match(src, /complianceSummary\.openFindings/);
    assert.match(src, /developmentSummary\.initiativeCount/);
    assert.match(src, /developmentSummary\.milestoneCount/);
    assert.match(src, /measurementSummary\.outcomes/);
    assert.match(src, /measuredOutcomeCount/);
  });

  it('7. Organization summary links to the canonical /szervezet route', () => {
    const src = companyOs();
    assert.match(src, /data-testid="company-os-summary-organization"/);
    assert.match(src, /href=\{`\/clients\/\$\{encodeURIComponent\(clientId\)\}\/szervezet`\}/);
    assert.doesNotMatch(src, /handleSectionChange\("organization"\)/);
  });

  it('8. Compliance summary links to the canonical /compliance route', () => {
    const src = companyOs();
    assert.match(src, /data-testid="company-os-summary-compliance"/);
    assert.match(src, /href=\{`\/clients\/\$\{encodeURIComponent\(clientId\)\}\/compliance`\}/);
    assert.doesNotMatch(src, /handleSectionChange\("compliance"\)/);
  });

  it('9. Development/Grow summary links to the canonical /grow route', () => {
    const src = companyOs();
    assert.match(src, /data-testid="company-os-summary-development"/);
    assert.match(src, /href=\{`\/clients\/\$\{encodeURIComponent\(clientId\)\}\/grow`\}/);
    assert.doesNotMatch(src, /handleSectionChange\("development"\)/);
  });

  it('10. Outcome summary links to the canonical /grow route', () => {
    const src = companyOs();
    // "Mért kimenetek" cockpit KPI and the outcomes panel both target Grow.
    assert.match(src, /label="Mért kimenetek"[\s\S]{0,200}href=\{`\/clients\/\$\{encodeURIComponent\(clientId\)\}\/grow`\}/);
    assert.match(src, /data-testid="company-os-summary-development"/);
  });

  it('11-14. Legacy ?section= deep links resolve to canonical module routes', () => {
    const legacy = blockFrom(companyOs(), 'export const LEGACY_CROSS_DOMAIN_SECTIONS', '};');
    assert.match(legacy, /organization: "szervezet"/);
    assert.match(legacy, /compliance: "compliance"/);
    assert.match(legacy, /development: "grow"/);
    assert.match(legacy, /outcomes: "grow"/);
    // Compatibility redirects use replace-style navigation, not push.
    assert.match(companyOs(), /router\.replace\(`\/clients\/\$\{encodeURIComponent\(clientId\)\}\/\$\{canonicalSuffix\}`\)/);
    // Legacy sections remain resolvable (not dropped from the canonical union).
    const canonical = blockFrom(companyOs(), 'export const WORKSPACE_SECTIONS', '];');
    for (const key of ['organization', 'compliance', 'development', 'outcomes']) {
      assert.match(canonical, new RegExp(`"${key}"`));
    }
  });

  it('15. Company-owned ?section= values still work through the existing push-state path', () => {
    const src = companyOs();
    const canonical = blockFrom(src, 'export const WORKSPACE_SECTIONS', '];');
    const primary = blockFrom(src, 'export const VISIBLE_WORKSPACE_SECTIONS', '];');
    const advanced = blockFrom(src, 'export const ADVANCED_WORKSPACE_SECTIONS', '];');
    // Primary product navigation.
    for (const key of ['overview', 'company-profile', 'processes', 'systems', 'documents']) {
      assert.match(canonical, new RegExp(`"${key}"`));
      assert.match(primary, new RegExp(`"${key}"`));
      assert.doesNotMatch(advanced, new RegExp(`"${key}"`));
    }
    // Fact-engine audit and legacy views: reachable, but not primary.
    for (const key of ['data', 'data-quality', 'operational']) {
      assert.match(canonical, new RegExp(`"${key}"`));
      assert.match(advanced, new RegExp(`"${key}"`));
      assert.doesNotMatch(primary, new RegExp(`"${key}"`));
    }
    assert.match(src, /url\.searchParams\.set\("section", sec\)/);
    assert.match(src, /window\.history\.pushState\(\{\}, "", url\.toString\(\)\)/);
  });

  it('16. Browser back/forward remains valid for Company OS sections', () => {
    const src = companyOs();
    assert.match(src, /window\.addEventListener\("popstate", readSectionFromLocation\)/);
    assert.match(src, /window\.addEventListener\("hashchange", readSectionFromLocation\)/);
    assert.match(src, /window\.removeEventListener\("popstate", readSectionFromLocation\)/);
    assert.doesNotMatch(src, /Date\.now/);
  });

  it('17. Compliance shell renders ClientWorkspaceTabs before the module hero', () => {
    const src = compliance();
    const tabsIndex = src.indexOf('<ClientWorkspaceTabs');
    const heroIndex = src.indexOf('Megfelelés</p>');
    assert.ok(tabsIndex >= 0 && heroIndex >= 0);
    assert.ok(tabsIndex < heroIndex, 'ClientWorkspaceTabs must precede the compliance hero');
    // Restrained, shared module hero treatment.
    assert.match(src, /rounded-3xl border border-\[#DCCCA6\] bg-\[#fbf9f4\]/);
    assert.doesNotMatch(src, /rounded-\[var\(--adm-radius-md\)\] border border-\[#DCCCA6\]/);
  });

  it('18. Grow operational workbench sits below the client shell and preserves the legacy deep link', () => {
    const src = read(GROW);
    const tabsIndex = src.indexOf('<ClientWorkspaceTabs');
    const subNavIndex = src.indexOf('data-testid="grow-sub-nav"');
    assert.ok(tabsIndex >= 0 && subNavIndex >= 0);
    assert.ok(tabsIndex < subNavIndex, 'Client shell must stay above the Grow sub-navigation');
    // The methodology-led journey is preserved as a legacy deep link, not the default.
    assert.match(src, /<GrowJourney clientId=\{client\.id\} clientName=\{client\.name\} \/>/);
    // The operational workbench is the default primary surface.
    assert.match(src, /<GrowWorkbench/);
    // Legacy deep-link aliases survive the IA change.
    assert.match(src, /view === "diagnostics"/);
    assert.match(src, /view === "journey"/);
  });

  it('19. No backend, API client or data-fetch contract was altered', () => {
    const changed = tabs() + companyOs() + compliance();
    assert.doesNotMatch(changed, /from "@\/lib\/api"[\s\S]{0,40}updateClient/);
    assert.doesNotMatch(changed, /fetch\(/);
    assert.doesNotMatch(changed, /axios/);
    // The canonical read model is still the single data source.
    assert.match(companyOs(), /clientWorkspaceApi\.getDataRoom\(clientId\)/);
    assert.match(compliance(), /complianceWorkspaceApi\.getWorkspace\(clientId\)/);
    assert.match(compliance(), /complianceOverviewApi\.getOverview\(clientId\)/);
  });

  it('20. Customer portal navigation is untouched', () => {
    const changed = tabs() + companyOs() + compliance();
    assert.doesNotMatch(changed, /OrgGrowView|ClientPortalShell/);
    // Portal stays a first-class universal client tab.
    assert.match(tabs(), /\["portal", "Portál", "\/portal"\]/);
    assert.match(tabs(), /\/clients\/\$\{encodeURIComponent\(clientId\)\}\$\{suffix\}/);
  });

  it('Company OS page keeps the client shell before the operational workspace', () => {
    const src = read(OPS);
    const tabsIndex = src.indexOf('<ClientWorkspaceTabs');
    const workspaceIndex = src.indexOf('<ClientCompanyWorkspace');
    assert.ok(tabsIndex >= 0 && workspaceIndex >= 0);
    assert.ok(tabsIndex < workspaceIndex, 'ClientWorkspaceTabs must be the first module-level navigation element');
    assert.match(src, /active="company-operations"/);
  });
});
