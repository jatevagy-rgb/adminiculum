import fs from 'fs';
import path from 'path';

const repoRoot = path.join(__dirname, '..', '..');
const read = (rel: string) => fs.readFileSync(path.join(repoRoot, rel), 'utf8');

const card = read('Frontend/src/components/documents/DocumentWorkCard.tsx');
const overview = read('Frontend/src/components/cases/CaseWorkspaceOverview.tsx');
const api = read('Frontend/src/lib/api.ts');

/**
 * The document work-context backend shipped without a UI, so users still saw
 * context-free filename rows. These guards encode the operational card contract.
 */
describe('operational document work card', () => {
  it('leads with the human title and keeps the filename secondary', () => {
    expect(card).toContain('data-testid="doc-card-title"');
    expect(card).toContain('data-testid="doc-card-filename"');
    const titleAt = card.indexOf('data-testid="doc-card-title"');
    const fileAt = card.indexOf('data-testid="doc-card-filename"');
    expect(titleAt).toBeLessThan(fileAt);
  });

  it('shows the work instruction prominently', () => {
    expect(card).toContain('data-testid="doc-card-instruction"');
    expect(card).toContain('Munkautasítás');
    expect(card).toContain('card.workInstruction');
  });

  it('shows owner, reviewer, due date and next step', () => {
    // Rendered through the Field helper, which forwards testid -> data-testid.
    for (const t of ['doc-card-owner', 'doc-card-reviewer', 'doc-card-due', 'doc-card-next-step']) {
      expect(card).toContain(`testid="${t}"`);
    }
    expect(card).toContain('data-testid={testid}');
    expect(card).toContain('card.responsible?.name');
    expect(card).toContain('card.reviewer?.name');
  });

  it('renders the logical work status with a human Hungarian label', () => {
    expect(card).toContain('data-testid="doc-work-status"');
    expect(api).toContain('DOCUMENT_WORK_STATUS_LABELS');
    expect(api).toContain("IN_PROGRESS: 'Munka alatt'");
    expect(api).toContain("INTERNAL_REVIEW: 'Belső review'");
    expect(api).toContain("CHANGES_REQUESTED: 'Javítás kérve'");
  });

  it('keeps technical values behind an expandable secondary area', () => {
    expect(card).toContain('data-testid="doc-card-technical-toggle"');
    expect(card).toContain('data-testid="doc-card-technical"');
    expect(card).toContain('showTechnical');
  });

  it('never renders storage identifiers', () => {
    for (const leak of ['spItemId', 'spPath', 'spDriveId', 'checksum', 'spWebUrl']) {
      expect(card).not.toContain(leak);
    }
  });

  it('offers the four primary actions', () => {
    for (const action of ['Megnyitás', 'Feladat', 'Review', 'Új verzió']) {
      expect(card).toContain(action);
    }
  });

  it('renders loading and error states', () => {
    expect(card).toContain('data-testid="doc-card-loading"');
    expect(card).toContain('data-testid="doc-card-error"');
  });

  it('shows communication provenance when present', () => {
    expect(card).toContain('data-testid="doc-card-source"');
    expect(card).toContain('card.source');
  });
});

describe('work-context editor', () => {
  it('edits title, role, status, instruction, due date, priority and next step', () => {
    expect(card).toContain('data-testid="doc-work-context-editor"');
    for (const id of ['dwc-title', 'dwc-role', 'dwc-status', 'dwc-instruction', 'dwc-due', 'dwc-priority', 'dwc-next']) {
      expect(card).toContain(`id="${id}"`);
    }
  });

  it('uses human labels in the status select, not raw enum values', () => {
    expect(card).toContain('statusLabel(s)');
    expect(card).toContain('DOCUMENT_WORK_STATUS_ORDER');
  });

  it('validates, guards double submit and surfaces server errors', () => {
    expect(card).toContain('if (busy) return');
    expect(card).toContain('A cím megadása kötelező.');
    expect(card).toContain('role="alert"');
    expect(card).toContain('disabled={busy}');
  });

  it('offers cancel without saving', () => {
    expect(card).toContain('Mégse');
  });
});

describe('two-way task linking', () => {
  it('links and unlinks through the central API client', () => {
    expect(card).toContain('linkDocumentToTask');
    expect(card).toContain('unlinkDocumentFromTask');
    expect(card).not.toMatch(/\bfetch\(/);
  });

  it('shows linked tasks with their status and assignee', () => {
    expect(card).toContain('data-testid="doc-card-tasks"');
    expect(card).toContain('card.linkedTasks');
  });

  it('confirms before unlinking', () => {
    expect(card).toContain('data-testid="doc-card-unlink"');
    expect(card).toContain('window.confirm');
  });

  it('offers only case tasks that are not already linked', () => {
    expect(card).toContain('data-testid="doc-card-link-picker"');
    expect(card).toContain('!card.linkedTasks.some((l) => l.taskId === t.id)');
  });

  it('explains the 409 duplicate-link response meaningfully', () => {
    expect(card).toContain('már kapcsolva van ehhez a feladathoz');
  });
});

describe('cockpit document panel uses work cards', () => {
  it('renders DocumentWorkCard instead of a filename row', () => {
    expect(overview).toContain('<DocumentWorkCard');
    expect(overview).toContain('compact');
    expect(overview).toContain('caseTasks={ws.tasks}');
  });

  it('still prioritises operationally relevant documents only', () => {
    expect(overview).toContain('cp.activeDocuments');
    expect(overview).toContain('Review-ra vár');
    expect(overview).toContain('Határidő lejárt');
    expect(overview).not.toContain('ws.documents.map');
  });

  it('refreshes the projection after a card change', () => {
    expect(overview).toContain('onChanged={() => void refresh()}');
  });
});

describe('API client surface', () => {
  it('exposes the work-context and task-link methods', () => {
    for (const fn of [
      'export async function getDocumentWorkContext(',
      'export async function updateDocumentWorkContext(',
      'export async function linkDocumentToTask(',
      'export async function unlinkDocumentFromTask(',
      'export async function getTaskDocuments(',
    ]) {
      expect(api).toContain(fn);
    }
  });

  it('the work card type carries no storage identifiers', () => {
    const start = api.indexOf('export interface DocumentWorkCard {');
    const block = api.slice(start, api.indexOf('}', api.indexOf('source:', start)));
    for (const leak of ['spItemId', 'spPath', 'checksum']) {
      expect(block).not.toContain(leak);
    }
  });
});
