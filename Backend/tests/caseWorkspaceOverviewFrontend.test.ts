import fs from 'fs';
import path from 'path';

const repoRoot = path.join(__dirname, '..', '..');
const read = (rel: string) => fs.readFileSync(path.join(repoRoot, rel), 'utf8');

const overview = read('Frontend/src/components/cases/CaseWorkspaceOverview.tsx');
const panels = read('Frontend/src/components/cases/CaseCockpitPanels.tsx');
const caseDetail = read('Frontend/src/components/CaseDetail.tsx');

/**
 * The matter overview is an operational cockpit, not a stack of equal-weight
 * white modules. These guards encode the information architecture the redesign
 * requires, replacing the previous mini-dashboard contract.
 */
describe('matter cockpit — data source and states', () => {
  it('fetches the workspace projection through the central API client', () => {
    expect(overview).toContain('getCaseWorkspace(caseId)');
    expect(overview).not.toMatch(/\bfetch\(/);
  });

  it('renders loading, error and refresh states', () => {
    expect(overview).toContain('Az ügy-munkatér betöltése…');
    expect(overview).toContain('<SafePanelError');
    expect(overview).toContain('void load()');
    expect(overview).toContain('const refresh = useCallback');
  });

  it('takes every operational summary from the server cockpit, never inventing one', () => {
    expect(overview).toContain('const cp = ws.cockpit');
    for (const kpi of ['cp.kpi.openTasks', 'cp.kpi.deadlines', 'cp.kpi.communication', 'cp.kpi.review', 'cp.kpi.activeDocuments']) {
      expect(overview).toContain(kpi);
    }
  });
});

describe('matter hero', () => {
  it('leads with the matter and its operational identity', () => {
    expect(overview).toContain('data-testid="matter-hero"');
    expect(overview).toContain('c.client?.name');
    expect(overview).toContain('c.matterType');
    expect(overview).toContain('getCaseStatusLabel(c.status)');
    expect(overview).toContain('cp.responsible?.name');
  });

  it('surfaces urgency, next step and next deadline in the hero', () => {
    expect(overview).toContain('URGENCY_STYLE');
    expect(overview).toContain('data-testid="hero-next-step"');
    expect(overview).toContain('data-testid="hero-next-deadline"');
  });

  it('offers the three primary actions', () => {
    expect(overview).toContain('Új feladat');
    expect(overview).toContain('Kommunikáció hozzáadása');
    expect(overview).toContain('Dokumentum feltöltése');
  });
});

describe('functional KPI row', () => {
  it('renders exactly the six required cards', () => {
    const cards = (overview.match(/<KpiCard\b/g) || []).length;
    expect(cards).toBe(6);
    for (const label of ['Nyitott feladatok', 'Közelgő határidők', 'Kommunikáció', 'Review tételek', 'Aktív dokumentumok', 'Következő lépés']) {
      expect(overview).toContain(label);
    }
  });

  it('gives every card a meaningful secondary line, not a bare count', () => {
    expect(overview).toContain('secondary={cp.kpi.openTasks.secondary}');
    expect(overview).toContain('secondary={cp.kpi.deadlines.secondary}');
    expect(overview).toContain('secondary={cp.kpi.communication.secondary}');
  });

  it('cards are click-through controls that jump to their panel', () => {
    expect(panels).toContain('href={`#${targetId}`}');
    expect(panels).toContain('data-testid={`kpi-${targetId}`}');
  });

  it('emphasises a card when it demands attention', () => {
    expect(overview).toContain('emphasised={cp.kpi.openTasks.urgentCount > 0}');
    expect(overview).toContain('emphasised={cp.kpi.communication.replyNeededCount > 0}');
  });
});

describe('two-column operational layout', () => {
  it('uses a responsive two-column grid that collapses to one column', () => {
    expect(overview).toContain('xl:grid-cols-[minmax(0,1.15fr)_minmax(0,1fr)]');
    expect(overview).toContain('grid-cols-1');
  });

  it('groups work by when it must be acted on', () => {
    expect(overview).toContain('data-testid="task-group-immediate"');
    expect(overview).toContain('data-testid="task-group-today"');
    expect(overview).toContain('data-testid="task-group-later"');
    expect(overview).toContain('Azonnali');
    expect(overview).toContain('cp.taskGroups.immediate');
  });

  it('renders a grouped deadline timeline', () => {
    expect(overview).toContain('data-testid="deadline-timeline"');
    for (const label of ['Ma', 'Holnap', 'Ezen a héten', 'Később']) {
      expect(overview).toContain(`"${label}"`);
    }
    expect(overview).toContain('cp.deadlineGroups.today');
  });

  it('distinguishes matter deadlines from task deadlines', () => {
    expect(panels).toContain('Ügyhatáridő');
    expect(panels).toContain('d.source === "MATTER"');
  });

  it('flags communication awaiting a reply and internal vs external', () => {
    expect(overview).toContain('data-testid="reply-needed"');
    expect(overview).toContain('m.internal ?');
  });

  it('shows only operationally relevant documents, each with a reason', () => {
    expect(overview).toContain('data-testid="active-documents"');
    expect(overview).toContain('cp.activeDocuments');
    expect(overview).toContain('Review-ra vár');
    expect(overview).toContain('Határidő lejárt');
    // The whole repository must not be dumped into the panel.
    expect(overview).not.toContain('ws.documents.map');
  });
});

describe('empty states are actionable', () => {
  it('every empty state offers the next useful action', () => {
    expect(panels).toContain('data-testid="actionable-empty"');
    for (const action of [
      'Első feladat létrehozása',
      'Határidő hozzáadása',
      'E-mail thread hozzárendelése',
      'Dokumentum feltöltése',
      'Első megjegyzés létrehozása',
    ]) {
      expect(overview).toContain(action);
    }
  });

  it('does not render large passive "Nincs…" panels', () => {
    expect(overview).not.toContain('<Empty title=');
  });
});

describe('secondary area', () => {
  it('renders structured activity with actor, action and object as parts', () => {
    expect(overview).toContain('data-testid="activity-feed"');
    expect(overview).toContain('a.actor');
    expect(overview).toContain('a.actionLabel');
    expect(overview).toContain('a.objectLabel');
    expect(overview).not.toContain('Esemény rögzítve');
  });

  it('keeps time secondary and honest', () => {
    expect(overview).toContain('ws.time.available');
    expect(overview).toContain('Nem áll rendelkezésre megbízható ügy-szintű összesítés.');
  });
});

describe('visual system', () => {
  it('uses the shared functional accent map rather than ad-hoc colours', () => {
    for (const accent of ['petrol', 'terracotta', 'green', 'ochre', 'navy', 'neutral']) {
      expect(panels).toContain(`${accent}:`);
    }
    expect(overview).toContain('ACCENT.terracotta');
  });

  it('no longer renders the old equal-weight white panel stack', () => {
    expect(overview).not.toContain('<Panel id="cw-');
    expect(overview).not.toContain('<SummaryCard ');
  });
});

describe('CaseDetail wiring', () => {
  it('renders the cockpit as the case overview surface', () => {
    expect(caseDetail).toContain('<CaseWorkspaceOverview caseId={canonicalCaseId} />');
  });
});
