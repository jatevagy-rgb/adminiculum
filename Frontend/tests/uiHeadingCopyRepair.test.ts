import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { componentHarness, flatten, textOf, tick } from './helpers/componentHarness';

const read = (path: string) => readFileSync(path, 'utf8');
const countH1 = (source: string) => (source.match(/<h1\b/g) || []).length;

test('shell context is metadata-level and each audited route keeps a single H1', () => {
  const topBar = read('src/components/TopBar.tsx');
  assert.equal(countH1(topBar), 0, 'the shell TopBar must not render a competing page-level H1');
  assert.match(topBar, /data-testid="shell-context"/, 'shell context label is preserved for navigation context');

  const casesList = read('src/components/CasesList.tsx');
  assert.equal(countH1(casesList), 0, 'the /cases title is owned by the route PageHeader');
  assert.match(casesList, /<PageHeader[\s\S]*?title="Ügyek"/);

  const workload = read('src/app/workload/page.tsx');
  assert.equal(countH1(workload), 0, 'the /workload title is owned by the route PageHeader');
  assert.match(workload, /<PageHeader title="Munkaterhelés"/);

  const pageHeader = read('src/components/ui/PageHeader.tsx');
  assert.equal(countH1(pageHeader), 1, 'PageHeader renders the single route-level H1');
});

test('workflow activation copy stays user-facing and free of implementation jargon', () => {
  const workflows = read('src/app/settings/workflows/page.tsx');
  assert.doesNotMatch(workflows, /DAG/);
  assert.match(workflows, /Aktiváláskor a rendszer ellenőrzi, hogy a lépések sorrendje érvényes-e, és a függőségek nem alkotnak kört\./);
});

test('TopBar renders the shell context without an H1', () => {
  const h = componentHarness('src/components/TopBar.tsx', 'TopBar', {
    'next/link': { default: 'a' },
    '@/lib/api': { getUnreadNotificationsCount: async () => ({ unreadCount: 0 }) },
    '@/lib/notificationPresentation': { NOTIFICATIONS_CHANGED_EVENT: 'adminiculum:notifications-changed' },
  });
  const tree = h.render({ title: 'Aktív ügyek', onSignOut() {}, profileName: 'Teszt Ügyvéd' });
  const nodes = flatten(tree);
  assert.equal(nodes.filter((node) => node.type === 'h1').length, 0);
  const context = nodes.find((node) => node.props?.['data-testid'] === 'shell-context');
  assert.ok(context, 'shell context label is rendered');
  assert.equal(textOf(context), 'Aktív ügyek');
});

test('work-package list separates entity name from status and preserves the select action', async () => {
  const h = componentHarness('src/app/settings/work-packages/page.tsx', 'WorkPackagesContent', {
    '@/components/AuthenticatedApp': { AuthenticatedApp: 'div' },
    '@/components/adminiculum/ui': { AdminStatusPill: 'span' },
    '@/lib/api': {
      getCurrentUser: async () => ({ role: 'ADMIN' }),
      listWorkPackageCaseTypes: async () => ({ items: [{ id: 'type-1', name: 'Munkajog', isActive: true }] }),
      listWorkPackageTemplates: async () => ({ items: [{ id: 'draft-1', name: 'Alap munkacsomag', status: 'DRAFT', version: 1, items: [] }] }),
      createUsableCaseType: async () => ({ caseTypeDefinition: { id: 'new', name: 'Új' }, template: { id: 't', name: 'Sablon', version: 1, items: [] } }),
      setWorkPackageCaseTypeActive: async () => {},
      createWorkPackageTemplate: async () => {},
      activateWorkPackageTemplate: async () => {},
    },
  });
  let tree: any;
  for (let i = 0; i < 3; i += 1) {
    tree = h.render();
    h.effects();
    await tick();
  }
  tree = h.render();
  const nodes = flatten(tree);
  const typeButton = nodes.find((node) => node.type === 'button' && textOf(node).includes('Munkajog'));
  assert.ok(typeButton, 'the case-type select control is still rendered');
  assert.equal(textOf(typeButton).trim(), 'Munkajog', 'the control label must not concatenate the status');
  assert.ok(!textOf(typeButton).includes('Aktív'), 'status must not be part of the control label');
  assert.equal(typeof typeButton.props.onClick, 'function', 'the select action is preserved');
  assert.ok(!flatten(typeButton).some((node) => node.props?.tone === 'sage'), 'status is not nested inside the control');

  const status = nodes.find((node) => node.props?.tone === 'sage' && textOf(node).trim() === 'Aktív');
  assert.ok(status, 'status is rendered as a separate semantic element');
  assert.ok(nodes.some((node) => node.type === 'button' && textOf(node) === 'Munkacsomag aktiválása'), 'existing activation action is unchanged');
});
