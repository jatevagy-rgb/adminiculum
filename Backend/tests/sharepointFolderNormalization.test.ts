import {
  normalizeSharePointFolderPath,
  SHAREPOINT_FOLDERS,
  WorkflowToSPFolder,
} from '../src/modules/sharepoint/types';

describe('normalizeSharePointFolderPath', () => {
  it.each([
    ['CLIENT_INPUT', SHAREPOINT_FOLDERS.WORKFLOW_CLIENT_INPUT],
    ['ClientInput', SHAREPOINT_FOLDERS.WORKFLOW_CLIENT_INPUT],
    ['DRAFT', SHAREPOINT_FOLDERS.WORKFLOW_DRAFTS],
    ['DRAFTS', SHAREPOINT_FOLDERS.WORKFLOW_DRAFTS],
    ['Drafts', SHAREPOINT_FOLDERS.WORKFLOW_DRAFTS],
    ['IN_REVIEW', SHAREPOINT_FOLDERS.WORKFLOW_REVIEW],
    ['REVIEW', SHAREPOINT_FOLDERS.WORKFLOW_REVIEW],
    ['Review', SHAREPOINT_FOLDERS.WORKFLOW_REVIEW],
  ])('%s maps to the canonical workflow folder', (alias, expected) => {
    expect(normalizeSharePointFolderPath(alias)).toBe(expected);
  });

  it('keeps an already-canonical workflow folder unchanged', () => {
    expect(normalizeSharePointFolderPath(WorkflowToSPFolder.CLIENT_INPUT)).toBe(
      SHAREPOINT_FOLDERS.WORKFLOW_CLIENT_INPUT
    );
  });

  it('keeps unknown explicit folders unchanged', () => {
    expect(normalizeSharePointFolderPath('Custom/Folder')).toBe('Custom/Folder');
  });

  it('uses the intended default for an empty folder', () => {
    expect(normalizeSharePointFolderPath()).toBe(SHAREPOINT_FOLDERS.CONTRACTS);
    expect(normalizeSharePointFolderPath('  ')).toBe(SHAREPOINT_FOLDERS.CONTRACTS);
  });
});
