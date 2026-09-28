/**
 * W3A — legal-source observation review lifecycle (no database required).
 *
 * Exercises the REAL review routes and the REAL review service over an
 * in-memory Prisma fake, plus the real W2 ingestion service for replay
 * provenance. Proves the human/internal review boundary over machine-ingested
 * observations:
 *
 *  - W2 rows land in NEW; NEW → IN_REVIEW → { NO_IMPACT | IMPACT_CONFIRMED |
 *    REJECTED }; terminal states are immutable and every other transition is a
 *    409 OBSERVATION_REVIEW_INVALID_TRANSITION;
 *  - each transition is one atomic conditional update, so of concurrent actors
 *    exactly one wins (double start / double terminal decision);
 *  - reviewer and decider provenance is persisted; notes are trimmed, empty
 *    notes become null, notes over 2000 characters are rejected;
 *  - list pagination is bounded (default 50, max 100) and filters by
 *    reviewStatus and canonical sourceIdentifier;
 *  - CLIENT identities and unauthenticated callers cannot reach the surface;
 *  - a W2 duplicate replay never resets IN_REVIEW or a terminal state;
 *  - a decision never mutates the linked LegalSourceVersion status/reviewStatus
 *    and never writes AssessmentFinding/Task/Case/ComplianceProposal/
 *    Notification/RequirementApplicability;
 *  - the schema, migration and DTOs carry no clientId/caseId/documentId.
 */
import express, { NextFunction, Request, Response } from 'express';
import http from 'http';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

type Row = Record<string, any>;

interface Store {
  sources: Row[];
  versions: Row[];
  captures: Row[];
  observations: Row[];
  users: Row[];
}

const DOWNSTREAM_MODELS = [
  'assessmentFinding',
  'task',
  'case',
  'complianceProposal',
  'notification',
  'requirementApplicability',
] as const;

const REVIEW_STARTER = { id: 'user-starter', name: 'Starter Reviewer' };
const REVIEW_DECIDER = { id: 'user-decider', name: 'Deciding Reviewer' };

const counters = {
  observationCreate: 0,
  observationUpdate: 0,
  versionCreate: 0,
  versionUpdate: 0,
  captureCreate: 0,
  captureUpdate: 0,
  downstream: {} as Record<string, number>,
};
for (const model of DOWNSTREAM_MODELS) counters.downstream[model] = 0;

function gdprSource(): Row {
  return {
    id: 'source-gdpr',
    sourceKey: 'EU-32016R0679',
    jurisdictionCode: 'EU',
    instrumentType: 'REGULATION',
    canonicalCitation: 'Regulation (EU) 2016/679',
    title: 'GDPR',
    status: 'APPROVED',
  };
}

function freshStore(): Store {
  return {
    sources: [gdprSource()],
    versions: [],
    captures: [],
    observations: [],
    users: [{ ...REVIEW_STARTER }, { ...REVIEW_DECIDER }],
  };
}

const store: Store = freshStore();

function observationMatcher(row: Row, where: Row): boolean {
  if (where.reviewStatus !== undefined && String(row.reviewStatus) !== String(where.reviewStatus)) return false;
  if (where.kind !== undefined && String(row.kind) !== String(where.kind)) return false;
  if (where.sourceIdentifier !== undefined && row.sourceIdentifier !== where.sourceIdentifier) return false;
  return true;
}

function downstreamModel(name: string) {
  const touch = async () => {
    counters.downstream[name] += 1;
    return { count: 1 };
  };
  return { create: touch, createMany: touch, update: touch, updateMany: touch, upsert: touch, delete: touch, deleteMany: touch };
}

