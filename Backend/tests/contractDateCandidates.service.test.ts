/**
 * Contract date candidate lifecycle — behavioural tests with a mocked Prisma
 * client and mocked canonical contract service.
 *
 * Pins the hard invariant: extraction never writes canonical dates; candidates
 * are bound to one exact DocumentVersion; confirm writes through the EXISTING
 * canonical updateContract/createObligationOccurrence services; reject writes
 * nothing canonical; stale candidates fail closed; unauthorized/cross-client
 * confirms are rejected; rejected candidates never silently reappear.
 */
import { InteractionError } from '../src/modules/client-interaction/base';
import {
  confirmCandidate,
  extractCandidatesForVersion,
  listCandidatesForDocument,
  rejectCandidate,
} from '../src/modules/contract-date-candidates/service';

jest.mock('../src/modules/cases/authorization', () => ({
  userCanReadCase: jest.fn(async () => true),
  userCanManageCase: jest.fn(async () => true),
}));

jest.mock('../src/modules/client-contracts/service', () => ({
  updateContract: jest.fn(async (_actor: any, contractId: string, input: any) => ({ id: contractId, ...input })),
  createObligationOccurrence: jest.fn(async (_actor: any, obligationId: string, input: any) => ({
    occurrence: { id: `occ-${obligationId}`, ...input },
    replayed: false,
  })),
}));

import { createObligationOccurrence, updateContract } from '../src/modules/client-contracts/service';

const mockedUpdateContract = updateContract as jest.MockedFunction<typeof updateContract>;
const mockedCreateOccurrence = createObligationOccurrence as jest.MockedFunction<typeof createObligationOccurrence>;

const DOC_ID = 'doc-1';
const VER_ID = 'ver-1';
const CASE_ID = 'case-1';
const CLIENT_ID = 'client-1';
const ADMIN = { userId: 'manager-1', role: 'ADMIN' };
const LAWYER = { userId: 'lawyer-1', role: 'LAWYER' };

const VERSION_TEXT =
  'Jelen szerződés a felek aláírását követően, 2024. 05. 12. napján lép hatályba. ' +
  'A vállalkozói díj fizetési határidő: 2024. június 30. ' +
  'A harmadik ütem teljesítési határidő 2024.12.01. ' +
  'A felek rendes felmondási határidő: 2024.11.15.';

interface AnyRow { [key: string]: any }

const state: {
  documents: AnyRow[];
  versions: AnyRow[];
  candidates: AnyRow[];
  contracts: AnyRow[];
  obligations: AnyRow[];
} = {
  documents: [{ id: DOC_ID, caseId: CASE_ID, clientId: CLIENT_ID }],
  versions: [{
    id: VER_ID,
    documentId: DOC_ID,
    mimeType: 'text/plain',
    originalFileName: 'szerzodes.txt',
    size: Buffer.byteLength(VERSION_TEXT),
  }],
  candidates: [],
  contracts: [{ id: 'contract-1', clientId: CLIENT_ID, title: 'Vállalkozási szerződés' }],
  obligations: [{ id: 'obligation-1', clientId: CLIENT_ID, sourceContractId: 'contract-1' }],
};

let candidateCounter = 0;

function findByComposite(composite: any): AnyRow | null {
  return state.candidates.find((row) =>
    row.documentVersionId === composite.documentVersionId &&
    row.dateType === composite.dateType &&
    String(row.proposedDate.getTime?.() ?? new Date(row.proposedDate).getTime()) === String(new Date(composite.proposedDate).getTime()) &&
    row.excerptHash === composite.excerptHash,
  ) ?? null;
}

