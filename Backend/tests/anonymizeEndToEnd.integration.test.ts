/**
 * End-to-end anonymization contract (B1 closure):
 *  - source read reuses the canonical version storage (reader-equivalent)
 *  - multiple known-party bundles are preserved without overwrite
 *  - generated output has distinct identity, is tied to the exact case/source
 *    document, appears on reload, and never leaks into another case.
 *
 * Requires the disposable local PG fixture (127.0.0.1:55483/adminiculum_replay_wf10,
 * user wf10_pgtest). All content is synthetic; no real documents or personal data.
 */
import { randomUUID } from 'crypto';
import express from 'express';
import type { Server } from 'http';
import { prisma } from '../src/prisma/prisma.service';
import anonymizeRouter from '../src/modules/anonymize/routes';
import driveService from '../src/modules/sharepoint/driveService';

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
const otherCaseId = randomUUID();
// Source document whose legacy document-level pointer is NULL; only the current
// version carries the storage reference (the exact B1 divergence).
const documentId = randomUUID();
const versionId = randomUUID();
const SOURCE_TEXT = 'Alpha Kft. és Beta Kft. között létrejött szerződés.';

let server: Server;
let base: string;

beforeAll(async () => {
  const url = new URL(process.env.DATABASE_URL || '');
  if (url.hostname !== '127.0.0.1' || url.port !== '55483' || url.pathname !== '/adminiculum_replay_wf10') throw Error('Unsafe DB');
  const identity = await prisma.$queryRaw<any[]>`SELECT current_database() db,current_user usr,inet_server_port() port`;
  expect(identity[0]).toMatchObject({ db: 'adminiculum_replay_wf10', usr: 'wf10_pgtest', port: 55483 });
  process.env.ENABLE_AI_ANONYMIZATION = 'true';

  await prisma.user.create({ data: { id: user, email: `${user}@b1.invalid`, name: 'B1 admin', role: 'ADMIN', skills: [] } });
  await prisma.client.create({ data: { id: client, name: 'B1 Client' } });
  await prisma.case.create({ data: { id: caseId, caseNumber: caseId, title: 'B1 case', clientId: client, caseType: 'OTHER', createdById: user } });
  await prisma.case.create({ data: { id: otherCaseId, caseNumber: otherCaseId, title: 'B1 other case', clientId: client, caseType: 'OTHER', createdById: user } });

  // document pointer is intentionally null; the current version owns the storage.
  await prisma.document.create({ data: { id: documentId, caseId, clientId: client, name: 'SOURCE_DOCX', category: 'OTHER', mimeType: 'text/plain', spItemId: null } });
  await prisma.documentVersion.create({ data: { id: versionId, documentId, version: 1, name: 'v1', originalFileName: 'source.txt', mimeType: 'text/plain', uploadedById: user, storageReference: 'synthetic-v1', securityScanStatus: 'CLEAN', isCurrent: true } });

  (driveService.downloadDocument as jest.Mock).mockImplementation(async (storageId: string) => {
    if (storageId === 'synthetic-v1') return Buffer.from(SOURCE_TEXT, 'utf-8');
    return null;
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
});

describe('source read reuses canonical version storage', () => {
  test('GET anonymization-source resolves text from the current version when document pointer is null', async () => {
    const r = await fetch(`${base}/documents/${documentId}/anonymization-source`, { headers: { 'x-test-user': user } });
    expect(r.status).toBe(200);
    const body = await r.json() as any;
    expect(body.success).toBe(true);
    expect(body.textAvailable).toBe(true);
    expect(body.sourceText).toContain('Alpha Kft.');
  });

  test('POST anonymize succeeds without UI-provided text (resolves the same version storage)', async () => {
    const r = await fetch(`${base}/documents/${documentId}/anonymize`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-test-user': user },
      body: JSON.stringify({ aiTask: 'SUMMARIZE' }),
    });
    expect(r.status).toBe(200);
    const body = await r.json() as any;
    expect(body.success).toBe(true);
    expect(body.anonymizedDocumentId).toBeTruthy();
  });
});

describe('multiple known parties without overwrite', () => {
  async function anonymize(knownParties: unknown[]) {
    const r = await fetch(`${base}/documents/${documentId}/anonymize`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-test-user': user },
      body: JSON.stringify({
        aiTask: 'SUMMARIZE',
        metadata: { knownParties },
      }),
    });
    return { status: r.status, body: await r.json() as any };
  }

  test('two parties redact with distinct, role-derived tokens', async () => {
    const { status, body } = await anonymize([
      { kind: 'COMPANY', name: 'Alpha Kft.', legalRole: 'Vevő' },
      { kind: 'COMPANY', name: 'Beta Kft.', legalRole: 'Ellenérdekű fél' },
    ]);
    expect(status).toBe(200);
    expect(body.redactedText).toContain('[ÜGYFÉL_1]');
    expect(body.redactedText).toContain('[ELLENÉRDEKŰ FÉL_1]');
    expect(body.redactedText).not.toContain('Alpha Kft.');
    expect(body.redactedText).not.toContain('Beta Kft.');
  });

  test('removing a party does not mutate the remaining party redaction', async () => {
    const both = await anonymize([
      { kind: 'COMPANY', name: 'Alpha Kft.', legalRole: 'Vevő' },
      { kind: 'COMPANY', name: 'Beta Kft.', legalRole: 'Ellenérdekű fél' },
    ]);
    const onlyA = await anonymize([{ kind: 'COMPANY', name: 'Alpha Kft.', legalRole: 'Vevő' }]);

    expect(onlyA.body.redactedText).toContain('[ÜGYFÉL_1]');
    expect(onlyA.body.redactedText).not.toContain('Alpha Kft.');
    // Beta is not supplied, so it remains untouched in the source text.
    expect(onlyA.body.redactedText).toContain('Beta Kft.');
    expect(onlyA.body.redactedText).not.toContain('[ELLENÉRDEKŰ FÉL_1]');
    // The remaining party's redaction is identical to the two-party run.
    expect(both.body.redactedText).toContain('[ÜGYFÉL_1]');
  });
});

