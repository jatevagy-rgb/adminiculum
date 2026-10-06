import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createRaceHarness, deferred, settle, flatten, textOf } from './helpers/asyncRaceHarness';

function setup(enabled = true) {
  const calls: Array<{ id: string; response: ReturnType<typeof deferred> }> = [];
  const h = createRaceHarness('src/components/cases/CompactNewCaseDialog.tsx', 'CompactNewCaseDialog', {
    'next/navigation': { useRouter: () => ({ push() {} }) },
    'react-dom': { createPortal: (tree: any) => tree },
    './intake/intakeStyles': { intake: {}, ACCENT_BG: '', ACCENT_TEXT: '' },
    './intake/TeamTaskPlanningSection': { EMPTY_TEAM_TASK_PLAN: { collaboratorUserIds: [], tasks: [] } },
    '@/lib/api': { getClientList: async () => [{ id: 'A', name: 'Client A' }, { id: 'B', name: 'Client B' }],
      getCaseCreationOptions: async () => ({ items: [], capabilities: { clientOwner: enabled } }),
      getUsers: async () => [], getCurrentUser: async () => null, listWorkPackageCaseTypes: async () => ({ items: [] }) },
    '@/lib/clientOrganizationApi': { clientOrganizationApi: { listPersons: (id: string) => { const response = deferred(); calls.push({ id, response }); return response.promise; } } },
  });
  const props = { open: true, onClose() {}, initialClientId: 'A' };
  return { h, props, calls };
}

test('client A lookup cannot overwrite B and pending/failing reads cannot masquerade as an empty directory', async () => {
  const { h, props, calls } = setup();
  h.commit(props);
  await settle();
  let tree = h.commit(props);
  const client = flatten(tree).find((node) => node.type === 'select' && node.props.value === 'A');
  client.props.onChange({ target: { value: 'B' } });
  h.commit(props);
  calls[1].response.resolve({ items: [{ id: 'person-B', name: 'Owner B', employmentStatus: 'ACTIVE' }] });
  await settle();
  tree = h.commit(props);
  assert.match(textOf(tree), /Owner B/);
  calls[0].response.resolve({ items: [{ id: 'person-A', name: 'Stale owner A', employmentStatus: 'ACTIVE' }] });
  await settle();
  tree = h.commit(props);
  assert.doesNotMatch(textOf(tree), /Stale owner A/);
  assert.match(textOf(tree), /Owner B/);
});

test('disabled capability makes no owner query and presents no working owner selector', async () => {
  const { h, props, calls } = setup(false);
  h.commit(props);
  await settle();
  const tree = h.commit(props);
  assert.equal(calls.length, 0);
  assert.doesNotMatch(textOf(tree), /Ügygazda az ügyfélnél \(opcionális\)/);
});
