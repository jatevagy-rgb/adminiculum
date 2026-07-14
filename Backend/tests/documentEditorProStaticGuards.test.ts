import fs from 'fs';
import path from 'path';

/**
 * Static-safety guards for DOCUMENT-EDITOR-PRO-CONTRACT-WORKBENCH-1.
 *
 * The editor runs in persistence mode C (export-only working session), so the
 * guards enforce: no AI/n8n/Client-Portal coupling, no workspaceText usage, no
 * localStorage/sessionStorage durable persistence, no fake save/autosave, no
 * fake track changes, no direct SharePoint/Graph access from the editor, no
 * unsafe HTML rendering, and no external conversion services.
 */

const FRONTEND_SRC = path.join(__dirname, '..', '..', 'Frontend', 'src');

const EDITOR_LIB_DIR = path.join(FRONTEND_SRC, 'lib', 'editor');
const EDITOR_COMPONENT_DIR = path.join(FRONTEND_SRC, 'components', 'editor');
const CANONICAL_ROUTE = path.join(FRONTEND_SRC, 'app', 'documents', '[documentId]', 'edit', 'page.tsx');
const EDITOR_LAB_ROUTE = path.join(FRONTEND_SRC, 'app', 'editor-lab', 'page.tsx');

function listFiles(dir: string): string[] {
  return fs
    .readdirSync(dir, { withFileTypes: true })
    .flatMap((entry) => (entry.isDirectory() ? listFiles(path.join(dir, entry.name)) : [path.join(dir, entry.name)]))
    .filter((file) => /\.(ts|tsx)$/.test(file));
}

const editorFiles = [...listFiles(EDITOR_LIB_DIR), ...listFiles(EDITOR_COMPONENT_DIR), CANONICAL_ROUTE, EDITOR_LAB_ROUTE];

function read(file: string): string {
  return fs.readFileSync(file, 'utf8');
}

