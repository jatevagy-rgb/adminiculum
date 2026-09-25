/**
 * Behavioural tests for the modification-proposal service lifecycle against a
 * mocked Prisma client: create validation, idempotency, terminal decisions,
 * withdrawal, completion projection and the exactly-once correction handoff.
 *
 * Concurrency itself is exercised by the PostgreSQL integration suite; these
 * tests pin the deterministic lifecycle semantics.
 */
import { DocumentModificationProposalError } from '../src/modules/documents/modificationProposals.service';

const DOC = 'doc-1';
const VER = 'ver-1';
const OWNER = 'owner-1';

interface StoredProposal {
  [key: string]: any;
  id: string;
  documentId: string;
  documentVersionId: string;
  status: 'PENDING' | 'ACCEPTED' | 'REJECTED';
}

const state: {
  proposals: StoredProposal[];
  correctionNotifiedAt: Date | null;
  events: any[];
  timeline: any[];
  notifications: any[];
  version: any;
} = {
  proposals: [],
  correctionNotifiedAt: null,
  events: [],
  timeline: [],
  notifications: [],
  version: null,
};

let proposalCounter = 0;

function buildVersion() {
  return {
    id: VER,
    version: 4,
    correctionNotifiedAt: state.correctionNotifiedAt,
    document: {
      id: DOC,
      caseId: 'case-1',
      responsibleId: OWNER,
      reviewerId: 'reviewer-1',
      title: 'Teszt szerződés',
      name: 'teszt.docx',
      fileName: 'teszt.docx',
      case: { assignedLawyerId: 'lawyer-1', createdById: 'creator-1' },
    },
  };
}

function matchWhere(row: StoredProposal, where: Record<string, any>): boolean {
  return Object.entries(where).every(([key, value]) => row[key] === value);
}

function makeTx() {
  return {
    $queryRaw: jest.fn(async () => []),
    documentVersion: {
      findFirst: jest.fn(async () => state.version),
      update: jest.fn(async ({ data }: any) => {
        if (Object.prototype.hasOwnProperty.call(data, 'correctionNotifiedAt')) {
          state.correctionNotifiedAt = data.correctionNotifiedAt;
          state.version.correctionNotifiedAt = data.correctionNotifiedAt;
        }
        return state.version;
      }),
    },
    documentModificationProposal: {
      findFirst: jest.fn(async ({ where }: any) => state.proposals.find((p) => matchWhere(p, where)) ?? null),
      findMany: jest.fn(async ({ where }: any) =>
        state.proposals.filter((p) => matchWhere(p, where))
      ),
      create: jest.fn(async ({ data }: any) => {
        const row: StoredProposal = {
          ...data,
          id: `proposal-${++proposalCounter}`,
          status: 'PENDING',
          decisionReason: null,
          decidedById: null,
          decidedAt: null,
          deletedAt: null,
          deletedById: null,
          createdAt: new Date(),
          updatedAt: new Date(),
          createdBy: { id: data.createdById, name: 'Author', email: 'author@example.invalid' },
          decidedBy: null,
        };
        state.proposals.push(row);
        return row;
      }),
      update: jest.fn(async ({ where, data }: any) => {
        const row = state.proposals.find((p) => p.id === where.id) as StoredProposal;
        Object.assign(row, data, { updatedAt: new Date() });
        if (row.decidedById) {
          row.decidedBy = { id: row.decidedById, name: 'Decider', email: 'decider@example.invalid' };
        }
        return row;
      }),
    },
    documentModificationProposalEvent: {
      create: jest.fn(async ({ data }: any) => {
        state.events.push(data);
        return data;
      }),
    },
    timelineEvent: {
      create: jest.fn(async ({ data }: any) => {
        state.timeline.push(data);
        return data;
      }),
    },
    notification: {
      create: jest.fn(async ({ data }: any) => {
        state.notifications.push(data);
        return data;
      }),
    },
  };
}

const prismaMock: any = {
  $transaction: jest.fn(async (arg: any, _opts?: any) =>
    typeof arg === 'function' ? arg(makeTx()) : Promise.all(arg)
  ),
};

jest.mock('../src/prisma/prisma.service', () => ({ prisma: prismaMock }));

import {
  acceptModificationProposal,
  createModificationProposal,
  rejectModificationProposal,
  withdrawModificationProposal,
} from '../src/modules/documents/modificationProposals.service';