function createFakePrisma(st: Store): any {
  const pick = (row: Row, select: Row): Row => {
    const out: Row = {};
    for (const key of Object.keys(select)) out[key] = row[key];
    return out;
  };
  const withRelations = (row: Row): Row => ({
    ...row,
    legalSource: row.legalSourceId ? st.sources.find((source) => source.id === row.legalSourceId) ?? null : null,
    legalSourceVersion: row.legalSourceVersionId ? st.versions.find((version) => version.id === row.legalSourceVersionId) ?? null : null,
    legalSourceCapture: row.legalSourceCaptureId ? st.captures.find((capture) => capture.id === row.legalSourceCaptureId) ?? null : null,
    reviewStartedBy: row.reviewStartedById ? st.users.find((user) => user.id === row.reviewStartedById) ?? null : null,
    decidedBy: row.decidedById ? st.users.find((user) => user.id === row.decidedById) ?? null : null,
  });

  const db: any = {
    legalSource: {
      findUnique: async ({ where }: any) =>
        st.sources.find((source) => (where.sourceKey ? source.sourceKey === where.sourceKey : source.id === where.id)) ?? null,
      create: async () => {
        throw new Error('observation review must never provision a LegalSource');
      },
      update: async () => {
        throw new Error('observation review must never mutate a LegalSource');
      },
    },
    legalSourceVersion: {
      findUnique: async ({ where }: any) => st.versions.find((version) => version.id === where.id) ?? null,
      upsert: async ({ where, create }: any) => {
        const key = where.legalSourceId_legalVersionKey;
        const existing = st.versions.find(
          (version) => version.legalSourceId === key.legalSourceId && version.legalVersionKey === key.legalVersionKey,
        );
        if (existing) return existing;
        counters.versionCreate += 1;
        const row = { id: `version-${st.versions.length + 1}`, reviewStatus: 'UNREVIEWED', status: 'CANDIDATE', ...create };
        st.versions.push(row);
        return row;
      },
      update: async () => {
        counters.versionUpdate += 1;
        throw new Error('observation review must never mutate a LegalSourceVersion');
      },
      updateMany: async () => {
        counters.versionUpdate += 1;
        throw new Error('observation review must never mutate a LegalSourceVersion');
      },
    },
    legalSourceCapture: {
      upsert: async ({ where, create }: any) => {
        const key = where.legalSourceVersionId_sourceSha256;
        const existing = st.captures.find(
          (capture) => capture.legalSourceVersionId === key.legalSourceVersionId && capture.sourceSha256 === key.sourceSha256,
        );
        if (existing) return existing;
        counters.captureCreate += 1;
        const row = { id: `capture-${st.captures.length + 1}`, ...create };
        st.captures.push(row);
        return row;
      },
      update: async () => {
        counters.captureUpdate += 1;
        throw new Error('observation review must never mutate a LegalSourceCapture');
      },
    },
    legalSourceObservation: {
      findUnique: async ({ where, select, include }: any) => {
        let row: Row | undefined;
        if (where.id !== undefined) row = st.observations.find((observation) => observation.id === where.id);
        else if (where.idempotencyKey !== undefined) row = st.observations.find((observation) => observation.idempotencyKey === where.idempotencyKey);
        if (!row) return null;
        if (select) return pick(row, select);
        if (include) return withRelations(row);
        return { ...row };
      },
      create: async ({ data }: any) => {
        counters.observationCreate += 1;
        const row: Row = {
          id: `observation-${st.observations.length + 1}`,
          ingestedAt: new Date('2026-09-27T21:00:00.000Z'),
          legalSourceVersionId: null,
          legalSourceCaptureId: null,
          effectiveFrom: null,
          ...data,
          reviewStatus: 'NEW',
          reviewStartedAt: null,
          reviewStartedById: null,
          decidedAt: null,
          decidedById: null,
          decisionNote: null,
        };
        st.observations.push(row);
        return row;
      },
      updateMany: async ({ where, data }: any) => {
        const matches = st.observations.filter((row) => row.id === where.id && observationMatcher(row, where));
        if (matches.length > 0) {
          Object.assign(matches[0], data);
          counters.observationUpdate += 1;
        }
        return { count: matches.length };
      },
      count: async ({ where }: any) => st.observations.filter((row) => observationMatcher(row, where ?? {})).length,
      findMany: async ({ where, skip, take }: any) => {
        const rows = st.observations
          .filter((row) => observationMatcher(row, where ?? {}))
          .sort((a, b) => {
            const delta = new Date(b.ingestedAt).getTime() - new Date(a.ingestedAt).getTime();
            return delta !== 0 ? delta : String(b.id).localeCompare(String(a.id));
          });
        return rows.slice(skip ?? 0, (skip ?? 0) + (take ?? rows.length)).map(withRelations);
      },
    },
    user: { findUnique: async () => null },
    $transaction: async (run: any) => {
      const backup = {
        sources: [...st.sources],
        versions: [...st.versions],
        captures: [...st.captures],
        observations: [...st.observations],
      };
      try {
        return await run(db);
      } catch (error) {
        st.sources = backup.sources;
        st.versions = backup.versions;
        st.captures = backup.captures;
        st.observations = backup.observations;
        throw error;
      }
    },
  };
  for (const model of DOWNSTREAM_MODELS) db[model] = downstreamModel(model);
  return db;
}

const mockDb = createFakePrisma(store);

jest.mock('../src/middleware/auth', () => ({
  authenticate: (req: Request, res: Response, next: NextFunction) => {
    const header = String(req.headers.authorization || '');
    if (header === 'Bearer internal-token') {
      (req as any).user = { userId: 'user-starter', role: 'LAWYER' };
      return next();
    }
    if (header === 'Bearer decider-token') {
      (req as any).user = { userId: 'user-decider', role: 'ADMIN' };
      return next();
    }
    if (header === 'Bearer client-token') {
      (req as any).user = { userId: 'portal-user', role: 'CLIENT' };
      return next();
    }
    res.status(401).json({ code: 'NO_TOKEN' });
  },
}));
jest.mock('../src/prisma/prisma.service', () => ({ prisma: mockDb }));