describe('document editor pro — static safety', () => {
  it('the canonical editor route and libraries exist', () => {
    expect(fs.existsSync(CANONICAL_ROUTE)).toBe(true);
    expect(fs.existsSync(path.join(EDITOR_LIB_DIR, 'editorSchemaValidator.ts'))).toBe(true);
    expect(fs.existsSync(path.join(EDITOR_LIB_DIR, 'clauseNumbering.ts'))).toBe(true);
    expect(fs.existsSync(path.join(EDITOR_COMPONENT_DIR, 'DocumentEditorWorkbench.tsx'))).toBe(true);
  });

  it('imports no AI SDK/API and no external conversion service', () => {
    for (const file of editorFiles) {
      const lower = read(file).toLowerCase();
      for (const needle of [
        'openai',
        '@anthropic',
        'anthropic-ai',
        'generativeai',
        '@google/genai',
        'langchain',
        'cohere',
        'mistral',
        'ollama',
        'cloudconvert',
        'convertapi',
        'documentserver',
        'onlyoffice',
        'collabora',
      ]) {
        expect(`${path.basename(file)}:${needle}:${lower.includes(needle)}`).toBe(`${path.basename(file)}:${needle}:false`);
      }
    }
  });

  it('has no n8n, Client Portal, or realtime-collaboration coupling', () => {
    for (const file of editorFiles) {
      const lower = read(file).toLowerCase();
      for (const needle of ['n8n', 'client-portal', 'clientportal', '/portal', 'hocuspocus', 'yjs', 'y-websocket', 'websocket']) {
        expect(`${path.basename(file)}:${needle}:${lower.includes(needle)}`).toBe(`${path.basename(file)}:${needle}:false`);
      }
    }
  });

  it('never touches workspaceText or the gated document-content routes', () => {
    for (const file of editorFiles) {
      const source = read(file);
      expect(source.includes('workspaceText')).toBe(false);
      expect(source.includes('saveWorkspaceDocumentVersion')).toBe(false);
      expect(source.includes('getDocumentText')).toBe(false);
      expect(source.includes('/save-workspace-version')).toBe(false);
    }
  });

  it('uses no durable browser persistence for editor content', () => {
    for (const file of editorFiles) {
      const lower = read(file).toLowerCase();
      expect(`${path.basename(file)}:${lower.includes('localstorage')}`).toBe(`${path.basename(file)}:false`);
      expect(`${path.basename(file)}:${lower.includes('sessionstorage')}`).toBe(`${path.basename(file)}:false`);
      expect(`${path.basename(file)}:${lower.includes('indexeddb')}`).toBe(`${path.basename(file)}:false`);
    }
  });

  it('claims no fake save/autosave and no fake track changes', () => {
    const workbench = read(path.join(EDITOR_COMPONENT_DIR, 'DocumentEditorWorkbench.tsx'));
    // The honest session status must be present…
    expect(workbench.includes('nincs szerverre mentve')).toBe(true);
    // …and no autosave / track-changes vocabulary may appear anywhere.
    for (const file of editorFiles) {
      const lower = read(file).toLowerCase();
      expect(`${path.basename(file)}:${lower.includes('autosave')}`).toBe(`${path.basename(file)}:false`);
      expect(`${path.basename(file)}:${lower.includes('automatikus mentés')}`).toBe(`${path.basename(file)}:false`);
      expect(`${path.basename(file)}:${lower.includes('track changes')}`).toBe(`${path.basename(file)}:false`);
      expect(`${path.basename(file)}:${lower.includes('korrektúra bekapcsol')}`).toBe(`${path.basename(file)}:false`);
    }
  });

  it('keeps review comments unavailable without fake anchors or hidden persistence', () => {
    const qualityContract = read(path.join(EDITOR_LIB_DIR, 'reviewQuality.ts'));
    expect(qualityContract.includes('branch: "C"')).toBe(true);
    expect(qualityContract.includes('anchoredComments: false')).toBe(true);
    expect(qualityContract.includes('reviewerCanAccessCurrentSession: false')).toBe(true);
    expect(qualityContract.includes('Mentett források összehasonlítása')).toBe(true);
    for (const forbidden of [
      'selectionRange',
      'selectedText',
      'textSelection',
      'commentAnchor',
      'comment body in audit',
      'notification',
      'activity',
      'upload automatically',
      'autosave',
      'localStorage',
      'sessionStorage',
      'workspaceText',
    ]) {
      expect(`${forbidden}:${qualityContract.includes(forbidden)}`).toBe(`${forbidden}:false`);
    }
  });

  it('renders no unsanitized HTML and makes no direct SharePoint/Graph calls', () => {
    for (const file of editorFiles) {
      const source = read(file);
      expect(`${path.basename(file)}:${source.includes('dangerouslySetInnerHTML')}`).toBe(`${path.basename(file)}:false`);
      expect(source.includes('graph.microsoft.com')).toBe(false);
      expect(source.includes('sharepoint.com')).toBe(false);
    }
  });

  it('makes no raw fetch calls from editor code (only the shared API client)', () => {
    for (const file of editorFiles) {
      const source = read(file);
      expect(`${path.basename(file)}:${/\bfetch\s*\(/.test(source)}`).toBe(`${path.basename(file)}:false`);
      expect(`${path.basename(file)}:${source.includes('XMLHttpRequest')}`).toBe(`${path.basename(file)}:false`);
    }
  });

  it('enforces bounded content through shared limits', () => {
    const model = read(path.join(EDITOR_LIB_DIR, 'editorModel.ts'));
    expect(/maxNodes:\s*\d+/.test(model)).toBe(true);
    expect(/maxTotalTextLength:\s*\d+/.test(model)).toBe(true);
    expect(/maxSerializedBytes:\s*[\d_]+/.test(model)).toBe(true);
    const validator = read(path.join(EDITOR_LIB_DIR, 'editorSchemaValidator.ts'));
    expect(validator.includes('unknown node type')).toBe(true);
    expect(validator.includes('ALLOWED_LINK_PROTOCOLS')).toBe(true);
  });

  it('editor content is stored in no unrelated persistence field anywhere in the editor surface', () => {
    for (const file of editorFiles) {
      const source = read(file);
      for (const forbidden of ['templateData', 'SystemSetting', 'ContractTemplate.variables', 'Task.description', 'Case.description']) {
        expect(`${path.basename(file)}:${forbidden}:${source.includes(forbidden)}`).toBe(`${path.basename(file)}:${forbidden}:false`);
      }
    }
  });

  it('keeps the old editor-lab route as a redirect (no second drafting editor)', () => {
    const editorLab = read(EDITOR_LAB_ROUTE);
    expect(editorLab.includes('/documents/new/edit')).toBe(true);
    expect(editorLab.includes('useEditor')).toBe(false);
    expect(editorLab.includes('TipTapEditorExperimental')).toBe(false);
  });

  it('backend editor readiness module exposes validation/metadata only, not fake persistence', () => {
    const backendModules = path.join(__dirname, '..', 'src', 'modules');
    const documentEditorDir = path.join(backendModules, 'documentEditor');
    expect(fs.existsSync(documentEditorDir)).toBe(true);
    expect(fs.existsSync(path.join(backendModules, 'editor'))).toBe(false);

    const backendEditorFiles = listFiles(documentEditorDir);
    expect(backendEditorFiles.map((file) => path.basename(file)).sort()).toEqual(['contentSchema.ts', 'service.ts']);

    for (const file of backendEditorFiles) {
      const source = read(file);
      for (const forbidden of [
        'workspaceText',
        'saveWorkspaceDocumentVersion',
        'save-workspace-version',
        'uploadNewVersion',
        'downloadDocument',
        'spItemId',
        'spPath',
        'spWebUrl',
        'localStorage',
        'sessionStorage',
        'openai',
        'n8n',
      ]) {
        expect(`${path.basename(file)}:${forbidden}:${source.includes(forbidden)}`).toBe(`${path.basename(file)}:${forbidden}:false`);
      }
    }
  });
});
