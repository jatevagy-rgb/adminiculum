/**
 * Contract Workspace work-context header (CONTRACT-WS-WORK-CONTEXT-HEADER-1).
 *
 * The Contract Workspace previously led with a filename and never exposed the
 * legal work context that the matter cockpit already showed. These guards encode
 * the header contract: operational identity leads, technical metadata is demoted
 * and collapsed, actions are truthful, and every surface derives from the one
 * shared model rather than a private mapping.
 */
import fs from 'fs';
import path from 'path';

const repoRoot = path.join(__dirname, '..', '..');
const read = (rel: string) => fs.readFileSync(path.join(repoRoot, rel), 'utf8');
const F = 'Frontend/src/components/documents/workContext';

const model = read('Frontend/src/lib/documents/workContext.ts');
const header = read(`${F}/DocumentWorkspaceHeader.tsx`);
const identity = read(`${F}/DocumentIdentityBlock.tsx`);
const instruction = read(`${F}/DocumentWorkInstruction.tsx`);
const responsibility = read(`${F}/DocumentResponsibilitySummary.tsx`);
const linked = read(`${F}/DocumentLinkedWorkSummary.tsx`);
const version = read(`${F}/DocumentVersionIdentity.tsx`);
const technical = read(`${F}/DocumentTechnicalDetails.tsx`);
const hook = read(`${F}/useDocumentWorkContext.ts`);
const workspace = read('Frontend/src/app/cases/[caseId]/documents/page.tsx');
const card = read('Frontend/src/components/documents/DocumentWorkCard.tsx');
const api = read('Frontend/src/lib/api.ts');

/** Strip line and block comments so guards scan code, not documentation prose. */
const code = (src: string) => src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*/g, '');

describe('component extraction, not one monolithic header', () => {
  it('splits the header into small single-purpose blocks and a hook', () => {
    for (const [name, src] of [
      ['DocumentWorkspaceHeader', header], ['DocumentIdentityBlock', identity],
      ['DocumentWorkInstruction', instruction], ['DocumentResponsibilitySummary', responsibility],
      ['DocumentLinkedWorkSummary', linked], ['DocumentVersionIdentity', version],
      ['DocumentTechnicalDetails', technical],
    ] as const) {
      expect(src).toContain(`export function ${name}`);
    }
    expect(hook).toContain('export function useDocumentWorkContext');
  });

  it('keeps each header piece small — no new 700-line component', () => {
    expect(header.split('\n').length).toBeLessThan(160);
    for (const src of [identity, instruction, responsibility, linked, version, technical]) {
      expect(src.split('\n').length).toBeLessThan(120);
    }
  });
});

describe('information hierarchy', () => {
  it('leads with the human title, keeps filename and role secondary', () => {
    expect(identity).toContain('data-testid="dwh-title"');
    expect(identity).toContain('view.humanTitle');
    expect(identity).toContain('data-testid="dwh-filename"');
    expect(identity.indexOf('dwh-title')).toBeLessThan(identity.indexOf('dwh-filename'));
  });

  it('shows a human work-status badge and the selected version badge', () => {
    expect(identity).toContain('view.workStatusLabel');
    expect(identity).toContain('data-testid="dwh-status-badge"');
    expect(identity).toContain('data-testid="dwh-version-badge"');
  });

  it('gives the work instruction a prominent labelled block', () => {
    expect(instruction).toContain('Munkautasítás');
    expect(instruction).toContain('view.workInstruction');
    expect(instruction).toContain('data-testid="dwh-instruction"');
  });

  it('offers a compact actionable empty state for a missing instruction', () => {
    expect(instruction).toContain('data-testid="dwh-instruction-empty"');
    expect(instruction).toContain('Munkautasítás beállítása');
    expect(instruction).toContain('canEdit');
  });

  it('shows owner, reviewer, due date and priority', () => {
    // Cells forward testid -> data-testid, so assert the values and the forwarding.
    expect(responsibility).toContain('data-testid={testid}');
    for (const t of ['dwh-owner', 'dwh-reviewer', 'dwh-due', 'dwh-priority']) {
      expect(responsibility).toContain(`"${t}"`);
    }
    expect(responsibility).toContain('Felelős');
    expect(responsibility).toContain('Reviewer');
    expect(responsibility).toContain('Határidő');
  });

  it('shows the linked task, next step and provenance', () => {
    expect(linked).toContain('data-testid="dwh-linked-task"');
    expect(linked).toContain('Kapcsolódó feladat');
    expect(linked).toContain('data-testid="dwh-next-step"');
    expect(linked).toContain('Következő lépés');
    expect(linked).toContain('data-testid="dwh-provenance"');
  });

  it('shows selected and current version without conflating them', () => {
    expect(version).toContain('data-testid="dwh-selected-version"');
    expect(version).toContain('data-testid="dwh-current-version"');
    expect(version).toContain('view.selectedVersion');
    expect(version).toContain('view.currentVersion');
    expect(version).toContain('view.isHistoricalVersion');
  });
});

