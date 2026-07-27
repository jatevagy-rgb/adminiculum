/**
 * Behavioural tests for the operational cockpit projection
 * (MATTER-OVERVIEW-COCKPIT-1). Exercises the real derivation with a fixed clock:
 * urgency, task grouping, deadline timeline, reply-needed and active documents.
 */
import { buildCockpit, type CockpitTaskInput } from '../src/modules/cases/workspaceCockpit';

const NOW = new Date('2026-07-24T12:00:00.000Z');
const at = (iso: string) => new Date(iso);

function task(over: Partial<CockpitTaskInput> = {}): CockpitTaskInput {
  return {
    id: 't1', title: 'Feladat', status: 'TODO', priority: 'MEDIUM',
    dueDate: null, documentId: null, assignedTo: null, ...over,
  };
}

function build(over: Partial<Parameters<typeof buildCockpit>[0]> = {}) {
  return buildCockpit({
    caseRecord: { id: 'case-1', deadline: null, assignedLawyer: null },
    openTasks: [], documents: [], communications: [],
    communicationCount: 0, reviewCount: 0, documentLimit: 8, now: NOW,
    ...over,
  });
}

describe('urgency', () => {
  it('is STEADY with nothing pressing', () => {
    expect(build().urgency).toBe('STEADY');
  });

  it('is ATTENTION when something is urgent or due today', () => {
    expect(build({ openTasks: [task({ priority: 'URGENT' })] }).urgency).toBe('ATTENTION');
    expect(build({ openTasks: [task({ dueDate: at('2026-07-24T16:00:00.000Z') })] }).urgency).toBe('ATTENTION');
  });

  it('is CRITICAL when something is already overdue', () => {
    expect(build({ openTasks: [task({ dueDate: at('2026-07-20T09:00:00.000Z') })] }).urgency).toBe('CRITICAL');
  });

  it('is ATTENTION when a message awaits a reply', () => {
    const c = build({ communications: [{ id: 'c1', direction: 'INBOUND', createdAt: at('2026-07-24T08:00:00.000Z') }], communicationCount: 1 });
    expect(c.urgency).toBe('ATTENTION');
  });
});

describe('task grouping', () => {
  it('puts overdue and urgent work in immediate, today separately, rest later', () => {
    const c = build({
      openTasks: [
        task({ id: 'overdue', dueDate: at('2026-07-20T09:00:00.000Z') }),
        task({ id: 'urgent', priority: 'URGENT' }),
        task({ id: 'today', dueDate: at('2026-07-24T18:00:00.000Z') }),
        task({ id: 'next-week', dueDate: at('2026-08-05T09:00:00.000Z') }),
        task({ id: 'undated' }),
      ],
    });
    expect(c.taskGroups.immediate.sort()).toEqual(['overdue', 'urgent']);
    expect(c.taskGroups.today).toEqual(['today']);
    expect(c.taskGroups.later.sort()).toEqual(['next-week', 'undated']);
  });

  it('never places a task in more than one group', () => {
    const c = build({ openTasks: [task({ id: 'a', priority: 'HIGH', dueDate: at('2026-07-24T18:00:00.000Z') })] });
    const all = [...c.taskGroups.immediate, ...c.taskGroups.today, ...c.taskGroups.later];
    expect(all).toEqual(['a']);
    expect(new Set(all).size).toBe(all.length);
  });
});

