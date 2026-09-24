import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';

// Real React 19 + StrictMode behaviour of the route-generation guard.
//
// The deterministic harness models a single committed render pipeline; it cannot
// prove what React does with a SPECULATIVE render it later discards. This test
// renders the real hook with react-dom and StrictMode and asserts the invariant
// that a discarded render never invalidates the committed route.
//
// A DOM is required. `jsdom` is an explicit devDependency that canonical
// frontend CI installs, so it must be importable here. A missing jsdom is a TEST
// FAILURE, not a skip: a skipped real-React proof proves nothing. There is no
// silent-success fallback.

const require = createRequire(import.meta.url);

// Fail-closed: if jsdom cannot be resolved or loaded, this throws and the test
// file fails. It is never conditionally downgraded to `test.skip`.
const { JSDOM } = require('jsdom') as { JSDOM: new (html?: string, options?: any) => any };

test(
  'real React StrictMode: a discarded/suspended route render cannot invalidate the committed route',
  async () => {
    const dom = new JSDOM('<!doctype html><html><body><div id="root"></div></body></html>', {
      pretendToBeVisual: true,
    });

    const g: any = globalThis;
    const previous = new Map<string, PropertyDescriptor | undefined>();
    const setGlobal = (name: string, value: any) => {
      previous.set(name, Object.getOwnPropertyDescriptor(g, name));
      Object.defineProperty(g, name, { value, configurable: true, writable: true });
    };

    setGlobal('window', dom.window);
    setGlobal('document', dom.window.document);
    setGlobal('navigator', dom.window.navigator);
    setGlobal('HTMLElement', dom.window.HTMLElement);
    setGlobal('Element', dom.window.Element);
    setGlobal('Node', dom.window.Node);
    setGlobal('Event', dom.window.Event);
    setGlobal('requestAnimationFrame', (cb: any) => setTimeout(() => cb(Date.now()), 0));
    setGlobal('cancelAnimationFrame', (id: any) => clearTimeout(id));
    setGlobal('IS_REACT_ACT_ENVIRONMENT', true);

    try {
      // Import AFTER the DOM exists so react-dom picks the client build and the
      // hook resolves `typeof window !== "undefined"`.
      const React: any = await import('react');
      const { createRoot } = await import('react-dom/client');
      const { useRouteGeneration } = await import('../src/lib/routeGeneration');

      const { StrictMode, Suspense, startTransition, createElement: h } = React;

      const container = dom.window.document.getElementById('root')!;
      const root = createRoot(container);
      const committedText = () => container.textContent || '';

      const neverResolves = new Promise(() => {});
      let suspendFor: string | null = null;
      let routeRef: any = null;

      function Probe({ clientId }: { clientId: string }) {
        const route = useRouteGeneration(clientId);
        routeRef = route;
        if (suspendFor === clientId) throw neverResolves; // suspend this route
        return h('div', null, `route=${clientId} gen=${route.generation}`);
      }

      const render = (clientId: string) =>
        h(
          StrictMode,
          null,
          h(Suspense, { fallback: h('div', null, 'loading') }, h(Probe, { clientId })),
        );

      // 1. Commit route A.
      await React.act(async () => {
        root.render(render('A'));
      });
      assert.equal(committedText(), 'route=A gen=0', 'route A is committed');
      assert.equal(routeRef.generation, 0, 'route A is generation 0');

      // 2. Start a transition to B that suspends forever. React discards the
      //    speculative B render and keeps the committed A UI.
      suspendFor = 'B';
      await React.act(async () => {
        startTransition(() => {
          root.render(render('B'));
        });
        await new Promise((r) => setTimeout(r, 25));
      });

      assert.match(committedText(), /route=A/, 'the committed UI is still route A');
      assert.equal(
        routeRef.generation,
        0,
        'a discarded render must NOT advance the committed generation',
      );
      assert.equal(
        routeRef.isActive(0),
        true,
        'route A remains active, so its in-flight response is not discarded',
      );

      // 3. Now let B commit for real: the generation advances and A goes stale.
      suspendFor = null;
      await React.act(async () => {
        root.render(render('B'));
      });
      assert.match(committedText(), /route=B/, 'route B is committed');
      assert.equal(routeRef.generation, 1, 'committing B advances the generation');
      assert.equal(routeRef.isActive(0), false, 'route A responses are now stale');
    } finally {
      for (const [name, descriptor] of previous) {
        if (descriptor) Object.defineProperty(g, name, descriptor);
        else delete g[name];
      }
    }
  },
);