describe('partial-data and lifecycle states', () => {
  it('renders a stable loading skeleton, not a layout jump', () => {
    expect(header).toContain('data-testid="dwh-loading"');
    expect(header).toContain('animate-pulse');
  });

  it('renders a controlled error/retry state', () => {
    expect(header).toContain('data-testid="dwh-error"');
    expect(header).toContain('Újratöltés');
    expect(hook).toContain('reload');
  });

  it('renders the explicit no-work-context state with an authorized action', () => {
    expect(header).toContain('data-testid="dwh-no-context"');
    expect(header).toContain('Még nincs munkautasítás vagy felelős beállítva.');
    expect(header).toContain('Munkakontextus beállítása');
  });

  it('shows only populated responsibility fields — no row of "Nincs adat"', () => {
    // Cells are conditionally pushed, never rendered as empty placeholders.
    expect(responsibility).toContain('if (view.owner)');
    expect(responsibility).toContain('if (cells.length === 0) return null');
    expect(code(responsibility)).not.toContain('Nincs adat');
  });
});

describe('technical metadata is demoted, never dominant', () => {
  it('collapses technical details by default under Részletek', () => {
    expect(technical).toContain('Részletek');
    expect(technical).toContain('data-testid="dwh-technical-toggle"');
    expect(technical).toContain('useState(false)');
    expect(technical).toContain('aria-expanded');
  });

  it('never surfaces MIME, storage keys, SharePoint ids or raw internal UUIDs in the header', () => {
    const all = [header, identity, instruction, responsibility, linked, version, technical].map(code).join(' ');
    for (const forbidden of ['mimeType', 'storageKey', 'spItemId', 'sharepoint', 'storageCredential', 'blobUrl']) {
      expect(all.toLowerCase()).not.toContain(forbidden.toLowerCase());
    }
    // The internal document UUID is used only as a fetch key, never rendered.
    expect(technical).not.toContain('view.documentId');
    expect(identity).not.toContain('view.documentId');
  });
});

describe('truthful actions only', () => {
  it('offers only genuinely implemented actions', () => {
    expect(header).toContain('Letöltés');
    expect(header).toContain('Új verzió');
    expect(header).toContain('Munkakontextus');
  });

  it('shows no false Word action and no diff / approval / delivery / AI / anonymisation actions', () => {
    for (const fake of ['Megnyitás Wordben', 'Word', 'Diff', 'Összehasonlítás', 'Jóváhagyás', 'Kiküldés ügyfélnek', 'Publikálás', 'AI', 'Anonimizál']) {
      expect(header).not.toContain(fake);
    }
  });
});

describe('one shared mapping across all surfaces', () => {
  it('the workspace header, the cockpit card and the model all use the shared model', () => {
    expect(header).toContain('./useDocumentWorkContext');
    expect(hook).toContain('@/lib/documents/workContext');
    expect(identity).toContain('@/lib/documents/workContext');
    // The cockpit card resolves status/label/date through the same module.
    expect(card).toContain('from "@/lib/documents/workContext"');
    expect(card).toContain('workStatusAccent');
    expect(card).toContain('workStatusLabel');
    // Labels are single-source: api re-exports them from the model.
    expect(api).toContain("export { DOCUMENT_WORK_STATUS_LABELS } from './documents/workContext'");
    expect(model).toContain('export const DOCUMENT_WORK_STATUS_LABELS');
  });

  it('is wired into the real Contract Workspace page for uploaded documents', () => {
    expect(workspace).toContain('DocumentWorkspaceHeader');
    expect(workspace).toContain('documentId={selectedUploadedDocument.id}');
    expect(workspace).toContain('selectedVersion={selectedVersion?.versionNumber');
    expect(workspace).toContain('currentVersion={versions.find((v) => v.isCurrent)?.versionNumber');
  });
});

describe('editor / annotation isolation is preserved', () => {
  it('the header reads work context through its own hook and never touches annotation state', () => {
    expect(hook).toContain('getDocumentWorkContext');
    for (const forbidden of ['annotationsVersionId', 'setSelectedVersionId', 'createDocumentAnnotation', 'refreshAnnotations']) {
      expect(hook).not.toContain(forbidden);
      expect(header).not.toContain(forbidden);
    }
  });
});
