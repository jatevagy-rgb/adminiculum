import assert from 'node:assert/strict';
import { createRaceHarness, flatten, settle, textOf } from './helpers/asyncRaceHarness';
import { it } from 'node:test';

const row = (id: string, subject: string, direction: 'INBOUND' | 'OUTBOUND', at: string, caseId: string | null = null) => ({
  id, subject, direction, effectiveMessageAt: at, createdAt: at, caseId,
  senderName: 'Feladó', recipientName: 'Címzett', senderEmail: 'sender@example.test', recipientEmail: 'recipient@example.test',
  attachmentCount: id === 'a' ? 2 : 0, type: 'EMAIL',
});

it('an unassigned synthetic ledger supports metadata, multiselect, filters, sort and honest paging without reassignment', async () => {
  const calls: Array<{ clientId?: string; offset?: number }> = [];
  const caseReads: string[] = [];
  const first = [row('a', 'Szerződés', 'INBOUND', '2026-10-07T09:00:00Z'),
    row('b', 'Határidő', 'OUTBOUND', '2026-10-08T10:00:00Z'), row('c', 'Kapcsolt', 'INBOUND', '2026-10-06T11:00:00Z', 'other-case')];
  const h = createRaceHarness('src/components/cases/intake/CaseCommunicationPickerDrawer.tsx', 'CaseCommunicationPickerDrawer', {
    '@/lib/api': { getCaseById: async (id: string) => { caseReads.push(id); return { id, clientId: 'client-a', caseNumber: 'C-220', title: 'Másik ügy' }; },
      getCommunications: async (params: { clientId?: string; offset?: number }) => {
      calls.push(params);
      return { communications: params.offset ? [row('d', 'Negyedik', 'INBOUND', '2026-10-05T10:00:00Z')] : first,
        pagination: { total: 4, limit: 50, offset: params.offset ?? 0 } };
    } },
    '@/lib/businessDateTime': { businessDateKey: (value: string) => value.slice(0, 10) },
    './intakeStyles': { intake: { field: '', primaryAction: '', secondaryAction: '' }, ACCENT_BG: {}, ACCENT_TEXT: {} },
  });
  const props = { open: true, clientId: 'client-a', currentCaseId: 'case-a', selectedIds: [], primaryId: '',
    onCancel() {}, onConfirm() {} };
  h.render(props); h.effects(); await settle();
  let tree = h.render(props);
  const available = () => flatten(tree).find((node) => node.props?.['data-testid'] === 'comm-picker-available');
  assert.match(textOf(available()), /Szerződés[\s\S]*Feladó[\s\S]*Címzett[\s\S]*2 melléklet/);
  assert.match(textOf(flatten(available()).find((node) => node.type === 'li')), /Határidő/);
  assert.match(textOf(tree), /3\s*\/\s*4\s*beszélgetés betöltve/);
  assert.equal(flatten(available()).filter((node) => node.props?.['data-testid'] === 'comm-picker-item').length, 2);
  assert.equal(flatten(tree).find((node) => node.props?.['data-testid'] === 'comm-picker-confirm').props.disabled, true);
  flatten(available()).find((node) => node.props?.['data-testid'] === 'comm-picker-item').props.onChange();
  tree = h.render(props);
  assert.match(textOf(tree), /1 beszélgetés kiválasztva/);
  assert.equal(flatten(tree).find((node) => node.props?.['data-testid'] === 'comm-picker-confirm').props.disabled, false);

  flatten(tree).find((node) => node.props?.['aria-label'] === 'Irány szűrése').props.onChange({ target: { value: 'OUTBOUND' } });
  tree = h.render(props);
  assert.match(textOf(available()), /Határidő/);
  assert.doesNotMatch(textOf(available()), /Szerződés/);
  flatten(tree).find((node) => node.props?.['aria-label'] === 'Irány szűrése').props.onChange({ target: { value: 'ALL' } });
  tree = h.render(props);
  flatten(tree).find((node) => node.props?.['data-testid'] === 'comm-picker-assigned-toggle').props.onClick();
  tree = h.render(props);
  assert.match(textOf(flatten(tree).find((node) => node.props?.['data-testid'] === 'comm-picker-assigned')), /Kapcsolt ügy[\s\S]*C-220[\s\S]*Másik ügy/);
  assert.deepEqual(caseReads, ['other-case']);
  assert.equal(flatten(tree).filter((node) => node.props?.['data-testid'] === 'comm-picker-item').length, 2);

  flatten(tree).find((node) => textOf(node) === 'További beszélgetések betöltése' && node.type === 'button').props.onClick();
  await settle();
  tree = h.render(props);
  assert.match(textOf(tree), /4\s*\/\s*4\s*beszélgetés betöltve/);
  assert.equal(calls.length, 2);
  assert.equal(calls[0].clientId, 'client-a');
  assert.equal(calls[1].offset, 3);
  flatten(tree).find((node) => node.props?.['aria-label'] === 'Időrend').props.onChange({ target: { value: 'OLDEST' } });
  tree = h.render(props);
  assert.match(textOf(flatten(available()).find((node) => node.type === 'li')), /Negyedik/);
  flatten(tree).find((node) => node.props?.['aria-label'] === 'Kezdő dátum').props.onChange({ target: { value: '2026-10-08' } });
  tree = h.render(props);
  assert.match(textOf(available()), /Határidő/);
  assert.doesNotMatch(textOf(available()), /Szerződés|Negyedik/);
  flatten(tree).find((node) => node.props?.['data-testid'] === 'comm-picker-search').props.onChange({ target: { value: 'recipient@example.test' } });
  tree = h.render(props);
  assert.match(textOf(available()), /Határidő/);
  flatten(tree).find((node) => node.props?.['data-testid'] === 'comm-picker-search').props.onChange({ target: { value: 'nem létező' } });
  tree = h.render(props);
  assert.doesNotMatch(textOf(available()), /Határidő/);
  assert.match(textOf(tree), /Nincs a szűrésnek megfelelő szabad levelezés/);
});

