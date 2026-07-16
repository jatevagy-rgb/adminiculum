import fs from 'fs';
import path from 'path';

/**
 * Scroll-architecture static guards — DOCUMENT-EDITOR-WORKBENCH-UX-LAYOUT-OVERHAUL-1.
 *
 * These lock in the viewport-bound workbench so the historical defect (the
 * page/body becoming the document scroll surface, header/toolbar scrolling
 * away) cannot silently return. Assertions target structural markers rather
 * than exact formatting where possible.
 */

const FRONTEND_SRC = path.join(__dirname, '..', '..', 'Frontend', 'src');

function read(relative: string): string {
  return fs.readFileSync(path.join(FRONTEND_SRC, relative), 'utf8');
}

const workbench = () => read(path.join('components', 'editor', 'DocumentEditorWorkbench.tsx'));
const appShell = () => read(path.join('components', 'AppShell.tsx'));
const authenticatedApp = () => read(path.join('components', 'AuthenticatedApp.tsx'));
const editorRoute = () => read(path.join('app', 'documents', '[documentId]', 'edit', 'page.tsx'));
const sidePanel = () => read(path.join('components', 'editor', 'DocumentEditorSidePanel.tsx'));
const outline = () => read(path.join('components', 'editor', 'DocumentOutline.tsx'));
const toolbar = () => read(path.join('components', 'editor', 'DocumentEditorToolbar.tsx'));
const layoutModule = () => read(path.join('lib', 'editor', 'workbenchLayout.ts'));
const globalsCss = () => read(path.join('app', 'globals.css'));

describe('viewport-bound editor shell', () => {
  it('AppShell supports a fixed-viewport mode (h-dvh + overflow-hidden, non-scrolling main)', () => {
    const source = appShell();
    expect(source.includes('fullViewport')).toBe(true);
    expect(source.includes('h-dvh')).toBe(true);
    // In fullViewport mode <main> must not be a scroll surface.
    expect(/fullViewport\s*\n?\s*\?\s*"[^"]*overflow-hidden/.test(source)).toBe(true);
    // The default (page-scrolling) shell stays intact for every other route.
    expect(source.includes('min-h-screen')).toBe(true);
    expect(source.includes('overflow-y-auto')).toBe(true);
  });

  it('the canonical editor route opts into the fixed-viewport shell', () => {
    const source = editorRoute();
    expect(source.includes('fullViewport')).toBe(true);
    expect(source.includes('DocumentEditorWorkbench')).toBe(true);
  });

  it('AuthenticatedApp threads the fullViewport prop to the shell', () => {
    const source = authenticatedApp();
    expect(source.includes('fullViewport?: boolean')).toBe(true);
    expect(/AppShell[^>]*fullViewport=\{fullViewport\}/.test(source)).toBe(true);
  });
});

describe('workbench scroll regions', () => {
  it('the workbench root is a non-scrolling full-height column', () => {
    const source = workbench();
    expect(/editor-print-root[^"]*flex[^"]*h-full[^"]*min-h-0[^"]*flex-col[^"]*overflow-hidden/.test(source)).toBe(true);
  });

  it('the workbench body clips and only the document viewport scrolls', () => {
    const source = workbench();
    expect(/flex min-h-0 flex-1 overflow-hidden/.test(source)).toBe(true);
    expect(/editor-canvas-scroll[^"]*overflow-auto/.test(source)).toBe(true);
    expect(source.includes('data-editor-viewport')).toBe(true);
    // The A4 page itself never carries the scrollbar.
    expect(/editor-a4-page[^"]*overflow/.test(source)).toBe(false);
  });

  it('the side panel and outline scroll independently inside their rails', () => {
    expect(/min-h-0 flex-1 overflow-y-auto/.test(sidePanel())).toBe(true);
    expect(/overflow-y-auto/.test(outline())).toBe(true);
  });

  it('header, toolbar and status bar are non-scrolling chrome', () => {
    const source = workbench();
    expect(/<header[^>]*data-editor-chrome/.test(source)).toBe(true);
    expect(/<footer[^>]*data-editor-chrome/.test(source)).toBe(true);
    expect(toolbar().includes('data-editor-chrome')).toBe(true);
    expect(toolbar().includes('role="toolbar"')).toBe(true);
  });

  it('the canvas uses layout-affecting zoom (not transform scale) so scroll height stays correct', () => {
    const source = workbench();
    expect(source.includes('zoom: effectiveZoom')).toBe(true);
    expect(source.includes('transform: `scale(')).toBe(false);
  });
});

describe('layout state stays truthful and session-only', () => {
  it('layout module holds no browser persistence', () => {
    const lower = layoutModule().toLowerCase();
    for (const needle of ['localstorage', 'sessionstorage', 'indexeddb', 'document.cookie']) {
      expect(`${needle}:${lower.includes(needle)}`).toBe(`${needle}:false`);
    }
  });

  it('workbench keeps the honest Mode C session status', () => {
    const source = workbench().toLowerCase();
    expect(source.includes('a munkapéldány helyi szerkesztésű; a végleges dokumentumot exportálni kell.')).toBe(true);
    expect(source.includes('autosave')).toBe(false);
  });

  it('focus mode preserves an exit path ("Panelek visszaállítása")', () => {
    expect(workbench().includes('Panelek visszaállítása')).toBe(true);
  });

  it('the permanently large template banner is gone from the chrome (moved to the side panel)', () => {
    expect(workbench().includes('Sablonból munkapéldány')).toBe(false);
    expect(sidePanel().includes('Sablonból munkapéldány')).toBe(true);
  });
});

describe('single-editor and print regressions', () => {
  it('editor-lab remains a redirect (no second drafting editor)', () => {
    const source = read(path.join('app', 'editor-lab', 'page.tsx'));
    expect(source.includes('/documents/new/edit')).toBe(true);
    expect(source.includes('useEditor')).toBe(false);
  });

  it('print CSS still isolates the A4 page and honors page breaks', () => {
    const css = globalsCss();
    expect(css.includes('@media print')).toBe(true);
    expect(css.includes('page-break-after: always')).toBe(true);
    expect(/\.editor-print-root \.editor-a4-page/.test(css)).toBe(true);
  });

  it('the document viewport CSS is a deliberate scroll surface', () => {
    const css = globalsCss();
    expect(/\.editor-canvas-scroll\s*\{[^}]*scrollbar-gutter/.test(css)).toBe(true);
  });
});
