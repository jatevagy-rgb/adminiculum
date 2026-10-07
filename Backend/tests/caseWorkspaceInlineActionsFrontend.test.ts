import fs from 'fs';
import path from 'path';

const repoRoot = path.join(__dirname, '..', '..');
const read = (rel: string) => fs.readFileSync(path.join(repoRoot, rel), 'utf8');

const overview = read('Frontend/src/components/cases/CaseWorkspaceOverview.tsx');
const actions = read('Frontend/src/components/cases/CaseWorkspaceActions.tsx');
const caseDetail = read('Frontend/src/components/CaseDetail.tsx');
const nav = read('Frontend/src/components/cases/CaseWorkspaceNav.tsx');
const api = read('Frontend/src/lib/api.ts');

describe('Legacy overview retired', () => {
  it('CaseDetail no longer imports or renders CaseCenterOverview', () => {
    expect(caseDetail).not.toContain('import { CaseCenterOverview }');
    expect(caseDetail).not.toContain('<CaseCenterOverview');
  });

  it('the CaseCenterOverview component file is deleted', () => {
    expect(fs.existsSync(path.join(repoRoot, 'Frontend/src/components/cases/CaseCenterOverview.tsx'))).toBe(false);
  });

  it('the mount-time anonymous-documents fetch is removed from the case load path', () => {
    // The Promise.all data load must no longer call getCaseAnonymousDocuments.
    const loadBlock = caseDetail.slice(caseDetail.indexOf('await Promise.all(['), caseDetail.indexOf('await Promise.all([') + 1200);
    expect(loadBlock).not.toContain('getCaseAnonymousDocuments');
  });
});

describe('Primary tabs retain overview and context', () => {
  it('CaseWorkspaceNav exposes overview and context while communication lives in its canonical leaf', () => {
    const tabsBlock = nav.slice(nav.indexOf('const tabs = ['), nav.indexOf('];', nav.indexOf('const tabs = [')));
    expect(tabsBlock).toContain('"Áttekintés"');
    expect(tabsBlock).toContain('"Kontextus"');
    expect(tabsBlock).not.toContain('"Dokumentumok"');
    expect(tabsBlock).not.toContain('"Feladatok"');
    expect(tabsBlock).not.toContain('"Határidők"');
    expect(tabsBlock).not.toContain('"Munkaórák"');
  });

  it('the overview view still renders the (reduced) nav', () => {
    expect(caseDetail).toContain('<CaseWorkspaceNav');
    expect(caseDetail).toContain('activeTab="overview"');
  });
});

describe('Inline actions wired into the workspace', () => {
  it('exposes create/edit task, upload, deadline, and case-comment triggers', () => {
    // Primary actions live in the hero; panel-level triggers are compact.
    expect(overview).toContain('Új feladat');
    expect(overview).toContain('Dokumentum feltöltése');
    expect(overview).toContain('Határidő hozzáadása');
    expect(overview).toContain('Megjegyzés hozzáadása');
    expect(overview).toContain('Kommentek');
  });

  it('renders each action modal keyed off modal state', () => {
    for (const m of ['TaskFormModal', 'DocumentUploadModal', 'CaseCommentModal', 'DocumentCommentsModal']) {
      expect(overview).toContain(`<${m}`);
    }
  });

  it('refetches the workspace after an action instead of full page reload', () => {
    expect(overview).toContain('onSaved={() => void refresh()}');
    expect(overview).toContain('const refresh = useCallback');
    expect(overview).not.toContain('window.location.reload');
  });

  it('quick status change uses the lifecycle endpoints', () => {
    expect(overview).toContain('startTask(task.id)');
    expect(overview).toContain('TaskSubmissionWorkspace');
    expect(overview).toContain('Review megnyitása');
  });

  it('keeps discreet secondary links into the compatibility routes', () => {
    // The cockpit links out to the communication log rather than duplicating it.
    expect(overview).toContain('<WordWideCommunicationLeaf');
    const leaf = read('Frontend/src/components/cases/word-workflow/tools/WordWideCommunicationLeaf.tsx');
    expect(leaf).toContain('/communications?caseId=${encodeURIComponent(caseId)}&communicationId=${encodeURIComponent(selectedItem.id)}');
  });

  it('preserves the explicit time-unavailable state (never fake)', () => {
    expect(overview).toContain('<CaseTimeBillingSummary');
    expect(read('Frontend/src/components/cases/CaseTimeBillingSummary.tsx')).toContain('Az idő-összesítő jelenleg nem érhető el.');
  });
});

describe('Action modals are safe', () => {
  it('uses the central API client, not ad-hoc fetch', () => {
    expect(actions).not.toMatch(/\bfetch\(/);
    expect(actions).toContain('from "@/lib/api"');
  });

  it('scopes actions to the current caseId (auto, never re-selected)', () => {
    expect(actions).toContain('caseId,');
    expect(actions).toContain('createTask(');
    expect(actions).toContain('uploadCaseDocument(');
    expect(actions).toContain('createCaseComment(');
  });

  it('guards against double-submit and disables while busy', () => {
    expect(actions).toContain('if (busy) return');
    expect(actions).toContain('disabled={busy}');
  });

  it('closes on escape / cancel without saving', () => {
    expect(actions).toContain('<ViewportDialog');
    expect(read('Frontend/src/components/ui/useDialogAccessibility.ts')).toContain('event.key === "Escape"');
    expect(actions).toContain('Mégse');
  });

  it('shows the accepted upload types and enforces a size cap', () => {
    expect(actions).toContain('WORKSPACE_UPLOAD_ACCEPT');
    expect(actions).toContain('MAX_UPLOAD_BYTES');
  });
});

describe('API client surface', () => {
  it('exposes the new task-update and case-comment methods', () => {
    expect(api).toContain('export async function updateTask(');
    expect(api).toContain('export async function createCaseComment(');
    expect(api).toContain('export async function getCaseComments(');
  });

  it('the workspace type carries the comments section', () => {
    expect(api).toContain('comments: Array<{ id: string; author:');
  });
});
