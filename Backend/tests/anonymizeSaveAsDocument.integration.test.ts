import { randomUUID } from 'crypto';
import express from 'express';
import type { Server } from 'http';
import { prisma } from '../src/prisma/prisma.service';
import anonymizeRouter from '../src/modules/anonymize/routes';
import documentsRouter from '../src/modules/documents/routes';
import driveService from '../src/modules/sharepoint/driveService';

jest.mock('../src/middleware/auth', () => ({
  authenticate: (req: any, res: any, next: any) => {
    const u = req.headers['x-test-user'];
    if (!u) return res.status(401).json({ status: 401, code: 'UNAUTHENTICATED', message: 'Unauthenticated' });
    req.user = { userId: String(u), role: req.headers['x-test-role'] || 'ADMIN' };
    next();
  },
}));
jest.mock('../src/modules/sharepoint/driveService', () => ({
  __esModule: true,
  default: {
    uploadDocument: jest.fn(),
    deleteDocument: jest.fn(),
    downloadDocument: jest.fn(),
    downloadDocumentResult: jest.fn(),
  },
}));

const user = randomUUID();
const client = randomUUID();
const caseId = randomUUID();
const sourceDocId = randomUUID();
const rehydratedText = 'Rehidratált végleges AI-elemzés szövege — Dr. Hubay Gyula.';

let server: Server;
let base: string;
let uploadCalls = 0;
let deleteCalls: string[] = [];
let failUpload = false;
let collidingItemId: string | null = null;

async function createAnonymousDocument(overrides: Record<string, unknown> = {}) {
  const id = randomUUID();
  await prisma.anonymousDocument.create({
    data: {
      id,
      name: 'szanitizalt_szerzodes',
      content: 'Anonimizált tartalom [SZEMELY_0]',
      sourceDocId,
      redactedItems: [],
      caseId,
      rehydrationStatus: 'COMPLETE',
      rehydratedContent: rehydratedText,
      patternCount: 1,
      ...overrides,
    } as any,
  });
  return id;
}

async function postSave(anonymousDocId: string, headers: Record<string, string> = { 'x-test-user': user }) {
  const r = await fetch(`${base}/anonymous-documents/${anonymousDocId}/save-as-document`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', ...headers },
    body: JSON.stringify({}),
  });
  return { status: r.status, body: await r.json() as any };
}

async function getDownload(documentId: string, headers: Record<string, string> = { 'x-test-user': user }) {
  const r = await fetch(`${base}/api/v1/documents/${documentId}/download`, { headers });
  const text = await r.text();
  return { status: r.status, text };
}

beforeAll(async () => {
  const url = new URL(process.env.DATABASE_URL || '');
  if (url.hostname !== '127.0.0.1' || url.port !== '55483' || url.pathname !== '/adminiculum_replay_wf10') throw Error('Unsafe DB');
  const identity = await prisma.$queryRaw<any[]>`SELECT current_database() db,current_user usr,inet_server_port() port`;
  expect(identity[0]).toMatchObject({ db: 'adminiculum_replay_wf10', usr: 'wf10_pgtest', port: 55483 });
  process.env.ENABLE_AI_ANONYMIZATION = 'true';

  await prisma.user.create({ data: { id: user, email: `${user}@be-doc-004.invalid`, name: 'BE-DOC-004 admin', role: 'ADMIN', skills: [] } });
  await prisma.client.create({ data: { id: client, name: 'BE-DOC-004 Client' } });
  await prisma.case.create({ data: { id: caseId, caseNumber: caseId, title: 'BE-DOC-004 case', clientId: client, caseType: 'OTHER', createdById: user } });
  await prisma.document.create({ data: { id: sourceDocId, caseId, clientId: client, name: 'FORRAS_DOK', category: 'OTHER', mimeType: 'text/plain', spItemId: `synthetic-source-${randomUUID()}` } });

  uploadCalls = 0;
  deleteCalls = [];
  failUpload = false;
  collidingItemId = null;
  (driveService.uploadDocument as jest.Mock).mockImplementation(async (opts: any) => {
    uploadCalls += 1;
    if (failUpload) return { success: false, error: 'SP_DOWN' };
    const itemId = collidingItemId ?? `synthetic-ai-${randomUUID()}`;
    return { success: true, item: { id: itemId, name: opts.fileName }, webUrl: `https://graph.invalid/sites/1/drive/items/${itemId}`, version: '1.0' };
  });
  (driveService.deleteDocument as jest.Mock).mockImplementation(async (id: string) => {
    deleteCalls.push(String(id));
    return true;
  });
  (driveService.downloadDocumentResult as jest.Mock).mockImplementation(async (id: string) => ({
    success: true,
    content: Buffer.from(rehydratedText, 'utf-8'),
    fileName: 'ai.txt',
    id: String(id),
  }));

  const app = express();
  app.use(express.json());
  app.use(anonymizeRouter);
  app.use('/api/v1/documents', documentsRouter);
  await new Promise<void>((resolve) => { server = app.listen(0, '127.0.0.1', () => resolve()); });
  base = `http://127.0.0.1:${(server.address() as any).port}`;
}, 60000);

