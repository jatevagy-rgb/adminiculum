/**
 * W3B — read-only observation impact adapter (no database required).
 *
 * Exercises the REAL W3B route and service over an in-memory Prisma fake, the
 * REAL canonical C4C access resolver (`resolveImpactAccessScope`) and the REAL
 * C4C impact engine (`buildLegalSourceImpactForVersion`):
 *
 *  - only IMPACT_CONFIRMED observations expose impact; NEW, IN_REVIEW,
 *    NO_IMPACT and REJECTED are 409 OBSERVATION_IMPACT_NOT_CONFIRMED and an
 *    unknown id is 404 OBSERVATION_NOT_FOUND;
 *  - a persisted legalSourceVersionId is used EXACTLY, even when CANDIDATE /
 *    UNREVIEWED — it is never silently replaced by the ACTIVE + APPROVED
 *    version;
 *  - an amendment without a linked version resolves the unique ACTIVE +
 *    APPROVED base version: zero → 422 OBSERVATION_IMPACT_VERSION_UNAVAILABLE,
 *    more than one → 409 OBSERVATION_IMPACT_VERSION_AMBIGUOUS;
 *  - a consolidated observation without a linked version fails closed (422) and
 *    never falls back to the base version;
 *  - canonical scope semantics hold: CASE-scoped document visibility plus the
 *    HR_CONFIDENTIAL boundary plus the derived client-level scope;
 *  - the W3B path performs ZERO Prisma mutations, leaves the observation
 *    review state and the LegalSourceVersion lifecycle untouched, and keeps
 *    `automaticActionsCreated` at 0 (review signal, not non-compliance).
 */
import express, { NextFunction, Request, Response } from 'express';
import http from 'http';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

type Row = Record<string, any>;

interface Store {
  versions: Row[];
  observations: Row[];
  users: Row[];
  cases: Row[];
  caseCollaborators: Row[];
  clients: Row[];
  anchors: Row[];
  citations: Row[];
  controlMaps: Row[];
  clientControls: Row[];
  applicabilities: Row[];
}

const counters = { mutations: 0 };

const WRITE_OPS = ['create', 'createMany', 'update', 'updateMany', 'upsert', 'delete', 'deleteMany'] as const;

const GUARDED_MODELS = [
  'legalSourceObservation',
  'legalSourceVersion',
  'legalSource',
  'legalSourceCapture',
  'complianceDocumentClauseAnchor',
  'requirementCitation',
  'requirementControlMap',
  'requirementApplicability',
  'clientControl',
  'client',
  'case',
  'caseCollaborator',
  'user',
  'assessmentFinding',
  'task',
  'complianceProposal',
  'notification',
  'document',
  'documentVersion',
] as const;

const SOURCE_GDPR = {
  id: 'source-gdpr',
  sourceKey: 'EU-32016R0679',
  canonicalCitation: 'Regulation (EU) 2016/679',
  title: 'GDPR',
};

function versionRow(overrides: Row = {}): Row {
  return {
    legalSourceId: 'source-gdpr',
    legalSource: { ...SOURCE_GDPR },
    effectiveFrom: null,
    ...overrides,
  };
}

function freshStore(): Store {
  return {
    versions: [
      versionRow({ id: 'version-linked', legalVersionKey: '02016R0679-20160504', status: 'CANDIDATE', reviewStatus: 'UNREVIEWED' }),
      versionRow({ id: 'version-active', legalVersionKey: '32016R0679', status: 'ACTIVE', reviewStatus: 'APPROVED' }),
    ],
    observations: [],
    users: [
      { id: 'user-lawyer', role: 'LAWYER', status: 'ACTIVE', isActive: true },
      { id: 'user-admin', role: 'ADMIN', status: 'ACTIVE', isActive: true },
    ],
    cases: [
      { id: 'case-a', clientId: 'client-a', createdById: 'user-lawyer', assignedLawyerId: null },
      { id: 'case-b', clientId: 'client-a', createdById: 'user-other', assignedLawyerId: null },
    ],
    caseCollaborators: [],
    clients: [],
    anchors: [],
    citations: [],
    controlMaps: [],
    clientControls: [],
    applicabilities: [],
  };
}

const store: Store = freshStore();

function pick(row: Row, select: Row): Row {
  const out: Row = {};
  for (const key of Object.keys(select)) out[key] = row[key];
  return out;
}