describe('output + return contract', () => {
  test('source document and version are immutable, output is distinct and correctly linked', async () => {
    const beforeDoc = await prisma.document.findUnique({ where: { id: documentId }, include: { versions: true } });
    const r = await fetch(`${base}/documents/${documentId}/anonymize`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-test-user': user },
      body: JSON.stringify({ aiTask: 'SUMMARIZE' }),
    });
    expect(r.status).toBe(200);
    const body = await r.json() as any;

    const afterDoc = await prisma.document.findUnique({ where: { id: documentId }, include: { versions: true } });
    expect(afterDoc!.name).toBe(beforeDoc!.name);
    expect(afterDoc!.spItemId).toBeNull();
    expect(afterDoc!.versions).toHaveLength(1);
    expect(afterDoc!.versions[0].storageReference).toBe('synthetic-v1');
    expect(afterDoc!.versions[0].securityScanStatus).toBe('CLEAN');

    const artifact = await prisma.anonymousDocument.findUnique({ where: { id: body.anonymizedDocumentId } });
    expect(artifact).not.toBeNull();
    expect(artifact!.id).not.toBe(documentId);
    expect(artifact!.sourceDocId).toBe(documentId);
    expect(artifact!.caseId).toBe(caseId);

    // Reload/readback through the list and single-read surfaces.
    const list = await fetch(`${base}/anonymous-documents?sourceDocId=${documentId}`, { headers: { 'x-test-user': user } });
    const listBody = await list.json() as any[];
    expect(listBody.some((d) => d.id === artifact!.id)).toBe(true);

    const single = await fetch(`${base}/anonymous-documents/${artifact!.id}`, { headers: { 'x-test-user': user } });
    expect(single.status).toBe(200);
    const singleBody = await single.json() as any;
    expect(singleBody.redactedText).toBeDefined();

    // No unrelated case receives it.
    const otherList = await fetch(`${base}/anonymous-documents?caseId=${otherCaseId}`, { headers: { 'x-test-user': user } });
    const otherBody = await otherList.json() as any[];
    expect(otherBody.some((d) => d.id === artifact!.id)).toBe(false);
  });
});