afterAll(async () => {
  if (server) await new Promise<void>((r) => server.close(() => r()));
  await prisma.$disconnect();
});

test('unauthenticated save is rejected', async () => {
  const id = await createAnonymousDocument();
  const r = await fetch(`${base}/anonymous-documents/${id}/save-as-document`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: '{}' });
  expect(r.status).toBe(401);
});

test('FAILED rehydration cannot be saved and no upload happens', async () => {
  const id = await createAnonymousDocument({ rehydrationStatus: 'FAILED' });
  const beforeUploads = uploadCalls;
  const before = await prisma.document.count({ where: { documentType: 'AI_ANALYSIS' } });
  const r = await postSave(id);
  expect(r.status).toBe(400);
  expect(uploadCalls).toBe(beforeUploads);
  expect(await prisma.document.count({ where: { documentType: 'AI_ANALYSIS' } })).toBe(before);
});

test('COMPLETE save creates canonical Document + v1 DocumentVersion, readable, review-bindable', async () => {
  const id = await createAnonymousDocument();
  const r = await postSave(id);
  expect(r.status).toBe(200);
  expect(r.body.documentId).toBeDefined();
  expect(r.body.documentVersionId).toBeDefined();

  const doc = await prisma.document.findUnique({
    where: { id: r.body.documentId },
    include: { versions: true },
  });
  expect(doc).not.toBeNull();
  expect(doc!.caseId).toBe(caseId);
  expect(doc!.clientId).toBe(client);
  expect(doc!.category).toBe('RESEARCH');
  expect(doc!.documentType).toBe('AI_ANALYSIS');
  expect(doc!.folder).toBe('08_Anonymized');
  expect(doc!.version).toBe('1');
  expect(doc!.currentVersion).toBe(1);
  expect(doc!.currentVersionInt).toBe(1);
  expect(doc!.isLatest).toBe(true);
  expect(doc!.versions).toHaveLength(1);

  const v1 = doc!.versions[0];
  expect(v1.id).toBe(r.body.documentVersionId);
  expect(v1.version).toBe(1);
  expect(v1.isCurrent).toBe(true);
  expect(v1.storageReference).toBe(doc!.spItemId);
  expect(v1.spItemId).toBe(doc!.spItemId);
  expect(v1.reviewStatus).toBe('NOT_IN_REVIEW');
  expect(v1.publicationStatus).toBe('INTERNAL_ONLY');
  expect(v1.uploadSource).toBe('GENERATED');
  expect(v1.versionType).toBe('ORIGINAL');
  expect(v1.securityScanStatus).toBe('CLEAN');
  expect(v1.uploadedById).toBe(user);
  expect(v1.mimeType).toBe('text/plain');

  // Exact content readable through the canonical download surface (scan gate passes on v1 CLEAN).
  const dl = await getDownload(r.body.documentId);
  expect(dl.status).toBe(200);
  expect(dl.text).toBe(rehydratedText);

  // Formal review can bind to v1 (the FK relation DocumentReview.documentVersionId is satisfiable).
  const reviewId = randomUUID();
  await prisma.documentReview.create({
    data: {
      id: reviewId,
      documentId: doc!.id,
      documentVersionId: v1.id,
      status: 'DRAFT',
      createdById: user,
    },
  });
  const bound = await prisma.documentReview.findUnique({ where: { id: reviewId } });
  expect(bound?.documentVersionId).toBe(v1.id);

  // WF10 source binding preserved on the audit event, plus the new version identity.
  const event = await prisma.timelineEvent.findFirst({
    where: { caseId, eventType: 'DOCUMENT_UPLOADED', payload: { path: ['sourceAnonymousDocId'], equals: id } },
  });
  const payload = event?.payload as any;
  expect(payload.sourceAnonymousDocId).toBe(id);
  expect(payload.sourceDocId).toBe(sourceDocId);
  expect(payload.documentVersionId).toBe(v1.id);
  expect(payload.version).toBe(1);
  expect(payload.rehydrationStatus).toBe('COMPLETE');
});

