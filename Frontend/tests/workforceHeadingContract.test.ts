import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

// Canonical workforce heading contract:
//   1. shell brand/logo text is not a heading
//   2. shell context (TopBar) is metadata, not a heading
//   3. every route owns exactly one meaningful page-level H1
//   4. workspace/section headings use h2/h3
const read = (path: string) => readFileSync(path, 'utf8');
const countH1 = (source: string) => (source.match(/<h1\b/g) || []).length;

test('workforce shell chrome never renders a page-level H1', () => {
  const sidebar = read('src/components/Sidebar.tsx');
  assert.equal(countH1(sidebar), 0, 'the brand block must not be an H1');
  assert.match(sidebar, /<p[^>]*>Adminiculum<\/p>/, 'the visible brand text is preserved as non-heading chrome');

  const topBar = read('src/components/TopBar.tsx');
  assert.equal(countH1(topBar), 0, 'shell context must not be a page-level H1');
  assert.match(topBar, /data-testid="shell-context"/, 'shell context stays available as metadata');

  const appShell = read('src/components/AppShell.tsx');
  assert.equal(countH1(appShell), 0, 'the shell must not inject another page-level H1');
});

test('shared route-level heading primitives expose one H1 by default', () => {
  const pageHeader = read('src/components/ui/PageHeader.tsx');
  assert.equal(countH1(pageHeader), 1, 'PageHeader owns exactly one route-level H1');

  const operational = read('src/components/adminiculum/OperationalPrimitives.tsx');
  assert.equal(countH1(operational), 1, 'OperationalPageHeader renders one H1 by default');
  assert.match(operational, /level\?: "h1" \| "h2"/);
  assert.match(operational, /level = "h1"/, 'the default level stays h1');

  const ui = read('src/components/adminiculum/ui.tsx');
  assert.equal(countH1(ui), 1, 'AdminSectionHeader can render the promoted page H1');
  assert.match(ui, /titleAs\?: "h1" \| "h2" \| "h3"/);
  assert.match(ui, /titleAs = "h3"/, 'section headers stay h3 unless a page title is promoted');
});

test('case workspace routes keep exactly one page-level H1', () => {
  const nav = read('src/components/cases/CaseWorkspaceNav.tsx');
  assert.equal(countH1(nav), 1, 'the case workspace nav owns the case page H1');

  const overview = read('src/components/cases/CaseWorkspaceOverview.tsx');
  assert.equal(countH1(overview), 0, 'the overview hero is demoted to a workspace h2');

  const caseDetail = read('src/components/CaseDetail.tsx');
  assert.match(caseDetail, /<CaseWorkspaceNav/, 'case detail renders the shared case nav (H1 owner)');
  assert.match(caseDetail, /<CaseWorkspaceOverview/, 'case detail renders the overview (h2)');

  const handoff = read('src/app/cases/[caseId]/handoff/page.tsx');
  assert.match(handoff, /<CaseWorkspaceNav/, 'handoff renders the shared case nav (H1 owner)');
  assert.match(handoff, /<OperationalPageHeader[\s\S]*?level="h2"/, 'the handoff header must not create a second H1');
});

test('previously zero-H1 routes now own a page-level H1', () => {
  const intake = read('src/app/intake/page.tsx');
  assert.equal(countH1(intake), 1, '/intake needs one page-level H1');

  const clientPortalAdmin = read('src/app/client-portal-admin/page.tsx');
  assert.equal(countH1(clientPortalAdmin), 0, 'the visible title is rendered by the shared primitive');
  assert.match(clientPortalAdmin, /titleAs="h1"/, '/client-portal-admin promotes its page title to H1');

  const editor = read('src/components/editor/DocumentEditorWorkbench.tsx');
  assert.equal(countH1(editor), 1, 'the document editor header owns the page-level H1');
});

test('every audited route-owning source exposes exactly one page-level H1', () => {
  // Files that literally own the single route-level H1.
  const singleH1Owners = [
    'src/components/ui/PageHeader.tsx',
    'src/components/adminiculum/OperationalPrimitives.tsx',
    'src/components/cases/CaseWorkspaceNav.tsx',
    'src/components/editor/DocumentEditorWorkbench.tsx',
    'src/app/intake/page.tsx',
    'src/app/clause-library/page.tsx',
    'src/app/search/page.tsx',
    'src/app/settings/page.tsx',
    'src/app/settings/work-packages/page.tsx',
    'src/app/timesheet-presets/page.tsx',
    'src/app/litigation-workspace/page.tsx',
    'src/app/documents/compare/page.tsx',
    'src/app/clients/[clientId]/page.tsx',
    'src/app/clients/[clientId]/calendar/page.tsx',
    'src/app/clients/[clientId]/cases/page.tsx',
    'src/app/clients/[clientId]/compliance/page.tsx',
    'src/app/clients/[clientId]/portal/page.tsx',
    'src/app/cases/[caseId]/review/[documentId]/edit/page.tsx',
    'src/components/communications/CommunicationWorkspace.tsx',
    'src/components/communications/MailboxAccountsPanel.tsx',
  ];
  for (const path of singleH1Owners) {
    assert.equal(countH1(read(path)), 1, `${path} must expose exactly one page-level H1`);
  }

  // Route sources that delegate the page H1 to a shared primitive must not also
  // render a competing literal H1.
  const delegatedOwners = [
    'src/components/CasesList.tsx',
    'src/app/workload/page.tsx',
    'src/components/DashboardFocused.tsx',
    'src/app/clients/page.tsx',
    'src/app/deadlines/page.tsx',
    'src/app/reviews/page.tsx',
    'src/app/tasks/page.tsx',
    'src/app/time-entries/page.tsx',
    'src/app/notifications/page.tsx',
    'src/app/settings/workflows/page.tsx',
    'src/app/cases/[caseId]/client-portal/page.tsx',
    'src/app/cases/[caseId]/communications/CommunicationsPageContent.tsx',
    'src/app/cases/[caseId]/documents/page.tsx',
  ];
  for (const path of delegatedOwners) {
    assert.equal(countH1(read(path)), 0, `${path} must delegate its single H1 to a shared primitive`);
  }
});