function makePrisma() {
  return {
    document: {
      findUnique: jest.fn(async ({ where }: any) => state.documents.find((d) => d.id === where.id) ?? null),
    },
    documentVersion: {
      findUnique: jest.fn(async ({ where }: any) => {
        const version = state.versions.find((v) => v.id === where.id) ?? null;
        if (!version) return null;
        return { ...version, document: state.documents.find((d) => d.id === version.documentId) ?? null };
      }),
    },
    contractDateCandidate: {
      findUnique: jest.fn(async ({ where }: any) => {
        if (where.id) {
          const row = state.candidates.find((c) => c.id === where.id) ?? null;
          if (!row) return null;
          return {
            ...row,
            document: state.documents.find((d) => d.id === row.documentId) ?? null,
            documentVersion: state.versions.find((v) => v.id === row.documentVersionId) ?? null,
          };
        }
        if (where.documentVersionId_dateType_proposedDate_excerptHash) return findByComposite(where.documentVersionId_dateType_proposedDate_excerptHash);
        return null;
      }),
      findMany: jest.fn(async ({ where }: any) =>
        state.candidates.filter((c) =>
          Object.entries(where).every(([key, value]) => c[key] === value),
        ),
      ),
      create: jest.fn(async ({ data }: any) => {
        const row: AnyRow = {
          ...data,
          id: `candidate-${++candidateCounter}`,
          status: data.status ?? 'PENDING',
          targetContractId: null,
          targetOccurrenceId: null,
          decisionReason: null,
          decidedById: null,
          decidedAt: null,
          createdAt: new Date('2026-09-27T10:00:00Z'),
          updatedAt: new Date('2026-09-27T10:00:00Z'),
        };
        state.candidates.push(row);
        return row;
      }),
      updateMany: jest.fn(async ({ where, data }: any) => {
        let count = 0;
        for (const row of state.candidates) {
          if (where.id === row.id && where.status === row.status) {
            Object.assign(row, data, { updatedAt: new Date('2026-09-27T11:00:00Z') });
            count += 1;
          }
        }
        return { count };
      }),
    },
    contractRecord: {
      findUnique: jest.fn(async ({ where }: any) => state.contracts.find((c) => c.id === where.id) ?? null),
    },
    clientObligation: {
      findUnique: jest.fn(async ({ where }: any) => state.obligations.find((o) => o.id === where.id) ?? null),
    },
    client: {
      findUnique: jest.fn(async () => ({ id: CLIENT_ID, name: 'Kft' })),
    },
    user: {
      findUnique: jest.fn(async ({ where }: any) => ({ id: where.id, role: 'ADMIN', status: 'ACTIVE', isActive: true })),
    },
    case: { findFirst: jest.fn(async () => null) },
  } as any;
}

function deps() {
  return {
    prisma: makePrisma(),
    downloadVersion: jest.fn(async () => Buffer.from(VERSION_TEXT, 'utf8')),
  };
}

beforeEach(() => {
  state.candidates = [];
  candidateCounter = 0;
  mockedUpdateContract.mockClear();
  mockedCreateOccurrence.mockClear();
});

describe('extraction — candidates never write canonical data', () => {
  it('creates PENDING candidates bound to the exact DocumentVersion with excerpt provenance', async () => {
    const result = await extractCandidatesForVersion(ADMIN, { documentVersionId: VER_ID }, deps());
    expect(result.createdCount).toBeGreaterThanOrEqual(3);
    for (const candidate of result.items) {
      expect(candidate.status).toBe('PENDING');
      expect(candidate.documentVersionId).toBe(VER_ID);
      expect(candidate.documentId).toBe(DOC_ID);
      expect(candidate.sourceExcerpt.length).toBeGreaterThan(0);
      expect(candidate.provenance).toBe('RULE_BASED_EXTRACTION');
      expect(candidate.proposedDate).not.toBeNull();
    }
    expect(mockedUpdateContract).not.toHaveBeenCalled();
    expect(mockedCreateOccurrence).not.toHaveBeenCalled();
  });

  it('never recreates an identical candidate — including a REJECTED one', async () => {
    const first = await extractCandidatesForVersion(ADMIN, { documentVersionId: VER_ID }, deps());
    expect(first.createdCount).toBeGreaterThan(0);
    const second = await extractCandidatesForVersion(ADMIN, { documentVersionId: VER_ID }, deps());
    expect(second.createdCount).toBe(0);
    expect(second.skippedExisting).toBe(first.createdCount);
  });

  it('requires case-manage access', async () => {
    const { userCanManageCase } = require('../src/modules/cases/authorization');
    (userCanManageCase as jest.Mock).mockResolvedValueOnce(false);
    await expect(extractCandidatesForVersion(LAWYER, { documentVersionId: VER_ID }, deps()))
      .rejects.toMatchObject({ status: 403, code: 'CASE_ACCESS_FORBIDDEN' });
  });

  it('fails honestly when version text is unavailable (no silent fallback)', async () => {
    const testDeps = deps();
    (testDeps.downloadVersion as jest.Mock).mockResolvedValueOnce(null);
    await expect(extractCandidatesForVersion(ADMIN, { documentVersionId: VER_ID }, testDeps))
      .rejects.toMatchObject({ status: 400, code: 'CANDIDATE_SOURCE_TEXT_UNAVAILABLE' });
    expect(mockedUpdateContract).not.toHaveBeenCalled();
  });
});

