import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';
import * as jsx from 'react/jsx-runtime';

// No browser, DOM, or network: execute production event handlers with a small hook scheduler.
export function componentHarness(file: string, name: string, imports: Record<string, any>) {
  const slots: any[] = [];
  const effects: Array<() => void> = [];
  let cursor = 0;
  const equal = (a: any[], b: any[]) => a && b && a.length === b.length && a.every((v, i) => Object.is(v, b[i]));
  const memo = (fn: any, deps: any[]) => {
    const i = cursor++;
    if (!slots[i] || !equal(slots[i].deps, deps)) slots[i] = { deps, value: fn() };
    return slots[i].value;
  };
  const hooks = {
    useState(initial: any) {
      const i = cursor++;
      if (!(i in slots)) slots[i] = typeof initial === 'function' ? initial() : initial;
      return [slots[i], (value: any) => { slots[i] = typeof value === 'function' ? value(slots[i]) : value; }];
    },
    useRef(value: any) { return memo(() => ({ current: value }), []); },
    useMemo: memo,
    useCallback(fn: any, deps: any[]) { return memo(() => fn, deps); },
    useEffect(fn: any, deps: any[]) {
      const i = cursor++;
      if (!slots[i] || !equal(slots[i].deps, deps)) {
        slots[i]?.cleanup?.();
        slots[i] = { deps };
        effects.push(() => { slots[i].cleanup = fn(); });
      }
    },
  };
  const exports: any = {};
  const source = readFileSync(file, 'utf8').replace(new RegExp(`(?<!export )function ${name}\\(`), `export function ${name}(`);
  vm.runInNewContext(ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX, target: ts.ScriptTarget.ES2020 } }).outputText, {
    exports, console, URLSearchParams, process: { env: { NODE_ENV: 'test' } }, document: { body: {} }, alert: (message: string) => { throw new Error(message); },
    require: (key: string) => key === 'react' ? hooks : key === 'react/jsx-runtime' ? jsx : key === 'react-dom' ? { createPortal: (tree: any) => tree } : imports[key] || {},
  });
  return {
    render(props: any = {}) { cursor = 0; return exports[name](props); },
    effects() { effects.splice(0).forEach((effect) => effect()); },
  };
}
export const flatten = (node: any): any[] => !node || typeof node !== 'object' ? [] : Array.isArray(node) ? node.flatMap(flatten) : [node, ...flatten(node.props?.children)];
export const textOf = (node: any): string => typeof node === 'string' ? node : Array.isArray(node) ? node.map(textOf).join(' ') : node?.props ? textOf(node.props.children) : '';
export const tick = () => new Promise((resolve) => setImmediate(resolve));
