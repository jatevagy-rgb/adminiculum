/**
 * Case Context V2 — service-level regression tests.
 *
 * Covers PASTED/COMMUNICATION creation, immutability of rawText, detect/apply
 * determinism and guards, atomic one-shot apply, and the "no reversible mapping
 * is ever persisted" invariant. All fixtures are synthetic.
 */

import type { ManualSensitiveTerm } from '../src/modules/anonymization';

jest.mock('../src/prisma/prisma.service', () => ({
  prisma: {
    caseContextSource: {
      create: jest.fn(),
      findUnique: jest.fn(),
      findMany: jest.fn(),
      updateMany: jest.fn(),
    },
    communication: { findUnique: jest.fn() },
  },
}));

import { prisma } from '../src/prisma/prisma.service';
import {
  anonymizeContextSource,
  computeOptionsDigest,
  createCommunicationContextSource,
  createPastedContextSource,
  detectContextSource,
  listContextSources,
} from '../src/modules/case-context/service';

const caseContextSource = prisma.caseContextSource as unknown as {
  create: jest.Mock;
  findUnique: jest.Mock;
  findMany: jest.Mock;
  updateMany: jest.Mock;
};
const communication = prisma.communication as unknown as { findUnique: jest.Mock };

const ACTOR = { userId: 'user-1' };

function record(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    id: 'src-1',
    caseId: 'case-1',
    origin: 'PASTED',
    rawText: 'Semleges szöveg.',
    anonymizedText: null,
    anonymizationSnapshot: null,
    sourceCommunicationId: null,
    createdAt: new Date('2026-01-01T00:00:00.000Z'),
    updatedAt: new Date('2026-01-01T00:00:00.000Z'),
    createdBy: { id: 'user-1', name: 'Dr. Teszt', email: 'teszt@example.com' },
    ...overrides,
  };
}

beforeEach(() => {
  jest.clearAllMocks();
});

describe('PASTED source creation', () => {
  it('persists rawText losslessly and derives case/author/origin server-side', async () => {
    const rawText = 'Kovács Péter ügyfél. E-mail: kovacs@example.hu.';
    caseContextSource.create.mockResolvedValue(record({ rawText }));
    const result = await createPastedContextSource(ACTOR, { caseId: 'case-1', rawText });

    expect(caseContextSource.create).toHaveBeenCalledTimes(1);
    const data = caseContextSource.create.mock.calls[0][0].data;
    expect(data.rawText).toBe(rawText);
    expect(data.caseId).toBe('case-1');
    expect(data.createdById).toBe('user-1');
    expect(data.origin).toBe('PASTED');
    // No client-supplied author/snapshot fields are ever written.
    expect(data).not.toHaveProperty('anonymizedText');
    expect(data).not.toHaveProperty('anonymizationSnapshot');
    expect(result.rawText).toBe(rawText);
  });

  it('rejects empty and whitespace-only rawText', async () => {
    await expect(createPastedContextSource(ACTOR, { caseId: 'case-1', rawText: '' })).rejects.toMatchObject({ code: 'EMPTY_RAW_TEXT' });
    await expect(createPastedContextSource(ACTOR, { caseId: 'case-1', rawText: '   \n\t' })).rejects.toMatchObject({ code: 'EMPTY_RAW_TEXT' });
    expect(caseContextSource.create).not.toHaveBeenCalled();
  });

  it('rejects rawText above the fail-closed size limit', async () => {
    const huge = 'a'.repeat(2_000_001);
    await expect(createPastedContextSource(ACTOR, { caseId: 'case-1', rawText: huge })).rejects.toMatchObject({ code: 'RAW_TEXT_TOO_LARGE' });
    expect(caseContextSource.create).not.toHaveBeenCalled();
  });
});

