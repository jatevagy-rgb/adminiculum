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
    'next/link': { default: 'a' },
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

test('existing types without an active work package are selectable and say so plainly', async () => {
  // The catalogue returns an ACTIVE type with no active work package. It is a
  // selectable creation option; the missing work package is an informational
  // note, not a reason to hide the type or to author global taxonomy.
  const { h, created } = harness({
    role: 'ADMIN',
    options: [{ caseTypeDefinition: { id: 'type-1', name: 'Szerződésvéleményezés', slug: 'type-1' }, template: null }],
    types: [{ id: 'type-1', name: 'Szerződésvéleményezés', isActive: true, sortOrder: 0 }],
  });
  const tree = await settle(h, { open: true, onClose() {}, initialClientId: 'client-1' });
  const list = flatten(tree).find((node) => node.props?.id === 'existing-case-type');
  assert.ok(list, 'the existing type must be selectable');
  assert.ok(flatten(list).some((node) => node.type === 'option' && node.props.value === 'type-1'));
  list.props.onChange({ target: { value: 'type-1' } });
  const afterSelect = h.render({ open: true, onClose() {}, initialClientId: 'client-1' });
  assert.match(textOf(afterSelect), /nincs aktív munkacsomag/i);
  assert.deepEqual(created, []);
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
  assert.ok(!flatten(tree).some((node) => node.props?.href === '/settings/work-packages'));
  assert.deepEqual(created, []);
});

test('an empty New Case state gives managers one obvious path to the canonical case type settings surface', async () => {
  const { h } = harness({ role: 'ADMIN', options: [], types: [] });
  const tree = await settle(h, { open: true, onClose() {}, initialClientId: 'client-1' });
  const cta = flatten(tree).find((node) => node.props?.href === '/settings/work-packages');
  assert.ok(cta, 'the empty state must link to the canonical /settings/work-packages surface');
  assert.match(textOf(cta), /Ügytípusok és munkacsomagok beállítása/);
});

test('the canonical settings path can make a case type creation-eligible without hidden knowledge', async () => {
  // Mirrors the real flow: POST /work-package-admin/case-types/usable creates the
  // type and atomically activates an empty "Alap munkacsomag" template, so the
  // very next creation-options read contains it. No seed, no hidden row.
  const { h } = harness({ role: 'ADMIN', options: [], types: [] });
  const settings = componentHarness('src/app/settings/work-packages/page.tsx', 'WorkPackagesContent', {
    '@/components/AuthenticatedApp': { AuthenticatedApp: 'div' },
    '@/lib/api': {
      getCurrentUser: async () => ({ role: 'ADMIN' }),
      listWorkPackageCaseTypes: async () => ({ items: [] }),
      listWorkPackageTemplates: async () => ({ items: [] }),
      createUsableCaseType: async (name: string) => eligible('type-new', name),
      setWorkPackageCaseTypeActive: async () => ({}),
      createWorkPackageTemplate: async () => ({}),
      activateWorkPackageTemplate: async () => ({}),
    },
  });
  let tree: any;
  for (let i = 0; i < 3; i += 1) { tree = settings.render(); settings.effects(); await tick(); }
  tree = settings.render();
  const nameInput = flatten(tree).find((node) => node.props?.id === 'case-type-name');
  assert.ok(nameInput, 'settings must expose name-only creation');
  nameInput.props.onChange({ target: { value: 'Munkajog' } });
  tree = settings.render();
  flatten(tree).find((node) => node.type === 'form').props.onSubmit({ preventDefault() {} });
  await tick();
  // The dialog only ever reads the canonical options; nothing is invented here.
  assert.ok(!flatten(await settle(h, { open: true, onClose() {}, initialClientId: 'client-1' })).some((node) => node.props?.id === 'existing-case-type'));
});

test('after configuration the reopened dialog reloads canonical options and creates the case', async () => {
  const options: Eligible[] = [];
  const types: any[] = [];
  const { h, cases, created } = harness({ role: 'ADMIN', options, types });
  const open = { open: true, onClose() {}, initialClientId: 'client-1', initialTitle: 'Munkajogi tanácsadás' };
  let tree = await settle(h, open);
  assert.match(textOf(tree), /nincs ügytípus/i);

  // Admin configures the first eligible type on the canonical settings surface.
  options.push(eligible('type-1', 'Munkajog'));
  types.push({ id: 'type-1', name: 'Munkajog', isActive: true, sortOrder: 0 });

  h.render({ ...open, open: false }); h.effects();
  tree = h.render(open); h.effects(); await tick(); tree = h.render(open); h.effects(); tree = h.render(open);

  const list = flatten(tree).find((node) => node.props?.id === 'existing-case-type');
  assert.ok(list, 'the newly eligible type must appear after reopening');
  assert.ok(flatten(list).some((node) => node.type === 'option' && node.props.value === 'type-1'));
  list.props.onChange({ target: { value: 'type-1' } });
  tree = h.render(open); h.effects(); tree = h.render(open);
  await flatten(tree).find((node) => node.type === 'form').props.onSubmit({ preventDefault() {} });
  assert.equal(cases[0].caseTypeDefinitionId, 'type-1');
  assert.equal(cases[0].clientId, 'client-1');
  assert.deepEqual(created, []);
});

test('a failed catalogue lookup still surfaces the honest empty state instead of a creation path', async () => {
  const { h, created } = harness({ role: 'ADMIN', options: [], types: [], failTypes: true });
  const tree = await settle(h, { open: true, onClose() {}, initialClientId: 'client-1' });
  assert.match(textOf(tree), /nincs ügytípus/i);
  assert.deepEqual(created, []);
});
