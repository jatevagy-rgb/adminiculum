import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';
import * as jsx from 'react/jsx-runtime';
import * as operational from '../src/lib/casesOperational';

// Render the actual component's element tree with a minimal hook scheduler.
// Network, routing and child components are isolated; event handlers are real.
test('CasesList interactions preserve filters, scoped requests, creation and both navigation actions', async () => {
  const states: any[] = [], effects: Array<() => void> = [], dependencies: any[][] = [];
  let cursor = 0;
  const hooks = {
    useState(initial: any) { const i = cursor++; if (!(i in states)) states[i] = typeof initial === 'function' ? initial() : initial; return [states[i], (value: any) => { states[i] = typeof value === 'function' ? value(states[i]) : value; }]; },
    useMemo(fn: any) { return fn(); }, useCallback(fn: any) { return fn; },
    useEffect(fn: any, deps: any[]) { const i = cursor++; if (!dependencies[i] || deps.some((v, j) => v !== dependencies[i][j])) { dependencies[i] = deps; effects.push(fn); } },
  };
  const pushes: string[] = [], calls: any[] = [];
  const cases = [
    { id: 'a', title: 'Alpha', caseNumber: 'A', clientId: 'client', clientName: 'Alpha Client', status: 'DRAFT', priority: 'URGENT', matterType: 'CONTRACT', deadline: '2020-01-01', assignedLawyer: { id: 'me', name: 'Lawyer' } },
    { id: 'b', title: 'Beta', caseNumber: 'B', clientId: 'client', clientName: 'Beta Client', status: 'ON_HOLD', priority: 'HIGH', matterType: 'LITIGATION', deadline: null, assignedLawyer: { id: 'other', name: 'Other' } },
    { id: 'c', title: 'Closed', caseNumber: 'C', clientId: 'client', clientName: 'Client', status: 'FINAL', priority: 'LOW', matterType: 'CONTRACT', deadline: null },
  ];
  const api = { getCases: async (...args: any[]) => { calls.push(['cases', ...args]); return { data: cases }; }, getCurrentUser: async () => ({ id: 'me' }), getClients: async () => ({ data: [] }), getUsers: async () => [], getCaseAttention: async (...args: any[]) => { calls.push(['attention', ...args]); return { items: [{ case: { id: 'b' }, attention: { urgency: 'NONE', nextAction: null, signals: [] } }, { case: { id: 'a' }, attention: { urgency: 'URGENT', nextAction: { label: 'Review Alpha' }, signals: [] } }] }; } };
  const imports: Record<string, any> = { react: hooks, 'react/jsx-runtime': jsx, 'next/navigation': { useRouter: () => ({ push: (path: string) => pushes.push(path) }), useSearchParams: () => new URLSearchParams('clientId=client') }, '@/lib/api': api, '@/lib/casesOperational': operational, '@/lib/caseLabels': { getCaseDisplayTitle: (item: any) => item.title, getCaseMatterTypeLabel: (v: any) => v }, '@/lib/clientColors': { getClientAccentBorderClass: () => 'accent' } };
  const exports: any = {};
  vm.runInNewContext(ts.transpileModule(readFileSync('src/components/CasesList.tsx', 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX, target: ts.ScriptTarget.ES2020 } }).outputText, { exports, console, URLSearchParams, require: (name: string) => imports[name] || new Proxy({}, { get: (_, key) => String(key) }) });
  let tree: any;
  const render = () => { cursor = 0; tree = exports.CasesList(); };
  const nodes = (node = tree): any[] => !node || typeof node !== 'object' ? [] : Array.isArray(node) ? node.flatMap(n => nodes(n ?? null)) : [node, ...nodes(node.props?.children ?? null), ...nodes(node.props?.primaryAction ?? null)];
  const text = (node: any): string => typeof node === 'string' ? node : Array.isArray(node) ? node.map(text).join(' ') : node?.props ? text(node.props.children) : '';
  const rows = () => nodes().filter(n => n.type === 'tr' && n.props.onClick);
  const click = (label: string) => { const n = nodes().find(n => ['button', 'AdminButton'].includes(n.type) && n.props?.onClick && text(n).startsWith(label)); assert.ok(n, label); n.props.onClick(); render(); };
  render(); effects.splice(0).forEach(fn => fn()); await new Promise(resolve => setImmediate(resolve)); render();
  assert.equal(rows().length, 2); assert.ok(text(tree).includes('Review Alpha')); assert.ok(text(tree).includes('Lejárt'));
  assert.deepEqual(calls[0], ['attention', 'client', 50, 0]); assert.ok(calls.some(c => c[0] === 'cases' && c[2] === 200 && c[4] === 'client'));
  rows()[0].props.onClick(); click('Ügy megnyitása'); assert.deepEqual(pushes, ['/cases/a', '/cases/a']);
  click('Hozzám rendelve'); assert.equal(rows().length, 1); click('Lezárt'); assert.equal(rows().length, 1); click('Aktív');
  const select = (label: string, value: string) => { const parent = nodes().find(n => n.type === 'label' && text(n).startsWith(label)); const control = nodes(parent).find(n => n.type === 'select'); control.props.onChange({ target: { value } }); render(); };
  select('Szakterület', 'CONTRACT'); assert.equal(rows().length, 1); select('Szakterület', 'all');
  select('Munkaprioritás', 'Magas'); assert.equal(rows()[0].key, 'b'); select('Munkaprioritás', 'all');
  select('Teendők', 'attention'); assert.equal(rows()[0].key, 'a'); select('Teendők', 'all');
  nodes().find(n => n.type === 'input' && n.props.placeholder === 'Ügyfél keresése').props.onChange({ target: { value: 'Beta' } }); render(); assert.equal(rows()[0].key, 'b');
  click('Új ügy'); assert.equal(nodes().find(n => n.type === 'CompactNewCaseDialog').props.open, true);
});