describe('COMMUNICATION source creation', () => {
  it('snapshots the canonical content and stores sourceCommunicationId', async () => {
    communication.findUnique.mockResolvedValue({ id: 'comm-1', caseId: 'case-1', content: 'Titkos üzenet tartalma.' });
    caseContextSource.create.mockResolvedValue(record({ origin: 'COMMUNICATION', sourceCommunicationId: 'comm-1', rawText: 'Titkos üzenet tartalma.' }));

    const result = await createCommunicationContextSource(ACTOR, { caseId: 'case-1', communicationId: 'comm-1' });

    expect(communication.findUnique).toHaveBeenCalledWith({
      where: { id: 'comm-1' },
      select: { id: true, caseId: true, content: true },
    });
    const data = caseContextSource.create.mock.calls[0][0].data;
    expect(data.rawText).toBe('Titkos üzenet tartalma.');
    expect(data.sourceCommunicationId).toBe('comm-1');
    expect(data.origin).toBe('COMMUNICATION');
    expect(result.sourceCommunicationId).toBe('comm-1');
  });

  it('rejects a communication not linked to the same case (no provenance spoofing)', async () => {
    communication.findUnique.mockResolvedValue({ id: 'comm-1', caseId: 'other-case', content: 'Másik ügy.' });
    await expect(createCommunicationContextSource(ACTOR, { caseId: 'case-1', communicationId: 'comm-1' })).rejects.toMatchObject({ code: 'COMMUNICATION_CASE_MISMATCH' });
    expect(caseContextSource.create).not.toHaveBeenCalled();
  });

  it('reports COMMUNICATION_SOURCE_GAP when there is no snapshot-able body', async () => {
    communication.findUnique.mockResolvedValue({ id: 'comm-1', caseId: 'case-1', content: null });
    await expect(createCommunicationContextSource(ACTOR, { caseId: 'case-1', communicationId: 'comm-1' })).rejects.toMatchObject({ code: 'COMMUNICATION_SOURCE_GAP' });
    expect(caseContextSource.create).not.toHaveBeenCalled();
  });

  it('rejects a missing communication', async () => {
    communication.findUnique.mockResolvedValue(null);
    await expect(createCommunicationContextSource(ACTOR, { caseId: 'case-1', communicationId: 'missing' })).rejects.toMatchObject({ code: 'COMMUNICATION_NOT_FOUND' });
  });
});

describe('list', () => {
  it('lists sources for the case with safe DTO fields', async () => {
    caseContextSource.findMany.mockResolvedValue([record()]);
    const items = await listContextSources('case-1');
    expect(caseContextSource.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { caseId: 'case-1' } }),
    );
    expect(items).toHaveLength(1);
    expect(items[0]).toMatchObject({ id: 'src-1', createdBy: { id: 'user-1' } });
  });
});

describe('detect', () => {
  it('detects deterministic candidates from arbitrary raw text', async () => {
    caseContextSource.findUnique.mockResolvedValue(record({ rawText: 'Kovács Péter kovacs@example.hu' }));
    const result = await detectContextSource({ caseId: 'case-1', id: 'src-1' });
    expect(result.sourceHash).toHaveLength(64);
    expect(result.optionsDigest).toHaveLength(64);
    expect(result.candidates.some((c) => c.type === 'EMAIL')).toBe(true);
  });

  it('manualTerms affect detection', async () => {
    caseContextSource.findUnique.mockResolvedValue(record({ rawText: 'Kovács Péter találkozó.' }));
    const without = await detectContextSource({ caseId: 'case-1', id: 'src-1' });
    const withTerm = await detectContextSource({
      caseId: 'case-1',
      id: 'src-1',
      manualTerms: [{ term: 'Kovács Péter', category: 'PERSON' }],
    });
    expect(without.candidates.filter((c) => c.type === 'PERSON')).toHaveLength(0);
    expect(withTerm.candidates.filter((c) => c.type === 'PERSON')).toHaveLength(1);
  });

  it('produces a stable review identity for the same source/options', async () => {
    caseContextSource.findUnique.mockResolvedValue(record({ rawText: 'Kovács Péter kovacs@example.hu' }));
    const terms: ManualSensitiveTerm[] = [{ term: 'Kovács Péter', category: 'PERSON' }];
    const a = await detectContextSource({ caseId: 'case-1', id: 'src-1', manualTerms: terms });
    const b = await detectContextSource({ caseId: 'case-1', id: 'src-1', manualTerms: terms });
    expect(a.sourceHash).toBe(b.sourceHash);
    expect(a.optionsDigest).toBe(b.optionsDigest);
    expect(a.candidates.map((c) => c.id)).toEqual(b.candidates.map((c) => c.id));
  });

  it('term ordering does not change the optionsDigest', () => {
    const a = computeOptionsDigest([
      { term: 'Kovács Péter', category: 'PERSON' },
      { term: 'Nagy Anna', category: 'PERSON' },
    ]);
    const b = computeOptionsDigest([
      { term: 'Nagy Anna', category: 'PERSON' },
      { term: 'Kovács Péter', category: 'PERSON' },
    ]);
    expect(a).toBe(b);
  });

  it('changed terms change the optionsDigest', () => {
    const a = computeOptionsDigest([{ term: 'Kovács Péter', category: 'PERSON' }]);
    const b = computeOptionsDigest([{ term: 'Nagy Anna', category: 'PERSON' }]);
    expect(a).not.toBe(b);
  });

  it('fails closed when the source does not belong to the case', async () => {
    caseContextSource.findUnique.mockResolvedValue(record({ caseId: 'other-case' }));
    await expect(detectContextSource({ caseId: 'case-1', id: 'src-1' })).rejects.toMatchObject({ code: 'CONTEXT_SOURCE_NOT_FOUND' });
  });
});

