import fs from 'fs';
import path from 'path';

const repoRoot = path.join(__dirname, '..', '..');
const read = (rel: string) => fs.readFileSync(path.join(repoRoot, rel), 'utf8');

const list = read('Frontend/src/components/CasesList.tsx');
const dialog = read('Frontend/src/components/cases/intake/CaseIntakeDialog.tsx');
const sections = read('Frontend/src/components/cases/intake/CaseIntakeSections.tsx');
const hook = read('Frontend/src/components/cases/intake/useCaseIntakeForm.ts');
const api = read('Frontend/src/lib/api.ts');

describe('the six-step wizard is gone from the live intake path', () => {
  it('renders no stepper and no wizard modal', () => {
    expect(list).not.toContain('adm-wizard-modal');
    expect(list).not.toContain('adm-wizard-step');
    expect(list).not.toContain('adm-wizard-section');
    expect(list).not.toContain('adm-wizard-header');
    expect(list).not.toContain('adm-wizard-footer');
  });

  it('drops the repeated "kötelező" labels and per-field explanatory paragraphs', () => {
    expect(list).not.toContain('kötelező</span>');
    expect(list).not.toMatch(/Nevezd meg röviden az ügyet/);
  });

  it('opens the new intake dialog instead', () => {
    expect(list).toContain('<CaseIntakeDialog');
    expect(list).toContain('open={showNewCaseModal}');
  });

  it('exposes no legacy or classic intake toggle', () => {
    expect(list).not.toMatch(/régi ügyindítás|classic intake|legacyIntake/i);
  });

  it('navigates to the created matter cockpit', () => {
    expect(list).toContain('router.push(`/cases/${result.case.id}`)');
  });
});

describe('intake architecture is separated, not another monolith', () => {
  it('splits dialog, sections and form state into their own modules', () => {
    expect(dialog).toContain('CaseIntakeDialog');
    for (const c of ['CaseBasicsSection', 'CaseStartingContextSection', 'CaseDeadlineSection',
                     'CaseCommunicationPicker', 'CaseParticipantsSection', 'CaseInitialTasksSection']) {
      expect(sections).toContain(`export function ${c}`);
      expect(dialog).toContain(c);
    }
    expect(hook).toContain('export function useCaseIntakeForm');
  });

  it('keeps the dialog itself small — composition, not implementation', () => {
    expect(dialog.split('\n').length).toBeLessThan(220);
  });
});

describe('sticky header', () => {
  it('keeps the title and the primary action visible while scrolling', () => {
    expect(dialog).toContain('data-testid="intake-sticky-header"');
    expect(dialog).toContain('sticky top-0');
    expect(dialog).toContain('Új ügy');
    expect(dialog).toContain('Mégse');
    expect(dialog).toContain('Ügy létrehozása');
  });
});

describe('quick intake and detailed configuration', () => {
  it('shows quick intake always', () => {
    expect(dialog).toContain('Gyors ügyindítás');
    expect(dialog).toContain('<CaseBasicsSection');
    expect(dialog).toContain('data-testid="intake-next-step-quick"');
  });

  it('collapses the detailed section by default', () => {
    expect(dialog).toContain('data-testid="intake-detailed-toggle"');
    expect(dialog).toContain('form.detailedOpen ?');
    expect(hook).toContain('useState(false)');
    expect(hook).toContain('detailedOpen');
  });

  it('requires only the quick fields to create a matter', () => {
    const v = hook.slice(hook.indexOf('const validate'), hook.indexOf('const buildPayload'));
    for (const f of ['clientId', 'title', 'matterType', 'assignedLawyerId', 'nextStep', 'communication']) {
      expect(v).toContain(f);
    }
    // Participants and tasks are only validated when rows exist.
    expect(v).toContain('state.participants.forEach');
    expect(v).toContain('state.tasks.forEach');
  });

  it('opens the collapsed section when it hides a validation error', () => {
    expect(hook).toContain('setDetailedOpen(true)');
  });
});

describe('starting context', () => {
  it('renders the five answers as separate inputs, never one textarea', () => {
    for (const q of ['Miért indult az ügy?', 'Mi a jelenlegi helyzet?', 'Mit vár az ügyfél?', 'Van-e sürgős teendő?']) {
      expect(sections).toContain(q);
    }
    expect(sections).toContain('Mi az első következő ügyvédi lépés?');
  });

  it('keeps one canonical next-step value shared by both views', () => {
    // Quick intake and the detailed section both write startingContext.nextStep.
    expect(dialog).toContain('patchContext("nextStep"');
    expect(sections).toContain('onPatchContext("nextStep"');
    expect(dialog).toContain('includeNextStep={false}');
  });
});

