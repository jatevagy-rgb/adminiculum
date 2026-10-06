import { it } from 'node:test';
import assert from 'node:assert/strict';
import { createRaceHarness, settle } from './helpers/asyncRaceHarness';
import { flatten, textOf } from './helpers/componentHarness';
import { linkThreadErrorMessage } from '../src/lib/communicationLinkErrors';

it('a failed primary list shows an accessible retry, not a false empty result; retry recovers', async () => {
  let failed = true;
  const harness = createRaceHarness('src/components/communications/CommunicationWorkspace.tsx', 'default', {
    '@/lib/api': {
      getMailboxConnections: async () => ({ mailboxes: [] }),
      getOutlookStatus: async () => ({ available: false }),
      getCommunications: async () => { if (failed) throw new Error('private provider diagnostic'); return { communications: [], pagination: { total: 0 } }; },
      getCases: async () => ({ data: [] }), getClients: async () => ({ data: [] }),
    },
    '@/lib/attentionCategory': { ATTENTION_CATEGORY_ORDER: [] },
  });
  harness.render(); harness.effects(); await settle();
  let tree = harness.render();
  const alert = flatten(tree).find((node) => node.props?.role === 'alert');
  assert.match(textOf(alert), /lista most nem érhető el/);
  assert.doesNotMatch(textOf(tree), /private provider diagnostic/);
  assert.equal(flatten(tree).some((node) => node.props?.title === 'Nincs találat.'), false);
  failed = false;
  flatten(alert).find((node) => node.type === 'button').props.onClick();
  harness.render(); harness.effects(); await settle(); tree = harness.render();
  assert.equal(flatten(tree).some((node) => node.props?.role === 'alert'), false);
  assert.equal(flatten(tree).some((node) => node.props?.title === 'Nincs találat.'), true);
});

it('a concurrent link conflict gives a safe, actionable message', () => {
  assert.match(linkThreadErrorMessage({ status: 409, code: 'COMMUNICATION_ALREADY_LINKED' }), /másik ügyhöz.*Frissítsd/);
});
