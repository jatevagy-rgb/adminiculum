import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import path from 'node:path';

const root = process.cwd();
const read = (rel: string) => readFileSync(path.join(root, rel), 'utf8');

describe('Dedicated client compliance workspace (structural)', () => {
  const pagePath = 'src/app/clients/[clientId]/compliance/page.tsx';
  const page = () => read(pagePath);

  it('exposes the dedicated /clients/[id]/compliance route', () => {
    assert.ok(existsSync(path.join(root, pagePath)));
  });

  it('is an authenticated workforce client-workspace page', () => {
    const src = page();
    assert.match(src, /AuthenticatedApp/);
    assert.match(src, /ClientWorkspaceTabs/);
    assert.match(src, /useParams/);
    assert.match(src, /encodeURIComponent\(clientId\)/);
  });

  it('reuses the existing compliance panels and overview API without duplicating engine logic', () => {
    const src = page();
    assert.match(src, /ComplianceOverviewPanel/);
    assert.match(src, /ComplianceProposalPanel/);
    assert.match(src, /complianceOverviewApi/);
    // No engine duplication: no direct endpoint strings, no rule/proposal logic in the page.
    assert.doesNotMatch(src, /fetchApi/);
    assert.doesNotMatch(src, /\/compliance\/proposals|evaluator|ruleAst|AssessmentFinding|requirementApplicability/i);
  });

  it('never substitutes portal-safe endpoints or surfaces diagnostics UI', () => {
    const src = page();
    assert.doesNotMatch(src, /client-portal\/compliance/);
    assert.doesNotMatch(src, /unresolved-rule-scopes|diagnostics/i);
  });

  it('uses the same organization capability gate as the company-operations page', () => {
    const src = page();
    const companyOps = read('src/app/clients/[clientId]/vallalati-mukodes/page.tsx');
    assert.match(src, /listAdminWorkspaces/);
    assert.match(src, /ORGANIZATION/);
    assert.match(src, /CASE_RELAY/);
    assert.match(src, /organizationMode/);
    // Gate mechanism identical to the accepted company-operations surface.
    assert.match(companyOps, /listAdminWorkspaces/);
  });

  it('keeps the truthful capability framing without legal-certainty claims', () => {
    const src = page();
    assert.match(src, /megfelelőségi területei, megállapításai/);
  });

  it('offers restrained navigation back to overview and company operations', () => {
    const src = page();
    assert.match(src, /Ügyfél áttekintés/);
    assert.match(src, /Vállalati működés/);
  });

  it('repoints the client overview Compliance entry to the dedicated route', () => {
    const overview = read('src/app/clients/[clientId]/page.tsx');
    assert.match(overview, /clients\/\$\{encodeURIComponent\(clientId\)\}\/compliance`} className="adm-link-button[^"]*">Compliance/);
    assert.doesNotMatch(overview, /vallalati-mukodes#compliance/);
  });

  it('leaves the Grow with us entry unchanged', () => {
    const overview = read('src/app/clients/[clientId]/page.tsx');
    assert.match(overview, /vallalati-mukodes`} className="adm-link-button[^"]*">Grow with us/);
  });

  it('does not add a Compliance top tab to ClientWorkspaceTabs', () => {
    const tabs = read('src/components/clients/ClientWorkspaceTabs.tsx');
    const tabsArray = tabs.slice(tabs.indexOf('const tabs'), tabs.indexOf('] as const'));
    assert.doesNotMatch(tabsArray, /compliance/i);
  });

  it('preserves the embedded compliance section inside ClientCompanyWorkspace', () => {
    const workspace = read('src/components/clients/ClientCompanyWorkspace.tsx');
    assert.match(workspace, /id="compliance"/);
    assert.match(workspace, /Releváns területek/);
    assert.match(workspace, /ComplianceOverviewPanel/);
    assert.match(workspace, /ComplianceProposalPanel/);
  });

  it('surfaces engine applicability state separately from findings via the workspace read model', () => {
    const src = page();
    assert.match(src, /complianceWorkspaceApi/);
    assert.match(src, /getWorkspace\(clientId\)/);
    assert.match(src, /Állapotkép/);
    assert.match(src, /Megfelelőségi területek/);
    assert.match(src, /Tisztázandó \/ hiányzó információ/);
  });

  it('renders an informative zero-evaluation and zero-finding state', () => {
    const src = page();
    assert.match(src, /még nem készült megfelelőségi értékelés/);
    // DOES_NOT_APPLY reuses the existing neutral outcome label — no warning styling invention.
    assert.match(src, /complianceOutcomeLabels/);
    assert.match(src, /complianceOutcomeClass/);
  });

  it('contains no demo constants, thresholds or frontend rule evaluation', () => {
    const src = page();
    const api = read('src/lib/complianceWorkspaceApi.ts');
    for (const text of [src, api]) {
      assert.doesNotMatch(text, /DEMO_KFT|employee_count|employeeCount|\b47\b|\b52\b|> 50|>= 50/);
      assert.doesNotMatch(text, /evaluator|ruleEngine|ruleAst|threshold/i);
    }
  });

  it('uses a read-only workspace API client and does not duplicate the profile write UI', () => {
    const api = read('src/lib/complianceWorkspaceApi.ts');
    assert.match(api, /fetchApi<ComplianceWorkspace>\(`\/compliance\/clients\/\$\{encodeURIComponent\(clientId\)\}\/workspace`\)/);
    assert.doesNotMatch(api, /method: ['"](?:POST|PUT|PATCH|DELETE)['"]/);
    const src = page();
    assert.doesNotMatch(src, /answerCompanyProfileQuestion|getCompanyProfileDiscovery/);
  });
});
