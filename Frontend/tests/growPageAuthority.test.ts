import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createRaceHarness, deferred, flatten, settle, textOf } from './helpers/asyncRaceHarness';

const file = 'src/app/clients/[clientId]/grow/page.tsx';
function setup(role: string, readContext: () => Promise<any> = async () => ({ items: [], organizationMode: true }), query = '') {
  let clientId = 'client-a';
  const user = deferred();
  const harness = createRaceHarness(file, 'GrowPageContent', {
    'next/navigation': { useParams: () => ({ clientId }), useSearchParams: () => new URLSearchParams(query) },
    '@/lib/api': { getClient: async (id: string) => ({ id, name: id }), getCurrentUser: () => user.promise },
    '@/lib/growApi': { growApi: { listOpportunityPublicationWorkspaces: readContext } },
    '@/components/clients/GrowWorkbench': { GROW_TABS: [{ id: 'attekintes', label: 'Áttekintés' }], GrowWorkbench: 'Workbench' },
    '@/components/clients/GrowJourney': { GrowJourney: 'Journey' },
    '@/components/AuthenticatedApp': { AuthenticatedApp: 'Auth' },
    '@/components/adminiculum/OperationalPrimitives': { SafePanelError: 'ReadError' },
    '@/components/clients/ClientWorkspaceTabs': { ClientWorkspaceTabs: 'Tabs' },
  });
  return { harness, user, role, switchClient: (id: string) => { clientId = id; } };
}

test('authorized reader may prepare a publication without approval or manager authority', async () => {
  const { harness, user } = setup('COLLAB_LAWYER', undefined, 'view=journey');
  harness.commit(); user.resolve({ role: 'COLLAB_LAWYER' }); await settle();
  const journey = flatten(harness.render()).find(node => node.type === 'Journey');
  assert.equal(journey.props.canPreparePublication, true);
  assert.equal(journey.props.canPublish, false);
  assert.equal(journey.props.canManage, false);
  harness.unmount();
});

for (const role of ['ADMIN', 'PARTNER', 'LAWYER', 'COLLAB_LAWYER']) {
  test(`Grow page resolves ${role} authority before rendering mutation consumers`, async () => {
    const { harness, user } = setup(role);
    harness.commit(); await settle();
    assert.equal(flatten(harness.render()).some(node => node.type === 'Workbench'), false);
    assert.match(textOf(harness.render()), /betöltése/);
    user.resolve({ role }); await settle();
    const view = flatten(harness.render()).find(node => node.type === 'Workbench');
    assert.ok(view);
    assert.equal(view.props.canManage, ['ADMIN', 'PARTNER'].includes(role));
    assert.equal(view.props.canPublish, ['ADMIN', 'PARTNER', 'LAWYER'].includes(role));
    harness.unmount();
  });
}

test('suspended organization retains Grow readability without a publication target', async () => {
  const { harness, user } = setup('LAWYER');
  harness.commit(); user.resolve({ role: 'LAWYER' }); await settle();
  assert.ok(flatten(harness.render()).find(node => node.type === 'Workbench'));
  harness.unmount();
});

for (const status of [403, 503, 500]) {
  test(`context read ${status} is not a legitimate non-organization empty gate`, async () => {
    const { harness, user } = setup('ADMIN', async () => { throw { status }; });
    harness.commit(); user.resolve({ role: 'ADMIN' }); await settle();
    const tree = harness.render();
    assert.ok(flatten(tree).find(node => node.type === 'ReadError'));
    assert.doesNotMatch(textOf(tree), /csak szervezeti ügyfélmódban/);
    assert.equal(flatten(tree).some(node => node.type === 'Workbench'), false);
    harness.unmount();
  });
}

test('failed identity lookup grants no writes but preserves authorized read context', async () => {
  const { harness, user } = setup('ADMIN');
  harness.commit(); user.reject({ status: 503 }); await settle();
  const tree = harness.render();
  const view = flatten(tree).find(node => node.type === 'Workbench');
  assert.equal(view.props.canManage, false);
  assert.equal(view.props.canPublish, false);
  assert.ok(flatten(tree).find(node => node.type === 'ReadError'));
  harness.unmount();
});

test('late prior-client context cannot overwrite newly resolved Grow context', async () => {
  const first = deferred(); let calls = 0;
  const { harness, user, switchClient } = setup('ADMIN', () => ++calls === 1 ? first.promise : Promise.resolve({ organizationMode: true, items: [] }));
  harness.commit(); user.resolve({ role: 'ADMIN' }); await settle();
  switchClient('client-b'); harness.commit(); await settle();
  first.resolve({ organizationMode: false, items: [] }); await settle();
  const view = flatten(harness.render()).find(node => node.type === 'Workbench');
  assert.equal(view.props.clientId, 'client-b');
  harness.unmount();
});
