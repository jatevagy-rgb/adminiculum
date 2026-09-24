import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';
import * as jsx from 'react/jsx-runtime';

// Deterministic async-race harness.
//
// Executes the REAL production component function (hooks, effects and async
// loaders) against controlled network promises so a client-side route change
// can be modelled exactly:
//   1. render route A -> effect starts A's request (deferred, not resolved yet)
//   2. render route B -> effect starts B's request
//   3. resolve B, observe B committed
//   4. resolve A late -> observe whether stale A overwrites B
//
// It emulates the observable state machine that matters for the race: a hook
// slot table that survives across renders (React preserves state across a
// same-component route param change) plus a dependency-aware effect queue.
// No production source is modified; the component is transpiled in-memory.

export type Deferred<T = any> = {
  promise: Promise<T>;
  resolve: (value: T | PromiseLike<T>) => void;
  reject: (reason?: any) => void;
  settled: boolean;
};

export function deferred<T = any>(): Deferred<T> {
  let resolveFn!: (value: T | PromiseLike<T>) => void;
  let rejectFn!: (reason?: any) => void;
  const promise = new Promise<T>((resolve, reject) => {
    resolveFn = resolve;
    rejectFn = reject;
  });
  const d: Deferred<T> = {
    promise,
    resolve: (value) => {
      d.settled = true;
      resolveFn(value);
    },
    reject: (reason) => {
      d.settled = true;
      rejectFn(reason);
    },
    settled: false,
  };
  return d;
}

export const tick = () => new Promise<void>((resolve) => setImmediate(resolve));

export async function settle(rounds = 8): Promise<void> {
  for (let i = 0; i < rounds; i += 1) await tick();
}

const fakeWindow = {
  location: { hash: '' },
  innerHeight: 800,
  addEventListener() {},
  removeEventListener() {},
  setTimeout: (cb: () => void, ms?: number) => setTimeout(cb, ms),
  clearTimeout: (id: any) => clearTimeout(id),
};

const fakeDocument = {
  body: { appendChild() {}, removeChild() {} },
  getElementById: () => null,
  createElement: () => ({ style: {}, setAttribute() {}, click() {} }),
  addEventListener() {},
  removeEventListener() {},
};

