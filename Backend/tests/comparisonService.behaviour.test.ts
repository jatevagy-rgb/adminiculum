/**
 * Comparison persistence lifecycle (STRUCTURED-DOC-COMPARISON-1, Phase 5).
 *
 * Exercises the real service against a mocked Prisma client and an injected text
 * resolver: version-pair validation, idempotent reuse, cross-document rejection,
 * unsupported/identical results, atomic segment persistence with correct counts,
 * and no orphan PROCESSING row on failure.
 */
import { createOrGetComparison, ComparisonError } from '../src/modules/documents/comparison/comparisonService';
import { resolveVersionText } from '../src/modules/documents/comparison/versionText';

function makePrisma(overrides: any = {}) {
  const store: any = { comparison: null, segments: [] };
  const prisma: any = {
    _store: store,
    documentVersion: {
      findMany: jest.fn(async ({ where }: any) => {
        const ids: string[] = where.id.in;
        return ids.map((id) => ({ id, documentId: 'doc-1', version: id === 'vB' ? 1 : 2, mimeType: 'text/plain', originalFileName: id + '.txt', size: 100 }));
      }),
    },
    documentComparison: {
      findUnique: jest.fn(async () => store.comparison),
      create: jest.fn(async ({ data }: any) => { store.comparison = { id: 'cmp-1', ...data }; return store.comparison; }),
      update: jest.fn(async ({ data }: any) => { store.comparison = { ...store.comparison, ...data }; return store.comparison; }),
    },
    documentChangeSegment: {
      deleteMany: jest.fn(async () => { store.segments = []; }),
      createMany: jest.fn(async ({ data }: any) => { store.segments = data; return { count: data.length }; }),
    },
    $transaction: jest.fn(async (fn: any) => fn(prisma)),
    ...overrides,
  };
  return prisma;
}

const TXT = (t: string) => async () => ({ supported: true, text: t, reasonCode: null, extractionRevision: 1 });
const UNSUP = async () => ({ supported: false, text: null, reasonCode: 'FORMAT_NOT_TEXT_EXTRACTABLE', extractionRevision: 1 });

const base = { actorId: 'u1', documentId: 'doc-1', baseVersionId: 'vB', targetVersionId: 'vT' };

describe('validation', () => {
  it('requires an authenticated actor', async () => {
    await expect(createOrGetComparison({ ...base, actorId: '' }, { prisma: makePrisma(), resolveText: TXT('a') }))
      .rejects.toMatchObject({ code: 'UNAUTHENTICATED', status: 401 });
  });

  it('rejects an identical base/target version id', async () => {
    await expect(createOrGetComparison({ ...base, targetVersionId: 'vB' }, { prisma: makePrisma(), resolveText: TXT('a') }))
      .rejects.toMatchObject({ code: 'SAME_VERSION' });
  });

  it('rejects versions from a different document', async () => {
    const prisma = makePrisma({
      documentVersion: { findMany: jest.fn(async () => [
        { id: 'vB', documentId: 'doc-1', version: 1, mimeType: 'text/plain', originalFileName: 'b.txt', size: 10 },
        { id: 'vT', documentId: 'doc-OTHER', version: 2, mimeType: 'text/plain', originalFileName: 't.txt', size: 10 },
      ]) },
    });
    await expect(createOrGetComparison(base, { prisma, resolveText: TXT('a') }))
      .rejects.toMatchObject({ code: 'CROSS_DOCUMENT_VERSIONS' });
  });

  it('404s when a version does not exist', async () => {
    const prisma = makePrisma({ documentVersion: { findMany: jest.fn(async () => [{ id: 'vB', documentId: 'doc-1', version: 1, mimeType: 'text/plain', originalFileName: 'b.txt', size: 10 }]) } });
    await expect(createOrGetComparison(base, { prisma, resolveText: TXT('a') }))
      .rejects.toMatchObject({ code: 'VERSION_NOT_FOUND', status: 404 });
  });
});

