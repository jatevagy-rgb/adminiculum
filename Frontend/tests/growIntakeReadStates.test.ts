import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createRaceHarness, deferred, flatten, settle } from './helpers/asyncRaceHarness';
import { workbenchReadFailure } from '../src/components/clients/growWorkbenchState';

const file = 'src/components/clients/GrowIntake.tsx';
function setup(history: (id: string) => Promise<any>, processes: (id: string) => Promise<any> = async () => []) {
  return createRaceHarness(file, 'GrowIntake', {
    '@/lib/growApi': { SURVEY_CATEGORY_LABELS_HU: { MANUAL_ADMIN: 'Kézi munka' }, growApi: { listSurveyIntakes: history, listProcesses: processes } },
    './growWorkbenchState': { workbenchReadFailure },
  });
}
const states = (tree: any) => flatten(tree).filter(node => node.props?.label && node.props?.state).map(node => node.props.state);

for (const [status, expected] of [[403, 'UNAUTHORIZED'], [503, 'UNAVAILABLE'], [500, 'ERROR']] as const) {
  test(`intake history failure ${status} is distinct from empty while processes remain usable`, async () => {
    const harness = setup(async () => { throw { status }; }, async () => [{ id: 'p', name: 'Folyamat', status: 'ACTIVE' }]);
    harness.commit({ clientId: 'a' }); await settle();
    const tree = harness.render({ clientId: 'a' });
    assert.deepEqual(states(tree), ['READY', expected]);
    assert.equal(flatten(tree).find(node => node.type === 'select')?.props.disabled, false);
    harness.unmount();
  });
}

test('intake loading and successful empty reads have distinct states', async () => {
  const pending = deferred(); const harness = setup(() => pending.promise);
  harness.commit({ clientId: 'a' }); await settle();
  assert.deepEqual(states(harness.render({ clientId: 'a' })), ['EMPTY', 'LOADING']);
  pending.resolve({ items: [] }); await settle();
  assert.deepEqual(states(harness.render({ clientId: 'a' })), ['EMPTY', 'EMPTY']);
  harness.unmount();
});

test('late old-client history failure does not replace new-client successful empty', async () => {
  const old = deferred();
  const harness = setup(id => id === 'a' ? old.promise : Promise.resolve({ items: [] }));
  harness.commit({ clientId: 'a' }); await settle();
  harness.commit({ clientId: 'b' }); await settle();
  old.reject({ status: 403 }); await settle();
  assert.deepEqual(states(harness.render({ clientId: 'b' })), ['EMPTY', 'EMPTY']);
  harness.unmount();
});

for (const lateFailure of [false, true]) {
  test(`latest same-client history read wins over old ${lateFailure ? 'failure' : 'empty'} response`, async () => {
    const old = deferred(); let calls = 0;
    const harness = setup(() => ++calls === 1 ? old.promise : Promise.resolve({ items: [{ id: 'new', observedAt: '2026-10-07', payload: {} }] }));
    harness.commit({ clientId: 'a' }); await settle();
    const history = flatten(harness.render({ clientId: 'a' })).find(node => node.props?.label === 'Korábbi bejelentések');
    history.props.onRetry(); await settle();
    assert.deepEqual(states(harness.render({ clientId: 'a' })), ['EMPTY', 'READY']);
    if (lateFailure) old.reject({ status: 403 }); else old.resolve({ items: [] });
    await settle();
    assert.deepEqual(states(harness.render({ clientId: 'a' })), ['EMPTY', 'READY']);
    harness.unmount();
  });
}