export function createRaceHarness(
  file: string,
  exportName: string,
  imports: Record<string, any>,
) {
  const slots: any[] = [];
  const effects: Array<() => void> = [];
  let cursor = 0;

  const equal = (a: any, b: any) =>
    Array.isArray(a) && Array.isArray(b) && a.length === b.length && a.every((v, i) => Object.is(v, b[i]));

  const memo = (fn: any, deps: any[]) => {
    const i = cursor++;
    if (!slots[i] || !equal(slots[i].deps, deps)) slots[i] = { deps, value: fn() };
    return slots[i].value;
  };

  const hooks = {
    useState(initial: any) {
      const i = cursor++;
      if (!(i in slots)) slots[i] = typeof initial === 'function' ? initial() : initial;
      return [
        slots[i],
        (value: any) => {
          slots[i] = typeof value === 'function' ? value(slots[i]) : value;
        },
      ];
    },
    useRef(value: any) {
      return memo(() => ({ current: value }), []);
    },
    useMemo: memo,
    useCallback(fn: any, deps: any[]) {
      return memo(() => fn, deps);
    },
    useEffect(fn: any, deps: any[]) {
      const i = cursor++;
      if (!slots[i] || !equal(slots[i].deps, deps)) {
        try {
          slots[i]?.cleanup?.();
        } catch {
          /* production cleanup errors are not part of the race under test */
        }
        slots[i] = { deps };
        effects.push(() => {
          slots[i].cleanup = fn();
        });
      }
    },
    // React 19 `use(params)`: tests pass an already-resolved param object.
    use(value: any) {
      return value;
    },
    useReducer(reducer: any, initial: any) {
      const i = cursor++;
      if (!(i in slots)) slots[i] = typeof initial === 'function' ? initial() : initial;
      return [
        slots[i],
        (action: any) => {
          slots[i] = reducer(slots[i], action);
        },
      ];
    },
  };

  let source = readFileSync(file, 'utf8');
  if (exportName !== 'default') {
    // Allow targeting an inner, non-exported named function without changing
    // production source (same trick as tests/helpers/componentHarness.ts).
    source = source.replace(new RegExp(`(?<!export )function ${exportName}\\(`), `export function ${exportName}(`);
  }
  const transpiled = ts.transpileModule(source, {
    compilerOptions: {
      module: ts.ModuleKind.CommonJS,
      jsx: ts.JsxEmit.ReactJSX,
      target: ts.ScriptTarget.ES2020,
    },
  }).outputText;

  // Load an isolated real production module (e.g. the route-generation guard)
  // with the same hook runtime, so tests exercise the actual guard code.
  const moduleCache = new Map<string, any>();
  const loadModule = (moduleFile: string) => {
    if (moduleCache.has(moduleFile)) return moduleCache.get(moduleFile);
    const moduleJs = ts.transpileModule(readFileSync(moduleFile, 'utf8'), {
      compilerOptions: {
        module: ts.ModuleKind.CommonJS,
        jsx: ts.JsxEmit.ReactJSX,
        target: ts.ScriptTarget.ES2020,
      },
    }).outputText;
    const loaded: any = {};
    vm.runInNewContext(moduleJs, {
      exports: loaded,
      module: { exports: loaded },
      require: (k: string) => (k === 'react' ? hooks : imports[k] || {}),
      console,
      URLSearchParams,
      process: { env: { NODE_ENV: 'test' } },
    });
    moduleCache.set(moduleFile, loaded);
    return loaded;
  };

  const moduleExports: any = {};
  vm.runInNewContext(transpiled, {
    exports: moduleExports,
    module: { exports: moduleExports },
    console,
    URLSearchParams,
    process: { env: { NODE_ENV: 'test' } },
    window: fakeWindow,
    document: fakeDocument,
    alert: (message: string) => {
      throw new Error(message);
    },
    setTimeout,
    clearTimeout,
    setInterval,
    clearInterval,
    require: (key: string) => {
      if (key === 'react') return hooks;
      if (key === 'react/jsx-runtime') return jsx;
      if (key === 'react-dom') return { createPortal: (tree: any) => tree };
      if (key === 'next/link') return imports[key] || { default: 'a' };
      if (key === 'next/image') return imports[key] || { default: 'img' };
      if (key === '@/lib/routeGeneration') {
        return imports[key] || loadModule('src/lib/routeGeneration.ts');
      }
      return imports[key] || {};
    },
  });

  const component =
    exportName === 'default'
      ? moduleExports.default
      : moduleExports[exportName] || moduleExports.default || moduleExports[exportName];
  if (typeof component !== 'function') {
    throw new Error(`asyncRaceHarness: could not resolve component "${exportName}" from ${file}`);
  }

  return {
    render(props: any = {}) {
      cursor = 0;
      return component(props);
    },
    effects() {
      const queued = effects.splice(0);
      for (const effect of queued) effect();
      return queued.length;
    },
    // Convenience: render then run any newly queued effects.
    commit(props: any = {}) {
      const tree = this.render(props);
      this.effects();
      return tree;
    },
    pendingEffects() {
      return effects.length;
    },
    slots() {
      return slots;
    },
  };
}

export const flatten = (node: any): any[] =>
  !node || typeof node !== 'object'
    ? []
    : Array.isArray(node)
      ? node.flatMap(flatten)
      : [node, ...flatten(node.props?.children)];

export const textOf = (node: any): string =>
  typeof node === 'string' || typeof node === 'number'
    ? String(node)
    : Array.isArray(node)
      ? node.map(textOf).join(' ')
      : node?.props
        ? textOf(node.props.children)
        : '';
