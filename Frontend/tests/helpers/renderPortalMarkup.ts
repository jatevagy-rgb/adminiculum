import React from 'react';
import { createRequire } from 'node:module';

// Body portals mount after hydration; SSR markup cannot exercise their content.
export async function renderPortalMarkup(element: React.ReactElement): Promise<string> {
  const { JSDOM } = createRequire(import.meta.url)('jsdom');
  const dom = new JSDOM('<!doctype html><html><body><div id="root"></div></body></html>', { pretendToBeVisual: true });
  const globals: Record<string, unknown> = {
    window: dom.window, document: dom.window.document, navigator: dom.window.navigator,
    HTMLElement: dom.window.HTMLElement, Element: dom.window.Element, Node: dom.window.Node,
    requestAnimationFrame: dom.window.requestAnimationFrame.bind(dom.window),
    cancelAnimationFrame: dom.window.cancelAnimationFrame.bind(dom.window),
    IS_REACT_ACT_ENVIRONMENT: true, React,
  };
  for (const [key, value] of Object.entries(globals)) {
    Object.defineProperty(globalThis, key, { value, configurable: true, writable: true });
  }
  const { createRoot } = await import('react-dom/client');
  const root = createRoot(dom.window.document.getElementById('root'));
  try {
    await React.act(async () => { root.render(element); });
    return dom.window.document.body.innerHTML;
  } finally {
    await React.act(async () => { root.unmount(); });
    // Globals stay installed until node:test exits this isolated file process,
    // so React's deferred scheduler can finish without losing its window.
  }
}