import reviewRoutes from '../src/modules/compliance/legalSourceObservationReviewRoutes';
import { ingestLegalSourceObservations } from '../src/modules/compliance/legalSourceObservationService';

const BASE = '/api/v1/compliance/legal-source-observations';

const app = express();
app.use(express.json());
app.use('/api/v1/compliance', reviewRoutes);
const server = http.createServer(app);

beforeAll((done) => {
  server.listen(0, done);
});
afterAll((done) => {
  server.close(done);
});

let seedSeq = 0;

function resetStore(): void {
  const fresh = freshStore();
  store.sources = fresh.sources;
  store.versions = fresh.versions;
  store.captures = fresh.captures;
  store.observations = fresh.observations;
  store.users = fresh.users;
  counters.observationCreate = 0;
  counters.observationUpdate = 0;
  counters.versionCreate = 0;
  counters.versionUpdate = 0;
  counters.captureCreate = 0;
  counters.captureUpdate = 0;
  for (const model of DOWNSTREAM_MODELS) counters.downstream[model] = 0;
  seedSeq = 0;
}

beforeEach(() => {
  resetStore();
});

function api(method: string, path: string, opts: { token?: string | null; body?: any } = {}): Promise<{ status: number; json: any }> {
  const token = opts.token === undefined ? 'internal-token' : opts.token;
  return new Promise((resolve, reject) => {
    const payload = opts.body === undefined ? undefined : JSON.stringify(opts.body);
    const request = http.request(
      {
        host: '127.0.0.1',
        port: (server.address() as any).port,
        path,
        method,
        headers: {
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
          ...(payload ? { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(payload) } : {}),
        },
      },
      (response) => {
        let data = '';
        response.on('data', (chunk) => (data += chunk));
        response.on('end', () => resolve({ status: response.statusCode || 0, json: data ? JSON.parse(data) : null }));
      },
    );
    request.on('error', reject);
    if (payload) request.write(payload);
    request.end();
  });
}

function startReview(id: string, token = 'internal-token') {
  return api('POST', `${BASE}/${id}/start-review`, { token });
}

function decideReview(id: string, decision: string, note?: unknown, token = 'decider-token') {
  return api('POST', `${BASE}/${id}/decision`, {
    token,
    body: note === undefined ? { decision } : { decision, note },
  });
}

function seedObservation(overrides: Row = {}): Row {
  seedSeq += 1;
  const row: Row = {
    id: `obs-${seedSeq}`,
    schemaVersion: 1,
    idempotencyKey: `seed-key-${seedSeq}`,
    payloadDigest: 'd'.repeat(64),
    kind: 'AMENDMENT_PUBLISHED',
    source: 'EUR_LEX',
    identifierFamily: 'CELEX',
    sourceIdentifier: '32016R0679',
    relatedIdentifier: '32003R1882',
    legalSourceId: 'source-gdpr',
    effectiveFrom: null,
    sourceUri: `https://eur-lex.europa.eu/seed-${seedSeq}`,
    evidenceSha256: 'e'.repeat(64),
    capturedAt: new Date('2026-09-27T20:00:00.000Z'),
    queryProvenance: null,
    warnings: [],
    legalSourceVersionId: null,
    legalSourceCaptureId: null,
    ingestedAt: new Date(Date.UTC(2026, 8, 27, 20, 0, seedSeq)),
    reviewStatus: 'NEW',
    reviewStartedAt: null,
    reviewStartedById: null,
    decidedAt: null,
    decidedById: null,
    decisionNote: null,
    ...overrides,
  };
  store.observations.push(row);
  return row;
}

const SHA_A = 'a'.repeat(64);

function amendmentItem(overrides: Row = {}): Row {
  return {
    idempotencyKey: 'watcher-amendment-default',
    kind: 'AMENDMENT_PUBLISHED',
    source: 'EUR_LEX',
    identifierFamily: 'CELEX',
    sourceIdentifier: '32016R0679',
    relatedIdentifier: '32003R1882',
    effectiveFrom: null,
    evidence: {
      sourceUri: 'https://eur-lex.europa.eu/legal-content/EN/TXT/?uri=CELEX:32003R1882',
      sha256: SHA_A,
      capturedAt: '2026-09-27T20:00:00Z',
      queryProvenance: { cellar: { work: '32003R1882' } },
    },
    warnings: [],
    ...overrides,
  };
}