function anchorRow(input: {
  versionId: string;
  documentId: string;
  client: Row;
  caseId: string;
  securityClassification: string;
  clauseRef: string;
  clauseTitle: string | null;
}): Row {
  return {
    legalSourceVersionId: input.versionId,
    documentVersionId: `${input.documentId}-v1`,
    clauseRef: input.clauseRef,
    clauseTitle: input.clauseTitle,
    anchorType: 'CLAUSE',
    relationType: 'REFERENCES',
    anchorKey: null,
    documentVersion: {
      version: 1,
      isCurrent: true,
      document: {
        id: input.documentId,
        name: `${input.documentId}.docx`,
        clientId: input.client.id,
        client: { ...input.client },
        caseId: input.caseId,
        securityClassification: input.securityClassification,
      },
    },
  };
}

function seedImpactGraph(versionId: string): void {
  const clientA = { id: 'client-a', name: 'Client A' };
  const clientB = { id: 'client-b', name: 'Client B' };
  store.clients.push({ ...clientA }, { ...clientB });
  store.anchors.push(
    anchorRow({
      versionId,
      documentId: 'doc-visible',
      client: clientA,
      caseId: 'case-a',
      securityClassification: 'STANDARD',
      clauseRef: '3.1',
      clauseTitle: 'Visible clause',
    }),
    anchorRow({
      versionId,
      documentId: 'doc-hidden',
      client: clientA,
      caseId: 'case-b',
      securityClassification: 'STANDARD',
      clauseRef: '4.1',
      clauseTitle: 'Other-case clause',
    }),
    anchorRow({
      versionId,
      documentId: 'doc-hr',
      client: clientA,
      caseId: 'case-a',
      securityClassification: 'HR_CONFIDENTIAL',
      clauseRef: '5.1',
      clauseTitle: null,
    }),
  );
  store.citations.push({
    id: `citation-${versionId}`,
    legalSourceVersionId: versionId,
    requirementVersionId: 'rv-1',
    supportRole: 'SUPPORTS',
    locator: 'Art. 5',
    requirementVersion: {
      id: 'rv-1',
      requirementId: 'req-1',
      versionKey: 'rv-1',
      title: 'Requirement One',
      status: 'ACTIVE',
      requirement: { id: 'req-1', key: 'REQ-1', domainCode: 'GDPR', status: 'ACTIVE' },
    },
  });
  store.controlMaps.push({
    id: `map-${versionId}`,
    requirementVersionId: 'rv-1',
    controlDefinitionId: 'cd-1',
    controlDefinition: { id: 'cd-1', key: 'CTRL-1', title: 'Control One', type: 'PREVENTIVE', status: 'ACTIVE' },
  });
  store.clientControls.push(
    { id: `cc-a-${versionId}`, clientId: 'client-a', controlDefinitionId: 'cd-1', implementationStatus: 'IMPLEMENTED', lastReviewedAt: null, nextReviewAt: null },
    { id: `cc-b-${versionId}`, clientId: 'client-b', controlDefinitionId: 'cd-1', implementationStatus: 'NOT_IMPLEMENTED', lastReviewedAt: null, nextReviewAt: null },
  );
  store.applicabilities.push(
    { id: `app-a-${versionId}`, clientId: 'client-a', requirementVersionId: 'rv-1', outcome: 'APPLICABLE', scopeType: 'CLIENT', evaluationAt: new Date('2026-09-01T00:00:00.000Z') },
    { id: `app-b-${versionId}`, clientId: 'client-b', requirementVersionId: 'rv-1', outcome: 'NOT_APPLICABLE', scopeType: 'CLIENT', evaluationAt: new Date('2026-09-02T00:00:00.000Z') },
  );
}

let seedSeq = 0;

function seedObservation(overrides: Row = {}): Row {
  seedSeq += 1;
  const row: Row = {
    id: `obs-${seedSeq}`,
    kind: 'AMENDMENT_PUBLISHED',
    legalSourceId: 'source-gdpr',
    legalSourceVersionId: null,
    reviewStatus: 'IMPACT_CONFIRMED',
    ingestedAt: new Date(Date.UTC(2026, 8, 27, 20, 0, seedSeq)),
    ...overrides,
  };
  store.observations.push(row);
  return row;
}