describe('anonymize', () => {
  const rawText = 'Kovács Péter és Nagy Anna.';
  const terms: ManualSensitiveTerm[] = [
    { term: 'Kovács Péter', category: 'PERSON' },
    { term: 'Nagy Anna', category: 'PERSON' },
  ];

  function setupAnonymize(overrides: Record<string, unknown> = {}) {
    caseContextSource.findUnique.mockResolvedValue(record({ rawText, ...overrides }));
    caseContextSource.updateMany.mockResolvedValue({ count: 1 });
  }

  it('applies only approved candidates and persists safe metadata', async () => {
    setupAnonymize();
    const detected = await detectContextSource({ caseId: 'case-1', id: 'src-1', manualTerms: terms });
    const kovacs = detected.candidates.find((c) => c.originalText.includes('Kovács'));

    const result = await anonymizeContextSource({
      caseId: 'case-1',
      id: 'src-1',
      sourceHash: detected.sourceHash,
      optionsDigest: detected.optionsDigest,
      manualTerms: terms,
      approvedCandidateIds: [kovacs!.id],
    });

    expect(result.anonymizedText).toContain('[SZEMÉLY_1]');
    expect(result.anonymizedText).toContain('Nagy Anna'); // unapproved → unchanged
    expect(result.anonymizedText).not.toBe(rawText);

    const update = caseContextSource.updateMany.mock.calls[0][0];
    expect(update.where).toEqual({ id: 'src-1', anonymizedText: null });
    expect(update.data).not.toHaveProperty('rawText'); // rawText immutable

    const snapshot = update.data.anonymizationSnapshot;
    expect(snapshot).toMatchObject({ mappingLocation: 'in-memory-only' });
    expect(snapshot.algorithmRevision).toBeGreaterThan(0);
    expect(snapshot.sourceHash).toBe(detected.sourceHash);
    expect(snapshot.appliedCount).toBe(1);
    expect(typeof snapshot.resultHash).toBe('string');
    expect(typeof snapshot.categoryCounts).toBe('object');
    expect(Array.isArray(snapshot.warnings)).toBe(true);
  });

  it('fails closed on an unknown approvedCandidateId', async () => {
    setupAnonymize();
    const detected = await detectContextSource({ caseId: 'case-1', id: 'src-1', manualTerms: terms });
    await expect(anonymizeContextSource({
      caseId: 'case-1',
      id: 'src-1',
      sourceHash: detected.sourceHash,
      optionsDigest: detected.optionsDigest,
      manualTerms: terms,
      approvedCandidateIds: ['cand-999'],
    })).rejects.toMatchObject({ code: 'UNKNOWN_CANDIDATE_ID' });
    expect(caseContextSource.updateMany).not.toHaveBeenCalled();
  });

  it('fails closed on a stale sourceHash', async () => {
    setupAnonymize();
    await expect(anonymizeContextSource({
      caseId: 'case-1',
      id: 'src-1',
      sourceHash: 'a'.repeat(64),
      optionsDigest: computeOptionsDigest(terms),
      manualTerms: terms,
      approvedCandidateIds: [],
    })).rejects.toMatchObject({ code: 'SOURCE_HASH_MISMATCH' });
    expect(caseContextSource.updateMany).not.toHaveBeenCalled();
  });

  it('fails closed on a stale optionsDigest', async () => {
    setupAnonymize();
    const detected = await detectContextSource({ caseId: 'case-1', id: 'src-1', manualTerms: terms });
    await expect(anonymizeContextSource({
      caseId: 'case-1',
      id: 'src-1',
      sourceHash: detected.sourceHash,
      optionsDigest: computeOptionsDigest([{ term: 'Másik', category: 'PERSON' }]),
      manualTerms: terms,
      approvedCandidateIds: [],
    })).rejects.toMatchObject({ code: 'OPTIONS_DIGEST_MISMATCH' });
    expect(caseContextSource.updateMany).not.toHaveBeenCalled();
  });

  it('returns a controlled conflict when the source is already anonymized', async () => {
    setupAnonymize();
    const detected = await detectContextSource({ caseId: 'case-1', id: 'src-1', manualTerms: terms });
    caseContextSource.updateMany.mockResolvedValue({ count: 0 });
    await expect(anonymizeContextSource({
      caseId: 'case-1',
      id: 'src-1',
      sourceHash: detected.sourceHash,
      optionsDigest: detected.optionsDigest,
      manualTerms: terms,
      approvedCandidateIds: [],
    })).rejects.toMatchObject({ code: 'CONTEXT_SOURCE_ALREADY_ANONYMIZED' });
  });
});