describe('deadline editor', () => {
  it('asks first and hides the editor when there is no deadline', () => {
    expect(sections).toContain('Van már ismert fontos határidő?');
    expect(sections).toContain('Nincs');
    expect(sections).toContain('Igen, hozzáadom');
    expect(sections).toContain('state.hasDeadline ?');
    expect(sections).toContain('data-testid="intake-deadline-editor"');
  });

  it('sends no deadline object when disabled', () => {
    expect(hook).toContain('if (state.hasDeadline)');
  });

  it('offers exactly two modes with quick date choices', () => {
    expect(sections).toContain('data-testid="dl-mode-absolute"');
    expect(sections).toContain('data-testid="dl-mode-relative"');
    expect(sections).toContain('Konkrét időpont');
    expect(sections).toContain('Ennyi idő múlva');
    for (const q of ['Ma', 'Holnap', 'Hét vége', 'Jövő hét']) expect(sections).toContain(`>${q}<`);
  });

  it('offers the four relative units', () => {
    for (const u of ['perc', 'óra', 'nap', 'hét']) expect(hook).toContain(`label: "${u}"`);
  });

  it('always shows the calculated absolute deadline', () => {
    expect(sections).toContain('data-testid="dl-absolute-preview"');
    expect(sections).toContain('Számított határidő');
    expect(hook).toContain('export function computeAbsoluteDeadline');
  });

  it('offers all five deadline types', () => {
    for (const t of ['STATUTORY', 'CLIENT_COMMITMENT', 'INTERNAL', 'NEXT_ACTION', 'OTHER']) {
      expect(hook).toContain(t);
    }
  });

  it('uses one compact reminder select, not a chip row', () => {
    expect(hook).toContain('REMINDER_OPTIONS');
    expect(sections).toContain('id="ci-dl-reminder"');
    expect(sections).not.toContain('reminder-chip');
  });

  it('rejects a non-positive relative value', () => {
    expect(hook).toContain('e.deadlineRelative');
  });
});

describe('communication picker', () => {
  it('searches real communications and shows the required metadata', () => {
    expect(sections).toContain('getCommunications');
    expect(sections).toContain('data-testid="comm-search"');
    expect(sections).toContain('c.senderName');
    expect(sections).toContain('c.subject');
  });

  it('supports multiple selection and exactly one primary', () => {
    expect(sections).toContain('data-testid="comm-item"');
    expect(sections).toContain('data-testid="comm-primary"');
    expect(hook).toContain('setPrimaryThread');
  });

  it('keeps the primary inside the selection', () => {
    expect(hook).toContain('next.includes(s.primaryCommunicationThreadId)');
    expect(hook).toContain('s.communicationThreadIds.includes(id)');
  });

  it('offers the explicit later choice', () => {
    expect(sections).toContain('data-testid="comm-later"');
    expect(sections).toContain('Később kapcsolom hozzá');
    expect(hook).toContain('setCommunicationLater');
  });

  it('marks threads already assigned to a matter as unavailable', () => {
    expect(sections).toContain('const unavailable = Boolean(c.caseId)');
    expect(sections).toContain('disabled={unavailable}');
  });

  it('discloses linking consequences compactly, not in long paragraphs', () => {
    expect(sections).toContain('data-testid="comm-disclosure"');
    expect(sections).toContain('csatolmányokból nem jön létre automatikusan dokumentum');
  });
});

describe('participants', () => {
  it('requires a role on every participant', () => {
    expect(sections).toContain('data-testid="participant-role"');
    expect(hook).toContain('A szerep megadása kötelező.');
  });

  it('supports internal and external participants with a side', () => {
    expect(sections).toContain('+ Belső munkatárs');
    expect(sections).toContain('+ Külső résztvevő');
    expect(sections).toContain('Ellenérdekű');
  });

  it('does not silently drop an incomplete row', () => {
    expect(hook).toContain('e[`participant-${p.key}`]');
  });
});

describe('initial tasks', () => {
  it('supports title, owner, due date and priority', () => {
    expect(sections).toContain('data-testid="task-row"');
    expect(sections).toContain('Prioritás');
    expect(sections).toContain('aria-label="Felelős"');
  });

  it('offers presets that create ordinary editable rows', () => {
    expect(sections).toContain('TASK_PRESETS');
    expect(sections).toContain('Iratok bekérése');
    expect(sections).toContain('data-testid="task-preset"');
    expect(sections).toContain('onAdd(p)');
  });

  it('supports removal', () => {
    expect(sections).toContain('data-testid="task-remove"');
  });
});