function createFakePrisma(st: Store): any {
  const db: any = {
    legalSourceObservation: {
      findUnique: async ({ where, select }: any) => {
        const row = st.observations.find((observation) => observation.id === where.id);
        if (!row) return null;
        return select ? pick(row, select) : { ...row };
      },
    },
    legalSourceVersion: {
      findUnique: async ({ where, select }: any) => {
        const row = st.versions.find((version) => version.id === where.id);
        if (!row) return null;
        return select ? pick(row, select) : { ...row };
      },
      findMany: async ({ where, select }: any) =>
        st.versions
          .filter(
            (version) =>
              (where.legalSourceId === undefined || version.legalSourceId === where.legalSourceId) &&
              (where.status === undefined || String(version.status) === String(where.status)) &&
              (where.reviewStatus === undefined || String(version.reviewStatus) === String(where.reviewStatus)),
          )
          .map((version) => (select ? pick(version, select) : { ...version })),
    },
    user: {
      findUnique: async ({ where, select }: any) => {
        const row = st.users.find((user) => user.id === where.id);
        if (!row) return null;
        return select ? pick(row, select) : { ...row };
      },
    },
    case: {
      findMany: async ({ where, select }: any) => {
        let rows = [...st.cases];
        if (where?.OR) {
          rows = rows.filter((row) =>
            where.OR.some(
              (cond: Row) =>
                (cond.createdById !== undefined && row.createdById === cond.createdById) ||
                (cond.assignedLawyerId !== undefined && row.assignedLawyerId === cond.assignedLawyerId),
            ),
          );
        }
        if (where?.id?.in) rows = rows.filter((row) => where.id.in.includes(row.id));
        return rows.map((row) => (select ? pick(row, select) : { ...row }));
      },
    },
    caseCollaborator: {
      findMany: async ({ where, select }: any) =>
        st.caseCollaborators
          .filter((collaborator) => collaborator.userId === where.userId)
          .map((collaborator) => (select ? pick(collaborator, select) : { ...collaborator })),
    },
    client: {
      findMany: async ({ where, select }: any) =>
        st.clients
          .filter((client) => where.id.in.includes(client.id))
          .map((client) => (select ? pick(client, select) : { ...client })),
    },
    complianceDocumentClauseAnchor: {
      findMany: async ({ where }: any) =>
        st.anchors
          .filter((anchor) => {
            if (where.legalSourceVersionId !== undefined && anchor.legalSourceVersionId !== where.legalSourceVersionId) return false;
            const documentWhere = where.documentVersion?.document;
            if (documentWhere) {
              const document = anchor.documentVersion.document;
              if (documentWhere.caseId?.in && !documentWhere.caseId.in.includes(document.caseId)) return false;
              if (documentWhere.securityClassification?.not && document.securityClassification === documentWhere.securityClassification.not) return false;
            }
            return true;
          })
          .map((anchor) => ({ ...anchor })),
    },
    requirementCitation: {
      findMany: async ({ where }: any) =>
        st.citations.filter((citation) => citation.legalSourceVersionId === where.legalSourceVersionId).map((citation) => ({ ...citation })),
    },
    requirementControlMap: {
      findMany: async ({ where }: any) =>
        st.controlMaps
          .filter((map) => where.requirementVersionId.in.includes(map.requirementVersionId))
          .map((map) => ({ ...map })),
    },
    clientControl: {
      findMany: async ({ where }: any) =>
        st.clientControls
          .filter(
            (control) =>
              where.controlDefinitionId.in.includes(control.controlDefinitionId) &&
              (!where.clientId?.in || where.clientId.in.includes(control.clientId)),
          )
          .map((control) => ({ ...control })),
    },
    requirementApplicability: {
      findMany: async ({ where }: any) =>
        st.applicabilities
          .filter(
            (applicability) =>
              where.requirementVersionId.in.includes(applicability.requirementVersionId) &&
              (!where.clientId?.in || where.clientId.in.includes(applicability.clientId)),
          )
          .map((applicability) => ({ ...applicability })),
    },
  };

  for (const name of GUARDED_MODELS) {
    const model = (db[name] = db[name] ?? {});
    for (const op of WRITE_OPS) {
      model[op] = async () => {
        counters.mutations += 1;
        throw new Error(`W3B must never call ${name}.${op}`);
      };
    }
  }
  db.$transaction = async () => {
    counters.mutations += 1;
    throw new Error('W3B must never open a transaction');
  };
  return db;
}