describe('anonymize input validation (fail closed)', () => {
  const rawText = 'Kovács Péter és Nagy Anna.';

  function baseInput(approvedCandidateIds: unknown) {
    return {
      caseId: 'case-1',
      id: 'src-1',
      sourceHash: 'stale-source-hash',
      optionsDigest: 'stale-options-digest',
      manualTerms: [],
      approvedCandidateIds,
    };
  }

  it.each([
    ['missing', undefined],
    ['null', null],
    ['non-array string', 'cand-1'],
    ['array with a non-string', ['cand-1', 123]],
    ['array with a blank string', ['cand-1', '   ']],
  ])('rejects %s approvedCandidateIds with 400 and never reads or writes the store', async (_label, value) => {
    caseContextSource.findUnique.mockResolvedValue(record({ rawText }));

    await expect(anonymizeContextSource(baseInput(value))).rejects.toMatchObject({
      status: 400,
      code: 'INVALID_APPROVED_CANDIDATE_IDS',
    });
    expect(caseContextSource.findUnique).not.toHaveBeenCalled();
    expect(caseContextSource.updateMany).not.toHaveBeenCalled();
  });

  it('allows an explicitly empty approvedCandidateIds (validation precedes sourceHash check)', async () => {
    caseContextSource.findUnique.mockResolvedValue(record({ rawText }));

    await expect(anonymizeContextSource(baseInput([]))).rejects.toMatchObject({
      code: 'SOURCE_HASH_MISMATCH',
    });
    // Validation passed (no 400); the stale-hash business guard fired instead.
    expect(caseContextSource.findUnique).toHaveBeenCalled();
    expect(caseContextSource.updateMany).not.toHaveBeenCalled();
  });
});

describe('forbidden metadata', () => {
  it('never persists the reversible mapping or candidate originalText', async () => {
    const secret1 = 'TitkosÜgyfélKft';
    const secret2 = 'Kovács Péter';
    const rawText = `${secret2} kapcsolat: ${secret1}, email: kovacs@example.hu`;
    const terms: ManualSensitiveTerm[] = [
      { term: secret2, category: 'PERSON' },
      { term: secret1, category: 'BUSINESS_SECRET' },
    ];
    caseContextSource.findUnique.mockResolvedValue(record({ rawText }));
    caseContextSource.updateMany.mockResolvedValue({ count: 1 });

    const detected = await detectContextSource({ caseId: 'case-1', id: 'src-1', manualTerms: terms });
    await anonymizeContextSource({
      caseId: 'case-1',
      id: 'src-1',
      sourceHash: detected.sourceHash,
      optionsDigest: detected.optionsDigest,
      manualTerms: terms,
      approvedCandidateIds: detected.candidates.map((c) => c.id),
    });

    const update = caseContextSource.updateMany.mock.calls[0][0];
    const snapshot = update.data.anonymizationSnapshot;
    const forbiddenKeys = [
      'mapping',
      'originalToReplacementMapping',
      'internalReplacementMapping',
      'rehydrationMap',
      'original',
      'replacement',
      'originalText',
      'correspondence',
    ];

    const keys = collectKeys(snapshot);
    const strings = collectStrings(snapshot);
    for (const key of forbiddenKeys) {
      expect(keys).not.toContain(key);
    }
    for (const value of strings) {
      expect(value.includes(secret1)).toBe(false);
      expect(value.includes(secret2)).toBe(false);
    }
  });
});

function collectKeys(value: unknown, out: string[] = []): string[] {
  if (Array.isArray(value)) {
    for (const item of value) collectKeys(item, out);
  } else if (value && typeof value === 'object') {
    for (const [key, child] of Object.entries(value as Record<string, unknown>)) {
      out.push(key);
      collectKeys(child, out);
    }
  }
  return out;
}

function collectStrings(value: unknown, out: string[] = []): string[] {
  if (typeof value === 'string') {
    out.push(value);
  } else if (Array.isArray(value)) {
    for (const item of value) collectStrings(item, out);
  } else if (value && typeof value === 'object') {
    for (const child of Object.values(value as Record<string, unknown>)) collectStrings(child, out);
  }
  return out;
}