beforeEach(() => {
  jest.clearAllMocks();
  proposalCounter = 0;
  state.proposals = [];
  state.events = [];
  state.timeline = [];
  state.notifications = [];
  state.correctionNotifiedAt = null;
  state.version = buildVersion();
});

const validCreate = {
  selectedText: 'három hónap',
  startOffset: 10,
  endOffset: 21,
  proposedText: 'négy hónap',
};

describe('createModificationProposal validation', () => {
  it('creates a PENDING proposal and emits PROPOSAL_CREATED', async () => {
    const dto = await createModificationProposal(DOC, VER, 'reader-1', validCreate);
    expect(dto.status).toBe('PENDING');
    expect(dto.selectedText).toBe('három hónap');
    expect(state.events.map((e) => e.eventType)).toEqual(['PROPOSAL_CREATED']);
  });

  it('allows a case-only change', async () => {
    const dto = await createModificationProposal(DOC, VER, 'reader-1', {
      selectedText: 'Megrendelő',
      startOffset: 0,
      endOffset: 10,
      proposedText: 'megrendelő',
    });
    expect(dto.status).toBe('PENDING');
  });

  it('rejects a whitespace-only change as PROPOSED_TEXT_UNCHANGED', async () => {
    await expect(
      createModificationProposal(DOC, VER, 'reader-1', {
        selectedText: '  három   hónap ',
        startOffset: 0,
        endOffset: 16,
        proposedText: 'három hónap',
      })
    ).rejects.toMatchObject({ code: 'PROPOSED_TEXT_UNCHANGED', status: 400 });
    expect(state.proposals).toHaveLength(0);
  });

  it('requires proposedText', async () => {
    await expect(
      createModificationProposal(DOC, VER, 'reader-1', { ...validCreate, proposedText: '   ' })
    ).rejects.toMatchObject({ code: 'PROPOSED_TEXT_REQUIRED' });
  });

  it('requires offsets', async () => {
    await expect(
      createModificationProposal(DOC, VER, 'reader-1', {
        selectedText: 'x',
        proposedText: 'y',
      })
    ).rejects.toMatchObject({ code: 'INVALID_TEXT_RANGE' });
  });

  it('rejects an invalid offset range', async () => {
    await expect(
      createModificationProposal(DOC, VER, 'reader-1', {
        selectedText: 'x',
        startOffset: 5,
        endOffset: 5,
        proposedText: 'y',
      })
    ).rejects.toMatchObject({ code: 'INVALID_TEXT_RANGE' });
  });

  it('resets the completion-cycle marker for a genuinely new proposal', async () => {
    state.correctionNotifiedAt = new Date('2026-01-01T00:00:00Z');
    state.version.correctionNotifiedAt = state.correctionNotifiedAt;
    await createModificationProposal(DOC, VER, 'reader-1', validCreate);
    expect(state.correctionNotifiedAt).toBeNull();
  });
});

describe('createModificationProposal idempotency', () => {
  it('returns the existing operation on retry and does NOT reset the marker', async () => {
    const marker = new Date('2026-01-01T00:00:00Z');
    const first = await createModificationProposal(DOC, VER, 'reader-1', {
      ...validCreate,
      idempotencyKey: 'retry-key',
    });
    state.correctionNotifiedAt = marker;
    state.version.correctionNotifiedAt = marker;

    const second = await createModificationProposal(DOC, VER, 'reader-1', {
      ...validCreate,
      idempotencyKey: 'retry-key',
    });
    expect(second.id).toBe(first.id);
    expect(state.proposals).toHaveLength(1);
    expect(state.correctionNotifiedAt).toBe(marker);
  });

  it('returns 409 when the key belongs to a withdrawn proposal', async () => {
    const created = await createModificationProposal(DOC, VER, 'reader-1', {
      ...validCreate,
      idempotencyKey: 'withdrawn-key',
    });
    await withdrawModificationProposal(DOC, VER, created.id, { id: 'reader-1', role: 'TRAINEE' });

    await expect(
      createModificationProposal(DOC, VER, 'reader-1', {
        ...validCreate,
        idempotencyKey: 'withdrawn-key',
      })
    ).rejects.toMatchObject({ code: 'PROPOSAL_IDEMPOTENCY_CONFLICT', status: 409 });
  });
});