describe('generation and persistence', () => {
  it('produces READY with correct counts and stable segment sequence', async () => {
    const prisma = makePrisma();
    const row = await createOrGetComparison(base, {
      prisma,
      resolveText: (v) => (v.id === 'vB' ? TXT('Alpha\n\nA díj 100 EUR.\n\nTörlendő')() : TXT('Alpha\n\nA díj 250 EUR.')()),
    });
    expect(row.status).toBe('READY');
    expect(row.replaceCount).toBe(1);
    expect(row.deleteCount).toBe(1);
    expect(row.totalSegmentCount).toBe(2);
    // Segments persisted in ascending sequence with no gaps.
    const seqs = prisma._store.segments.map((s: any) => s.sequence);
    expect(seqs).toEqual([...seqs].sort((a, b) => a - b));
    expect(prisma.$transaction).toHaveBeenCalledTimes(1);
  });

  it('records IDENTICAL with zero segments', async () => {
    const prisma = makePrisma();
    const row = await createOrGetComparison(base, { prisma, resolveText: TXT('Azonos szöveg') });
    expect(row.status).toBe('IDENTICAL');
    expect(row.totalSegmentCount).toBe(0);
    expect(prisma._store.segments).toHaveLength(0);
  });

  it('records UNSUPPORTED when a side has no authoritative text', async () => {
    const prisma = makePrisma();
    const row = await createOrGetComparison(base, { prisma, resolveText: UNSUP });
    expect(row.status).toBe('UNSUPPORTED');
    expect(row.failureCode).toBe('EXTRACTION_UNAVAILABLE');
    expect(row.failureMessageSafe).not.toMatch(/path|storage|stack/i);
  });
});

describe('idempotency and lifecycle safety', () => {
  it('reuses an existing READY comparison without regenerating', async () => {
    const prisma = makePrisma();
    prisma._store.comparison = { id: 'cmp-existing', status: 'READY', totalSegmentCount: 3 };
    const row = await createOrGetComparison(base, { prisma, resolveText: TXT('x') });
    expect(row.id).toBe('cmp-existing');
    expect(prisma.$transaction).not.toHaveBeenCalled();
    expect(prisma.documentComparison.create).not.toHaveBeenCalled();
  });

  it('does not duplicate an in-flight PROCESSING comparison', async () => {
    const prisma = makePrisma();
    prisma._store.comparison = { id: 'cmp-inflight', status: 'PROCESSING' };
    const row = await createOrGetComparison(base, { prisma, resolveText: TXT('x') });
    expect(row.id).toBe('cmp-inflight');
    expect(prisma.documentComparison.create).not.toHaveBeenCalled();
  });

  it('reuses the row a concurrent creator won the unique race on', async () => {
    const prisma = makePrisma();
    let created = false;
    prisma.documentComparison.findUnique = jest.fn(async () => (created ? { id: 'cmp-raced', status: 'PROCESSING' } : null));
    prisma.documentComparison.create = jest.fn(async () => { created = true; const e: any = new Error('unique'); e.code = 'P2002'; throw e; });
    const row = await createOrGetComparison(base, { prisma, resolveText: TXT('x') });
    expect(row.id).toBe('cmp-raced');
  });

  it('marks FAILED (never orphan PROCESSING) when persistence throws', async () => {
    const prisma = makePrisma();
    prisma.$transaction = jest.fn(async () => { throw new Error('db down'); });
    await expect(createOrGetComparison(base, {
      prisma, resolveText: (v) => (v.id === 'vB' ? TXT('a')() : TXT('b')()),
    })).rejects.toBeInstanceOf(ComparisonError);
    expect(prisma._store.comparison.status).toBe('FAILED');
    expect(prisma._store.comparison.failureCode).toBe('PROCESSING_ERROR');
    expect(prisma._store.comparison.completedAt).toBeInstanceOf(Date);
  });
});

describe('version-text provider', () => {
  it('extracts TXT and refuses non-text formats without fabricating text', async () => {
    const dl = async () => Buffer.from('Szerződés\r\nszöveg', 'utf8');
    const ok = await resolveVersionText({ id: 'v', documentId: 'd', mimeType: 'text/plain', originalFileName: 'a.txt', size: 20 }, dl);
    expect(ok.supported).toBe(true);
    expect(ok.text).toContain('Szerződés');

    const pdf = await resolveVersionText({ id: 'v', documentId: 'd', mimeType: 'application/pdf', originalFileName: 'a.pdf', size: 20 }, dl);
    expect(pdf.supported).toBe(false);
    expect(pdf.text).toBeNull();
    expect(pdf.reasonCode).toBe('FORMAT_NOT_TEXT_EXTRACTABLE');
  });
});
