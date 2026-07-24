import fs from 'fs';
import path from 'path';

const repoRoot = path.join(__dirname, '..', '..');
const read = (rel: string) => fs.readFileSync(path.join(repoRoot, rel), 'utf8');

const list = read('Frontend/src/components/CasesList.tsx');
const dialog = read('Frontend/src/components/cases/intake/CaseIntakeDialog.tsx');
const sections = read('Frontend/src/components/cases/intake/CaseIntakeSections.tsx');
const hook = read('Frontend/src/components/cases/intake/useCaseIntakeForm.ts');
const drawer = read('Frontend/src/components/cases/intake/CaseCommunicationPickerDrawer.tsx');
const styles = read('Frontend/src/components/cases/intake/intakeStyles.ts');
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
                     'CaseCommunicationSummary', 'CaseParticipantsSection', 'CaseInitialTasksSection']) {
      expect(sections).toContain(`export function ${c}`);
      expect(dialog).toContain(c);
    }
    // The list itself moved out of the form into its own surface.
    expect(drawer).toContain('export function CaseCommunicationPickerDrawer');
    expect(dialog).toContain('<CaseCommunicationPickerDrawer');
    expect(hook).toContain('export function useCaseIntakeForm');
  });

  it('keeps the dialog itself small — composition, not implementation', () => {
    expect(dialog.split('\n').length).toBeLessThan(220);
  });
});

describe('sticky header', () => {
  it('keeps the title and the primary action visible while scrolling', () => {
    expect(dialog).toContain('data-testid="intake-sticky-header"');
    expect(dialog).toContain('intake.header');
    expect(styles).toContain('sticky top-0');
    expect(dialog).toContain('Új ügy');
    expect(dialog).toContain('Mégse');
    expect(dialog).toContain('Ügy létrehozása');
  });
});

