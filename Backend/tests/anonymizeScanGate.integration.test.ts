import { randomUUID } from 'crypto';
import express from 'express';
import type { Server } from 'http';
import { Client } from 'pg';
import { prisma } from '../src/prisma/prisma.service';
import anonymizeRouter from '../src/modules/anonymize/routes';
import driveService from '../src/modules/sharepoint/driveService';
import { scanDocumentVersionInBackground } from '../src/modules/documents/securityScan.service';
import { scanClaimKey, closeScanClaimPool } from '../src/modules/documents/scanClaim';
import { setScanner } from '../src/modules/upload-security/scannerAdapter';

jest.mock('../src/middleware/auth', () => ({
  authenticate: (req: any, res: any, next: any) => {
    const u = req.headers['x-test-user'];
    if (!u) return res.status(401).json({ status: 401, code: 'UNAUTHENTICATED', message: 'Unauthenticated' });
    req.user = { userId: String(u), role: req.headers['x-test-role'] || 'ADMIN' };
    next();
  },
}));
jest.mock('../src/modules/sharepoint/driveService', () => ({ __esModule: true, default: { downloadDocument: jest.fn() } }));

const user = randomUUID();
const client = randomUUID();
const caseId = randomUUID();
const documentId = randomUUID();
const spItemId = `synthetic-sp-${randomUUID()}`;
const v1 = randomUUID();
const v2 = randomUUID();
let server: Server;
let base: string;
let downloads = 0;

beforeAll(async () => {
  const url = new URL(process.env.DATABASE_URL || '');
  if (url.hostname !== '127.0.0.1' || url.port !== '55483' || url.pathname !== '/adminiculum_replay_wf10') throw Error('Unsafe DB');
  const identity = await prisma.$queryRaw<any[]>`SELECT current_database() db,current_user usr,inet_server_port() port`;
  expect(identity[0]).toMatchObject({ db: 'adminiculum_replay_wf10', usr: 'wf10_pgtest', port: 55483 });
  process.env.ENABLE_AI_ANONYMIZATION = 'true';
  await prisma.user.create({ data: { id: user, email: `${user}@wf10.invalid`, name: 'Scan gate admin', role: 'ADMIN', skills: [] } });
  await prisma.client.create({ data: { id: client, name: 'SecretClient ScanGate' } });
  await prisma.case.create({ data: { id: caseId, caseNumber: caseId, title: 'Scan gate case', clientId: client, caseType: 'OTHER', createdById: user } });
  await prisma.document.create({ data: { id: documentId, caseId, clientId: client, name: 'GATED_FILE', category: 'OTHER', mimeType: 'text/plain', spItemId } });
  await prisma.documentVersion.create({ data: { id: v1, documentId, version: 1, name: 'v1', originalFileName: 'gated.txt', mimeType: 'text/plain', uploadedById: user, storageReference: 'synthetic-v1', securityScanStatus: 'CLEAN', isCurrent: true } });
  await prisma.documentVersion.create({ data: { id: v2, documentId, version: 2, name: 'v2', originalFileName: 'gated2.txt', mimeType: 'text/plain', uploadedById: user, storageReference: 'synthetic-v2', securityScanStatus: 'SCAN_FAILED', isCurrent: false } });
  downloads = 0;
  (driveService.downloadDocument as jest.Mock).mockImplementation(async () => {
    downloads += 1;
    return Buffer.from('SecretClient ScanGate file text');
  });
  const app = express();
  app.use(express.json());
  app.use(anonymizeRouter);
  await new Promise<void>((resolve) => { server = app.listen(0, '127.0.0.1', () => resolve()); });
  base = `http://127.0.0.1:${(server.address() as any).port}`;
}, 30000);

afterAll(async () => {
  if (server) await new Promise<void>((r) => server.close(() => r()));
  await prisma.$disconnect();
  await closeScanClaimPool();
});

async function setCurrentStatus(status: 'PENDING_SCAN' | 'CLEAN' | 'SCAN_FAILED' | 'INFECTED') {
  await prisma.documentVersion.update({ where: { id: v1 }, data: { securityScanStatus: status } });
}

async function postAnonymize(body: Record<string, unknown> = {}, headers: Record<string, string> = { 'x-test-user': user }) {
  const r = await fetch(`${base}/documents/${documentId}/anonymize`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', ...headers },
    body: JSON.stringify(body),
  });
  return { status: r.status, body: await r.json() as any };
}

async function getSource(headers: Record<string, string> = { 'x-test-user': user }) {
  const r = await fetch(`${base}/documents/${documentId}/anonymization-source`, { headers });
  return { status: r.status, body: await r.json() as any };
}

const artifactCount = () => prisma.anonymousDocument.count({ where: { caseId } });

test('unauthenticated request is rejected', async () => {
  const r = await fetch(`${base}/documents/${documentId}/anonymize`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: '{}' });
  expect(r.status).toBe(401);
});

