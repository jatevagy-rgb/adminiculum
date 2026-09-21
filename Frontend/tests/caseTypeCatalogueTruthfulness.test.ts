import { test } from 'node:test';
import assert from 'node:assert/strict';
import { componentHarness, flatten, textOf, tick } from './helpers/componentHarness';

// UAT reproduction: Demo Kft. case creation. The Ügytípus field must surface
// existing eligible case types, and when the catalogue is genuinely empty the
// dialog must say so instead of presenting "create a new global case type" as
// the only normal path. No global taxonomy may be created automatically.

type Eligible = { caseTypeDefinition: { id: string; name: string; slug: string }; template: any };

const eligible = (id: string, name: string): Eligible => ({
  caseTypeDefinition: { id, name, slug: id },
  template: {
    id: `template-${id}`, name: 'Alap munkacsomag', version: 1,
    items: [{ moduleKey: 'required', label: 'Kötelező', isOptional: false, order: 0 }],
  },
});

function harness({ role = 'ADMIN', options = [] as Eligible[], types = [] as any[], failTypes = false }: any = {}) {
  const created: string[] = [];
  const cases: any[] = [];
  const h = componentHarness('src/components/cases/CompactNewCaseDialog.tsx', 'CompactNewCaseDialog', {
    'next/navigation': { useRouter: () => ({ push() {} }) },
    './intake/intakeStyles': { intake: {}, ACCENT_BG: {}, ACCENT_TEXT: {} },
    '@/lib/api': {
      getClientList: async () => [{ id: 'client-1', name: 'Demo Kft.' }],
      getCaseCreationOptions: async () => ({ items: options }),
      listWorkPackageCaseTypes: async () => { if (failTypes) throw new Error('unavailable'); return { items: types }; },
      getUsers: async () => [],
      getCurrentUser: async () => ({ role }),
      createUsableCaseType: async (name: string) => { created.push(name); return eligible('saved-type', name); },
      createCase: async (data: any) => { cases.push(data); return { id: 'new-case' }; },
    },
  });
  return { h, created, cases };
}

async function settle(h: any, props: any) {
  let tree = h.render(props);
  h.effects();
  await tick();
  tree = h.render(props);
  h.effects();
  tree = h.render(props);
  return tree;
}

test('empty eligible catalogue is stated honestly and offers no automatic global type', async () => {
  const { h, created, cases } = harness({ role: 'ADMIN', options: [], types: [] });
  const tree = await settle(h, { open: true, onClose() {}, initialClientId: 'client-1' });
  const text = textOf(tree);
  assert.match(text, /nincs ügytípus/i);
  assert.equal(created.length, 0);
  assert.equal(cases.length, 0);
  assert.equal(flatten(tree).find((node) => node.type === 'button' && node.props.type === 'submit').props.disabled, true);
});

test('existing but unusable types explain the missing active work package instead of hiding it', async () => {
  const { h } = harness({ role: 'ADMIN', options: [], types: [{ id: 'type-1', name: 'Szerződésvéleményezés', isActive: true, sortOrder: 0 }] });
  const tree = await settle(h, { open: true, onClose() {}, initialClientId: 'client-1' });
  assert.match(textOf(tree), /nincs aktív munkacsomag/i);
});

test('inactive-only catalogue is reported as inactive rather than as a missing type', async () => {
  const { h } = harness({ role: 'ADMIN', options: [], types: [{ id: 'type-1', name: 'Munkajog', isActive: false, sortOrder: 0 }] });
  const tree = await settle(h, { open: true, onClose() {}, initialClientId: 'client-1' });
  assert.match(textOf(tree), /inaktív/i);
});

test('managers select an existing eligible type from an explicit list without typing its exact name', async () => {
  const { h, created, cases } = harness({ role: 'ADMIN', options: [eligible('type-1', 'Szerződésvéleményezés')], types: [{ id: 'type-1', name: 'Szerződésvéleményezés', isActive: true, sortOrder: 0 }] });
  let tree = await settle(h, { open: true, onClose() {}, initialClientId: 'client-1', initialTitle: 'Szerződés felülvizsgálat' });
  const list = flatten(tree).find((node) => node.props?.id === 'existing-case-type');
  assert.ok(list, 'existing eligible types must be explicitly selectable');
  assert.ok(flatten(list).some((node) => node.type === 'option' && node.props.value === 'type-1'));
  list.props.onChange({ target: { value: 'type-1' } });
  tree = h.render({ open: true, onClose() {}, initialClientId: 'client-1', initialTitle: 'Szerződés felülvizsgálat' });
  h.effects();
  tree = h.render({ open: true, onClose() {}, initialClientId: 'client-1', initialTitle: 'Szerződés felülvizsgálat' });
  await flatten(tree).find((node) => node.type === 'form').props.onSubmit({ preventDefault() {} });
  assert.equal(cases[0].caseTypeDefinitionId, 'type-1');
  assert.equal(cases[0].clientId, 'client-1');
  assert.deepEqual(created, []);
});

test('client context survives global and client-scoped creation without auto-creating taxonomy', async () => {
  const { h, created, cases } = harness({ role: 'LAWYER', options: [eligible('type-1', 'Szerződésvéleményezés')], types: [{ id: 'type-1', name: 'Szerződésvéleményezés', isActive: true, sortOrder: 0 }] });
  let tree = await settle(h, { open: true, onClose() {}, initialClientId: 'client-1', initialTitle: 'Ügy' });
  const select = flatten(tree).find((node) => node.props?.id === 'new-case-type');
  assert.equal(select.type, 'select');
  select.props.onChange({ target: { value: 'type-1' } });
  tree = h.render({ open: true, onClose() {}, initialClientId: 'client-1', initialTitle: 'Ügy' });
  h.effects();
  tree = h.render({ open: true, onClose() {}, initialClientId: 'client-1', initialTitle: 'Ügy' });
  await flatten(tree).find((node) => node.type === 'form').props.onSubmit({ preventDefault() {} });
  assert.equal(cases[0].clientId, 'client-1');
  assert.equal(cases[0].caseTypeDefinitionId, 'type-1');
  assert.deepEqual(created, []);
});

test('non-managers keep the honest empty state and gain no creation capability', async () => {
  const { h, created } = harness({ role: 'LAWYER', options: [], types: [] });
  const tree = await settle(h, { open: true, onClose() {}, initialClientId: 'client-1' });
  assert.match(textOf(tree), /nincs ügytípus/i);
  assert.ok(!textOf(tree).includes('mentése új ügytípusként'));
  assert.ok(!flatten(tree).some((node) => node.props?.id === 'existing-case-type'));
  assert.deepEqual(created, []);
});

test('a failed catalogue lookup still surfaces the honest empty state instead of a creation path', async () => {
  const { h, created } = harness({ role: 'ADMIN', options: [], types: [], failTypes: true });
  const tree = await settle(h, { open: true, onClose() {}, initialClientId: 'client-1' });
  assert.match(textOf(tree), /nincs ügytípus/i);
  assert.deepEqual(created, []);
});