describe('deadline timeline', () => {
  it('groups into today / tomorrow / this week / later', () => {
    const c = build({
      openTasks: [
        task({ id: 'a', title: 'Ma', dueDate: at('2026-07-24T15:00:00.000Z') }),
        task({ id: 'b', title: 'Holnap', dueDate: at('2026-07-25T10:00:00.000Z') }),
        task({ id: 'c', title: 'Héten', dueDate: at('2026-07-28T10:00:00.000Z') }),
        task({ id: 'd', title: 'Később', dueDate: at('2026-09-01T10:00:00.000Z') }),
      ],
    });
    expect(c.deadlineGroups.today.map((d) => d.title)).toEqual(['Ma']);
    expect(c.deadlineGroups.tomorrow.map((d) => d.title)).toEqual(['Holnap']);
    expect(c.deadlineGroups.thisWeek.map((d) => d.title)).toEqual(['Héten']);
    expect(c.deadlineGroups.later.map((d) => d.title)).toEqual(['Később']);
  });

  it('surfaces overdue deadlines in today rather than parking them in the past', () => {
    const c = build({ openTasks: [task({ id: 'x', title: 'Lejárt', dueDate: at('2026-07-01T10:00:00.000Z') })] });
    expect(c.deadlineGroups.today.map((d) => d.title)).toEqual(['Lejárt']);
    expect(c.deadlineGroups.today[0].overdue).toBe(true);
    expect(c.deadlineGroups.later).toEqual([]);
  });

  it('distinguishes the matter deadline from task deadlines', () => {
    const c = build({
      caseRecord: { id: 'case-1', deadline: at('2026-07-26T10:00:00.000Z'), assignedLawyer: { id: 'u1', name: 'dr. Teszt' } },
      openTasks: [task({ id: 't', title: 'Feladat', dueDate: at('2026-07-25T10:00:00.000Z') })],
    });
    const all = [...c.deadlineGroups.today, ...c.deadlineGroups.tomorrow, ...c.deadlineGroups.thisWeek, ...c.deadlineGroups.later];
    expect(all.find((d) => d.source === 'MATTER')?.title).toBe('Ügyhatáridő');
    expect(all.find((d) => d.source === 'TASK')?.title).toBe('Feladat');
    expect(all.find((d) => d.source === 'MATTER')?.deadlineType).toBe('MATTER_DEADLINE');
  });

  it('reports the nearest deadline as the KPI value', () => {
    const c = build({
      openTasks: [
        task({ id: 'far', dueDate: at('2026-08-30T10:00:00.000Z') }),
        task({ id: 'near', dueDate: at('2026-07-25T10:00:00.000Z') }),
      ],
    });
    expect(c.kpi.deadlines.nextDueAt).toBe('2026-07-25T10:00:00.000Z');
    expect(c.kpi.deadlines.count).toBe(2);
  });
});

describe('reply-needed communication', () => {
  it('counts inbound messages newer than the latest outbound', () => {
    const c = build({
      communications: [
        { id: 'in-old', direction: 'INBOUND', createdAt: at('2026-07-20T09:00:00.000Z') },
        { id: 'out', direction: 'OUTBOUND', createdAt: at('2026-07-21T09:00:00.000Z') },
        { id: 'in-new', direction: 'INBOUND', createdAt: at('2026-07-23T09:00:00.000Z') },
      ],
      communicationCount: 3,
    });
    expect(c.replyNeeded).toEqual(['in-new']);
    expect(c.kpi.communication.replyNeededCount).toBe(1);
    expect(c.kpi.communication.secondary).toBe('1 válaszra vár');
  });

  it('reports nothing outstanding when the last word was ours', () => {
    const c = build({
      communications: [
        { id: 'in', direction: 'INBOUND', createdAt: at('2026-07-20T09:00:00.000Z') },
        { id: 'out', direction: 'OUTBOUND', createdAt: at('2026-07-22T09:00:00.000Z') },
      ],
      communicationCount: 2,
    });
    expect(c.replyNeeded).toEqual([]);
    expect(c.kpi.communication.secondary).toBe('Nincs nyitott válasz');
  });
});