function consolidatedItem(overrides: Row = {}): Row {
  return {
    idempotencyKey: 'watcher-consolidated-default',
    kind: 'CONSOLIDATED_VERSION_AVAILABLE',
    source: 'EUR_LEX',
    identifierFamily: 'CELEX',
    sourceIdentifier: '32016R0679',
    relatedIdentifier: '02016R0679-20160504',
    effectiveFrom: '2016-05-04T00:00:00Z',
    evidence: {
      sourceUri: 'https://eur-lex.europa.eu/legal-content/EN/TXT/?uri=CELEX:02016R0679-20160504',
      sha256: SHA_A,
      capturedAt: '2026-09-27T20:00:00Z',
      queryProvenance: { cellar: { work: '02016R0679-20160504' } },
    },
    warnings: [],
    ...overrides,
  };
}

function ingestW2(...observations: unknown[]) {
  return ingestLegalSourceObservations({ schemaVersion: 1, observations }, mockDb);
}

async function ingestAmendment(key: string, overrides: Row = {}): Promise<Row> {
  const response = await ingestW2(amendmentItem({ idempotencyKey: key, ...overrides }));
  expect(response.results[0]).toMatchObject({ status: 'ACCEPTED' });
  return store.observations.find((observation) => observation.idempotencyKey === key) as Row;
}

