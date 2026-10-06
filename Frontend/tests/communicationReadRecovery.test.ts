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

it('the canonical communication leaf retains reply-needed and internal/external signals by exact message ID', async () => {
  const items = ['message-a', 'message-b', 'message-outside-summary'].map(id => ({ id, type: 'EMAIL', subject: id, attachmentCount: 0 }));
  const harness = createRaceHarness('src/components/cases/word-workflow/tools/WordWideCommunicationLeaf.tsx', 'WordWideCommunicationLeaf', {
    '@/lib/api': { getCommunications: async () => ({ communications: items }) },
    '@/lib/businessDateTime': { formatDeadline: () => 'Nincs időpont' },
  });
  const props = { caseId: 'case-a', clientId: null, replyNeededIds: ['message-b'], communicationSignals: [{ id: 'message-a', internal: true }, { id: 'message-b', internal: false }] };
  harness.render(props); harness.effects(); await settle();
  const tree = harness.render(props);
  const a = flatten(tree).find(n => n.props?.['data-testid'] === 'comm-thread-item-message-a');
  const b = flatten(tree).find(n => n.props?.['data-testid'] === 'comm-thread-item-message-b');
  assert.match(textOf(a), /Belső/); assert.doesNotMatch(textOf(a), /Válaszra vár/);
  assert.match(textOf(b), /Külső/); assert.match(textOf(b), /Válaszra vár/);
  const outside = flatten(tree).find(n => n.props?.['data-testid'] === 'comm-thread-item-message-outside-summary');
  assert.doesNotMatch(textOf(outside), /Belső|Külső|Válaszra vár/);
  const refreshed = harness.render({ ...props, replyNeededIds: [] });
  assert.doesNotMatch(textOf(refreshed), /Válaszra vár/);
});

it('the picker announces its staged selection count and cancellation never confirms it', async () => {
  let confirmed = false, cancelled = false;
  const harness = createRaceHarness('src/components/cases/intake/CaseCommunicationPickerDrawer.tsx', 'CaseCommunicationPickerDrawer', {
    '@/lib/api': { getCommunications: async () => ({ communications: [{ id: 'message-a', subject: 'Első', caseId: null }] }) },
    './intakeStyles': { intake: {}, ACCENT_BG: {}, ACCENT_TEXT: {} },
  });
  const props = { open: true, clientId: 'client-a', selectedIds: [], primaryId: '', onCancel: () => { cancelled = true; }, onConfirm: () => { confirmed = true; } };
  harness.render(props); harness.effects(); await settle();
  let tree = harness.render(props);
  const count = () => flatten(tree).find(n => n.props?.['data-testid'] === 'comm-picker-count');
  assert.equal(count().props.role, 'status'); assert.match(textOf(count()), /0 beszélgetés/);
  flatten(tree).find(n => n.props?.['data-testid'] === 'comm-picker-item').props.onChange();
  tree = harness.render(props); assert.match(textOf(count()), /1 beszélgetés/);
  flatten(tree).find(n => n.props?.['data-testid'] === 'comm-picker-cancel').props.onClick();
  assert.equal(cancelled, true); assert.equal(confirmed, false);
});