describe('active documents are operationally selected, not dumped', () => {
  it('includes only documents linked to open work, with a reason', () => {
    const c = build({
      openTasks: [
        task({ id: 't1', documentId: 'd-review', status: 'IN_REVIEW' }),
        task({ id: 't2', documentId: 'd-late', dueDate: at('2026-07-01T09:00:00.000Z') }),
        task({ id: 't3', documentId: 'd-progress' }),
      ],
      documents: [
        { id: 'd-review', fileName: 'review.docx' },
        { id: 'd-late', fileName: 'late.docx' },
        { id: 'd-progress', fileName: 'progress.docx' },
        { id: 'd-idle', fileName: 'idle.docx' },
      ],
    });
    const byId = Object.fromEntries(c.activeDocuments.map((d) => [d.id, d.reason]));
    expect(byId['d-review']).toBe('REVIEW_PENDING');
    expect(byId['d-late']).toBe('DEADLINE_PASSED');
    expect(byId['d-progress']).toBe('IN_PROGRESS');
    // A document with no open work attached is not operationally relevant.
    expect(byId['d-idle']).toBeUndefined();
    expect(c.kpi.activeDocuments.count).toBe(3);
  });

  it('surfaces documents whose own work context is active even without a task link', () => {
    const c = build({
      documents: [
        { id: 'd-review', fileName: 'internal-review.docx', workStatus: 'INTERNAL_REVIEW' },
        { id: 'd-owner', fileName: 'partial-context.docx', workStatus: 'RECEIVED', responsibleId: 'u1' },
        { id: 'd-empty', fileName: 'received.docx', workStatus: 'RECEIVED' },
      ],
    });
    const byId = Object.fromEntries(c.activeDocuments.map((d) => [d.id, d.reason]));
    expect(byId['d-review']).toBe('REVIEW_PENDING');
    expect(byId['d-owner']).toBe('IN_PROGRESS');
    expect(byId['d-empty']).toBeUndefined();
    expect(c.kpi.activeDocuments.count).toBe(2);
  });

  it('bounds the active document list', () => {
    const tasks = Array.from({ length: 20 }, (_, i) => task({ id: `t${i}`, documentId: `d${i}` }));
    const docs = Array.from({ length: 20 }, (_, i) => ({ id: `d${i}`, fileName: `f${i}.docx` }));
    const c = build({ openTasks: tasks, documents: docs, documentLimit: 8 });
    expect(c.activeDocuments.length).toBeLessThanOrEqual(8);
  });
});

describe('next step', () => {
  it('prefers the most pressing task', () => {
    const c = build({
      openTasks: [
        task({ id: 'later', title: 'Később', dueDate: at('2026-08-10T09:00:00.000Z') }),
        task({ id: 'overdue', title: 'Lejárt teendő', dueDate: at('2026-07-10T09:00:00.000Z') }),
      ],
    });
    expect(c.nextStep).toMatchObject({ label: 'Lejárt teendő', source: 'TASK', objectId: 'overdue' });
  });

  it('falls back to answering communication when there is no task', () => {
    const c = build({
      communications: [{ id: 'c1', direction: 'INBOUND', createdAt: at('2026-07-23T09:00:00.000Z') }],
      communicationCount: 1,
    });
    expect(c.nextStep).toMatchObject({ source: 'COMMUNICATION', objectId: 'c1' });
  });

  it('is null when there is genuinely nothing to do', () => {
    expect(build().nextStep).toBeNull();
  });
});

describe('KPI secondary lines carry operational meaning, never bare counts', () => {
  it('describes urgency and emptiness in words', () => {
    const busy = build({ openTasks: [task({ priority: 'URGENT' })] });
    expect(busy.kpi.openTasks.secondary).toBe('1 sürgős');

    const empty = build();
    expect(empty.kpi.openTasks.secondary).toBe('Nincs nyitott feladat');
    expect(empty.kpi.deadlines.secondary).toBe('Nincs határidő');
    expect(empty.kpi.communication.secondary).toBe('Nincs kommunikáció');
    expect(empty.kpi.review.secondary).toBe('Nincs review tétel');
    expect(empty.kpi.activeDocuments.secondary).toBe('Nincs aktív dokumentum');
  });

  it('flags overdue deadlines in the deadline KPI', () => {
    const c = build({ openTasks: [task({ dueDate: at('2026-07-01T09:00:00.000Z') })] });
    expect(c.kpi.deadlines.secondary).toBe('1 lejárt');
  });

  it('reports review items', () => {
    expect(build({ reviewCount: 2 }).kpi.review).toMatchObject({ count: 2, secondary: 'Review-ra vár' });
  });
});

describe('shape safety', () => {
  it('exposes only ids in the grouping arrays, not embedded records', () => {
    const c = build({ openTasks: [task({ id: 'a', priority: 'URGENT' })] });
    expect(c.taskGroups.immediate).toEqual(['a']);
    expect(typeof c.taskGroups.immediate[0]).toBe('string');
  });

  it('carries no message bodies or contents in the cockpit payload', () => {
    const c = build({
      communications: [{ id: 'c1', direction: 'INBOUND', createdAt: at('2026-07-23T09:00:00.000Z') }],
      communicationCount: 1,
    });
    const payload = JSON.stringify(c);
    expect(payload).not.toMatch(/content|body|senderEmail/i);
  });
});