it('late client A ledger responses cannot replace client B or preserve A selection', async () => {
  let resolveOld!: (value: unknown) => void;
  const h = createRaceHarness('src/components/cases/intake/CaseCommunicationPickerDrawer.tsx', 'CaseCommunicationPickerDrawer', {
    '@/lib/api': { getCommunications: ({ clientId }: { clientId: string }) => clientId === 'client-a'
      ? new Promise((resolve) => { resolveOld = resolve; })
      : Promise.resolve({ communications: [row('b', 'Csak B', 'OUTBOUND', '2026-10-08T10:00:00Z')], pagination: { total: 1, limit: 50, offset: 0 } }) },
    '@/lib/businessDateTime': { businessDateKey: (value: string) => value.slice(0, 10) },
    './intakeStyles': { intake: { field: '', primaryAction: '', secondaryAction: '' }, ACCENT_BG: {}, ACCENT_TEXT: {} },
  });
  const props = { open: true, clientId: 'client-a', currentCaseId: 'case-a', selectedIds: [], primaryId: '', onCancel() {}, onConfirm() {} };
  h.render(props); h.effects();
  h.render({ ...props, clientId: 'client-b', currentCaseId: 'case-b' }); h.effects(); await settle();
  let tree = h.render({ ...props, clientId: 'client-b', currentCaseId: 'case-b' });
  assert.match(textOf(tree), /Csak B/);
  resolveOld({ communications: [row('a', 'Régi A', 'INBOUND', '2026-10-07T09:00:00Z')], pagination: { total: 1, limit: 50, offset: 0 } });
  await settle();
  tree = h.render({ ...props, clientId: 'client-b', currentCaseId: 'case-b' });
  assert.match(textOf(tree), /Csak B/);
  assert.doesNotMatch(textOf(tree), /Régi A/);
  assert.equal(flatten(tree).find((node) => node.props?.['data-testid'] === 'comm-picker-confirm').props.disabled, true);
});

it('an assigned case from another client is not named and cannot be selected', async () => {
  const h = createRaceHarness('src/components/cases/intake/CaseCommunicationPickerDrawer.tsx', 'CaseCommunicationPickerDrawer', {
    '@/lib/api': {
      getCommunications: async () => ({ communications: [row('linked', 'Rejtett ügy', 'INBOUND', '2026-10-07T09:00:00Z', 'foreign-case')], pagination: { total: 1 } }),
      getCaseById: async (id: string) => ({ id, clientId: 'client-b', caseNumber: 'SECRET-9', title: 'Másik ügyfél' }),
    },
    '@/lib/businessDateTime': { businessDateKey: (value: string) => value.slice(0, 10) },
    './intakeStyles': { intake: { field: '', primaryAction: '', secondaryAction: '' }, ACCENT_BG: {}, ACCENT_TEXT: {} },
  });
  const props = { open: true, clientId: 'client-a', currentCaseId: 'case-a', selectedIds: [], primaryId: '', onCancel() {}, onConfirm() {} };
  h.render(props); h.effects(); await settle();
  let tree = h.render(props);
  flatten(tree).find((node) => node.props?.['data-testid'] === 'comm-picker-assigned-toggle').props.onClick();
  tree = h.render(props);
  assert.match(textOf(tree), /Az ügy adatai nem érhetők el/);
  assert.doesNotMatch(textOf(tree), /SECRET-9|Másik ügyfél/);
  assert.equal(flatten(tree).filter((node) => node.props?.['data-testid'] === 'comm-picker-item').length, 0);
});

it('an already-linked conversation in this case is never grouped as another case', async () => {
  const h = createRaceHarness('src/components/cases/intake/CaseCommunicationPickerDrawer.tsx', 'CaseCommunicationPickerDrawer', {
    '@/lib/api': {
      getCommunications: async () => ({ communications: [row('own', 'Saját ügy', 'INBOUND', '2026-10-07T09:00:00Z', 'case-a')], pagination: { total: 1 } }),
      getCaseById: async (id: string) => ({ id, clientId: 'client-a', caseNumber: 'C-100', title: 'Jelen ügy' }),
    },
    '@/lib/businessDateTime': { businessDateKey: (value: string) => value.slice(0, 10) },
    './intakeStyles': { intake: { field: '', primaryAction: '', secondaryAction: '' }, ACCENT_BG: {}, ACCENT_TEXT: {} },
  });
  const props = { open: true, clientId: 'client-a', currentCaseId: 'case-a', selectedIds: [], primaryId: '', onCancel() {}, onConfirm() {} };
  h.render(props); h.effects(); await settle();
  let tree = h.render(props);
  assert.match(textOf(tree), /Már ügyhöz kapcsolt beszélgetések \(\s*1\s*\)/);
  assert.doesNotMatch(textOf(tree), /Más ügyhöz már hozzárendelve/);
  flatten(tree).find((node) => node.props?.['data-testid'] === 'comm-picker-assigned-toggle').props.onClick();
  tree = h.render(props);
  assert.match(textOf(tree), /Ehhez az ügyhöz kapcsolva[\s\S]*C-100[\s\S]*Jelen ügy/);
  assert.equal(flatten(tree).filter((node) => node.props?.['data-testid'] === 'comm-picker-item').length, 0);
});