describe('acceptModificationProposal', () => {
  it('accepts a pending proposal and completes the cycle exactly once', async () => {
    const created = await createModificationProposal(DOC, VER, 'reader-1', validCreate);
    state.version.document.reviewerId = 'lawyer-1';

    const accepted = await acceptModificationProposal(DOC, VER, created.id, {
      id: 'lawyer-1',
      role: 'LAWYER',
    });
    expect(accepted.status).toBe('ACCEPTED');
    expect(state.events.map((e) => e.eventType)).toEqual(['PROPOSAL_CREATED', 'PROPOSAL_ACCEPTED']);
    expect(state.timeline).toHaveLength(1);
    expect(state.timeline[0]).toMatchObject({ eventType: 'CUSTOM', type: 'DOCUMENT_READY_FOR_CORRECTION' });
    expect(state.timeline[0].metadata.responsibleId).toBe(OWNER);
    expect(state.notifications).toHaveLength(1);
    expect(state.notifications[0]).toMatchObject({ userId: OWNER, type: 'SYSTEM', title: 'Dokumentum kész a javításra' });
    expect(state.notifications[0].link).toBe(`/cases/case-1/documents?documentId=${DOC}&versionId=${VER}`);
    expect(state.correctionNotifiedAt).not.toBeNull();
  });

  it('is idempotent when already accepted (no duplicate event)', async () => {
    const created = await createModificationProposal(DOC, VER, 'reader-1', validCreate);
    state.version.document.reviewerId = 'lawyer-1';
    await acceptModificationProposal(DOC, VER, created.id, { id: 'lawyer-1', role: 'LAWYER' });
    const eventsAfterFirst = state.events.length;

    const again = await acceptModificationProposal(DOC, VER, created.id, { id: 'lawyer-1', role: 'LAWYER' });
    expect(again.status).toBe('ACCEPTED');
    expect(state.events).toHaveLength(eventsAfterFirst);
  });

  it('returns 409 when the proposal is already rejected', async () => {
    const created = await createModificationProposal(DOC, VER, 'reader-1', validCreate);
    state.version.document.reviewerId = 'lawyer-1';
    await rejectModificationProposal(DOC, VER, created.id, { id: 'lawyer-1', role: 'LAWYER' }, 'nem jó');

    await expect(
      acceptModificationProposal(DOC, VER, created.id, { id: 'lawyer-1', role: 'LAWYER' })
    ).rejects.toMatchObject({ code: 'PROPOSAL_ALREADY_DECIDED', status: 409 });
  });

  it('forbids a TRAINEE from deciding', async () => {
    const created = await createModificationProposal(DOC, VER, 'reader-1', validCreate);
    state.version.document.reviewerId = 'trainee-1';

    await expect(
      acceptModificationProposal(DOC, VER, created.id, { id: 'trainee-1', role: 'TRAINEE' })
    ).rejects.toMatchObject({ code: 'PROPOSAL_DECISION_FORBIDDEN', status: 403 });
    expect(state.events.map((e) => e.eventType)).toEqual(['PROPOSAL_CREATED']);
  });
});

describe('rejectModificationProposal', () => {
  beforeEach(() => {
    state.version.document.reviewerId = 'lawyer-1';
  });

  it('requires a rejection reason', async () => {
    const created = await createModificationProposal(DOC, VER, 'reader-1', validCreate);
    await expect(
      rejectModificationProposal(DOC, VER, created.id, { id: 'lawyer-1', role: 'LAWYER' }, '   ')
    ).rejects.toMatchObject({ code: 'REJECTION_REASON_REQUIRED', status: 400 });
  });

  it('rejects with a reason and completes the cycle', async () => {
    const created = await createModificationProposal(DOC, VER, 'reader-1', validCreate);
    const rejected = await rejectModificationProposal(
      DOC, VER, created.id, { id: 'lawyer-1', role: 'LAWYER' }, 'nem elfogadható'
    );
    expect(rejected.status).toBe('REJECTED');
    expect(rejected.decisionReason).toBe('nem elfogadható');
    expect(state.timeline).toHaveLength(1);
    expect(state.notifications).toHaveLength(1);
  });

  it('is idempotent for the same normalized reason but 409 for a different one', async () => {
    const created = await createModificationProposal(DOC, VER, 'reader-1', validCreate);
    await rejectModificationProposal(DOC, VER, created.id, { id: 'lawyer-1', role: 'LAWYER' }, '  indok  egy ');
    const eventsAfterFirst = state.events.length;

    const same = await rejectModificationProposal(DOC, VER, created.id, { id: 'lawyer-1', role: 'LAWYER' }, 'indok egy');
    expect(same.status).toBe('REJECTED');
    expect(state.events).toHaveLength(eventsAfterFirst);

    await expect(
      rejectModificationProposal(DOC, VER, created.id, { id: 'lawyer-1', role: 'LAWYER' }, 'más indok')
    ).rejects.toMatchObject({ code: 'PROPOSAL_ALREADY_DECIDED', status: 409 });
  });

  it('returns 409 when the proposal is already accepted', async () => {
    const created = await createModificationProposal(DOC, VER, 'reader-1', validCreate);
    await acceptModificationProposal(DOC, VER, created.id, { id: 'lawyer-1', role: 'LAWYER' });
    await expect(
      rejectModificationProposal(DOC, VER, created.id, { id: 'lawyer-1', role: 'LAWYER' }, 'nem')
    ).rejects.toMatchObject({ code: 'PROPOSAL_ALREADY_DECIDED', status: 409 });
  });
});

