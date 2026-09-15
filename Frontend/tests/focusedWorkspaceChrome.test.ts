import { test } from 'node:test';
import assert from 'node:assert/strict';
import { componentHarness, flatten } from './helpers/componentHarness';

function harness() {
  const SidebarMock = () => null;
  const h = componentHarness('src/components/AppShell.tsx', 'AppShell', {
    'next/link': { default: 'a' },
    './Sidebar': { Sidebar: SidebarMock },
    './TopBar': { TopBar: () => null },
    './DashboardFocused': { DashboardFocused: () => null },
    './CasesList': { CasesList: () => null },
    '@/lib/uiPack': { useUiPack: () => ['legal_ops_atelier'] },
  });
  return { h, SidebarMock };
}

test('focused workspace chrome hides the sidebar and shows the focused nav', () => {
  const { h, SidebarMock } = harness();
  const tree = h.render({ onSignOut() {}, section: 'case-detail', workspaceChrome: 'focused', children: 'tartalom' });
  assert.equal(tree.props['data-shell-chrome'], 'focused');
  assert.equal(flatten(tree).some((n: any) => n.type === SidebarMock), false, 'sidebar must be hidden in focused mode');
  assert.equal(
    flatten(tree).some((n: any) => n.props?.['data-testid'] === 'focused-workspace-nav'),
    true,
    'focused workspace nav (escape back to cases) must be present',
  );
});

test('normal routes still render the existing sidebar', () => {
  const { h, SidebarMock } = harness();
  const tree = h.render({ onSignOut() {}, section: 'cases', children: 'tartalom' });
  assert.equal(tree.props['data-shell-chrome'], 'default');
  assert.equal(flatten(tree).some((n: any) => n.type === SidebarMock), true, 'sidebar must remain on normal routes');
  assert.equal(
    flatten(tree).some((n: any) => n.props?.['data-testid'] === 'focused-workspace-nav'),
    false,
  );
});

test('explicit default chrome keeps the sidebar', () => {
  const { h, SidebarMock } = harness();
  const tree = h.render({ onSignOut() {}, section: 'dashboard', workspaceChrome: 'default', children: null });
  assert.equal(flatten(tree).some((n: any) => n.type === SidebarMock), true);
});