test('a non-managing worker cannot anonymize', async () => {
  const outsider = randomUUID();
  await prisma.user.create({ data: { id: outsider, email: `${outsider}@wf10.invalid`, name: 'Outsider lawyer', role: 'LAWYER', skills: [] } });
  const r = await postAnonymize({ aiTask: 'SUMMARIZE' }, { 'x-test-user': outsider, 'x-test-role': 'LAWYER' });
  expect(r.status).toBe(403);
});

test('SCAN_FAILED current version cannot reach extraction or redaction', async () => {
  await setCurrentStatus('SCAN_FAILED');
  downloads = 0;
  const before = await artifactCount();
  const r = await postAnonymize({ aiTask: 'SUMMARIZE' });
  expect(r.status).toBe(409);
  expect(r.body.code).toBe('SECURITY_SCAN_BLOCKED');
  expect(JSON.stringify(r.body)).not.toMatch(/SecretClient|GATED_FILE/);
  expect(downloads).toBe(0);
  expect(await artifactCount()).toBe(before);
});

test('PENDING_SCAN current version is blocked', async () => {
  await setCurrentStatus('PENDING_SCAN');
  const r = await postAnonymize({ aiTask: 'SUMMARIZE' });
  expect(r.status).toBe(409);
  expect(r.body.code).toBe('SECURITY_SCAN_BLOCKED');
});

test('INFECTED current version is blocked', async () => {
  await setCurrentStatus('INFECTED');
  const r = await postAnonymize({ aiTask: 'SUMMARIZE' });
  expect(r.status).toBe(409);
  expect(r.body.code).toBe('SECURITY_SCAN_BLOCKED');
});

test('source preview never leaks raw text for an unclean file', async () => {
  await setCurrentStatus('SCAN_FAILED');
  downloads = 0;
  const r = await getSource();
  expect(r.status).toBe(409);
  expect(r.body.code).toBe('SECURITY_SCAN_BLOCKED');
  expect(JSON.stringify(r.body)).not.toMatch(/SecretClient|GATED_FILE/);
  expect(downloads).toBe(0);
});

test('a CLEAN current version still anonymizes through the file-backed path', async () => {
  await setCurrentStatus('CLEAN');
  downloads = 0;
  const before = await artifactCount();
  const r = await postAnonymize({ aiTask: 'SUMMARIZE' });
  expect(r.status).toBe(200);
  expect(downloads).toBe(1);
  expect(r.body.redactedText).toBeDefined();
  expect(JSON.stringify(r.body)).not.toMatch(/SecretClient/);
  expect(await artifactCount()).toBe(before + 1);
});

test('caller text cannot bypass an infected canonical version or write an artifact', async () => {
  await setCurrentStatus('INFECTED');
  downloads = 0;
  const before = await artifactCount();
  const r = await postAnonymize({ aiTask: 'SUMMARIZE', sourceText: 'A felhasználó által beírt szöveg, nincs fájlforrás.' });
  expect(r.status).toBe(409);
  expect(downloads).toBe(0);
  expect(r.body.code).toBe('SECURITY_SCAN_BLOCKED');
  expect(await artifactCount()).toBe(before);
});

test('legacy unbound documents without any version stay blocked (no trustworthy scan verdict)', async () => {
  const legacyDoc = randomUUID();
  await prisma.document.create({ data: { id: legacyDoc, caseId, clientId: client, name: 'LEGACY_UNBOUND', category: 'OTHER', mimeType: 'text/plain', spItemId: `synthetic-sp-legacy-${randomUUID()}` } });
  downloads = 0;
  const r = await fetch(`${base}/documents/${legacyDoc}/anonymize`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'x-test-user': user },
    body: JSON.stringify({ aiTask: 'SUMMARIZE' }),
  });
  const body = await r.json() as any;
  expect(r.status).toBe(409);
  expect(body.code).toBe('SECURITY_SCAN_BLOCKED');
  expect(downloads).toBe(0);
  expect(JSON.stringify(body)).not.toMatch(/SecretClient|LEGACY_UNBOUND/);
});

test('scan verdict is monotonic: INFECTED overwrites an earlier CLEAN and never loses to a later CLEAN', async () => {
  const conDocId = randomUUID();
  const conVersionId = randomUUID();
  await prisma.document.create({ data: { id: conDocId, caseId, clientId: client, name: 'CONCURRENCY_GATE', category: 'OTHER', mimeType: 'text/plain', spItemId: 'sp-conc' } });
  await prisma.documentVersion.create({ data: { id: conVersionId, documentId: conDocId, version: 1, name: 'v1', originalFileName: 'conc.txt', mimeType: 'text/plain', uploadedById: user, storageReference: 'conc-store', securityScanStatus: 'PENDING_SCAN', isCurrent: true } });

  const clean = { provider: 'FAKE', scan: async () => ({ outcome: 'CLEAN' as const, provider: 'FAKE', codeSafe: 'FAKE_CLEAN' }) };
  const infected = { provider: 'FAKE', scan: async () => ({ outcome: 'INFECTED' as const, provider: 'FAKE', codeSafe: 'FAKE_INFECTED' }) };

  try {
    // Scan 1 (e.g. original background scan) establishes CLEAN.
    setScanner(clean);
    await scanDocumentVersionInBackground(conVersionId, Buffer.from('bytes'));
    expect((await prisma.documentVersion.findUnique({ where: { id: conVersionId } }))?.securityScanStatus).toBe('CLEAN');

    // Scan 2 (e.g. concurrent retry) returns INFECTED: it must overwrite CLEAN.
    setScanner(infected);
    await scanDocumentVersionInBackground(conVersionId, Buffer.from('bytes'));
    expect((await prisma.documentVersion.findUnique({ where: { id: conVersionId } }))?.securityScanStatus).toBe('INFECTED');

    // A later CLEAN must never downgrade the persisted INFECTED.
    setScanner(clean);
    await scanDocumentVersionInBackground(conVersionId, Buffer.from('bytes'));
    expect((await prisma.documentVersion.findUnique({ where: { id: conVersionId } }))?.securityScanStatus).toBe('INFECTED');
  } finally {
    setScanner(null);
  }
});