describe('withdrawModificationProposal and completion projection', () => {
  it('withdrawing the ONLY active proposal produces no handoff', async () => {
    const created = await createModificationProposal(DOC, VER, 'reader-1', validCreate);
    const withdrawn = await withdrawModificationProposal(DOC, VER, created.id, { id: 'reader-1', role: 'TRAINEE' });
    expect(withdrawn.deletedAt).not.toBeNull();
    expect(state.timeline).toHaveLength(0);
    expect(state.notifications).toHaveLength(0);
    expect(state.correctionNotifiedAt).toBeNull();
  });

  it('withdrawing the last pending proposal while an accepted one remains completes the cycle', async () => {
    state.version.document.reviewerId = 'lawyer-1';
    const accepted = await createModificationProposal(DOC, VER, 'reader-1', {
      ...validCreate,
      selectedText: 'a',
      proposedText: 'b',
    });
    const withdrawn = await createModificationProposal(DOC, VER, 'reader-1', {
      ...validCreate,
      selectedText: 'c',
      proposedText: 'd',
    });
    await acceptModificationProposal(DOC, VER, accepted.id, { id: 'lawyer-1', role: 'LAWYER' });
    expect(state.timeline).toHaveLength(0);

    await withdrawModificationProposal(DOC, VER, withdrawn.id, { id: 'reader-1', role: 'TRAINEE' });
    expect(state.timeline).toHaveLength(1);
    expect(state.notifications).toHaveLength(1);
  });

  it('a decided proposal cannot be withdrawn', async () => {
    state.version.document.reviewerId = 'lawyer-1';
    const created = await createModificationProposal(DOC, VER, 'reader-1', validCreate);
    await acceptModificationProposal(DOC, VER, created.id, { id: 'lawyer-1', role: 'LAWYER' });
    await expect(
      withdrawModificationProposal(DOC, VER, created.id, { id: 'reader-1', role: 'TRAINEE' })
    ).rejects.toMatchObject({ code: 'PROPOSAL_ALREADY_DECIDED', status: 409 });
  });

  it('a withdrawn proposal cannot be decided (404)', async () => {
    const created = await createModificationProposal(DOC, VER, 'reader-1', validCreate);
    await withdrawModificationProposal(DOC, VER, created.id, { id: 'reader-1', role: 'TRAINEE' });
    state.version.document.reviewerId = 'lawyer-1';
    await expect(
      acceptModificationProposal(DOC, VER, created.id, { id: 'lawyer-1', role: 'LAWYER' })
    ).rejects.toMatchObject({
      code: 'DOCUMENT_MODIFICATION_PROPOSAL_NOT_FOUND',
      status: 404,
    });
  });

  it('a manager (non-author) can withdraw a pending proposal when canManage is true', async () => {
    const created = await createModificationProposal(DOC, VER, 'reader-1', validCreate);
    const withdrawn = await withdrawModificationProposal(
      DOC,
      VER,
      created.id,
      { id: 'manager-1', role: 'LAWYER' },
      { canManage: true }
    );
    expect(withdrawn.deletedAt).not.toBeNull();
  });

  it('a non-author without manage authority cannot withdraw (403)', async () => {
    const created = await createModificationProposal(DOC, VER, 'reader-1', validCreate);
    await expect(
      withdrawModificationProposal(DOC, VER, created.id, { id: 'someone-else', role: 'TRAINEE' })
    ).rejects.toMatchObject({ code: 'PROPOSAL_WITHDRAW_FORBIDDEN', status: 403 });
  });
});
