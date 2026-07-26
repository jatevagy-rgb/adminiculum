/**
 * Matter-name contract (CASE-INTAKE-FUNCTIONAL-CLOSEOUT-1).
 *
 * The user-entered "Ügy megnevezése" must be the authoritative matter title
 * everywhere it is shown. Production acceptance found the list and detail DTOs
 * discarding the persisted title and recomposing `clientName - matterType`
 * (e.g. "Bálintfy és Társai Ügyvédi Iroda - CONTRACT_REVIEW"). These tests lock
 * the invariant at both layers: the create path persists the entered value
 * exactly, and the read path returns it rather than a generated string.
 */
const prismaMock: any = {
  client: { findUnique: jest.fn() },
  user: { findMany: jest.fn() },
  communication: { findMany: jest.fn(), update: jest.fn() },
  case: { create: jest.fn(), count: jest.fn(), findUnique: jest.fn(), findMany: jest.fn() },
  caseCollaborator: { create: jest.fn() },
  caseExternalParticipant: { create: jest.fn() },
  caseIntakeDeadline: { create: jest.fn() },
  task: { create: jest.fn() },
  timelineEvent: { create: jest.fn() },
  $transaction: jest.fn(),
};

jest.mock('../src/prisma/prisma.service', () => ({ prisma: prismaMock }));
jest.mock('../src/modules/sharepoint', () => ({ driveService: {} }));

import { createCaseIntake, CaseIntakeError } from '../src/modules/cases/intakeCreate.service';
import { resolveDisplayTitle } from '../src/modules/cases/services';

const ACTOR = 'user-1';
const CLIENT = { id: 'client-1', name: 'Bálintfy és Társai Ügyvédi Iroda' };
const ENTERED = 'Bérleti szerződés felülvizsgálat';

function caseRow(extra: Record<string, unknown> = {}) {
  return {
    id: 'case-1', caseNumber: 'CASE-2026-001', title: ENTERED, status: 'DRAFT', priority: 'MEDIUM',
    matterType: 'CONTRACT_REVIEW', clientName: CLIENT.name, clientRole: null, createdAt: new Date('2026-07-26'),
    intakeOriginReason: null, intakeCurrentSituation: null, intakeClientExpectation: null,
    intakeUrgentAction: null, intakeNextStep: null, client: CLIENT, assignedLawyer: null, ...extra,
  };
}

beforeEach(() => {
  jest.clearAllMocks();
  prismaMock.client.findUnique.mockResolvedValue(CLIENT);
  prismaMock.user.findMany.mockResolvedValue([]);
  prismaMock.communication.findMany.mockResolvedValue([]);
  prismaMock.case.count.mockResolvedValue(0);
  prismaMock.case.create.mockResolvedValue(caseRow());
  prismaMock.timelineEvent.create.mockResolvedValue({});
  prismaMock.$transaction.mockImplementation(async (fn: any) => fn(prismaMock));
});

describe('the entered matter name is persisted, not composed', () => {
  it('persists the exact entered title', async () => {
    await createCaseIntake(ACTOR, { clientId: CLIENT.id, title: ENTERED, matterType: 'CONTRACT_REVIEW' });
    expect(prismaMock.case.create).toHaveBeenCalledTimes(1);
    expect(prismaMock.case.create.mock.calls[0][0].data.title).toBe(ENTERED);
    // The composed legacy form must never be what gets stored.
    expect(prismaMock.case.create.mock.calls[0][0].data.title).not.toContain(' - CONTRACT_REVIEW');
  });

  it('trims leading and trailing whitespace before persisting', async () => {
    await createCaseIntake(ACTOR, { clientId: CLIENT.id, title: `   ${ENTERED}   `, matterType: 'CONTRACT_REVIEW' });
    expect(prismaMock.case.create.mock.calls[0][0].data.title).toBe(ENTERED);
  });

  it('preserves internal spacing verbatim (only the ends are trimmed)', async () => {
    const spaced = 'Bérleti  szerződés   felülvizsgálat';
    await createCaseIntake(ACTOR, { clientId: CLIENT.id, title: spaced, matterType: 'CONTRACT_REVIEW' });
    expect(prismaMock.case.create.mock.calls[0][0].data.title).toBe(spaced);
  });

  it('rejects an empty matter name', async () => {
    await expect(createCaseIntake(ACTOR, { clientId: CLIENT.id, title: '   ', matterType: 'CONTRACT_REVIEW' }))
      .rejects.toMatchObject({ code: 'FIELD_REQUIRED' });
    expect(prismaMock.case.create).not.toHaveBeenCalled();
  });

  it('rejects an oversized matter name (> 300 chars)', async () => {
    await expect(createCaseIntake(ACTOR, { clientId: CLIENT.id, title: 'x'.repeat(301), matterType: 'CONTRACT_REVIEW' }))
      .rejects.toMatchObject({ code: 'FIELD_TOO_LONG' });
    expect(prismaMock.case.create).not.toHaveBeenCalled();
  });

  it('keeps client and matter type out of the stored title', async () => {
    await createCaseIntake(ACTOR, { clientId: CLIENT.id, title: ENTERED, matterType: 'CONTRACT_REVIEW' });
    const data = prismaMock.case.create.mock.calls[0][0].data;
    expect(data.title).toBe(ENTERED);
    expect(data.clientName).toBe(CLIENT.name);
    expect(data.matterType).toBe('CONTRACT_REVIEW');
  });
});

describe('read DTOs surface the persisted title, not a generated one', () => {
  it('returns the entered title when one is stored', () => {
    expect(resolveDisplayTitle({ title: ENTERED, clientName: CLIENT.name, matterType: 'CONTRACT_REVIEW' })).toBe(ENTERED);
  });

  it('trims a stored title with stray whitespace', () => {
    expect(resolveDisplayTitle({ title: `  ${ENTERED}  `, clientName: CLIENT.name, matterType: 'X' })).toBe(ENTERED);
  });

  it('never lets a generated title overwrite a valid entered title', () => {
    const out = resolveDisplayTitle({ title: ENTERED, clientName: CLIENT.name, matterType: 'CONTRACT_REVIEW' });
    expect(out).not.toBe(`${CLIENT.name} - CONTRACT_REVIEW`);
    expect(out).toBe(ENTERED);
  });

  it('falls back to the composed form only when no title is stored (legacy record)', () => {
    expect(resolveDisplayTitle({ title: null, clientName: CLIENT.name, matterType: 'CONTRACT_REVIEW' }))
      .toBe(`${CLIENT.name} - CONTRACT_REVIEW`);
    expect(resolveDisplayTitle({ title: '', clientName: CLIENT.name, matterType: 'LEASE' }))
      .toBe(`${CLIENT.name} - LEASE`);
  });

  it('degrades safely when a legacy record has neither title nor metadata', () => {
    expect(resolveDisplayTitle({})).toBe('Unknown Client - Unknown Type');
  });
});