async function createPendingVersion(): Promise<string> {
  const docId = randomUUID();
  const versionId = randomUUID();
  await prisma.document.create({ data: { id: docId, caseId, clientId: client, name: `CLAIM_${docId}`, category: 'OTHER', mimeType: 'text/plain', spItemId: `sp-${docId}` } });
  await prisma.documentVersion.create({ data: { id: versionId, documentId: docId, version: 1, name: 'v1', originalFileName: 'claim.txt', mimeType: 'text/plain', uploadedById: user, storageReference: `store-${versionId}`, securityScanStatus: 'PENDING_SCAN', isCurrent: true } });
  return versionId;
}

async function statusOf(versionId: string): Promise<string | undefined> {
  return (await prisma.documentVersion.findUnique({ where: { id: versionId } }))?.securityScanStatus;
}

test('X2 — cross-process claim: no temporary CLEAN while another worker scans the same version', async () => {
  const versionId = await createPendingVersion();

  // Worker A (a different session/process) acquires the advisory lock and holds
  // it, simulating an in-flight scan whose eventual verdict is INFECTED.
  const workerA = new Client({ connectionString: process.env.DATABASE_URL });
  await workerA.connect();
  await workerA.query('SELECT pg_advisory_lock($1::int, $2::int)', scanClaimKey(versionId));

  let bScans = 0;
  setScanner({ provider: 'FAKE', scan: async () => { bScans += 1; return { outcome: 'CLEAN', provider: 'FAKE', codeSafe: 'FAKE_CLEAN' }; } });
  try {
    await scanDocumentVersionInBackground(versionId, Buffer.from('bytes'));
    // Worker B must NOT run a competing scanner, and status must NOT become CLEAN.
    expect(bScans).toBe(0);
    expect(await statusOf(versionId)).toBe('PENDING_SCAN');
  } finally {
    setScanner(null);
    await workerA.query('SELECT pg_advisory_unlock_all()');
    await workerA.end();
  }

  // Worker A's eventual verdict wins and is INFECTED.
  setScanner({ provider: 'FAKE', scan: async () => ({ outcome: 'INFECTED', provider: 'FAKE', codeSafe: 'FAKE_INFECTED' }) });
  try {
    await scanDocumentVersionInBackground(versionId, Buffer.from('bytes'));
    expect(await statusOf(versionId)).toBe('INFECTED');
  } finally {
    setScanner(null);
  }
});

test('X4 — claim releases on connection/process death and recovery can rescan exact bytes', async () => {
  const versionId = await createPendingVersion();

  // Worker A acquires the lock then dies WITHOUT unlocking (connection closes).
  const workerA = new Client({ connectionString: process.env.DATABASE_URL });
  await workerA.connect();
  await workerA.query('SELECT pg_advisory_lock($1::int, $2::int)', scanClaimKey(versionId));
  await workerA.end(); // simulate process death: session ends, lock auto-released

  setScanner({ provider: 'FAKE', scan: async () => ({ outcome: 'CLEAN', provider: 'FAKE', codeSafe: 'FAKE_CLEAN' }) });
  try {
    await scanDocumentVersionInBackground(versionId, Buffer.from('bytes'));
    expect(await statusOf(versionId)).toBe('CLEAN');
  } finally {
    setScanner(null);
  }
});

test('X5 — different versions scan independently (lock scope is version identity only)', async () => {
  const vA = await createPendingVersion();
  const vB = await createPendingVersion();

  const workerA = new Client({ connectionString: process.env.DATABASE_URL });
  await workerA.connect();
  await workerA.query('SELECT pg_advisory_lock($1::int, $2::int)', scanClaimKey(vA));

  setScanner({ provider: 'FAKE', scan: async () => ({ outcome: 'CLEAN', provider: 'FAKE', codeSafe: 'FAKE_CLEAN' }) });
  try {
    await scanDocumentVersionInBackground(vB, Buffer.from('bytes'));
    expect(await statusOf(vB)).toBe('CLEAN');
    expect(await statusOf(vA)).toBe('PENDING_SCAN');
  } finally {
    setScanner(null);
    await workerA.query('SELECT pg_advisory_unlock_all()');
    await workerA.end();
  }
});
