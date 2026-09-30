import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { componentHarness, flatten } from './helpers/componentHarness';

// Operational frame pilot: /workload and /reviews own their operational frame
// (surface + 1440px max width + single 24px desktop gutter) through the shared
// adm-board-page / adm-board-container primitives. AppShell must not stack a
// second gutter on them, and every other route keeps the default shell padding.

const read = (path: string) => readFileSync(path, 'utf8');

const PILOT_ROUTES = [
  { path: 'src/app/workload/page.tsx', section: 'tasks' },
  { path: 'src/app/reviews/page.tsx', section: 'reviews' },
] as const;

test('workload and reviews delegate surface, width and gutter to the shared board frame', () => {
  for (const { path, section } of PILOT_ROUTES) {
    const source = read(path);
    assert.match(
      source,
      new RegExp(`<AuthenticatedApp section="${section}" contentPadding="flush">`),
      `${path}: opts out of the shell gutter`,
    );
    assert.match(source, /className="min-h-screen adm-board-page text-\[#1F2937\]"/, `${path}: paints the shared board surface`);
    assert.match(source, /className="adm-board-container flex flex-col gap-[45]"/, `${path}: uses the shared board container`);
    assert.doesNotMatch(source, /max-w-7xl/, `${path}: no competing route-level max width`);
    assert.doesNotMatch(source, /px-4 py-5/, `${path}: no competing route-level gutter`);
  }
});

test('the shared board container owns the 1440px cap and the 24px desktop gutter', () => {
  const css = read('src/app/globals.css');
  const start = css.indexOf('.adm-board-container {');
  assert.ok(start >= 0, 'adm-board-container must exist in globals.css');
  const block = css.slice(start, css.indexOf('}', start));
  assert.match(block, /max-width: 1440px/, 'board container caps operational width at 1440px');
  const desktopBlock = css.slice(css.indexOf('@media (min-width: 1024px)', start));
  assert.match(desktopBlock, /\.adm-board-container\s*{\s*padding: 20px 24px;\s*}/, 'board container is the single 24px desktop gutter owner');
});

test('AppShell keeps the historical shell padding by default and flushes only on request', () => {
  const h = componentHarness('src/components/AppShell.tsx', 'AppShell', {
    'next/link': { default: 'a' },
    './Sidebar': { Sidebar: () => null },
    './TopBar': { TopBar: () => null },
    './DashboardFocused': { DashboardFocused: () => null },
    './CasesList': { CasesList: () => null },
    '@/lib/uiPack': { useUiPack: () => ['legal_ops_atelier'] },
  });
  const mainOf = (tree: any) => flatten(tree).find((node: any) => node.type === 'main');

  const byDefault = mainOf(h.render({ onSignOut() {}, section: 'cases', children: 'tartalom' }));
  assert.ok(byDefault, 'the shell renders its main scroll surface');
  assert.match(String(byDefault.props.className), /p-4 lg:p-5/, 'default routes keep the shell gutter');
  assert.ok(!String(byDefault.props.className).split(' ').includes('p-0'), 'default routes are never flushed');

  const flushed = mainOf(h.render({ onSignOut() {}, section: 'tasks', children: 'tartalom', contentPadding: 'flush' }));
  assert.ok(flushed, 'flushed routes still render the main scroll surface');
  assert.ok(String(flushed.props.className).split(' ').includes('p-0'), 'flushed routes drop the shell gutter');
  assert.match(String(flushed.props.className), /adm-shell-bg/, 'flushed routes keep the shell surface class for the route-owned frame');
});
