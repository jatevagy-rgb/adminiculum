import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const { JSDOM } = require('jsdom') as { JSDOM: new (html?: string, options?: any) => any };

function installGlobals(dom: { window: any }) {
  const globals = globalThis as any;
  const previous = new Map<string, PropertyDescriptor | undefined>();
  const setGlobal = (name: string, value: any) => {
    previous.set(name, Object.getOwnPropertyDescriptor(globals, name));
    Object.defineProperty(globals, name, { value, configurable: true, writable: true });
  };
  for (const [name, value] of Object.entries({
    window: dom.window, document: dom.window.document, navigator: dom.window.navigator,
    localStorage: dom.window.localStorage, HTMLElement: dom.window.HTMLElement,
    Element: dom.window.Element, Node: dom.window.Node, Event: dom.window.Event,
    IS_REACT_ACT_ENVIRONMENT: true,
  })) setGlobal(name, value);
  dom.window.localStorage.setItem('auth_token', 'synthetic-workforce-token');
  return previous;
}

function restoreGlobals(previous: Map<string, PropertyDescriptor | undefined>) {
  const globals = globalThis as any;
  for (const [name, descriptor] of previous) {
    if (descriptor) Object.defineProperty(globals, name, descriptor);
    else delete globals[name];
  }
}

function docJson(id: string, fileName: string, documentType: string, version: string | null) {
  return { id, caseId: 'case-B', fileName, documentType, version, createdAt: '2026-09-01T09:00:00Z', securityScanStatus: 'CLEAN', mimeType: null };
}

test('document AI flow ignores a delayed prior-case response after the visible case changes', async () => {
  const dom = new JSDOM('<!doctype html><html><body><div id="root"></div></body></html>', {
    url: 'http://localhost/cases/case-A', pretendToBeVisual: true,
  });
  const previous = installGlobals(dom);

  let releaseCaseA!: () => void;
  const slowA = new Promise<Response>((resolve) => {
    releaseCaseA = () => resolve(new Response(JSON.stringify([]), { status: 200, headers: { 'content-type': 'application/json' } }));
  });
  const bDocs = new Response(JSON.stringify([docJson('doc-B', 'b-doc.docx', 'CLIENT_INPUT', '2')]), { status: 200, headers: { 'content-type': 'application/json' } });
  const bAnon = new Response(JSON.stringify([{ id: 'anon-B', name: 'B munkapéldány', sourceDocId: 'doc-B', caseId: 'case-B', aiTask: null, customPrompt: null, rehydrationStatus: 'COMPLETE', rehydratedAt: null, createdAt: '2026-09-02T09:00:00Z', updatedAt: '2026-09-02T09:00:00Z' }]), { status: 200, headers: { 'content-type': 'application/json' } });
  const requests: string[] = [];
  (globalThis as any).fetch = (input: string) => {
    requests.push(String(input));
    if (String(input).includes('case-A')) return slowA;
    if (String(input).includes('/anonymous-documents')) return Promise.resolve(bAnon);
    return Promise.resolve(bDocs);
  };

  let root: import('react-dom/client').Root | null = null;
  try {
    const React = await import('react');
    (globalThis as any).React = React;
    const { createRoot } = await import('react-dom/client');
    const { DocumentAIFlow } = await import('../src/components/cases/word-workflow/documents/DocumentAIFlow');
    root = createRoot(dom.window.document.getElementById('root')!);
    await React.act(async () => { root!.render(React.createElement(DocumentAIFlow, { caseId: 'case-A', clientId: 'client-A' })); });
    assert.ok(requests.some((url) => url.includes('case-A')));

    await React.act(async () => { root!.render(React.createElement(DocumentAIFlow, { caseId: 'case-B', clientId: 'client-B' })); });
    assert.match(dom.window.document.body.textContent, /b-doc\.docx/);
    assert.match(dom.window.document.body.textContent, /B munkapéldány/);

    // A's delayed empty responses must not overwrite B's populated lists.
    await React.act(async () => { releaseCaseA(); await slowA; });
    assert.match(dom.window.document.body.textContent, /b-doc\.docx/);
    assert.match(dom.window.document.body.textContent, /B munkapéldány/);
    assert.doesNotMatch(dom.window.document.body.textContent, /A munkapéldány/);
  } finally {
    if (root) {
      const React = await import('react');
      await React.act(async () => { root!.unmount(); });
    }
    restoreGlobals(previous);
    dom.window.close();
  }
});

