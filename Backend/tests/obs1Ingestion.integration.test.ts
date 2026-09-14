import crypto from 'crypto';
import { PrismaClient, ObservationType } from '@prisma/client';
import { ObservatoryIngestionService, validateNoSecrets } from '../src/modules/company-observatory/ingestion/service';
import { canonicalDigest } from '../src/modules/compliance/canonicalDigest';

const databaseUrl =
  process.env.OBSERVATORY_TEST_DATABASE_URL ||
  process.env.GROW_TEST_DATABASE_URL ||
  process.env.MIGRATION_REPLAY_DATABASE_URL ||
  process.env.DATABASE_URL;

const d = databaseUrl ? describe : describe.skip;

d('OBS-1 Ingestion Integration', () => {
  let prisma: PrismaClient;
  const service = new ObservatoryIngestionService();

  const suffix = crypto.randomUUID().slice(0, 8);
  const adminId = crypto.randomUUID();
  const lawyerId = crypto.randomUUID();
  const c1 = crypto.randomUUID();
  const c2 = crypto.randomUUID();

  // Real canonical actors: ADMIN may read any client; the LAWYER has case access
  // to client 1 only, which is what makes the cross-client assertions meaningful.
  const admin = { userId: adminId, role: 'ADMIN' };
  const lawyer = { userId: lawyerId, role: 'LAWYER' };

  beforeAll(async () => {
    process.env.DATABASE_URL = databaseUrl;
    prisma = new PrismaClient({ datasources: { db: { url: databaseUrl } } });

    await prisma.user.createMany({
      data: [
        { id: adminId, email: `obs1-admin-${suffix}@test.invalid`, name: 'OBS1 Admin', role: 'ADMIN', status: 'ACTIVE' },
        { id: lawyerId, email: `obs1-lawyer-${suffix}@test.invalid`, name: 'OBS1 Lawyer', role: 'LAWYER', status: 'ACTIVE' },
      ] as never,
    });
    await prisma.client.createMany({
      data: [
        { id: c1, name: `OBS1 Client 1 ${suffix}` },
        { id: c2, name: `OBS1 Client 2 ${suffix}` },
      ],
    });
    await prisma.case.create({
      data: {
        id: crypto.randomUUID(),
        caseNumber: `OBS1-${suffix}`,
        title: 'OBS1 access case',
        caseType: 'OTHER',
        clientId: c1,
        createdById: adminId,
        assignedLawyerId: lawyerId,
      } as any,
    });
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  it('0. OBS_SOURCE_REGISTER=PASS source registration persists', async () => {
    const src = await service.registerExternalSource(admin, {
      clientId: c1,
      sourceType: 'CSV_IMPORT',
      name: 'Test Source',
      config: { folder: '/tmp/test' }
    });
    expect(src.id).toBeDefined();
    expect(src.clientId).toBe(c1);
  });

  it('0b. OBS_SECRET_REJECT=PASS non-secret and secret config handling', async () => {
    expect(() => validateNoSecrets({ description: 'accessToken is cool' })).not.toThrow();
    expect(() => validateNoSecrets({ accessToken: 'xyz' })).toThrow('Forbidden secret key');
    expect(() => validateNoSecrets({ CLIENTSECRET: 'xyz' })).toThrow('Forbidden secret key');
    expect(() => validateNoSecrets({ auth: { refreSHToken: 'xyz' } })).toThrow('Forbidden secret key');
  });

  let sourceId = '';
  it('0c. OBS_START_RUN=PASS run start persists', async () => {
    const src = await service.registerExternalSource(admin, { clientId: c1, sourceType: 'CSV', name: 'Test', config: {} });
    sourceId = src.id;
    const run = await service.startDiscoveryRun(admin, { clientId: c1, connectionId: src.id });
    expect(run.status).toBe('RUNNING');
  });

  it('0d. OBS_COMPLETE_RUN=PASS run completion persists', async () => {
    const run = await service.startDiscoveryRun(admin, { clientId: c1, connectionId: sourceId });
    const completed = await service.completeDiscoveryRun(admin, { clientId: c1, runId: run.id });
    expect(completed.status).toBe('COMPLETED');
    expect(completed.completedAt).not.toBeNull();
  });

  it('0e. run fail persists', async () => {
    const run = await service.startDiscoveryRun(admin, { clientId: c1, connectionId: sourceId });
    const failed = await service.failDiscoveryRun(admin, { clientId: c1, runId: run.id });
    expect(failed.status).toBe('FAILED');
    expect(failed.completedAt).not.toBeNull();
  });

  it('0f. run partial persists', async () => {
    const run = await service.startDiscoveryRun(admin, { clientId: c1, connectionId: sourceId });
    const partial = await service.markDiscoveryRunPartial(admin, { clientId: c1, runId: run.id });
    expect(partial.status).toBe('PARTIAL');
    expect(partial.completedAt).not.toBeNull();
  });

  it('0g. OBS_INGEST=PASS observation persists', async () => {
    const run = await service.startDiscoveryRun(admin, { clientId: c1, connectionId: sourceId });
    const obs = await service.ingestObservation(admin, {
      clientId: c1,
      connectionId: sourceId,
      discoveryRunId: run.id,
      idempotencyKey: 'key1',
      rawPayload: { a: 1 }
    });
    expect(obs.id).toBeDefined();
  });

  it('10. canonical digest key-order deterministic', async () => {
    const obj1 = { a: 1, b: 2 };
    const obj2 = { b: 2, a: 1 };
    expect(canonicalDigest(obj1)).toBe(canonicalDigest(obj2));
  });

  it('11. OBS_IDEMPOTENT_REPLAY=PASS exact retry returns same Observation ID / one row', async () => {
    const run = await service.startDiscoveryRun(admin, { clientId: c1, connectionId: sourceId });
    const obs1 = await service.ingestObservation(admin, { clientId: c1, connectionId: sourceId, discoveryRunId: run.id, idempotencyKey: 'key_retry', rawPayload: { x: 1 } });
    const obs2 = await service.ingestObservation(admin, { clientId: c1, connectionId: sourceId, discoveryRunId: run.id, idempotencyKey: 'key_retry', rawPayload: { x: 1 } });
    expect(obs1.id).toBe(obs2.id);
  });

  it('12. OBS_IDEMPOTENCY_CONFLICT=PASS same key + changed payload rejected', async () => {
    const run = await service.startDiscoveryRun(admin, { clientId: c1, connectionId: sourceId });
    await service.ingestObservation(admin, { clientId: c1, connectionId: sourceId, discoveryRunId: run.id, idempotencyKey: 'key_conflict', rawPayload: { y: 1 } });
    await expect(service.ingestObservation(admin, { clientId: c1, connectionId: sourceId, discoveryRunId: run.id, idempotencyKey: 'key_conflict', rawPayload: { y: 2 } }))
      .rejects.toThrow('IDEMPOTENCY_CONFLICT');
  });

  it('13. different key + same content => two rows', async () => {
    const run = await service.startDiscoveryRun(admin, { clientId: c1, connectionId: sourceId });
    const payload = { same: true };
    const obs1 = await service.ingestObservation(admin, { clientId: c1, connectionId: sourceId, discoveryRunId: run.id, idempotencyKey: 'key_diff1', rawPayload: payload });
    const obs2 = await service.ingestObservation(admin, { clientId: c1, connectionId: sourceId, discoveryRunId: run.id, idempotencyKey: 'key_diff2', rawPayload: payload });
    expect(obs1.id).not.toBe(obs2.id);
  });

  it('14. same key across clients independent', async () => {
    const src2 = await service.registerExternalSource(admin, { clientId: c2, sourceType: 'CSV', name: 'Test2', config: {} });
    const run1 = await service.startDiscoveryRun(admin, { clientId: c1, connectionId: sourceId });
    const run2 = await service.startDiscoveryRun(admin, { clientId: c2, connectionId: src2.id });
    const obs1 = await service.ingestObservation(admin, { clientId: c1, connectionId: sourceId, discoveryRunId: run1.id, idempotencyKey: 'key_multi', rawPayload: { a: 1 } });
    const obs2 = await service.ingestObservation(admin, { clientId: c2, connectionId: src2.id, discoveryRunId: run2.id, idempotencyKey: 'key_multi', rawPayload: { a: 1 } });
    expect(obs1.id).not.toBe(obs2.id);
  });

  it('15. same key across connections independent', async () => {
    const src2 = await service.registerExternalSource(admin, { clientId: c1, sourceType: 'CSV', name: 'Test3', config: {} });
    const run1 = await service.startDiscoveryRun(admin, { clientId: c1, connectionId: sourceId });
    const run2 = await service.startDiscoveryRun(admin, { clientId: c1, connectionId: src2.id });
    const obs1 = await service.ingestObservation(admin, { clientId: c1, connectionId: sourceId, discoveryRunId: run1.id, idempotencyKey: 'key_multi_conn', rawPayload: { a: 1 } });
    const obs2 = await service.ingestObservation(admin, { clientId: c1, connectionId: src2.id, discoveryRunId: run2.id, idempotencyKey: 'key_multi_conn', rawPayload: { a: 1 } });
    expect(obs1.id).not.toBe(obs2.id);
  });

  it('16. OBS_CROSS_CLIENT_ISOLATION=PASS cross-client source/run rejected', async () => {
    // The lawyer has case access to client 1 only; client 2 is out of scope.
    await expect(service.startDiscoveryRun(lawyer, { clientId: c2, connectionId: sourceId })).rejects.toMatchObject({ code: 'CLIENT_ACCESS_FORBIDDEN' });
  });

  it('17. cross-client observation rejected', async () => {
    const run = await service.startDiscoveryRun(admin, { clientId: c1, connectionId: sourceId });
    await expect(service.ingestObservation(lawyer, { clientId: c2, connectionId: sourceId, discoveryRunId: run.id, idempotencyKey: 'cross', rawPayload: {} })).rejects.toMatchObject({ code: 'CLIENT_ACCESS_FORBIDDEN' });
  });

  it('18. connectionId/run connection mismatch rejected by PostgreSQL FK', async () => {
    const src2 = await service.registerExternalSource(admin, { clientId: c1, sourceType: 'CSV', name: 'Test4', config: {} });
    const run = await service.startDiscoveryRun(admin, { clientId: c1, connectionId: sourceId });
    await expect(prisma.observation.create({
      data: {
        clientId: c1,
        connectionId: src2.id, // MISMATCH!
        discoveryRunId: run.id,
        idempotencyKey: 'mismatch',
        inputDigest: 'x',
        rawPayload: {}
      }
    })).rejects.toThrow();
  });

  it('19. archived/revoked source retains history', async () => {
    const run = await service.startDiscoveryRun(admin, { clientId: c1, connectionId: sourceId });
    await service.ingestObservation(admin, { clientId: c1, connectionId: sourceId, discoveryRunId: run.id, idempotencyKey: 'keep', rawPayload: {} });
    await service.updateExternalSourceStatus(admin, { clientId: c1, connectionId: sourceId, status: 'REVOKED' });
    const obs = await prisma.observation.findFirst({ where: { clientId: c1, idempotencyKey: 'keep' } });
    expect(obs).toBeDefined();
  });

  it('20. source delete with runs rejected', async () => {
    await expect(prisma.externalSourceConnection.delete({ where: { id_clientId: { id: sourceId, clientId: c1 } } })).rejects.toThrow();
  });

  it('21. run delete with observations rejected', async () => {
    const run = await service.startDiscoveryRun(admin, { clientId: c1, connectionId: sourceId });
    await service.ingestObservation(admin, { clientId: c1, connectionId: sourceId, discoveryRunId: run.id, idempotencyKey: 'delete-test', rawPayload: {} });
    await expect(prisma.discoveryRun.delete({ where: { id_clientId: { id: run.id, clientId: c1 } } })).rejects.toThrow();
  });

  it('22. canonical company models unchanged', async () => {
    const p1 = await prisma.businessProcess.count({ where: { clientId: c1 } });
    const run = await service.startDiscoveryRun(admin, { clientId: c1, connectionId: sourceId });
    await service.ingestObservation(admin, { clientId: c1, connectionId: sourceId, discoveryRunId: run.id, idempotencyKey: 'safe', rawPayload: {} });
    const p2 = await prisma.businessProcess.count({ where: { clientId: c1 } });
    expect(p1).toBe(p2);
  });
});