const mockDb = createFakePrisma(store);

jest.mock('../src/middleware/auth', () => ({
  authenticate: (req: Request, res: Response, next: NextFunction) => {
    const header = String(req.headers.authorization || '');
    if (header === 'Bearer lawyer-token') {
      (req as any).user = { userId: 'user-lawyer', role: 'LAWYER' };
      return next();
    }
    if (header === 'Bearer admin-token') {
      (req as any).user = { userId: 'user-admin', role: 'ADMIN' };
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
import { buildLegalSourceImpactForVersion } from '../src/modules/compliance/legalSourceImpact';
import { resolveImpactAccessScope } from '../src/modules/compliance-doc-intelligence/routes';

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

beforeEach(() => {
  const fresh = freshStore();
  store.versions = fresh.versions;
  store.observations = fresh.observations;
  store.users = fresh.users;
  store.cases = fresh.cases;
  store.caseCollaborators = fresh.caseCollaborators;
  store.clients = fresh.clients;
  store.anchors = fresh.anchors;
  store.citations = fresh.citations;
  store.controlMaps = fresh.controlMaps;
  store.clientControls = fresh.clientControls;
  store.applicabilities = fresh.applicabilities;
  counters.mutations = 0;
  seedSeq = 0;
});

function api(method: string, path: string, opts: { token?: string | null } = {}): Promise<{ status: number; json: any }> {
  const token = opts.token === undefined ? 'lawyer-token' : opts.token;
  return new Promise((resolve, reject) => {
    const request = http.request(
      {
        host: '127.0.0.1',
        port: (server.address() as any).port,
        path,
        method,
        headers: token ? { Authorization: `Bearer ${token}` } : {},
      },
      (response) => {
        let data = '';
        response.on('data', (chunk) => (data += chunk));
        response.on('end', () => resolve({ status: response.statusCode || 0, json: data ? JSON.parse(data) : null }));
      },
    );
    request.on('error', reject);
    request.end();
  });
}

function impactApi(id: string, token = 'lawyer-token') {
  return api('GET', `${BASE}/${id}/impact`, { token });
}

function snapshot<T>(value: T): T {
  return JSON.parse(JSON.stringify(value));
}

function withoutGeneratedAt(value: unknown): unknown {
  return JSON.parse(JSON.stringify(value), (key, val) => (key === 'generatedAt' ? 'normalized' : val));
}

describe('W3B impact gate', () => {
  it.each(['NEW', 'IN_REVIEW', 'NO_IMPACT', 'REJECTED'])(
    'denies impact for %s with 409 OBSERVATION_IMPACT_NOT_CONFIRMED',
    async (reviewStatus) => {
      const row = seedObservation({ reviewStatus });
      const response = await impactApi(row.id);
      expect(response.status).toBe(409);
      expect(response.json.code).toBe('OBSERVATION_IMPACT_NOT_CONFIRMED');
      expect(row.reviewStatus).toBe(reviewStatus);
      expect(counters.mutations).toBe(0);
    },
  );

  it('returns 404 OBSERVATION_NOT_FOUND for an unknown observation', async () => {
    const response = await impactApi('missing-observation');
    expect(response.status).toBe(404);
    expect(response.json.code).toBe('OBSERVATION_NOT_FOUND');
    expect(counters.mutations).toBe(0);
  });

  it('forbids CLIENT identities and unauthenticated callers', async () => {
    const row = seedObservation();
    const client = await impactApi(row.id, 'client-token');
    expect(client.status).toBe(403);
    expect(client.json.code).toBe('INTERACTION_NOT_AUTHORIZED');

    const anonymous = await impactApi(row.id, null as any);
    expect(anonymous.status).toBe(401);
    expect(row.reviewStatus).toBe('IMPACT_CONFIRMED');
  });
});

describe('W3B version resolution', () => {
  it('uses the exact linked CANDIDATE/UNREVIEWED version for a consolidated observation', async () => {
    seedImpactGraph('version-linked');
    const row = seedObservation({ kind: 'CONSOLIDATED_VERSION_AVAILABLE', legalSourceVersionId: 'version-linked' });
    const versionsBefore = snapshot(store.versions);

    const response = await impactApi(row.id, 'admin-token');
    expect(response.status).toBe(200);
    expect(response.json.subject.legalSourceVersionId).toBe('version-linked');
    expect(response.json.documentReferenceImpact.totals.references).toBe(3);
    expect(snapshot(store.versions)).toEqual(versionsBefore);
    expect(counters.mutations).toBe(0);
  });

  it('resolves the unique ACTIVE + APPROVED base version for an amendment without a linked version', async () => {
    seedImpactGraph('version-active');
    const row = seedObservation({ kind: 'AMENDMENT_PUBLISHED' });

    const response = await impactApi(row.id, 'admin-token');
    expect(response.status).toBe(200);
    expect(response.json.subject.legalSourceVersionId).toBe('version-active');
    expect(response.json.documentReferenceImpact.totals.references).toBe(3);
  });

  it('fails closed with 422 when the amendment has no ACTIVE + APPROVED version', async () => {
    store.versions = store.versions.filter((version) => version.id !== 'version-active');
    const row = seedObservation({ kind: 'AMENDMENT_PUBLISHED' });

    const response = await impactApi(row.id);
    expect(response.status).toBe(422);
    expect(response.json.code).toBe('OBSERVATION_IMPACT_VERSION_UNAVAILABLE');
    expect(counters.mutations).toBe(0);
  });

  it('fails closed with 409 OBSERVATION_IMPACT_VERSION_AMBIGUOUS for multiple ACTIVE + APPROVED versions', async () => {
    store.versions.push(
      versionRow({ id: 'version-active-2', legalVersionKey: '32016R0679-v2', status: 'ACTIVE', reviewStatus: 'APPROVED' }),
    );
    const row = seedObservation({ kind: 'AMENDMENT_PUBLISHED' });

    const response = await impactApi(row.id);
    expect(response.status).toBe(409);
    expect(response.json.code).toBe('OBSERVATION_IMPACT_VERSION_AMBIGUOUS');
    expect(counters.mutations).toBe(0);
  });

  it('never falls back to the base version for a consolidated observation without a linked version', async () => {
    seedImpactGraph('version-linked');
    const row = seedObservation({ kind: 'CONSOLIDATED_VERSION_AVAILABLE', legalSourceVersionId: null });

    const response = await impactApi(row.id);
    expect(response.status).toBe(422);
    expect(response.json.code).toBe('OBSERVATION_IMPACT_VERSION_UNAVAILABLE');
  });
});

describe('W3B canonical access scope', () => {
  function confirmedConsolidated(): Row {
    seedImpactGraph('version-linked');
    return seedObservation({ kind: 'CONSOLIDATED_VERSION_AVAILABLE', legalSourceVersionId: 'version-linked' });
  }

  it('lawyer: CASE-scoped documents, HR_CONFIDENTIAL excluded, restricted client rows excluded', async () => {
    const row = confirmedConsolidated();
    const response = await impactApi(row.id, 'lawyer-token');
    expect(response.status).toBe(200);

    const references = response.json.documentReferenceImpact.references;
    expect(references.map((reference: Row) => reference.documentId)).toEqual(['doc-visible']);
    expect(response.json.documentReferenceImpact.totals).toMatchObject({ references: 1, documents: 1, clients: 1 });
    const serialized = JSON.stringify(response.json);
    expect(serialized).not.toContain('doc-hidden');
    expect(serialized).not.toContain('doc-hr');

    expect(response.json.controlImpact.clientControls.map((control: Row) => control.clientId)).toEqual(['client-a']);
    expect(response.json.applicabilityImpact.applicabilities.map((applicability: Row) => applicability.clientId)).toEqual(['client-a']);
    expect(response.json.clients.map((client: Row) => client.clientId)).toEqual(['client-a']);

    expect(response.json.requirementImpact.totals.citations).toBe(1);
    expect(response.json.controlImpact.totals.controlDefinitions).toBe(1);
  });

  it('admin: full case + HR visibility keeps the complete canonical projection', async () => {
    const row = confirmedConsolidated();
    const response = await impactApi(row.id, 'admin-token');
    expect(response.status).toBe(200);

    expect(response.json.documentReferenceImpact.references.map((reference: Row) => reference.documentId).sort()).toEqual([
      'doc-hidden',
      'doc-hr',
      'doc-visible',
    ]);
    expect(response.json.controlImpact.clientControls.map((control: Row) => control.clientId)).toEqual(['client-a', 'client-b']);
    expect(response.json.applicabilityImpact.applicabilities.map((applicability: Row) => applicability.clientId)).toEqual([
      'client-a',
      'client-b',
    ]);
  });

  it('matches the existing buildLegalSourceImpactForVersion result for the same actor scope', async () => {
    const row = confirmedConsolidated();
    const response = await impactApi(row.id, 'lawyer-token');
    const direct = await buildLegalSourceImpactForVersion(
      'version-linked',
      mockDb,
      await resolveImpactAccessScope({ userId: 'user-lawyer', role: 'LAWYER' }),
    );
    expect(direct).not.toBeNull();
    expect(withoutGeneratedAt(response.json)).toEqual(withoutGeneratedAt(direct));
  });

  it('keeps the review signal: automaticActionsCreated 0 and no non-compliance claim', async () => {
    const row = confirmedConsolidated();
    const response = await impactApi(row.id, 'admin-token');
    expect(response.status).toBe(200);
    expect(response.json.review.automaticActionsCreated).toBe(0);
    expect(response.json.review.note).toBe('LEGAL_CHANGE_MEANS_REVIEW_REQUIRED_NOT_NON_COMPLIANCE');

    // The mandated review note is the ONLY place a non-compliance token may
    // appear, and only as "NOT". No field claims a violation, finding or
    // remediation requirement.
    const scrubbed = { ...response.json, review: { ...response.json.review, note: '' } };
    const serialized = JSON.stringify(scrubbed).toLowerCase();
    for (const claim of ['noncompliant', 'non_compliance', 'violation', 'finding', 'remediation']) {
      expect(serialized).not.toContain(claim);
    }
  });
});

describe('W3B zero-write isolation', () => {
  it('performs zero Prisma mutations and leaves observation/version state unchanged', async () => {
    seedImpactGraph('version-linked');
    const confirmed = seedObservation({ kind: 'CONSOLIDATED_VERSION_AVAILABLE', legalSourceVersionId: 'version-linked' });
    const amendment = seedObservation({ kind: 'AMENDMENT_PUBLISHED' });
    const denied = seedObservation({ kind: 'CONSOLIDATED_VERSION_AVAILABLE', legalSourceVersionId: 'version-linked', reviewStatus: 'IN_REVIEW' });
    const observationsBefore = snapshot(store.observations);
    const versionsBefore = snapshot(store.versions);

    const responses = await Promise.all([
      impactApi(confirmed.id, 'lawyer-token'),
      impactApi(confirmed.id, 'admin-token'),
      impactApi(amendment.id, 'admin-token'),
      impactApi(denied.id, 'lawyer-token'),
      impactApi('missing-observation'),
    ]);
    expect(responses.map((response) => response.status).sort()).toEqual([200, 200, 200, 404, 409]);

    expect(counters.mutations).toBe(0);
    expect(snapshot(store.observations)).toEqual(observationsBefore);
    expect(snapshot(store.versions)).toEqual(versionsBefore);
  });

  it('static guard: the W3B service function and route perform no writes', () => {
    const serviceSource = readFileSync(
      join(__dirname, '..', 'src', 'modules', 'compliance', 'legalSourceObservationReviewService.ts'),
      'utf8',
    );
    const functionStart = serviceSource.indexOf('export async function getLegalSourceObservationImpact');
    expect(functionStart).toBeGreaterThan(-1);
    const body = serviceSource.slice(functionStart);
    for (const token of ['updateMany(', 'update(', 'upsert(', 'create(', 'createMany(', 'delete(', 'deleteMany(', '$transaction']) {
      expect(body).not.toContain(token);
    }

    const routesSource = readFileSync(
      join(__dirname, '..', 'src', 'modules', 'compliance', 'legalSourceObservationReviewRoutes.ts'),
      'utf8',
    );
    const routeIndex = routesSource.indexOf("'/legal-source-observations/:id/impact'");
    expect(routeIndex).toBeGreaterThan(-1);
    const handler = routesSource.slice(routeIndex, routeIndex + 1600);
    expect(handler).toContain('requireInternal');
    expect(handler).toContain('resolveImpactAccessScope');
    expect(handler).toContain('getLegalSourceObservationImpact');
  });
});