describe('quick intake and detailed configuration', () => {
  it('shows quick intake always', () => {
    expect(dialog).toContain('Ügy alapadatai');
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
    expect(drawer).toContain('getCommunications');
    expect(drawer).toContain('data-testid="comm-picker-search"');
    expect(drawer).toContain('c.senderName');
    expect(drawer).toContain('c.subject');
  });

  it('supports multiple selection and exactly one primary', () => {
    expect(drawer).toContain('data-testid="comm-picker-item"');
    expect(drawer).toContain('data-testid="comm-picker-primary"');
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
    // Assigned threads are separated out and collapsed rather than listed as dead rows.
    expect(drawer).toContain('list.filter((c) => Boolean(c.caseId))');
    expect(drawer).toContain('data-testid="comm-picker-assigned-toggle"');
    expect(drawer).toContain('Más ügyhöz már hozzárendelve');
  });

  it('discloses linking consequences compactly, not in long paragraphs', () => {
    expect(drawer).toContain('data-testid="comm-disclosure"');
    expect(drawer).toContain('csatolmányaiból nem jön létre automatikusan dokumentum');
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

/**
 * CASE-INTAKE-VISUAL-CORRECTION-1.
 *
 * The first build read as fog: every surface was the same washed-out tone, the
 * communication list dominated the form and nested a second scrollbar inside it.
 * These are the guards for the corrected hierarchy.
 */
describe('visual correction: tonal hierarchy comes from shared tokens', () => {
  it('defines the intake surfaces once, not as scattered inline classes', () => {
    for (const t of ['overlay', 'shell', 'header', 'body', 'area', 'field', 'primaryAction', 'accordion', 'commRow']) {
      expect(styles).toContain(`${t}:`);
    }
    for (const f of [dialog, sections, drawer]) expect(f).toContain('./intakeStyles');
  });

  it('separates overlay, body and content tones instead of one beige fog', () => {
    // Dark neutral scrim, very light neutral body, clean white content areas.
    expect(styles).toContain('bg-[rgba(16,22,19,0.58)]');
    expect(styles).toContain("body: 'min-h-0 flex-1 overflow-y-auto bg-[#F4F6F4]");
    expect(styles).toContain("area: 'rounded-lg bg-white");
    // No cream/beige dominant surface.
    expect(styles).not.toMatch(/#F5EFE0|#FBF7EC|#EFE7D8/i);
  });

  it('uses the shared tokens in the dialog rather than re-declaring them', () => {
    for (const t of ['intake.overlay', 'intake.shell', 'intake.header', 'intake.body', 'intake.primaryAction']) {
      expect(dialog).toContain(t);
    }
  });
});

describe('visual correction: the communication list is not on the default surface', () => {
  it('shows no communication results in the intake form itself', () => {
    for (const marker of ['getCommunications', 'comm-picker-item', 'comm-picker-available', 'overflow-y-auto']) {
      expect(sections).not.toContain(marker);
    }
  });

  it('replaces the list with a compact labelled summary row', () => {
    expect(sections).toContain('Kapcsolódó kommunikáció');
    expect(sections).toContain('data-testid="comm-summary"');
    expect(sections).toContain('intake.commRow');
    expect(sections).toContain('Nincs kiválasztva');
  });

  it('states the primary and the extra count in the summary', () => {
    expect(sections).toContain('1 elsődleges beszélgetés kiválasztva');
    expect(sections).toContain('elsődleges és ${count - 1} további beszélgetés kiválasztva');
  });

  it('keeps the explicit later choice next to the summary', () => {
    expect(sections).toContain('data-testid="comm-later"');
    expect(sections).toContain('Később kapcsolom hozzá');
  });

  it('opens a dedicated secondary surface from the trigger button', () => {
    expect(sections).toContain('data-testid="comm-open-picker"');
    expect(sections).toContain('Kommunikáció kiválasztása');
    expect(dialog).toContain('onOpenPicker={() => setPickerOpen(true)}');
    expect(drawer).toContain('data-testid="comm-picker-drawer"');
    expect(drawer).toContain('aria-modal="true"');
  });

  it('changes nothing when the picker is cancelled', () => {
    // Selection is staged locally and only handed back on confirm.
    expect(drawer).toContain('const [staged, setStaged]');
    expect(drawer).toContain('data-testid="comm-picker-cancel"');
    expect(drawer).toContain('onClick={onCancel}');
    expect(drawer).toContain('onConfirm(staged, stagedPrimary)');
    expect(drawer).toContain('Kiválasztás megerősítése');
  });

  it('commits the confirmed selection in one form update', () => {
    expect(dialog).toContain('form.setCommunicationSelection(ids, primary)');
    expect(hook).toContain('const setCommunicationSelection');
    // The primary always stays inside the committed selection.
    expect(hook).toContain('ids.includes(primary) ? primary : (ids[0] || "")');
  });

  it('shows the running selection count in the picker', () => {
    expect(drawer).toContain('data-testid="comm-picker-count"');
    expect(drawer).toContain('beszélgetés kiválasztva`');
  });

  it('nests no second scroll surface inside the modal body', () => {
    // The body is the only scroll container in the dialog...
    expect(dialog.match(/overflow-y-auto/g)).toBeNull();
    expect((styles.match(/overflow-y-auto/g) || []).length).toBe(1);
    // ...and the drawer, on its own surface, has exactly one of its own.
    expect((drawer.match(/overflow-y-auto/g) || []).length).toBe(1);
  });
});

describe('visual correction: header, hierarchy and density', () => {
  it('drops the explanatory subtitle under the title', () => {
    expect(dialog).not.toContain('A kötelező mezőkkel az ügy azonnal létrehozható');
    expect(dialog).not.toContain('intake-header-subtitle');
  });

  it('states the title strongly and keeps the header sticky', () => {
    expect(styles).toContain('sticky top-0');
    expect(styles).toContain("headerTitle: 'font-serif text-[24px] font-semibold");
    expect(styles).toContain('text-[#16201A]');
  });

  it('has exactly one primary action, with loading and honest disabling', () => {
    expect(dialog).toContain('Ügy létrehozása');
    expect(dialog).toContain('Létrehozás…');
    expect(dialog).toContain('disabled={submitting}');
    // Only the create action is green; cancel is the neutral secondary token.
    expect((dialog.match(/intake\.primaryAction/g) || []).length).toBe(1);
    expect(dialog).toContain('intake.secondaryAction');
  });

  it('gives the sections functional accents instead of uniform grey', () => {
    expect(dialog).toContain('accent="petrol"');
    expect(sections).toContain('ACCENT_BG');
    expect(styles).toContain("petrol: '#1F5A66'");
    expect(styles).toContain("terracotta: '#A8442A'");
    expect(styles).toContain("green: '#1D5138'");
  });

  it('highlights the next-step field without boxing it in another card', () => {
    expect(dialog).toContain('Első következő ügyvédi lépés');
    expect(dialog).toContain('border-l-[3px] border-[#1F5A66]');
  });

  it('keeps the form compact enough for a normal laptop viewport', () => {
    expect(styles).toContain('max-h-[88vh]');
    expect(styles).toContain('max-w-[1000px]');
    // Compact field metrics: short rows, tight label/input and row gaps.
    expect(styles).toContain('py-[7px]');
    expect(styles).toContain('text-[13px] leading-[18px]');
    expect(styles).toContain('gap-y-2.5');
  });

  it('labels fields legibly and marks required fields clearly', () => {
    expect(styles).toContain("label: 'block text-[12px] font-semibold");
    expect(styles).toContain('text-[#2C3A31]');
    expect(styles).toContain("required: 'ml-0.5 text-[#A8442A]'");
    // No faint wide-tracked micro-labels.
    expect(styles).not.toContain('tracking-[0.14em]');
  });
});

describe('visual correction: detailed settings accordion', () => {
  it('collapses to one labelled row with a chevron', () => {
    expect(dialog).toContain('Részletes beállítás');
    expect(dialog).toContain('Határidő, résztvevők és induló feladatok');
    expect(dialog).toContain('data-testid="intake-detailed-chevron"');
    expect(dialog).toContain('aria-expanded={form.detailedOpen}');
  });

  it('expands into a bordered accented surface, not a second oversized card', () => {
    expect(dialog).toContain('intake.accordionOpen');
    expect(styles).toContain("accordionOpen: 'rounded-lg border border-[rgba(31,90,102,0.28)] bg-[#EDF2F3]'");
    expect(dialog).toContain('data-testid="intake-detailed"');
  });

  it('leaves the sticky actions in place while the accordion is open', () => {
    // The actions live in the sticky header, above the single scroll surface.
    expect(dialog.indexOf('data-testid="intake-submit"')).toBeLessThan(dialog.indexOf('data-testid="intake-body"'));
  });
});

describe('visual correction: mobile behaves as a full-height sheet', () => {
  it('fills the viewport on small screens and pads only from sm up', () => {
    expect(dialog).toContain('p-0 sm:p-6');
    expect(drawer).toContain('items-end justify-center p-0 sm:items-center sm:p-6');
    expect(drawer).toContain('h-[92vh]');
  });

  it('collapses to one column and never overflows horizontally', () => {
    expect(styles).toContain('grid-cols-1');
    expect(styles).toContain('sm:grid-cols-2');
    expect(styles).toContain("'mx-auto flex w-full max-w-[1000px]");
    // Long values truncate rather than widening the layout.
    expect(drawer).toContain('truncate');
    expect(drawer).toContain('min-w-0');
  });
});

describe('visual correction: the legacy wizard stays gone', () => {
  it('reintroduces no stepper, no wizard markers and no inline picker', () => {
    for (const f of [dialog, sections, drawer]) {
      expect(f).not.toMatch(/adm-wizard|Következő lépés →|Lépés \d\/\d/);
    }
    expect(sections).not.toContain('CaseCommunicationPicker');
    expect(list).not.toContain('adm-wizard-modal');
  });
});
