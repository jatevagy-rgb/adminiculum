import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createRaceHarness, deferred, settle, textOf, flatten } from './helpers/asyncRaceHarness';

// CF-004 (regression) — /clients/[clientId]/grow route identity.
//
// A late response from client A must be discarded once route B is active.
// These tests previously proved the stale overwrite; they now prove the
// stale response cannot commit.

const visibleClientName = (tree: any): string | undefined =>
  flatten(tree).map((node) => node?.props?.clientName).find((value) => typeof value === 'string');

function makeGrowHarness() {
  let currentId = 'A';
  const clientA = deferred<any>();
  const clientB = deferred<any>();
  const wsA = deferred<any>();
  const wsB = deferred<any>();

  const h = createRaceHarness('src/app/clients/[clientId]/grow/page.tsx', 'GrowPageContent', {
    '@/components/AuthenticatedApp': { AuthenticatedApp: 'div' },
    '@/components/clients/GrowJourney': { GrowJourney: 'div' },
    '@/components/clients/diagnostic-workbench/GrowDiagnosticWorkbench': { GrowDiagnosticWorkbench: 'div' },
    '@/components/clients/GrowWorkbench': {
      GrowWorkbench: 'div',
      GROW_TABS: [
        { id: 'attekintes', label: 'Áttekintés' },
        { id: 'diagnosztika', label: 'Diagnosztika' },
        { id: 'bizonyitekok', label: 'Bizonyítékok' },
        { id: 'dontesek', label: 'Döntések' },
        { id: 'kezdemenyezesek', label: 'Kezdeményezések' },
        { id: 'eredmenyek', label: 'Eredmények' },
        { id: 'adatforrasok', label: 'Adatforrások' },
      ],
    },
    '@/components/clients/ClientWorkspaceTabs': { ClientWorkspaceTabs: 'div' },
    '@/components/adminiculum/OperationalPrimitives': { SafePanelError: 'div' },
    '@/lib/api': {
      getClient: (id: string) => (id === 'A' ? clientA.promise : clientB.promise),
    },
    '@/lib/clientPortalAdminApi': {
      listAdminWorkspaces: (id: string) => (id === 'A' ? wsA.promise : wsB.promise),
    },
    'next/navigation': {
      useParams: () => ({ clientId: currentId }),
      useSearchParams: () => new URLSearchParams(''),
    },
    'next/link': { default: 'a' },
  });

  return {
    h,
    setRoute: (id: string) => {
      currentId = id;
    },
    clientA,
    clientB,
    wsA,
    wsB,
  };
}

const orgWorkspace = { id: 'ws', status: 'ACTIVE', mode: 'ORGANIZATION' };

test('CF-004 grow: late client A cannot overwrite route B', async () => {
  const ctx = makeGrowHarness();

  // 1. Render route A; A's request stays pending.
  let tree = ctx.h.commit();
  await settle();
  tree = ctx.h.render();
  assert.ok(textOf(tree).includes('Ügyfél betöltése'), 'A should still be loading');

  // 2. Navigate to B while A is pending.
  ctx.setRoute('B');
  ctx.h.commit();
  await settle();

  // 3. B resolves and commits.
  ctx.clientB.resolve({ id: 'B', name: 'B Ügyfél' });
  ctx.wsB.resolve({ items: [orgWorkspace] });
  await settle();
  tree = ctx.h.render();
  assert.equal(visibleClientName(tree), 'B Ügyfél', 'route B identity committed');
  assert.ok(textOf(tree).includes('Áttekintés'), 'Grow content renders for organization mode');

  // 4. A resolves LATE and must be discarded.
  ctx.clientA.resolve({ id: 'A', name: 'A Ügyfél' });
  ctx.wsA.resolve({ items: [orgWorkspace] });
  await settle();
  tree = ctx.h.render();

  assert.equal(visibleClientName(tree), 'B Ügyfél', 'stale client A must be discarded');
  assert.ok(!textOf(tree).includes('A Ügyfél'), 'no A identity may appear under the B route');
});

test('CF-004 control: when A resolves before B, route B still wins', async () => {
  const ctx = makeGrowHarness();

  ctx.h.commit();
  await settle();

  ctx.setRoute('B');
  ctx.h.commit();
  await settle();

  ctx.clientA.resolve({ id: 'A', name: 'A Ügyfél' });
  ctx.wsA.resolve({ items: [orgWorkspace] });
  await settle();

  ctx.clientB.resolve({ id: 'B', name: 'B Ügyfél' });
  ctx.wsB.resolve({ items: [orgWorkspace] });
  await settle();
  const tree = ctx.h.render();

  assert.equal(visibleClientName(tree), 'B Ügyfél', 'B must win when it resolves last in time');
});