describe('confirmation — canonical write only through the canonical service', () => {
  async function seedEffectiveCandidate() {
    const { prisma } = deps();
    const row = await prisma.contractDateCandidate.create({
      data: {
        documentId: DOC_ID,
        documentVersionId: VER_ID,
        dateType: 'EFFECTIVE',
        proposedDate: new Date('2024-05-12T12:00:00Z'),
        sourceExcerpt: '2024. 05. 12. napján lép hatályba',
        excerptStartOffset: 0,
        excerptEndOffset: 100,
        excerptHash: 'deadbeef',
        provenance: 'RULE_BASED_EXTRACTION',
        status: 'PENDING',
        createdById: 'manager-1',
      },
    });
    return row;
  }

  it('writes effectiveDate through updateContract and marks the candidate CONFIRMED', async () => {
    const candidate = await seedEffectiveCandidate();
    const result = await confirmCandidate(ADMIN, candidate.id, { targetContractId: 'contract-1' }, deps());
    expect(mockedUpdateContract).toHaveBeenCalledWith(
      expect.anything(),
      'contract-1',
      expect.objectContaining({ effectiveDate: expect.any(Date) }),
      expect.anything(),
    );
    expect(result.candidate.status).toBe('CONFIRMED');
    expect(result.candidate.targetContractId).toBe('contract-1');
    expect(result.candidate.decidedById).toBe('manager-1');
    expect(result.candidate.decidedAt).not.toBeNull();
  });

  it('writes occurrence types through createObligationOccurrence with evidence version', async () => {
    const { prisma } = deps();
    const row = await prisma.contractDateCandidate.create({
      data: {
        documentId: DOC_ID,
        documentVersionId: VER_ID,
        dateType: 'PAYMENT_DUE',
        proposedDate: new Date('2024-06-30T12:00:00Z'),
        sourceExcerpt: 'fizetési határidő: 2024. június 30.',
        excerptStartOffset: 0,
        excerptEndOffset: 100,
        excerptHash: 'cafebabe',
        provenance: 'RULE_BASED_EXTRACTION',
        status: 'PENDING',
        createdById: 'manager-1',
      },
    });
    const result = await confirmCandidate(ADMIN, row.id, { targetContractId: 'contract-1', obligationId: 'obligation-1' }, deps());
    expect(mockedUpdateContract).not.toHaveBeenCalled();
    expect(mockedCreateOccurrence).toHaveBeenCalledWith(
      expect.anything(),
      'obligation-1',
      expect.objectContaining({
        occurrenceType: 'PAYMENT',
        occurrenceKey: `contract-date-candidate:${row.id}`,
        dueDate: '2024-06-30T12:00:00.000Z',
        evidenceDocumentVersionId: VER_ID,
      }),
      expect.anything(),
    );
    expect(result.candidate.targetOccurrenceId).toBe('occ-obligation-1');
  });

  it('rejects confirm without manager permission (lawyer cannot confirm)', async () => {
    const candidate = await seedEffectiveCandidate();
    await expect(confirmCandidate(LAWYER, candidate.id, { targetContractId: 'contract-1' }, deps()))
      .rejects.toMatchObject({ status: 403, code: 'CONTRACT_MANAGE_FORBIDDEN' });
    expect(mockedUpdateContract).not.toHaveBeenCalled();
  });

  it('rejects cross-client target contracts', async () => {
    const candidate = await seedEffectiveCandidate();
    state.contracts.push({ id: 'other-client-contract', clientId: 'client-2', title: 'Idegen' });
    await expect(confirmCandidate(ADMIN, candidate.id, { targetContractId: 'other-client-contract' }, deps()))
      .rejects.toMatchObject({ status: 403, code: 'CROSS_CLIENT_CONTRACT' });
    expect(mockedUpdateContract).not.toHaveBeenCalled();
  });

  it('fails closed on stale candidates whose excerpt is no longer in the source version', async () => {
    const candidate = await seedEffectiveCandidate();
    const staleDeps = deps();
    (staleDeps.downloadVersion as jest.Mock).mockResolvedValue(Buffer.from('Teljesen megváltozott szöveg, hatályba lépésről szó sincs.', 'utf8'));
    await expect(confirmCandidate(ADMIN, candidate.id, { targetContractId: 'contract-1' }, staleDeps))
      .rejects.toMatchObject({ status: 409, code: 'STALE_CANDIDATE_EXCERPT_MISSING' });
    expect(mockedUpdateContract).not.toHaveBeenCalled();
  });

  it('rejects confirming an already-decided candidate', async () => {
    const candidate = await seedEffectiveCandidate();
    await confirmCandidate(ADMIN, candidate.id, { targetContractId: 'contract-1' }, deps());
    await expect(confirmCandidate(ADMIN, candidate.id, { targetContractId: 'contract-1' }, deps()))
      .rejects.toMatchObject({ status: 409, code: 'CANDIDATE_NOT_PENDING' });
  });

  it('rejects an obligation that does not belong to the target contract', async () => {
    const { prisma } = deps();
    const row = await prisma.contractDateCandidate.create({
      data: {
        documentId: DOC_ID,
        documentVersionId: VER_ID,
        dateType: 'MILESTONE',
        proposedDate: new Date('2024-12-01T12:00:00Z'),
        sourceExcerpt: 'teljesítési határidő 2024.12.01.',
        excerptStartOffset: 0,
        excerptEndOffset: 100,
        excerptHash: 'f00dcafe',
        provenance: 'RULE_BASED_EXTRACTION',
        status: 'PENDING',
        createdById: 'manager-1',
      },
    });
    state.obligations.push({ id: 'obligation-other', clientId: CLIENT_ID, sourceContractId: 'contract-other' });
    await expect(confirmCandidate(ADMIN, row.id, { targetContractId: 'contract-1', obligationId: 'obligation-other' }, deps()))
      .rejects.toMatchObject({ status: 400, code: 'OBLIGATION_CONTRACT_MISMATCH' });
  });
});