test('final download preserves the server file extension; sanitized export stays UTF-8 TXT', async () => {
  const dom = new JSDOM('<!doctype html><html><body><div id="root"></div></body></html>', {
    url: 'http://localhost/cases/case-1', pretendToBeVisual: true,
  });
  const previous = installGlobals(dom);

  const documents = new Response(JSON.stringify([
    docJson('doc-1', 'bérleti_szerzodes.docx', 'CLIENT_INPUT', '1'),
    docJson('final-1', 'eredmeny.pdf', 'AI_ANALYSIS', '1'),
  ]), { status: 200, headers: { 'content-type': 'application/json' } });
  const anonList = new Response(JSON.stringify([{ id: 'anon-1', name: 'bérleti_szerzodes.docx', sourceDocId: 'doc-1', caseId: 'case-1', aiTask: 'REVIEW_RISKS', customPrompt: null, rehydrationStatus: 'COMPLETE', rehydratedAt: null, createdAt: '2026-09-02T09:00:00Z', updatedAt: '2026-09-02T09:00:00Z' }]), { status: 200, headers: { 'content-type': 'application/json' } });
  const bySource = new Response(JSON.stringify([{ id: 'anon-1', name: 'bérleti_szerzodes.docx', sourceDocId: 'doc-1', caseId: 'case-1', redactedText: '[ÜGYFÉL] szanitizált szöveg.' }]), { status: 200, headers: { 'content-type': 'application/json' } });
  const download = new Response(new Blob(['FAKE-PDF-BYTES']), { status: 200 });

  const anchors: Array<{ download: string }> = [];
  const originalCreateElement = dom.window.document.createElement.bind(dom.window.document);
  (dom.window.document as any).createElement = (tag: string) => {
    const el = originalCreateElement(tag);
    if (String(tag).toLowerCase() === 'a') anchors.push(el as any);
    return el;
  };
  (globalThis as any).URL.createObjectURL = () => 'blob:fake';
  (globalThis as any).URL.revokeObjectURL = () => {};

  (globalThis as any).fetch = (input: string) => {
    const url = String(input);
    if (url.includes('/documents/final-1/download')) return Promise.resolve(download);
    if (url.includes('/by-source/')) return Promise.resolve(bySource);
    if (url.includes('/anonymous-documents')) return Promise.resolve(anonList);
    return Promise.resolve(documents);
  };

  let root: import('react-dom/client').Root | null = null;
  try {
    const React = await import('react');
    (globalThis as any).React = React;
    const { createRoot } = await import('react-dom/client');
    const { DocumentAIFlow } = await import('../src/components/cases/word-workflow/documents/DocumentAIFlow');
    root = createRoot(dom.window.document.getElementById('root')!);
    await React.act(async () => { root!.render(React.createElement(DocumentAIFlow, { caseId: 'case-1', clientId: 'client-1' })); });
    await new Promise((resolve) => setTimeout(resolve, 50));

    const buttons = Array.from(dom.window.document.querySelectorAll('button')) as HTMLButtonElement[];
    const clickButton = async (label: string) => {
      const button = buttons.find((b) => (b.textContent || '').includes(label));
      assert.ok(button, `button not found: ${label}`);
      await React.act(async () => { (button as HTMLButtonElement).click(); });
      await new Promise((resolve) => setTimeout(resolve, 50));
    };

    // Final AI_ANALYSIS download must keep its real extension (.pdf), not .txt.
    await clickButton('Letöltés');
    const finalAnchor = anchors.find((a) => a.download.includes('eredmeny'));
    assert.ok(finalAnchor, 'final download anchor created');
    assert.equal(finalAnchor.download, 'eredmeny.pdf');

    // Sanitized work-copy export is UTF-8 TXT: the source name is kept and the
    // export is guaranteed to carry the .txt extension.
    await clickButton('TXT letöltés');
    const txtAnchor = anchors.find((a) => a.download.endsWith('.txt'));
    assert.ok(txtAnchor, 'sanitized TXT anchor created');
    assert.equal(txtAnchor.download, 'bérleti_szerzodes.docx.txt');
  } finally {
    if (root) {
      const React = await import('react');
      await React.act(async () => { root!.unmount(); });
    }
    restoreGlobals(previous);
    dom.window.close();
  }
});

