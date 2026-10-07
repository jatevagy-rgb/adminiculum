import fs from 'fs';
import path from 'path';

const repoRoot = path.join(__dirname, '..', '..');
const read = (rel: string) => fs.readFileSync(path.join(repoRoot, rel), 'utf8');

const overview = read('Frontend/src/components/cases/CaseWorkspaceOverview.tsx');
const panels = read('Frontend/src/components/cases/CaseCockpitPanels.tsx');
const communication = read('Frontend/src/components/cases/word-workflow/tools/WordWideCommunicationLeaf.tsx');
const history = read('Frontend/src/components/cases/word-workflow/history/CaseHistoryPanel.tsx');
const timeSummary = read('Frontend/src/components/cases/CaseTimeBillingSummary.tsx');
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
    for (const kpi of ['cp.taskGroups', 'cp.kpi.deadlines', 'cp.replyNeeded', 'cp.activeDocuments']) {
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

  it('offers task/upload actions and the communication leaf action', () => {
    expect(overview).toContain('Új feladat');
    expect(communication).toContain('E-mail thread hozzárendelése');
    expect(overview).toContain('Dokumentum feltöltése');
  });
});

describe('work-first summary without duplicate KPI cards', () => {
  it('keeps one work-first summary and no six-card KPI row', () => {
    const cards = (overview.match(/<KpiCard\b/g) || []).length;
    expect(cards).toBe(0);
    for (const label of ['Aktuális munka és következő lépés', 'Aktív munka', 'Következő lépés']) {
      expect(overview).toContain(label);
    }
  });

  it('keeps stored next-step and deadline context', () => {
    expect(overview).toContain('cp.nextStep');
    expect(overview).toContain('cp.kpi.deadlines.nextDueAt');
    expect(overview).toContain('aria-label="Következő feladat"');
  });

  it('cards are click-through controls that jump to their panel', () => {
    expect(panels).toContain('href={`#${targetId}`}');
    expect(panels).toContain('data-testid={`kpi-${targetId}`}');
  });

  it('preserves urgent-task and reply-needed signals without duplicating KPI cards', () => {
    expect(overview).toContain('task-group-immediate');
    expect(overview).toContain('replyNeededIds={cp.replyNeeded}');
    expect(communication).toContain('data-testid="reply-needed"');
  });
});

describe('two-column operational layout', () => {
  it('uses a responsive two-column grid that collapses to one column', () => {
    expect(overview).toContain('lg:grid-cols-[minmax(0,2fr)_minmax(0,1fr)]');
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
    expect(overview).toContain('replyNeededIds={cp.replyNeeded}');
    expect(overview).toContain('communicationSignals={ws.communications}');
    expect(communication).toContain('data-testid="reply-needed"');
    expect(communication).toContain('signal.internal ?');
  });

  it('shows only operationally relevant documents, each with a reason', () => {
    expect(overview).toContain('data-testid="active-documents"');
    expect(overview).toContain('cp.activeDocuments');
    expect(overview).toContain('Review-ra vár');
    expect(overview).toContain('Határidő lejárt');
    // The whole repository must not be dumped into the panel.
    expect(overview).toContain('activeDocuments={cp.activeDocuments}');
    // Full document selection is allowed inside the secondary matrix chooser.
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
      'Első megjegyzés írása',
    ]) {
      expect(overview + communication).toContain(action);
    }
  });

  it('does not render large passive "Nincs…" panels', () => {
    expect(overview).not.toContain('<Empty title=');
  });
});

describe('secondary area', () => {
  it('uses the canonical history with author, title and detail', () => {
    expect(overview).toContain('<CaseHistoryPanel key={caseId}');
    expect(history).toContain('item.authorName');
    expect(history).toContain('item.title');
    expect(history).toContain('item.detail');
    expect(overview).not.toContain('Esemény rögzítve');
  });

  it('keeps time secondary and honest', () => {
    expect(overview).toContain('<CaseTimeBillingSummary');
    expect(timeSummary).toContain('Az idő-összesítő jelenleg nem érhető el.');
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

/**
 * Regression: the cockpit rebuild dropped the lawyer instruction / matter
 * description entirely. The overview must state the legal work context, not only
 * the operational counters.
 */
describe('legal work context is present in the cockpit', () => {
  it('renders a dedicated starting-context panel', () => {
    expect(panels).toContain('StartingContextPanel');
    expect(panels).toContain('data-testid="starting-context-panel"');
    expect(panels).toContain('Ügyvédi instrukció / Induló helyzet');
    expect(overview).toContain('<StartingContextPanel');
  });

  it('shows each structured intake answer under its own label', () => {
    for (const label of ['Miért indult', 'Jelenlegi helyzet', 'Ügyfél elvárása', 'Sürgős teendő', 'Első következő lépés']) {
      expect(panels).toContain(label);
    }
    expect(panels).toContain('context.originReason');
    expect(panels).toContain('context.currentSituation');
    expect(panels).toContain('context.clientExpectation');
    expect(panels).toContain('context.urgentAction');
  });

  it('renders only the answers that exist, never a row of empty cards', () => {
    // Entries are pushed conditionally on a non-empty value.
    expect(panels).toContain('if (value && value.trim()) entries.push');
  });

  it('falls back to the free-text description for legacy matters', () => {
    expect(panels).toContain('data-testid="starting-context-legacy"');
    expect(panels).toContain('context.legacyOnly');
  });

  it('offers an action when there is no context at all', () => {
    expect(panels).toContain('Induló helyzet rögzítése');
  });

  it('does not reintroduce the old equal-weight stacked module', () => {
    // The panel uses the cockpit accent rail, not a bordered white card.
    expect(panels).toContain('border-l-4');
    expect(overview).not.toContain('<Panel id="cw-');
  });

  it('is fed by the server projection, not recomputed in the view', () => {
    expect(overview).toContain('context={c.startingContext}');
    expect(overview).toContain('description={c.description}');
  });
});