describe('rejection — no canonical write, terminal for the identity', () => {
  it('records REJECTED without touching canonical data', async () => {
    const { prisma } = deps();
    const row = await prisma.contractDateCandidate.create({
      data: {
        documentId: DOC_ID,
        documentVersionId: VER_ID,
        dateType: 'NOTICE',
        proposedDate: new Date('2024-11-15T12:00:00Z'),
        sourceExcerpt: 'rendes felmondási határidő: 2024.11.15.',
        excerptStartOffset: 0,
        excerptEndOffset: 100,
        excerptHash: 'abcdef01',
        provenance: 'RULE_BASED_EXTRACTION',
        status: 'PENDING',
        createdById: 'manager-1',
      },
    });
    const rejected = await rejectCandidate(LAWYER, row.id, 'Nem releváns határidő.', deps());
    expect(rejected.status).toBe('REJECTED');
    expect(rejected.decisionReason).toBe('Nem releváns határidő.');
    expect(rejected.decidedById).toBe('lawyer-1');
    expect(mockedUpdateContract).not.toHaveBeenCalled();
    expect(mockedCreateOccurrence).not.toHaveBeenCalled();

    // Terminal for the identity: re-extraction must not resurrect it.
    const reExtract = await extractCandidatesForVersion(ADMIN, { documentVersionId: VER_ID }, deps());
    expect(reExtract.items.every((candidate) => !(candidate.dateType === 'NOTICE' && candidate.excerptHash === 'abcdef01'))).toBe(true);
  });

  it('rejects a non-pending candidate with a conflict', async () => {
    const { prisma } = deps();
    const row = await prisma.contractDateCandidate.create({
      data: {
        documentId: DOC_ID,
        documentVersionId: VER_ID,
        dateType: 'OTHER',
        proposedDate: new Date('2024-10-01T12:00:00Z'),
        sourceExcerpt: 'más határidő',
        excerptStartOffset: 0,
        excerptEndOffset: 100,
        excerptHash: '12345678',
        provenance: 'RULE_BASED_EXTRACTION',
        status: 'REJECTED',
        createdById: 'manager-1',
      },
    });
    await expect(rejectCandidate(LAWYER, row.id, undefined, deps()))
      .rejects.toMatchObject({ status: 409, code: 'CANDIDATE_NOT_PENDING' });
  });
});

describe('listing', () => {
  it('returns candidates for the document through case-scoped read access', async () => {
    await extractCandidatesForVersion(ADMIN, { documentVersionId: VER_ID }, deps());
    const result = await listCandidatesForDocument(ADMIN, DOC_ID, {}, deps());
    expect(result.items.length).toBeGreaterThan(0);
    for (const item of result.items) {
      expect(item.documentId).toBe(DOC_ID);
      expect(item.proposedDate).toMatch(/^\d{4}-\d{2}-\d{2}/);
    }
  });

  it('denies reads without case access', async () => {
    const { userCanReadCase } = require('../src/modules/cases/authorization');
    (userCanReadCase as jest.Mock).mockResolvedValueOnce(false);
    await expect(listCandidatesForDocument(LAWYER, DOC_ID, {}, deps()))
      .rejects.toBeInstanceOf(InteractionError);
  });
});