test('partial rehydration is visibly partial and saving succeeds through the canonical endpoint', async () => {
  const dom = new JSDOM('<!doctype html><html><body><div id="root"></div></body></html>', {
    url: 'http://localhost/cases/case-1', pretendToBeVisual: true,
  });
  const previous = installGlobals(dom);

  const documents = new Response(JSON.stringify([docJson('doc-1', 'szerzodes.docx', 'CLIENT_INPUT', '1')]), { status: 200, headers: { 'content-type': 'application/json' } });
  const anonList = new Response(JSON.stringify([{ id: 'anon-1', name: 'szerzodes.docx_anon.txt', sourceDocId: 'doc-1', caseId: 'case-1', aiTask: 'REVIEW_RISKS', customPrompt: null, rehydrationStatus: 'PARTIAL', rehydratedAt: null, createdAt: '2026-09-02T09:00:00Z', updatedAt: '2026-09-02T09:00:00Z' }]), { status: 200, headers: { 'content-type': 'application/json' } });
  let saved = false;
  (globalThis as any).fetch = (input: string, init?: RequestInit) => {
    const url = String(input);
    if (url.includes('/save-as-document') && init?.method === 'POST') {
      saved = true;
      return Promise.resolve(new Response(JSON.stringify({ success: true, documentId: 'new-final', fileName: 'szerzodes.docx_anon_ai_analysis.txt' }), { status: 200, headers: { 'content-type': 'application/json' } }));
    }
    if (url.includes('/by-source/')) return Promise.resolve(new Response(JSON.stringify([{ id: 'anon-1', redactedText: 'x' }]), { status: 200, headers: { 'content-type': 'application/json' } }));
    if (url.includes('/anonymous-documents')) return Promise.resolve(anonList);
    return Promise.resolve(documents);
  };

  let root: import('react-dom/client').Root | null = null;
  try {
    const React = await import('react');
    (globalThis as any).React = React;
    const { createRoot } = await import('react-dom/client');
    const { DocumentAIFlow } = await import('../src/components/cases/word-workflow/documents/DocumentAIFlow');
    root = createRoot(dom.window.document.getElementById('root')!);
    await React.act(async () => { root!.render(React.createElement(DocumentAIFlow, { caseId: 'case-1', clientId: 'client-1' })); });
    await new Promise((resolve) => setTimeout(resolve, 50));

    assert.match(dom.window.document.body.textContent, /Részleges/);
    assert.match(dom.window.document.body.textContent, /részleges — ellenőrizze/i);
    assert.doesNotMatch(dom.window.document.body.textContent, /Jóváhagyva|Ügyfélnek kész|közzé/i);

    const buttons = Array.from(dom.window.document.querySelectorAll('button')) as HTMLButtonElement[];
    const saveButton = buttons.find((b) => (b.textContent || '').includes('Végleges mentés'));
    assert.ok(saveButton, 'save button present for PARTIAL artifact');
    await React.act(async () => { (saveButton as HTMLButtonElement).click(); });
    await new Promise((resolve) => setTimeout(resolve, 50));
    assert.equal(saved, true);
  } finally {
    if (root) {
      const React = await import('react');
      await React.act(async () => { root!.unmount(); });
    }
    restoreGlobals(previous);
    dom.window.close();
  }
});
