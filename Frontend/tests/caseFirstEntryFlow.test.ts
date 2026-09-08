import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { componentHarness, flatten, textOf, tick } from './helpers/componentHarness';
import { loadTimeEntryCases, timeEntryCaseLabel } from '../src/lib/timeEntryCaseSelection';

const option = (id = 'type-1', name = 'Szerződés', items: any[] = []) => ({ caseTypeDefinition: { id, name, slug: id }, template: { id: 'template-1', name: 'Sablon', version: 1, items } });
const change = (node: any, value: string) => node.props.onChange({ target: { value } });

function dialog(role = 'ADMIN', fail = false) {
  const options = [option('type-1', 'Szerződés', [{ moduleKey: 'required', label: 'Kötelező', isOptional: false, order: 0 }, { moduleKey: 'optional', label: 'Kutatás', isOptional: true, order: 1 }])];
  const calls: any[] = [], cases: any[] = [];
  const h = componentHarness('src/components/cases/CompactNewCaseDialog.tsx', 'CompactNewCaseDialog', {
    'next/navigation': { useRouter: () => ({ push() {} }) },
    './intake/intakeStyles': { intake: {}, ACCENT_BG: {}, ACCENT_TEXT: {} },
    '@/lib/api': {
      getClientList: async () => [{ id: 'client-1', name: 'Ügyfél' }], getCaseCreationOptions: async () => ({ items: [...options] }),
      getUsers: async () => [], getCurrentUser: async () => ({ role }),
      createUsableCaseType: async (name: string) => { calls.push(name); if (fail) throw new Error('failed'); const next = option('saved-type', name); options.push(next); return next; },
      createCase: async (data: any) => { cases.push(data); return { id: 'new-case' }; },
    },
  });
  return { h, calls, cases };
}

test('manager creates/selects reusable name-only type and keeps all unsaved case fields across save and reopen', async () => {
  for (const role of ['ADMIN', 'PARTNER']) {
    const { h, calls, cases } = dialog(role);
    const props = { open: true, onClose() {}, initialClientId: 'client-1', initialTitle: 'Megőrzött ügy', initialDescription: 'Leírás' };
    let tree = h.render(props); h.effects(); await tick(); tree = h.render(props); h.effects();
    change(flatten(tree).find((node) => node.props?.id === 'new-case-type'), 'Munkajog');
    tree = h.render(props); h.effects();
    await flatten(tree).find((node) => node.type === 'button' && textOf(node).includes('mentése új ügytípusként')).props.onClick();
    tree = h.render(props); h.effects(); tree = h.render(props);
    assert.deepEqual(calls, ['Munkajog']);
    assert.equal(flatten(tree).find((node) => node.props?.id === 'new-case-type').props.value, 'Munkajog');
    assert.ok(flatten(tree).some((node) => node.type === 'input' && node.props.value === 'Megőrzött ügy'));
    assert.ok(flatten(tree).some((node) => node.type === 'textarea' && node.props.value === 'Leírás'));
    h.render({ ...props, open: false }); h.effects(); h.render(props); h.effects(); await tick(); tree = h.render(props); h.effects(); tree = h.render(props);
    assert.ok(flatten(tree).some((node) => node.type === 'option' && node.props.value === 'Munkajog'));
    await flatten(tree).find((node) => node.type === 'form').props.onSubmit({ preventDefault() {} });
    assert.equal(cases[0].caseTypeDefinitionId, 'saved-type');
    assert.equal(cases[0].title, 'Megőrzött ügy');
    assert.deepEqual(Array.from(cases[0].selectedModuleKeys), []);
  }
});

test('non-managers use existing types and retain required/optional module behavior without creation action', async () => {
  const { h, calls, cases } = dialog('LAWYER');
  const props = { open: true, onClose() {}, initialClientId: 'client-1', initialTitle: 'Ügy' };
  h.render(props); h.effects(); await tick(); let tree = h.render(props); h.effects();
  const select = flatten(tree).find((node) => node.props?.id === 'new-case-type');
  assert.equal(select.type, 'select');
  change(select, 'type-1'); tree = h.render(props); h.effects(); tree = h.render(props);
  assert.equal(flatten(tree).find((node) => node.type === 'button' && textOf(node).includes('Kötelező')).props.disabled, true);
  flatten(tree).find((node) => node.type === 'button' && textOf(node).trim() === 'Kutatás').props.onClick();
  tree = h.render(props);
  await flatten(tree).find((node) => node.type === 'form').props.onSubmit({ preventDefault() {} });
  assert.deepEqual(Array.from(cases[0].selectedModuleKeys), ['required']);
  assert.deepEqual(calls, []);
  assert.ok(!textOf(tree).includes('mentése új ügytípusként'));
});