test('PARTIAL rehydration stays truthful and saveable', async () => {
  const id = await createAnonymousDocument({ rehydrationStatus: 'PARTIAL' });
  const r = await postSave(id);
  expect(r.status).toBe(200);
  const doc = await prisma.document.findUnique({ where: { id: r.body.documentId }, include: { versions: true } });
  expect(doc!.versions).toHaveLength(1);
  const event = await prisma.timelineEvent.findFirst({
    where: { caseId, payload: { path: ['sourceAnonymousDocId'], equals: id } },
  });
  expect((event?.payload as any).rehydrationStatus).toBe('PARTIAL');
  expect((event?.payload as any).sourceAnonymousDocId).toBe(id);
});

test('two explicit saves remain two distinct work products, each with its own v1', async () => {
  const id = await createAnonymousDocument();
  const first = await postSave(id);
  const second = await postSave(id);
  expect(first.status).toBe(200);
  expect(second.status).toBe(200);
  expect(first.body.documentId).not.toBe(second.body.documentId);
  expect(first.body.documentVersionId).not.toBe(second.body.documentVersionId);

  const firstDoc = await prisma.document.findUnique({ where: { id: first.body.documentId }, include: { versions: true } });
  const secondDoc = await prisma.document.findUnique({ where: { id: second.body.documentId }, include: { versions: true } });
  expect(firstDoc!.versions).toHaveLength(1);
  expect(secondDoc!.versions).toHaveLength(1);
  expect(firstDoc!.versions[0].version).toBe(1);
  expect(secondDoc!.versions[0].version).toBe(1);
  expect(firstDoc!.versions[0].isCurrent).toBe(true);
  expect(secondDoc!.versions[0].isCurrent).toBe(true);
  expect(firstDoc!.spItemId).not.toBe(secondDoc!.spItemId);
});

test('storage failure leaves no Document and no orphan DocumentVersion', async () => {
  const id = await createAnonymousDocument();
  const beforeDocs = await prisma.document.count({ where: { documentType: 'AI_ANALYSIS' } });
  const beforeVersions = await prisma.documentVersion.count();
  failUpload = true;
  try {
    const r = await postSave(id);
    expect(r.status).toBe(400);
  } finally {
    failUpload = false;
  }
  const afterDocs = await prisma.document.count({ where: { documentType: 'AI_ANALYSIS' } });
  const afterVersions = await prisma.documentVersion.count();
  expect(afterDocs).toBe(beforeDocs);
  expect(afterVersions).toBe(beforeVersions);
  expect(deleteCalls.length).toBe(0);
});

test('DB failure rolls back the pair and compensates the uploaded storage item', async () => {
  // A pre-existing Document with a colliding spItemId makes the nested create
  // fail on the unique constraint — deterministic DB failure mid-transaction.
  const collidingDocId = randomUUID();
  collidingItemId = `synthetic-collide-${randomUUID()}`;
  await prisma.document.create({
    data: { id: collidingDocId, caseId, clientId: client, name: 'COLLISION', category: 'OTHER', spItemId: collidingItemId },
  });

  const id = await createAnonymousDocument();
  const before = await prisma.document.count();
  const beforeVersions = await prisma.documentVersion.count();
  const r = await postSave(id);
  expect(r.status).toBe(400);
  expect(await prisma.document.count()).toBe(before);
  expect(await prisma.documentVersion.count()).toBe(beforeVersions);
  expect(deleteCalls).toContain(collidingItemId);
  collidingItemId = null;
});

test('a lawyer from another case/client is denied', async () => {
  const outsider = randomUUID();
  const outsiderClient = randomUUID();
  const outsiderCase = randomUUID();
  await prisma.user.create({ data: { id: outsider, email: `${outsider}@be-doc-004.invalid`, name: 'Other lawyer', role: 'LAWYER', skills: [] } });
  await prisma.client.create({ data: { id: outsiderClient, name: 'Other client' } });
  await prisma.case.create({ data: { id: outsiderCase, caseNumber: outsiderCase, title: 'Other case', clientId: outsiderClient, caseType: 'OTHER', createdById: outsider, assignedLawyerId: outsider } });

  const id = await createAnonymousDocument();
  const r = await postSave(id, { 'x-test-user': outsider, 'x-test-role': 'LAWYER' });
  expect(r.status).toBe(403);
  expect(JSON.stringify(r.body)).not.toMatch(/Rehidratált/);
});
