import fs from 'fs';
import path from 'path';

const repoRoot = path.join(__dirname, '..', '..');
const overview = fs.readFileSync(
  path.join(repoRoot, 'Frontend/src/components/cases/CaseWorkspaceOverview.tsx'),
  'utf8',
);
const caseDetail = fs.readFileSync(
  path.join(repoRoot, 'Frontend/src/components/CaseDetail.tsx'),
  'utf8',
);

describe('CaseWorkspaceOverview mini-dashboard', () => {
  it('fetches the workspace endpoint through the central API client', () => {
    expect(overview).toContain('getCaseWorkspace(caseId)');
    // no ad-hoc fetch() inside the component
    expect(overview).not.toMatch(/\bfetch\(/);
  });

  it('renders loading, error and empty states', () => {
    expect(overview).toContain('Az ügy-munkatér betöltése…');
    expect(overview).toContain('<SafePanelError');
    expect(overview).toContain('void load()'); // retry
  });

  it('renders the case header with client, status, priority and responsible', () => {
    expect(overview).toContain('aria-label="Ügyfejléc"');
    expect(overview).toContain('getCaseStatusLabel(c.status)');
    expect(overview).toContain('c.assignedLawyer?.name');
    expect(overview).toContain('c.client?.name');
  });

  it('renders the editable-instruction block read-only (no fake edit button)', () => {
    expect(overview).toContain('Ügyvédi instrukció');
    expect(overview).toContain('c.description');
    expect(overview).toContain('Következő lépés');
  });

  it('renders six summary cards', () => {
    const cards = (overview.match(/<SummaryCard /g) || []).length;
    expect(cards).toBe(6);
    expect(overview).toContain('Nyitott feladatok');
    expect(overview).toContain('Kommunikáció');
  });

  it('renders task, document, deadline, communication and activity panels', () => {
    for (const id of ['cw-tasks', 'cw-documents', 'cw-deadlines', 'cw-comms', 'cw-activity', 'cw-time']) {
      expect(overview).toContain(`id="${id}"`);
    }
    expect(overview).toContain('ws.tasks.map');
    expect(overview).toContain('ws.documents.map');
    expect(overview).toContain('ws.deadlines.map');
    expect(overview).toContain('ws.communications.map');
    expect(overview).toContain('ws.activity.map');
  });

  it('renders human-readable activity (actor + actionLabel + objectLabel), not generic', () => {
    expect(overview).toContain('a.actionLabel');
    expect(overview).toContain('a.objectLabel');
    expect(overview).not.toContain('Esemény rögzítve');
  });

  it('renders the explicit time-unavailable state, never a fake value', () => {
    expect(overview).toContain('ws.time.available');
    expect(overview).toContain('Nem áll rendelkezésre megbízható ügy-szintű összesítés.');
  });

  it('surfaces per-section partial errors from warnings', () => {
    expect(overview).toContain("warn(\"communications\")");
    expect(overview).toContain('ws.warnings.find');
  });

  it('uses the attention-category presentation for task badges', () => {
    expect(overview).toContain('attentionPresentation(t.attentionCategory)');
    expect(overview).toContain('formatEstimateRange');
  });
});

describe('CaseDetail wires the workspace overview as the dominant surface', () => {
  it('renders only CaseWorkspaceOverview and not the retired legacy overview', () => {
    expect(caseDetail).toContain('<CaseWorkspaceOverview caseId={canonicalCaseId} />');
    expect(caseDetail).not.toContain('import { CaseCenterOverview }');
    expect(caseDetail).not.toContain('<CaseCenterOverview');
  });
});