test('failed type creation preserves typed name/form and leaves submit unavailable', async () => {
  const { h } = dialog('ADMIN', true);
  const props = { open: true, onClose() {}, initialClientId: 'client-1', initialTitle: 'Megmarad' };
  h.render(props); h.effects(); await tick(); let tree = h.render(props);
  change(flatten(tree).find((node) => node.props?.id === 'new-case-type'), 'Új típus');
  tree = h.render(props);
  await flatten(tree).find((node) => node.type === 'button' && textOf(node).includes('mentése új ügytípusként')).props.onClick();
  tree = h.render(props);
  assert.equal(flatten(tree).find((node) => node.props?.id === 'new-case-type').props.value, 'Új típus');
  assert.equal(flatten(tree).find((node) => node.type === 'button' && node.props.type === 'submit').props.disabled, true);
});

const caseRow: any = { id: 'case-empty', clientId: 'client-1', clientName: 'Ügyfél', caseNumber: 'Ü-1', title: 'Idő nélküli ügy' };
function timePage(query = '', entries: any[] = []) {
  const creates: any[] = [], updates: any[] = [], scopes: any[] = [];
  const params = new URLSearchParams(query);
  const api = new Proxy({
    getTimeEntries: async (scope: any) => { scopes.push(scope); return entries; },
    getCases: async (_page: number, _limit: number, _lawyer: any, client: any) => { scopes.push({ casesClient: client }); return { data: [caseRow], pagination: { total: 1 } }; },
    getClients: async () => ({ data: [{ id: 'client-1', name: 'Ügyfél' }] }), getCurrentUser: async () => ({ role: 'LAWYER' }),
    getMatters: async () => { throw new Error('Dead Matters API must never be called'); },
    createTimeEntry: async (data: any) => { creates.push(data); return data; }, updateTimeEntry: async (...args: any[]) => { updates.push(args); return {}; },
  } as any, { get: (target, key) => target[key] || (async () => []) });
  const h = componentHarness('src/app/time-entries/page.tsx', 'TimeEntriesPageContent', {
    '@/lib/api': api, '@/lib/timeEntryCaseSelection': { loadTimeEntryCases, timeEntryCaseLabel },
    'next/navigation': { useSearchParams: () => params, useRouter: () => ({ push() {} }) },
    'next/link': { default: 'a' }, '@/components/AuthenticatedApp': { AuthenticatedApp: 'div' },
  });
  return { h, creates, updates, scopes };
}

test('new entries select Cases with no history, send caseId alone, and client/case links scope and preselect', async () => {
  for (const query of ['', 'clientId=client-1', 'clientId=client-1&caseId=case-empty']) {
    const { h, creates, scopes } = timePage(query);
    h.render(); h.effects(); await tick(); let tree = h.render(); h.effects(); tree = h.render();
    assert.ok(!textOf(tree).includes('A munkacsomag adatok betöltése részlegesen sikertelen.'));
    flatten(tree).find((node) => node.type === 'button' && textOf(node).trim() === 'Munkaóra rögzítése').props.onClick();
    tree = h.render();
    const select = flatten(tree).find((node) => node.props?.id === 'time-entry-case');
    assert.ok(flatten(select).some((node) => node.type === 'option' && node.props.value === 'case-empty'));
    if (query.includes('caseId=')) assert.equal(select.props.value, 'case-empty');
    change(select, 'case-empty');
    tree = h.render();
    change(flatten(tree).find((node) => node.type === 'textarea'), 'Szeptemberi munka');
    tree = h.render();
    await flatten(tree).find((node) => node.type === 'button' && textOf(node) === 'Mentés').props.onClick();
    assert.equal(creates[0].caseId, 'case-empty');
    assert.ok(!('matterId' in creates[0]));
    if (query) assert.ok(scopes.some((scope) => scope.casesClient === 'client-1'));
  }
});