describe('W3A review lifecycle transitions', () => {
  it('a new machine-ingested observation defaults to NEW with no review provenance', async () => {
    const response = await ingestW2(amendmentItem({ idempotencyKey: 'w3a-new-1' }));
    expect(response.results[0]).toMatchObject({ status: 'ACCEPTED' });
    expect(store.observations).toHaveLength(1);
    const row = store.observations[0];
    expect(row.reviewStatus).toBe('NEW');
    expect(row.reviewStartedAt).toBeNull();
    expect(row.reviewStartedById).toBeNull();
    expect(row.decidedAt).toBeNull();
    expect(row.decidedById).toBeNull();
    expect(row.decisionNote).toBeNull();

    const list = await api('GET', BASE);
    expect(list.status).toBe(200);
    expect(list.json.items[0].reviewStatus).toBe('NEW');
    const detail = await api('GET', `${BASE}/${row.id}`);
    expect(detail.status).toBe(200);
    expect(detail.json.reviewStatus).toBe('NEW');
  });

  it('NEW -> IN_REVIEW succeeds, records provenance, and a second start returns 409 OBSERVATION_REVIEW_INVALID_TRANSITION', async () => {
    const row = await ingestAmendment('w3a-start-1');

    const started = await startReview(row.id);
    expect(started.status).toBe(200);
    expect(started.json.reviewStatus).toBe('IN_REVIEW');
    expect(started.json.reviewStartedBy).toEqual({ id: 'user-starter', name: 'Starter Reviewer' });
    expect(Number.isNaN(new Date(started.json.reviewStartedAt).getTime())).toBe(false);
    expect(row.reviewStatus).toBe('IN_REVIEW');
    const startedAt = row.reviewStartedAt;
    expect(startedAt).toBeInstanceOf(Date);

    const second = await startReview(row.id);
    expect(second.status).toBe(409);
    expect(second.json.code).toBe('OBSERVATION_REVIEW_INVALID_TRANSITION');
    expect(row.reviewStatus).toBe('IN_REVIEW');
    expect(row.reviewStartedAt).toBe(startedAt);
    expect(row.reviewStartedById).toBe('user-starter');
  });

  it.each(['NO_IMPACT', 'IMPACT_CONFIRMED', 'REJECTED'])('IN_REVIEW -> %s is accepted', async (decision) => {
    const row = await ingestAmendment(`w3a-decide-${decision}`);
    const started = await startReview(row.id);
    expect(started.status).toBe(200);

    const decided = await decideReview(row.id, decision);
    expect(decided.status).toBe(200);
    expect(decided.json.reviewStatus).toBe(decision);
    expect(row.reviewStatus).toBe(decision);
    expect(row.decidedAt).toBeInstanceOf(Date);
    expect(row.decidedById).toBe('user-decider');
    expect(row.decisionNote).toBeNull();
  });

  it('rejects a terminal decision on a NEW observation', async () => {
    const row = seedObservation();
    const rejected = await decideReview(row.id, 'IMPACT_CONFIRMED');
    expect(rejected.status).toBe(409);
    expect(rejected.json.code).toBe('OBSERVATION_REVIEW_INVALID_TRANSITION');
    expect(row.reviewStatus).toBe('NEW');
    expect(row.decidedAt).toBeNull();
  });

  it('terminal states are immutable for every transition', async () => {
    const row = await ingestAmendment('w3a-terminal-1');
    await startReview(row.id);
    const decided = await decideReview(row.id, 'REJECTED');
    expect(decided.status).toBe(200);

    const restart = await startReview(row.id);
    expect(restart.status).toBe(409);
    expect(restart.json.code).toBe('OBSERVATION_REVIEW_INVALID_TRANSITION');
    const redecide = await decideReview(row.id, 'NO_IMPACT');
    expect(redecide.status).toBe(409);
    expect(redecide.json.code).toBe('OBSERVATION_REVIEW_INVALID_TRANSITION');
    expect(row.reviewStatus).toBe('REJECTED');
    expect(row.decidedById).toBe('user-decider');
  });

  it('concurrent start-review attempts: the conditional transition lets exactly one win', async () => {
    const row = seedObservation();
    const [first, second] = await Promise.all([startReview(row.id), startReview(row.id)]);
    expect([first.status, second.status].sort()).toEqual([200, 409]);
    expect(row.reviewStatus).toBe('IN_REVIEW');
    expect(row.reviewStartedById).toBe('user-starter');
    const startedAt = row.reviewStartedAt;

    const third = await startReview(row.id);
    expect(third.status).toBe(409);
    expect(row.reviewStartedAt).toBe(startedAt);
  });

  it('concurrent terminal decisions: the conditional transition lets exactly one win', async () => {
    const row = seedObservation();
    const started = await startReview(row.id);
    expect(started.status).toBe(200);

    const [noImpact, impact] = await Promise.all([
      decideReview(row.id, 'NO_IMPACT', undefined, 'decider-token'),
      decideReview(row.id, 'IMPACT_CONFIRMED', undefined, 'internal-token'),
    ]);
    expect([noImpact.status, impact.status].sort()).toEqual([200, 409]);
    expect(['NO_IMPACT', 'IMPACT_CONFIRMED']).toContain(row.reviewStatus);
    expect(row.decidedAt).toBeInstanceOf(Date);
    expect(row.decidedById).toBe(noImpact.status === 200 ? 'user-decider' : 'user-starter');
  });

  it('preserves the starter provenance and persists decider provenance', async () => {
    const row = await ingestAmendment('w3a-provenance-1');
    await startReview(row.id);
    const startedAt = row.reviewStartedAt;

    const decided = await decideReview(row.id, 'NO_IMPACT', '  needs a closer look  ');
    expect(decided.status).toBe(200);
    expect(decided.json.reviewStartedBy).toEqual({ id: 'user-starter', name: 'Starter Reviewer' });
    expect(new Date(decided.json.reviewStartedAt).getTime()).toBe(startedAt.getTime());
    expect(decided.json.decidedBy).toEqual({ id: 'user-decider', name: 'Deciding Reviewer' });
    expect(Number.isNaN(new Date(decided.json.decidedAt).getTime())).toBe(false);
    expect(row.reviewStartedById).toBe('user-starter');
    expect(row.reviewStartedAt).toBe(startedAt);
    expect(row.decidedById).toBe('user-decider');
    expect(row.decisionNote).toBe('needs a closer look');
  });

  it('persists an empty note as null', async () => {
    const row = await ingestAmendment('w3a-note-empty');
    await startReview(row.id);
    const decided = await decideReview(row.id, 'NO_IMPACT', '   ');
    expect(decided.status).toBe(200);
    expect(decided.json.decisionNote).toBeNull();
    expect(row.decisionNote).toBeNull();
  });

  it('rejects a note longer than 2000 characters and accepts exactly 2000', async () => {
    const row = await ingestAmendment('w3a-note-long');
    await startReview(row.id);
    const tooLong = await decideReview(row.id, 'NO_IMPACT', 'x'.repeat(2001));
    expect(tooLong.status).toBe(400);
    expect(tooLong.json.code).toBe('DECISION_NOTE_TOO_LONG');
    expect(row.reviewStatus).toBe('IN_REVIEW');
    expect(row.decidedAt).toBeNull();

    const boundary = await decideReview(row.id, 'NO_IMPACT', 'x'.repeat(2000));
    expect(boundary.status).toBe(200);
    expect(boundary.json.decisionNote).toHaveLength(2000);
    expect(row.decisionNote).toHaveLength(2000);
  });
});

describe('W3A authorization boundary', () => {
  it('forbids CLIENT identities on list and start-review', async () => {
    const list = await api('GET', BASE, { token: 'client-token' });
    expect(list.status).toBe(403);
    expect(list.json.code).toBe('INTERACTION_NOT_AUTHORIZED');

    const row = seedObservation();
    const start = await startReview(row.id, 'client-token');
    expect(start.status).toBe(403);
    expect(start.json.code).toBe('INTERACTION_NOT_AUTHORIZED');
    expect(row.reviewStatus).toBe('NEW');
  });

  it('forbids unauthenticated callers on list and start-review', async () => {
    const list = await api('GET', BASE, { token: null });
    expect(list.status).toBe(401);

    const row = seedObservation();
    const start = await startReview(row.id, null as any);
    expect(start.status).toBe(401);
    expect(row.reviewStatus).toBe('NEW');
  });
});