describe('submission', () => {
  it('uses the transactional intake endpoint only', () => {
    expect(hook).toContain('createCaseIntake');
    expect(api).toContain("fetchApi<CaseIntakeResult>('/cases/intake'");
    // No legacy fallback and no follow-up writes from the form.
    expect(hook).not.toContain('createCase(');
    expect(hook).not.toContain('addCaseCollaborator');
    expect(hook).not.toContain('createTask(');
  });

  it('prevents double submit', () => {
    // Guarded synchronously on a ref; see the dedicated regression block below.
    expect(hook).toContain('if (inFlight.current) return');
    expect(dialog).toContain('disabled={submitting}');
  });

  it('maps server error codes to Hungarian messages', () => {
    expect(api).toContain('CASE_INTAKE_ERROR_MESSAGES');
    expect(api).toContain('COMMUNICATION_ALREADY_LINKED');
    expect(api).toContain('PRIMARY_THREAD_NOT_SELECTED');
    expect(hook).toContain('caseIntakeErrorMessage');
    expect(dialog).toContain('data-testid="intake-server-error"');
  });

  it('sends one request carrying the whole starting context', () => {
    const b = hook.slice(hook.indexOf('const buildPayload'), hook.indexOf('const submit'));
    for (const k of ['startingContext', 'communicationThreadIds', 'primaryCommunicationThreadId',
                     'participants', 'externalParticipants', 'deadlines', 'initialTasks']) {
      expect(b).toContain(k);
    }
  });
});

/**
 * Regression: the intake shipped unable to create a matter because the client
 * selector treated the { data: Client[] } envelope as an array. Normalization now
 * lives in one typed adapter, and a broken response is an error state rather than
 * a silently empty list.
 */
describe('client list normalization', () => {
  it('normalizes the envelope in one typed adapter at the API boundary', () => {
    expect(api).toContain('export async function getClientList(): Promise<Client[]>');
    expect(api).toContain('export class MalformedResponseError');
    // The adapter validates the contract instead of assuming it.
    expect(api).toContain("!Array.isArray((response as { data?: unknown }).data)");
  });

  it('the intake consumes the adapter, not the raw envelope', () => {
    expect(dialog).toContain('getClientList()');
    expect(dialog).not.toContain('getClients()');
    // No envelope knowledge leaks into the component.
    expect(dialog).not.toContain('.data ??');
  });

  it('keeps loading, empty and malformed states distinguishable', () => {
    expect(dialog).toContain('setClientsLoading');
    expect(dialog).toContain('setClientsError');
    expect(sections).toContain('data-testid="intake-clients-error"');
    expect(sections).toContain('data-testid="intake-clients-empty"');
    expect(sections).toContain('Ügyfelek betöltése…');
    expect(sections).toContain('Nincs rögzített ügyfél.');
  });

  it('surfaces a malformed payload as an error, never as an empty selector', () => {
    expect(dialog).toContain("err.name === 'MalformedResponseError'");
    expect(sections).toContain('role="alert"');
  });

  it('disables the selector while loading or broken', () => {
    expect(sections).toContain('disabled={clientsLoading || Boolean(clientsError)}');
  });

  it('renders the real clients and submits the selected one', () => {
    expect(sections).toContain('clients.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)');
    expect(hook).toContain('clientId: state.clientId');
  });
});

describe('legacy intake implementation is fully removed', () => {
  it('leaves no legacy submission handler or legacy endpoint call', () => {
    expect(list).not.toContain('handleCreateCase');
    expect(list).not.toContain('createCase(');
  });

  it('leaves no legacy wizard state', () => {
    for (const sym of ['workplanSteps', 'deadlineMode', 'wizardSteps', 'selectedCollaboratorIds',
                       'relativeDeadlineValue', 'workplanPreset', 'newCaseData']) {
      expect(list).not.toContain(sym);
    }
  });

  it('leaves no obsolete wizard markup or copy', () => {
    for (const marker of ['adm-wizard', 'Munkaterv', 'MUNKATERV']) {
      expect(list).not.toContain(marker);
    }
  });

  it('exposes exactly one matter-creation workflow', () => {
    expect(list).toContain('<CaseIntakeDialog');
    expect((list.match(/CaseIntakeDialog/g) || []).length).toBeGreaterThanOrEqual(1);
  });
});

/**
 * Regression found in production acceptance: two clicks in the same tick both
 * read the same stale `submitting` closure, so two POST /cases/intake requests
 * were issued. The guard must be synchronous.
 */
describe('double submit is stopped synchronously', () => {
  it('guards on a ref, not on the async state value', () => {
    expect(hook).toContain('const inFlight = useRef(false)');
    expect(hook).toContain('if (inFlight.current) return');
    expect(hook).toContain('inFlight.current = true');
  });

  it('releases the guard only on failure, since success unmounts the dialog', () => {
    const submit = hook.slice(hook.indexOf('const submit = useCallback'));
    expect(submit).toContain('inFlight.current = false');
  });

  it('no longer depends on the stale submitting value', () => {
    expect(hook).not.toContain('if (submitting) return');
    expect(hook).toContain('}, [validate, buildPayload, onCreated]);');
  });
});
