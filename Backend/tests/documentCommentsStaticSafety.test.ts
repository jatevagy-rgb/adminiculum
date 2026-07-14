import fs from 'fs';
import path from 'path';

const repoRoot = path.join(__dirname, '..', '..');
const servicePath = path.join(repoRoot, 'Backend', 'src', 'modules', 'documents', 'documentComments.service.ts');
const sidePanelPath = path.join(repoRoot, 'Frontend', 'src', 'components', 'editor', 'DocumentEditorSidePanel.tsx');

function read(file: string): string {
  return fs.readFileSync(file, 'utf8');
}

describe('document comments static safety', () => {
  it('keeps document comments out of activity, notifications, tasks and editor persistence', () => {
    const service = read(servicePath);

    for (const forbidden of [
      'timelineEvent.create',
      'notification.create',
      'task.create',
      'Task.description',
      'Task.title',
      'workspaceText',
      'localStorage',
      'sessionStorage',
      'dangerouslySetInnerHTML',
      'openai',
      'anthropic',
      'n8n',
      '/portal',
      'graph.microsoft.com',
      'sharepoint.com',
      'include:',
    ]) {
      expect(`${forbidden}:${service.includes(forbidden)}`).toBe(`${forbidden}:false`);
    }
  });

  it('rejects fake anchors and client actor/status fields instead of storing them', () => {
    const service = read(servicePath);
    expect(service).toContain('COMMENT_FIELD_NOT_ACCEPTED');
    for (const forbiddenField of ['authorId', 'selectedText', 'editorJson', 'anchor', 'range', 'status']) {
      expect(service).toContain(`'${forbiddenField}'`);
    }
    expect(service).toContain('canDelete: false');
  });

  it('renders comments as React text and labels them as document-level only', () => {
    const sidePanel = read(sidePanelPath);
    expect(sidePanel).toContain('Dokumentumszintű megjegyzések');
    expect(sidePanel.toLowerCase()).toContain('nem szöveghez rögzített kommentek');
    expect(sidePanel).not.toContain('dangerouslySetInnerHTML');
    expect(sidePanel).not.toContain('selectedText');
    expect(sidePanel).not.toContain('localStorage');
    expect(sidePanel).not.toContain('sessionStorage');
  });
});