describe('W3A review queue', () => {
  it('bounds the default list page', async () => {
    for (let index = 0; index < 60; index += 1) seedObservation();
    const response = await api('GET', BASE);
    expect(response.status).toBe(200);
    expect(response.json.pagination).toMatchObject({ limit: 50, offset: 0, total: 60, returned: 50 });
    expect(response.json.items).toHaveLength(50);
    expect(response.json.items[0].id).toBe('obs-60');
    expect(response.json.items[49].id).toBe('obs-11');
  });

  it('accepts limit 100 and rejects limit over the maximum', async () => {
    seedObservation();
    seedObservation();
    seedObservation();
    const max = await api('GET', `${BASE}?limit=100`);
    expect(max.status).toBe(200);
    expect(max.json.pagination.limit).toBe(100);
    expect(max.json.pagination.returned).toBe(3);

    const over = await api('GET', `${BASE}?limit=101`);
    expect(over.status).toBe(400);
    expect(over.json.code).toBe('INVALID_PAGINATION');

    const zero = await api('GET', `${BASE}?limit=0`);
    expect(zero.status).toBe(400);
    expect(zero.json.code).toBe('INVALID_PAGINATION');
  });

  it('filters by reviewStatus and rejects an unknown status', async () => {
    const fresh = seedObservation();
    const inReview = seedObservation();
    const started = await startReview(inReview.id);
    expect(started.status).toBe(200);

    const newOnly = await api('GET', `${BASE}?reviewStatus=NEW`);
    expect(newOnly.status).toBe(200);
    expect(newOnly.json.pagination.total).toBe(1);
    expect(newOnly.json.items[0].id).toBe(fresh.id);

    const reviewOnly = await api('GET', `${BASE}?reviewStatus=IN_REVIEW`);
    expect(reviewOnly.status).toBe(200);
    expect(reviewOnly.json.pagination.total).toBe(1);
    expect(reviewOnly.json.items[0].id).toBe(inReview.id);

    const invalid = await api('GET', `${BASE}?reviewStatus=APPROVED`);
    expect(invalid.status).toBe(400);
    expect(invalid.json.code).toBe('INVALID_REVIEW_STATUS');
  });

  it('filters by canonical sourceIdentifier and rejects a malformed one', async () => {
    const gdpr = seedObservation();
    const nis2 = seedObservation({ sourceIdentifier: '32022L2555', relatedIdentifier: '32022L2555' });

    const normalized = await api('GET', `${BASE}?sourceIdentifier=32016r0679`);
    expect(normalized.status).toBe(200);
    expect(normalized.json.pagination.total).toBe(1);
    expect(normalized.json.items[0].id).toBe(gdpr.id);

    const absent = await api('GET', `${BASE}?sourceIdentifier=32020R0001`);
    expect(absent.status).toBe(200);
    expect(absent.json.pagination.total).toBe(0);

    const malformed = await api('GET', `${BASE}?sourceIdentifier=EU-32016R0679`);
    expect(malformed.status).toBe(400);
    expect(malformed.json.code).toBe('INVALID_SOURCE_IDENTIFIER');
    expect(nis2.reviewStatus).toBe('NEW');
  });

  it('returns 404 for an unknown observation detail', async () => {
    const response = await api('GET', `${BASE}/missing-observation`);
    expect(response.status).toBe(404);
    expect(response.json.code).toBe('OBSERVATION_NOT_FOUND');
  });
});

describe('W3A tenant-field isolation', () => {
  it('never exposes clientId/caseId/documentId through list or detail DTOs', async () => {
    const row = seedObservation({ clientId: 'client-x', caseId: 'case-x', documentId: 'doc-x' });
    const detail = await api('GET', `${BASE}/${row.id}`);
    expect(detail.status).toBe(200);
    expect(detail.json).not.toHaveProperty('clientId');
    expect(detail.json).not.toHaveProperty('caseId');
    expect(detail.json).not.toHaveProperty('documentId');
    expect(JSON.stringify(detail.json)).not.toContain('client-x');
    expect(JSON.stringify(detail.json)).not.toContain('case-x');
    expect(JSON.stringify(detail.json)).not.toContain('doc-x');

    const list = await api('GET', BASE);
    expect(list.status).toBe(200);
    expect(JSON.stringify(list.json)).not.toContain('client-x');
    expect(JSON.stringify(list.json)).not.toContain('case-x');
    expect(JSON.stringify(list.json)).not.toContain('doc-x');
  });
});

