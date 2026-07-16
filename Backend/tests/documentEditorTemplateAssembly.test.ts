import fs from 'fs';
import path from 'path';

const ROOT = path.join(__dirname, '..', '..');
const backendContractsDir = path.join(ROOT, 'Backend', 'src', 'modules', 'contracts');
const frontendSrc = path.join(ROOT, 'Frontend', 'src');

function read(relativePath: string): string {
  return fs.readFileSync(path.join(ROOT, relativePath), 'utf8');
}

describe('document editor template assembly bridge static safety', () => {
  it('exposes a capability contract without storage or generation side effects', () => {
    const capabilities = read('Backend/src/modules/contracts/templateCapabilities.ts');
    const routes = read('Backend/src/modules/contracts/routes.ts');

    expect(capabilities).toContain('EditorTemplateCapabilitiesDto');
    expect(capabilities).toContain('APPROVAL_READINESS_ONLY');
    expect(routes.indexOf("/editor-template-capabilities")).toBeGreaterThan(routes.indexOf('router.use(authenticate)'));
    expect(routes.indexOf("/editor-template-capabilities")).toBeLessThan(routes.indexOf('router.use(requireContractsEnabled)'));

    for (const forbidden of ['prisma.', 'fs.', 'readFile', 'writeFile', 'generateContract(', 'generateWithBundle', 'res.download', 'uploadDocument', 'templatePath', 'filePath', 'templateData']) {
      expect(capabilities).not.toContain(forbidden);
    }
  });

  it('keeps the editor bridge in Mode C without automatic generation or persistence', () => {
    const workbench = read('Frontend/src/components/editor/DocumentEditorWorkbench.tsx');
    const sidePanel = read('Frontend/src/components/editor/DocumentEditorSidePanel.tsx');
    const api = read('Frontend/src/lib/api.ts');

    expect(api).toContain('getEditorTemplateCapabilities');
    // The workbench still loads the capability contract; the template bridge
    // copy lives in the side panel "Sablon" tab since the UX layout overhaul
    // (the permanent header banner was removed deliberately).
    expect(workbench).toContain('getEditorTemplateCapabilities');
    expect(sidePanel).toContain('Sablonból munkapéldány');
    expect(sidePanel).toContain('A sablonkatalógus jelenleg nem érhető el.');
    expect(sidePanel).toContain('Helyi DOCX import');
    expect(workbench).toContain('A munkapéldány helyi szerkesztésű; a végleges dokumentumot exportálni kell.');

    for (const forbidden of [
      'generateContract(',
      'generateContractForCase(',
      'previewContract(',
      'getContractTemplates(',
      'downloadContract(',
      'uploadGeneratedContractToSharePoint(',
      'localStorage',
      'sessionStorage',
      'workspaceText',
      'templateData',
      'spWebUrl',
      'spItemId',
      'sharepoint',
      'graph.microsoft',
      'openai',
      'anthropic',
      'gemini',
      'n8n',
    ]) {
      expect(workbench.toLowerCase()).not.toContain(forbidden.toLowerCase());
    }
  });

  it('does not create a dynamic clause catalog contract without approval', () => {
    expect(fs.existsSync(path.join(ROOT, 'docs', 'document-editor-clause-catalog-contract.md'))).toBe(false);
    const workbench = read('Frontend/src/components/editor/DocumentEditorWorkbench.tsx');
    expect(workbench).not.toContain('/clause-library/clauses');
    expect(workbench).not.toContain('recommend');
  });

  it('does not add AI, n8n, or external converter dependencies to the bridge files', () => {
    const bridgeFiles = [
      path.join(backendContractsDir, 'templateCapabilities.ts'),
      path.join(frontendSrc, 'components', 'editor', 'DocumentEditorWorkbench.tsx'),
      path.join(frontendSrc, 'components', 'editor', 'DocumentEditorSidePanel.tsx'),
      path.join(frontendSrc, 'lib', 'api.ts'),
    ];

    for (const file of bridgeFiles) {
      const source = fs.readFileSync(file, 'utf8').toLowerCase();
      for (const forbidden of ['openai', '@anthropic', 'gemini', 'n8n', 'cloudconvert', 'libreoffice', 'pandoc', 'mammoth.convert', 'graph.microsoft']) {
        expect(source).not.toContain(forbidden);
      }
    }
  });

  it('keeps dependency remediation explicit and does not hide audit findings', () => {
    const packageJson = read('Frontend/package.json').toLowerCase();
    const auditDoc = read('docs/frontend-dependency-vulnerability-audit-2026-07.md').toLowerCase();

    expect(packageJson).not.toContain('audit fix --force');
    expect(packageJson).not.toContain('audit-level');
    expect(auditDoc).toContain('final count: 4 vulnerabilities');
    expect(auditDoc).toContain('0 critical');
    expect(auditDoc).toContain('npm audit fix --force');
    expect(auditDoc).toContain('remaining issues are explicit');
  });
});
