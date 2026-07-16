import fs from 'fs';
import path from 'path';

const repoRoot = path.join(__dirname, '..', '..');
const servicePath = path.join(repoRoot, 'Backend', 'src', 'modules', 'documents', 'services.ts');
const caseDetailPath = path.join(repoRoot, 'Frontend', 'src', 'components', 'CaseDetail.tsx');
const caseDocumentsPagePath = path.join(
  repoRoot,
  'Frontend',
  'src',
  'app',
  'cases',
  '[caseId]',
  'documents',
  'page.tsx'
);

function read(file: string): string {
  return fs.readFileSync(file, 'utf8');
}

function extractDeleteDocumentBody(source: string): string {
  const start = source.indexOf('async deleteDocument(');
  expect(start).toBeGreaterThanOrEqual(0);
  const end = source.indexOf('async searchDocuments(', start);
  expect(end).toBeGreaterThan(start);
  return source.slice(start, end);
}

describe('document delete static safety', () => {
  it('keeps backend deletion metadata-only and dependency-gated', () => {
    const deleteBody = extractDeleteDocumentBody(read(servicePath));

    for (const required of [
      'anonymousDocument.count',
      'task.count',
      'legalAnalysis.count',
      'documentReviewSuggestion.count',
      'driveService.deleteDocument',
      'communication.updateMany',
      'communicationAttachment.updateMany',
      'timelineEvent.create',
      'document.delete',
      'DOCUMENT_DELETE_CONFLICT',
      'DOCUMENT_STORAGE_DELETE_FAILED',
    ]) {
      expect(deleteBody).toContain(required);
    }

    for (const forbidden of [
      'workspaceText',
      'content:',
      'fileName',
      'spPath',
      'spWebUrl',
      'include:',
      'localStorage',
      'sessionStorage',
      'dangerouslySetInnerHTML',
    ]) {
      expect(`${forbidden}:${deleteBody.includes(forbidden)}`).toBe(`${forbidden}:false`);
    }
  });

  it('keeps frontend deletion explicit and non-persistent', () => {
    const caseDetail = read(caseDetailPath);
    const caseDocumentsPage = read(caseDocumentsPagePath);
    const frontendDeleteSources = `${caseDetail}\n${caseDocumentsPage}`;

    expect(frontendDeleteSources).toContain('Dokumentum törlése');
    expect(frontendDeleteSources).toContain('Végleges törlés');
    expect(frontendDeleteSources).toContain('handleConfirmDeleteDocument');
    expect(caseDetail).toContain('refreshCaseDocuments');
    expect(caseDocumentsPage).toContain('loadData(false)');
    expect(frontendDeleteSources).toContain('deleteDocumentError');
    expect(frontendDeleteSources).not.toContain('dangerouslySetInnerHTML');
    expect(frontendDeleteSources).not.toContain('localStorage');
    expect(frontendDeleteSources).not.toContain('sessionStorage');
  });
});