describe('W3A + W2 replay preservation and isolation', () => {
  it('a W2 duplicate replay leaves IN_REVIEW unchanged', async () => {
    const item = amendmentItem({ idempotencyKey: 'w3a-replay-in-review' });
    await ingestW2(item);
    const row = store.observations[0];
    const started = await startReview(row.id);
    expect(started.status).toBe(200);
    const startedAt = row.reviewStartedAt;
    const startedBy = row.reviewStartedById;
    const writesBefore = counters.observationCreate;

    const replay = await ingestW2(item);
    expect(replay.results[0]).toMatchObject({ status: 'DUPLICATE' });
    expect(store.observations).toHaveLength(1);
    expect(row.reviewStatus).toBe('IN_REVIEW');
    expect(row.reviewStartedAt).toBe(startedAt);
    expect(row.reviewStartedById).toBe(startedBy);
    expect(row.decidedAt).toBeNull();
    expect(counters.observationCreate).toBe(writesBefore);
  });

  it('a W2 duplicate replay leaves a terminal decision unchanged', async () => {
    const item = amendmentItem({ idempotencyKey: 'w3a-replay-terminal' });
    await ingestW2(item);
    const row = store.observations[0];
    await startReview(row.id);
    const decided = await decideReview(row.id, 'REJECTED', 'source-side noise only');
    expect(decided.status).toBe(200);
    const decidedAt = row.decidedAt;
    const snapshot = { ...row };

    const replay = await ingestW2(item);
    expect(replay.results[0]).toMatchObject({ status: 'DUPLICATE' });
    expect(store.observations).toHaveLength(1);
    expect(row.reviewStatus).toBe('REJECTED');
    expect(row.decidedAt).toBe(decidedAt);
    expect(row.decidedById).toBe('user-decider');
    expect(row.decisionNote).toBe('source-side noise only');
    expect(JSON.stringify(row)).toBe(JSON.stringify(snapshot));
  });

  it('a decision never mutates the linked LegalSourceVersion status/reviewStatus', async () => {
    const ingested = await ingestW2(consolidatedItem({ idempotencyKey: 'w3a-version-1' }));
    expect(ingested.results[0]).toMatchObject({ status: 'ACCEPTED' });
    expect(store.versions).toHaveLength(1);
    const version = store.versions[0];
    const versionSnapshot = { ...version };
    expect(version.status).toBe('CANDIDATE');
    expect(version.reviewStatus).toBe('UNREVIEWED');

    const row = store.observations[0];
    await startReview(row.id);
    const decided = await decideReview(row.id, 'IMPACT_CONFIRMED', 'human impact assessment needed');
    expect(decided.status).toBe(200);

    expect(version.status).toBe('CANDIDATE');
    expect(version.reviewStatus).toBe('UNREVIEWED');
    expect(store.versions[0]).toEqual(versionSnapshot);
    expect(store.captures).toHaveLength(1);
    expect(counters.versionUpdate).toBe(0);
    expect(counters.captureUpdate).toBe(0);

    const detail = await api('GET', `${BASE}/${row.id}`);
    expect(detail.json.legalSourceVersion).toMatchObject({ status: 'CANDIDATE', reviewStatus: 'UNREVIEWED' });
  });

  it('a decision leaves an ACTIVE + APPROVED linked version untouched', async () => {
    store.versions.push({
      id: 'version-active',
      legalSourceId: 'source-gdpr',
      legalVersionKey: '02016R0679-20160504',
      status: 'ACTIVE',
      reviewStatus: 'APPROVED',
      effectiveFrom: new Date('2016-05-04T00:00:00.000Z'),
    });
    const versionSnapshot = { ...store.versions[0] };
    const row = seedObservation({ legalSourceVersionId: 'version-active' });

    await startReview(row.id);
    const decided = await decideReview(row.id, 'NO_IMPACT');
    expect(decided.status).toBe(200);
    expect(store.versions[0]).toEqual(versionSnapshot);
    expect(store.versions[0].status).toBe('ACTIVE');
    expect(store.versions[0].reviewStatus).toBe('APPROVED');
    expect(counters.versionUpdate).toBe(0);
  });

  it('a full lifecycle performs zero writes to downstream compliance models', async () => {
    await ingestW2(
      amendmentItem({ idempotencyKey: 'w3a-downstream-1' }),
      consolidatedItem({ idempotencyKey: 'w3a-downstream-2' }),
    );
    const amendment = store.observations.find((observation) => observation.idempotencyKey === 'w3a-downstream-1') as Row;
    const consolidated = store.observations.find((observation) => observation.idempotencyKey === 'w3a-downstream-2') as Row;

    await startReview(amendment.id);
    await decideReview(amendment.id, 'NO_IMPACT');
    await startReview(consolidated.id);
    await decideReview(consolidated.id, 'IMPACT_CONFIRMED', 'warrants assessment');
    await api('GET', BASE);
    await api('GET', `${BASE}/${amendment.id}`);

    for (const model of DOWNSTREAM_MODELS) {
      expect(counters.downstream[model]).toBe(0);
    }
  });

  it('static guard: the W3A module performs no downstream compliance writes', () => {
    const files = [
      join(__dirname, '..', 'src', 'modules', 'compliance', 'legalSourceObservationReviewService.ts'),
      join(__dirname, '..', 'src', 'modules', 'compliance', 'legalSourceObservationReviewRoutes.ts'),
    ];
    const forbidden = [
      'assessmentFinding', 'complianceProposal', 'requirementApplicability',
      'task.create', 'case.create', 'notification.create', 'clientRequest.create',
      'legalSourceVersion.update', 'legalSourceCapture.update',
    ];
    for (const file of files) {
      const source = readFileSync(file, 'utf8');
      for (const token of forbidden) expect(source).not.toContain(token);
    }
  });
});

