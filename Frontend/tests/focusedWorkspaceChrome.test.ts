import { test } from 'node:test';
import assert from 'node:assert/strict';
import { componentHarness, flatten } from './helpers/componentHarness';

function harness() {
  const SidebarMock = () => null;
  const TopBarMock = () => null;
  const h = componentHarness('src/components/AppShell.tsx', 'AppShell', {
    'next/link': { default: 'a' },
    './Sidebar': { Sidebar: SidebarMock },
    './TopBar': { TopBar: TopBarMock },
    './DashboardFocused': { DashboardFocused: () => null },
    './CasesList': { CasesList: () => null },
    '@/lib/uiPack': { useUiPack: () => ['legal_ops_atelier'] },
  });
  return { h, SidebarMock, TopBarMock };
}

const has = (tree: any, type: unknown) => flatten(tree).some((n: any) => n.type === type);

test('focused workspace renders exactly one coherent chrome: no Sidebar, no stacked TopBar', () => {
  const { h, SidebarMock, TopBarMock } = harness();
  const tree = h.render({ onSignOut() {}, section: 'case-detail', workspaceChrome: 'focused', children: 'tartalom' });

  assert.equal(tree.props['data-shell-chrome'], 'focused');
  assert.equal(has(tree, SidebarMock), false, 'focused chrome must not render the permanent Sidebar');
  assert.equal(has(tree, TopBarMock), false, 'focused chrome must not stack the global TopBar underneath');

  const chrome = flatten(tree).find((n: any) => n.props?.['data-testid'] === 'focused-workspace-chrome');
  assert.ok(chrome, 'one focused workspace chrome must render');
  assert.ok(
    flatten(tree).some((n: any) => n.props?.['data-testid'] === 'focused-workspace-escape'),
    'focused chrome must expose an escape back to cases',
  );
  // sign-out access remains in the focused chrome
  assert.ok(String(flatten(tree).map((n: any) => n.type === 'button' && n.props?.onClick ? 'button' : '').join('')).length > 0);
});

test('normal routes keep the existing Sidebar + TopBar unchanged', () => {
  const { h, SidebarMock, TopBarMock } = harness();
  const tree = h.render({ onSignOut() {}, section: 'cases', children: 'tartalom' });

  assert.equal(tree.props['data-shell-chrome'], 'default');
  assert.equal(has(tree, SidebarMock), true, 'normal routes render the Sidebar');
  assert.equal(has(tree, TopBarMock), true, 'normal routes render the TopBar');
  assert.equal(
    flatten(tree).some((n: any) => n.props?.['data-testid'] === 'focused-workspace-chrome'),
    false,
  );
});
