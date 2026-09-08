import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';
import * as jsx from 'react/jsx-runtime';

// Behavior test for ItemRow's authoritative-prop → local-form synchronization.
// Rendered through the same minimal hook scheduler as casesOperationalInteraction:
// the element tree is real, event handlers are real, network is stubbed.
// Reproduces: source 60 → resync clamps to 30 → input must show 30 → save must
// not resend the stale 60.

function loadItemRow(stubs: { patchCalls: any[] }) {
  const states: any[] = [], effects: Array<() => void> = [], dependencies: any[][] = [];
  let cursor = 0;
  const hooks = {
    useState(initial: any) {
      const i = cursor++;
      if (!(i in states)) states[i] = typeof initial === 'function' ? initial() : initial;
      return [states[i], (value: any) => { states[i] = typeof value === 'function' ? value(states[i]) : value; }];
    },
    useEffect(fn: any, deps: any[]) {
      const i = cursor++;
      if (!dependencies[i] || deps.some((v, j) => v !== dependencies[i][j])) { dependencies[i] = deps; effects.push(fn); }
    },
    useCallback(fn: any) { return fn; },
    useMemo(fn: any) { return fn(); },
    useId() { return 'test-id'; },
  };
  class ApiError extends Error { status: number; constructor(status: number, message = 'err') { super(message); this.status = status; } }
  const imports: Record<string, any> = {
    react: hooks,
    'react/jsx-runtime': jsx,
    'next/link': { default: function Link() { return null; } },
    '@/lib/api': { ApiError, getCurrentUser: async () => ({ id: 'u1', role: 'ADMIN' }) },
    '@/lib/billingPreparationsApi': {
      getBillingPreparation: async () => null,
      patchBillingItem: async (...args: any[]) => { stubs.patchCalls.push(args); return {}; },
      refreshBillingPreparation: async () => ({ resynced: 0, added: 0 }),
      resyncBillingItem: async () => ({ resynced: true, item: {} }),
      setBillingPreparationStatus: async () => ({}),
    },
    '@/lib/billingPreparationPresentation': {
      formatMinutes: (m: number) => `${m}p`,
      formatNetAmount: (v: string | null) => v ?? '—',
      formatRate: (v: string | null) => v ?? '—',
      groupByOrganizationGroup: () => [],
      rateScopeLabel: () => 'Díj',
      reviewStatusLabel: new Proxy({}, { get: () => 'Állapot' }),
    },
  };
  const exports: any = {};
  const source = readFileSync('src/app/clients/[clientId]/szamlazas/[preparationId]/BillingReviewWorkspace.tsx', 'utf8');
  vm.runInNewContext(ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX, target: ts.ScriptTarget.ES2020 } }).outputText, {
    exports, console, URLSearchParams,
    require: (name: string) => imports[name] || new Proxy({}, { get: (_, key) => String(key) }),
  });
  assert.equal(typeof exports.ItemRow, 'function', 'ItemRow must be exported');
  const render = (props: any) => { cursor = 0; return exports.ItemRow(props); };
  return { render, runEffects: () => effects.splice(0).forEach((fn) => fn()) };
}

const itemWith = (billingMinutes: number, sourceMinutes: number, over: Record<string, any> = {}) => ({
  id: 'item-1',
  reviewStatus: 'OK',
  attributionKind: 'EXACT_CASE',
  source: {
    workDate: '2026-08-10', minutes: sourceMinutes, billable: true, description: 'Munka', workType: 'DRAFTING',
    case: { caseNumber: 'U1', title: 'Ügy' }, task: null, requester: null,
    worker: { name: 'Ügyvéd' }, department: null,
  },
  rate: { rateVersionId: 'rv-1', hourlyRate: '50000.0000' },
  billing: {
    included: true, billingMinutes, invoiceDescription: null, rateOverride: null,
    rateOverrideReason: null, adjustmentReason: null, effectiveHourlyRate: '50000.0000',
    netAmount: '50000.00', reviewedAt: null as string | null, ...over,
  },
});

const flatten = (node: any): any[] => !node || typeof node !== 'object' ? []
  : Array.isArray(node) ? node.flatMap(flatten)
  : [node, ...flatten(node.props?.children ?? null)];
const textOf = (node: any): string => typeof node === 'string' ? node
  : Array.isArray(node) ? node.map(textOf).join(' ')
  : node?.props ? textOf(node.props.children) : '';
const tick = () => new Promise((resolve) => setImmediate(resolve));

test('authoritative reload resyncs editable row fields and never resends stale minutes', async () => {
  const stubs = { patchCalls: [] as any[] };
  const { render, runEffects } = loadItemRow(stubs);
  const props = (item: any) => ({ item, preparationId: 'prep-1', open: true, onChanged: async () => {} });

  // 1) row renders billingMinutes 60, reason empty
  let tree = render(props(itemWith(60, 60)));
  const minutesInput = () => flatten(tree).find((n) => n.type === 'input' && n.props.type === 'number');
  const reasonInput = () => {
    const label = flatten(tree).find((n) => n.type === 'label' && textOf(n).startsWith('Igazolás / indoklás'));
    assert.ok(label, 'reason label');
    return flatten(label).find((n) => n.type === 'input');
  };
  assert.equal(minutesInput().props.value, '60');
  assert.equal(reasonInput().props.value, '');

  // 2) authoritative reload after resync: clamped to 30, server-generated reason
  tree = render(props(itemWith(30, 30, { adjustmentReason: 'A forrás munkaóra megváltozott — korábbi számlázási beállítás megőrizve.' })));
  runEffects();
  tree = render(props(itemWith(30, 30, { adjustmentReason: 'A forrás munkaóra megváltozott — korábbi számlázási beállítás megőrizve.' })));
  assert.equal(minutesInput().props.value, '30', 'clamped minutes must reach the input');
  assert.equal(reasonInput().props.value, 'A forrás munkaóra megváltozott — korábbi számlázási beállítás megőrizve.');

  // 3) saving after the reload sends the synced 30 — never the stale 60
  const form = flatten(tree).find((n) => n.type === 'form');
  assert.ok(form, 'form');
  form.props.onSubmit({ preventDefault() {} });
  await tick();
  assert.equal(stubs.patchCalls.length, 1);
  assert.equal(stubs.patchCalls[0][2].billingMinutes, 30, 'save must not resend stale 60');
  assert.equal(stubs.patchCalls[0][2].adjustmentReason, 'A forrás munkaóra megváltozott — korábbi számlázási beállítás megőrizve.');

  // 4) an unrelated authoritative refresh must not wipe an in-progress edit
  stubs.patchCalls.length = 0;
  const descLabel = flatten(tree).find((n) => n.type === 'label' && textOf(n).startsWith('Számlázási szöveg'));
  flatten(descLabel).find((n) => n.type === 'input').props.onChange({ target: { value: 'Szerkesztés folyamatban' } });
  const reloaded = itemWith(30, 30, { adjustmentReason: 'A forrás munkaóra megváltozott — korábbi számlázási beállítás megőrizve.' });
  reloaded.billing.reviewedAt = '2026-09-06T10:00:00Z'; // unrelated field changed
  tree = render(props(reloaded));
  runEffects(); // deps unchanged → no sync effect queued; assert in-place
  tree = render(props(reloaded));
  const descInput = flatten(flatten(tree).find((n) => n.type === 'label' && textOf(n).startsWith('Számlázási szöveg'))).find((n) => n.type === 'input');
  assert.equal(descInput.props.value, 'Szerkesztés folyamatban', 'in-progress edit survives unrelated refresh');
  assert.equal(minutesInput().props.value, '30');
});