describe('W3A schema + migration static guard', () => {
  const schema = readFileSync(join(__dirname, '..', 'prisma', 'schema.prisma'), 'utf8');
  const modelStart = schema.indexOf('model LegalSourceObservation {');
  const modelBlock = schema.slice(modelStart, schema.indexOf('\n}', modelStart));
  const enumStart = schema.indexOf('enum LegalSourceObservationReviewStatus {');
  const enumBlock = schema.slice(enumStart, schema.indexOf('\n}', enumStart));

  it('declares the review lifecycle enum with all five statuses', () => {
    expect(enumStart).toBeGreaterThan(-1);
    for (const status of ['NEW', 'IN_REVIEW', 'NO_IMPACT', 'IMPACT_CONFIRMED', 'REJECTED']) {
      expect(enumBlock).toContain(status);
    }
  });

  it('defaults reviewStatus to NEW and carries reviewer/decider provenance plus the queue index', () => {
    expect(modelStart).toBeGreaterThan(-1);
    expect(modelBlock).toMatch(/reviewStatus\s+LegalSourceObservationReviewStatus\s+@default\(NEW\)/);
    expect(modelBlock).toContain('reviewStartedAt');
    expect(modelBlock).toContain('reviewStartedById');
    expect(modelBlock).toContain('decidedAt');
    expect(modelBlock).toContain('decidedById');
    expect(modelBlock).toContain('decisionNote');
    expect(modelBlock).toContain('@@index([reviewStatus, ingestedAt])');
  });

  it('carries no clientId/caseId/documentId field', () => {
    expect(modelStart).toBeGreaterThan(-1);
    for (const forbidden of ['clientId', 'caseId', 'documentId']) {
      expect(modelBlock).not.toContain(forbidden);
    }
  });

  it('ships one additive review migration with the NEW default and no destructive statement', () => {
    const sql = readFileSync(
      join(__dirname, '..', 'prisma', 'migrations', '20260927230000_add_observation_review_lifecycle', 'migration.sql'),
      'utf8',
    );
    expect(sql).toContain('CREATE TYPE "LegalSourceObservationReviewStatus" AS ENUM');
    expect(sql).toMatch(/ADD COLUMN "reviewStatus" "LegalSourceObservationReviewStatus" NOT NULL DEFAULT 'NEW'/);
    expect(sql).toContain('CREATE INDEX "legal_source_observations_reviewStatus_ingestedAt_idx"');
    expect(sql).toMatch(/ON DELETE SET NULL/);
    expect(sql).not.toMatch(/DROP\s+(TABLE|COLUMN|TYPE|CONSTRAINT)/i);
    for (const forbidden of ['clientId', 'caseId', 'documentId']) {
      expect(sql).not.toContain(forbidden);
    }
  });

  it('declares no client/case/document field in the review DTOs', () => {
    const source = readFileSync(
      join(__dirname, '..', 'src', 'modules', 'compliance', 'legalSourceObservationReviewService.ts'),
      'utf8',
    );
    for (const name of ['ObservationReviewerSummaryDto', 'LegalSourceObservationReviewItemDto', 'LegalSourceObservationReviewDetailDto']) {
      const start = source.indexOf(`export interface ${name} `);
      expect(start).toBeGreaterThan(-1);
      const block = source.slice(start, source.indexOf('\n}', start));
      for (const forbidden of ['clientId', 'caseId', 'documentId']) {
        expect(block).not.toContain(forbidden);
      }
    }
  });
});
