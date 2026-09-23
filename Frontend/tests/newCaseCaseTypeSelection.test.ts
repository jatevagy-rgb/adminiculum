import { test } from 'node:test';
import assert from 'node:assert/strict';
import { componentHarness, flatten, textOf, tick } from './helpers/componentHarness';

// F-003 targeted repair: the ordinary new-case flow selects an EXISTING active
// case type. A type without an active work package is still selectable and the
// case is created with the selected id. Global case-type creation stays an
// explicit, opt-in manager action and is never invoked by ordinary selection.

type Option = { caseTypeDefinition: { id: string; name: string; slug: string }; template: any };

const option = (id: string, name: string, template: any = null): Option => ({
  caseTypeDefinition: { id, name, slug: id },
  template,
});

const withTemplate = (id: string, name: string): Option => option(id, name, {
  id: `template-${id}`, name: 'Alap munkacsomag', version: 1,
  items: [{ moduleKey: 'required', label: 'Kötelező', isOptional: false, order: 0 }],
});

function harness({ role = 'ADMIN', options = [] as Option[], types = [] as any[] }: any = {}) {
  const created: string[] = [];
  const cases: any[] = [];
  const routerPushes: string[] = [];
  const h = componentHarness('src/components/cases/CompactNewCaseDialog.tsx', 'CompactNewCaseDialog', {
    'next/navigation': { useRouter: () => ({ push: (href: string) => routerPushes.push(href) }) },
    'next/link': { default: 'a' },
    './intake/intakeStyles': { intake: {}, ACCENT_BG: {}, ACCENT_TEXT: {} },
    '@/lib/api': {
      getClientList: async () => [{ id: 'client-1', name: 'Demo Kft.' }],
      getCaseCreationOptions: async () => ({ items: options }),
      listWorkPackageCaseTypes: async () => ({ items: types }),
      getUsers: async () => [],
      getCurrentUser: async () => ({ role }),
      createUsableCaseType: async (name: string) => { created.push(name); return withTemplate('saved-type', name); },
      createCase: async (data: any) => { cases.push(data); return { id: 'new-case' }; },
    },
  });
  return { h, created, cases, routerPushes };
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

const props = (extra: any = {}) => ({ open: true, onClose() {}, initialClientId: 'client-1', initialTitle: 'Szerződés felülvizsgálat', ...extra });
const submit = (tree: any) => flatten(tree).find((node) => node.type === 'form').props.onSubmit({ preventDefault() {} });

test('catalogue loads and an existing active type without an active work package is selectable', async () => {
  const { h } = harness({ role: 'ADMIN', options: [option('type-szerzodes', 'Szerződés')], types: [{ id: 'type-szerzodes', name: 'Szerződés', isActive: true }] });
  const tree = await settle(h, props());
  const list = flatten(tree).find((node) => node.props?.id === 'existing-case-type');
  assert.ok(list, 'the existing case type list must render');
  assert.ok(flatten(list).some((node) => node.type === 'option' && node.props.value === 'type-szerzodes'));
  list.props.onChange({ target: { value: 'type-szerzodes' } });
  const afterSelect = h.render(props()); h.effects(); 
  // No active work package is an informational note, not a blocking error.
  assert.match(textOf(afterSelect), /nincs aktív munkacsomag/i);
});

test('selecting an existing type submits its id and never invokes global type creation', async () => {
  const { h, created, cases, routerPushes } = harness({ role: 'ADMIN', options: [withTemplate('type-szerzodes', 'Szerződés')] });
  let tree = await settle(h, props());
  const list = flatten(tree).find((node) => node.props?.id === 'existing-case-type');
  list.props.onChange({ target: { value: 'type-szerzodes' } });
  tree = h.render(props()); h.effects(); tree = h.render(props());
  await submit(tree);
  assert.equal(cases[0].caseTypeDefinitionId, 'type-szerzodes');
  assert.equal(cases[0].clientId, 'client-1');
  assert.deepEqual(created, [], 'ordinary selection must not create global taxonomy');
  assert.deepEqual(routerPushes, ['/cases/new-case']);
});

test('a template-less selection creates the case with no modules and no global type creation', async () => {
  const { h, created, cases } = harness({ role: 'ADMIN', options: [option('type-szerzodes', 'Szerződés')] });
  let tree = await settle(h, props());
  flatten(tree).find((node) => node.props?.id === 'existing-case-type').props.onChange({ target: { value: 'type-szerzodes' } });
  tree = h.render(props()); h.effects(); tree = h.render(props());
  await submit(tree);
  assert.equal(cases[0].caseTypeDefinitionId, 'type-szerzodes');
  assert.deepEqual(Array.from(cases[0].selectedModuleKeys), []);
  assert.deepEqual(created, []);
});

test('non-managers select an existing type from a required select with no creation action', async () => {
  const { h, created, cases } = harness({ role: 'LAWYER', options: [withTemplate('type-1', 'Munkajog')] });
  let tree = await settle(h, props({ initialTitle: 'Ügy' }));
  const select = flatten(tree).find((node) => node.props?.id === 'new-case-type');
  assert.equal(select.type, 'select');
  assert.equal(select.props.required, true);
  select.props.onChange({ target: { value: 'type-1' } });
  tree = h.render(props({ initialTitle: 'Ügy' })); h.effects(); tree = h.render(props({ initialTitle: 'Ügy' }));
  await submit(tree);
  assert.equal(cases[0].caseTypeDefinitionId, 'type-1');
  assert.deepEqual(created, []);
  assert.ok(!textOf(tree).includes('mentése új ügytípusként'));
});

test('required validation remains: no type means submit stays unavailable', async () => {
  const { h, cases } = harness({ role: 'ADMIN', options: [withTemplate('type-1', 'Munkajog')] });
  const tree = await settle(h, props());
  assert.equal(flatten(tree).find((node) => node.props?.id === 'existing-case-type').props.required, true);
  assert.equal(flatten(tree).find((node) => node.type === 'button' && node.props.type === 'submit').props.disabled, true);
  assert.deepEqual(cases, []);
});

test('global type creation stays explicit and opt-in, never automatic', async () => {
  const { h, created, cases } = harness({ role: 'ADMIN', options: [withTemplate('type-1', 'Munkajog')] });
  let tree = await settle(h, props());
  assert.deepEqual(created, [], 'opening the dialog must never create taxonomy');

  const nameInput = flatten(tree).find((node) => node.props?.id === 'new-case-type');
  assert.ok(nameInput, 'the manager-only creation input is still available');
  assert.notEqual(nameInput.props.required, true, 'the creation input must not masquerade as the required field');
  nameInput.props.onChange({ target: { value: 'Új ügytípus' } });
  tree = h.render(props()); h.effects();
  await flatten(tree).find((node) => node.type === 'button' && textOf(node).includes('mentése új ügytípusként')).props.onClick();
  assert.deepEqual(created, ['Új ügytípus']);
  assert.deepEqual(cases, []);
});