test('legacy Matter-only entry remains visible and editing sends no attribution fields', async () => {
  const entry = { id: 'legacy', matterId: 'matter-old', matter: { id: 'matter-old', title: 'Régi munka', clientId: 'client-1', client: { id: 'client-1', name: 'Ügyfél' } }, workType: 'REVIEW', description: 'Régi leírás', minutes: 60, billable: true, workDate: new Date().toISOString(), attributionKind: 'MATTER_ONLY' };
  const { h, updates } = timePage('', [entry]);
  h.render(); h.effects(); await tick(); let tree = h.render(); h.effects(); tree = h.render();
  assert.ok(textOf(tree).includes('Régi leírás'));
  flatten(tree).find((node) => node.type === 'button' && textOf(node).trim() === 'Szerkeszt').props.onClick();
  tree = h.render(); assert.ok(textOf(tree).includes('Régi munka'));
  assert.ok(!flatten(tree).some((node) => node.props?.id === 'time-entry-case'));
  await flatten(tree).find((node) => node.type === 'button' && textOf(node) === 'Mentés').props.onClick();
  assert.equal(updates[0][0], 'legacy');
  for (const key of ['matterId', 'caseId', 'taskId']) assert.ok(!(key in updates[0][1]));
});

test('case selection follows all pages and forwards client scope', async () => {
  const pages: number[] = [];
  const rows = await loadTimeEntryCases(async (page, _limit, _lawyer, client) => {
    pages.push(page); assert.equal(client, 'client-1');
    return { data: [{ ...caseRow, id: `case-${page}` }], pagination: { total: 2, page, limit: 1 } };
  }, 'client-1');
  assert.deepEqual(pages, [1, 2]); assert.equal(rows.length, 2);
});

test('dead route stays unmounted and generic compatibility helper is preserved', () => {
  assert.doesNotMatch(readFileSync('../Backend/src/index.ts', 'utf8'), /app\.use\(['"]\/api\/v1\/matters['"]/);
  assert.doesNotMatch(readFileSync('src/app/time-entries/page.tsx', 'utf8'), /getMatters/);
  assert.match(readFileSync('src/lib/api.ts', 'utf8'), /export async function getMatters/);
});

test('settings exposes name-only creation and explicit type/template activation only to managers', async () => {
  for (const role of ['ADMIN', 'LAWYER']) {
    const calls: any[] = [];
    const h = componentHarness('src/app/settings/work-packages/page.tsx', 'WorkPackagesContent', {
      '@/components/AuthenticatedApp': { AuthenticatedApp: 'div' },
      '@/lib/api': {
        getCurrentUser: async () => ({ role }),
        listWorkPackageCaseTypes: async () => ({ items: [{ id: 'type-1', name: 'Munkajog', isActive: false }] }),
        listWorkPackageTemplates: async () => ({ items: [{ id: 'draft-1', name: 'Alap munkacsomag', status: 'DRAFT', version: 1, items: [] }] }),
        createUsableCaseType: async (name: string) => { calls.push(['create', name]); return option(); },
        setWorkPackageCaseTypeActive: async (...args: any[]) => { calls.push(['type-active', ...args]); },
        createWorkPackageTemplate: async (body: any) => { calls.push(['template', body]); },
        activateWorkPackageTemplate: async (id: string) => { calls.push(['template-active', id]); },
      },
    });
    let tree: any;
    async function settle() { for (let i = 0; i < 3; i += 1) { tree = h.render(); h.effects(); await tick(); } tree = h.render(); }
    await settle();
    assert.ok(textOf(tree).includes('Inaktív'));
    if (role === 'LAWYER') {
      assert.ok(!flatten(tree).some((node) => node.type === 'form'));
      assert.ok(!flatten(tree).some((node) => node.type === 'button' && textOf(node) === 'Munkacsomag aktiválása'));
      continue;
    }
    const click = async (label: string) => { flatten(tree).find((node) => node.type === 'button' && textOf(node) === label).props.onClick(); await settle(); };
    await click('Aktiválás');
    await click('Munkacsomag aktiválása');
    await click('Alap munkacsomag létrehozása');
    change(flatten(tree).find((node) => node.props?.id === 'case-type-name'), 'Új ügytípus'); tree = h.render();
    flatten(tree).find((node) => node.type === 'form').props.onSubmit({ preventDefault() {} }); await settle();
    assert.equal(JSON.stringify(calls), JSON.stringify([
      ['type-active', 'type-1', true], ['template-active', 'draft-1'],
      ['template', { caseTypeDefinitionId: 'type-1', name: 'Alap munkacsomag', items: [] }], ['create', 'Új ügytípus'],
    ]));
    assert.ok(!textOf(tree).includes('Azonosító, pl.'));
  }
});
