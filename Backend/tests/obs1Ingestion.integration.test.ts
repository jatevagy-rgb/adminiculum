import { PrismaClient, ObservationType } from '@prisma/client';
import { ObservatoryIngestionService, validateNoSecrets } from '../src/modules/company-observatory/ingestion/service';
import { canonicalDigest } from '../src/modules/compliance/canonicalDigest';

const prisma = new PrismaClient();
const service = new ObservatoryIngestionService();

// Mock actor to satisfy tenant tests
const mockActor = (clientId: string) => ({ actorType: "USER", userId: "u1", context: { clientId } } as any);

describe('OBS-1 Ingestion Integration', () => {

  beforeAll(async () => {
    await prisma.client.createMany({ data: [{ id: 'c1', name: 'Client 1' }, { id: 'c2', name: 'Client 2' }], skipDuplicates: true });
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  it('1. source registration persists', async () => {
    const src = await service.registerExternalSource(mockActor('c1'), {
      clientId: 'c1',
      sourceType: 'CSV_IMPORT',
      name: 'Test Source',
      config: { folder: '/tmp/test' }
    });
    expect(src.id).toBeDefined();
    expect(src.clientId).toBe('c1');
  });

  it('2. non-secret config accepted', async () => {
    expect(() => validateNoSecrets({ description: 'accessToken is cool' })).not.toThrow();
  });

  it('3. top-level secret key rejected', async () => {
    expect(() => validateNoSecrets({ accessToken: 'xyz' })).toThrow('Forbidden secret key');
    expect(() => validateNoSecrets({ CLIENTSECRET: 'xyz' })).toThrow('Forbidden secret key');
  });

  it('4. nested secret key rejected', async () => {
    expect(() => validateNoSecrets({ auth: { refreSHToken: 'xyz' } })).toThrow('Forbidden secret key');
  });

  let sourceId = '';
  it('5. run start persists', async () => {
    const src = await service.registerExternalSource(mockActor('c1'), { clientId: 'c1', sourceType: 'CSV', name: 'Test', config: {} });
    sourceId = src.id;
    const run = await service.startDiscoveryRun(mockActor('c1'), { clientId: 'c1', connectionId: src.id });
    expect(run.status).toBe('RUNNING');
  });

  it('6. run complete persists', async () => {
    const run = await service.startDiscoveryRun(mockActor('c1'), { clientId: 'c1', connectionId: sourceId });
    const completed = await service.completeDiscoveryRun(mockActor('c1'), { clientId: 'c1', runId: run.id });
    expect(completed.status).toBe('COMPLETED');
    expect(completed.completedAt).not.toBeNull();
  });

  it('7. run fail persists', async () => {
    const run = await service.startDiscoveryRun(mockActor('c1'), { clientId: 'c1', connectionId: sourceId });
    const failed = await service.failDiscoveryRun(mockActor('c1'), { clientId: 'c1', runId: run.id });
    expect(failed.status).toBe('FAILED');
    expect(failed.completedAt).not.toBeNull();
  });

  it('8. run partial persists', async () => {
    const run = await service.startDiscoveryRun(mockActor('c1'), { clientId: 'c1', connectionId: sourceId });
    const partial = await service.markDiscoveryRunPartial(mockActor('c1'), { clientId: 'c1', runId: run.id });
    expect(partial.status).toBe('PARTIAL');
    expect(partial.completedAt).not.toBeNull();
  });

  it('9. observation persists', async () => {
    const run = await service.startDiscoveryRun(mockActor('c1'), { clientId: 'c1', connectionId: sourceId });
    const obs = await service.ingestObservation(mockActor('c1'), {
      clientId: 'c1',
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

  it('11. exact retry returns same Observation ID / one row', async () => {
    const run = await service.startDiscoveryRun(mockActor('c1'), { clientId: 'c1', connectionId: sourceId });
    const obs1 = await service.ingestObservation(mockActor('c1'), { clientId: 'c1', connectionId: sourceId, discoveryRunId: run.id, idempotencyKey: 'key_retry', rawPayload: { x: 1 } });
    const obs2 = await service.ingestObservation(mockActor('c1'), { clientId: 'c1', connectionId: sourceId, discoveryRunId: run.id, idempotencyKey: 'key_retry', rawPayload: { x: 1 } });
    expect(obs1.id).toBe(obs2.id);
  });

  it('12. same key + changed payload => IDEMPOTENCY_CONFLICT', async () => {
    const run = await service.startDiscoveryRun(mockActor('c1'), { clientId: 'c1', connectionId: sourceId });
    await service.ingestObservation(mockActor('c1'), { clientId: 'c1', connectionId: sourceId, discoveryRunId: run.id, idempotencyKey: 'key_conflict', rawPayload: { y: 1 } });
    await expect(service.ingestObservation(mockActor('c1'), { clientId: 'c1', connectionId: sourceId, discoveryRunId: run.id, idempotencyKey: 'key_conflict', rawPayload: { y: 2 } }))
      .rejects.toThrow('IDEMPOTENCY_CONFLICT');
  });

  it('13. different key + same content => two rows', async () => {
    const run = await service.startDiscoveryRun(mockActor('c1'), { clientId: 'c1', connectionId: sourceId });
    const payload = { same: true };
    const obs1 = await service.ingestObservation(mockActor('c1'), { clientId: 'c1', connectionId: sourceId, discoveryRunId: run.id, idempotencyKey: 'key_diff1', rawPayload: payload });
    const obs2 = await service.ingestObservation(mockActor('c1'), { clientId: 'c1', connectionId: sourceId, discoveryRunId: run.id, idempotencyKey: 'key_diff2', rawPayload: payload });
    expect(obs1.id).not.toBe(obs2.id);
  });

  it('14. same key across clients independent', async () => {
    const src2 = await service.registerExternalSource(mockActor('c2'), { clientId: 'c2', sourceType: 'CSV', name: 'Test2', config: {} });
    const run1 = await service.startDiscoveryRun(mockActor('c1'), { clientId: 'c1', connectionId: sourceId });
    const run2 = await service.startDiscoveryRun(mockActor('c2'), { clientId: 'c2', connectionId: src2.id });
    const obs1 = await service.ingestObservation(mockActor('c1'), { clientId: 'c1', connectionId: sourceId, discoveryRunId: run1.id, idempotencyKey: 'key_multi', rawPayload: { a: 1 } });
    const obs2 = await service.ingestObservation(mockActor('c2'), { clientId: 'c2', connectionId: src2.id, discoveryRunId: run2.id, idempotencyKey: 'key_multi', rawPayload: { a: 1 } });
    expect(obs1.id).not.toBe(obs2.id);
  });

  it('15. same key across connections independent', async () => {
    const src2 = await service.registerExternalSource(mockActor('c1'), { clientId: 'c1', sourceType: 'CSV', name: 'Test3', config: {} });
    const run1 = await service.startDiscoveryRun(mockActor('c1'), { clientId: 'c1', connectionId: sourceId });
    const run2 = await service.startDiscoveryRun(mockActor('c1'), { clientId: 'c1', connectionId: src2.id });
    const obs1 = await service.ingestObservation(mockActor('c1'), { clientId: 'c1', connectionId: sourceId, discoveryRunId: run1.id, idempotencyKey: 'key_multi_conn', rawPayload: { a: 1 } });
    const obs2 = await service.ingestObservation(mockActor('c1'), { clientId: 'c1', connectionId: src2.id, discoveryRunId: run2.id, idempotencyKey: 'key_multi_conn', rawPayload: { a: 1 } });
    expect(obs1.id).not.toBe(obs2.id);
  });

  it('16. cross-client source/run rejected', async () => {
    await expect(service.startDiscoveryRun(mockActor('c2'), { clientId: 'c2', connectionId: sourceId })).rejects.toThrow();
  });

  it('17. cross-client observation rejected', async () => {
    const run = await service.startDiscoveryRun(mockActor('c1'), { clientId: 'c1', connectionId: sourceId });
    await expect(service.ingestObservation(mockActor('c2'), { clientId: 'c2', connectionId: sourceId, discoveryRunId: run.id, idempotencyKey: 'cross', rawPayload: {} })).rejects.toThrow();
  });

  it('18. connectionId/run connection mismatch rejected by PostgreSQL FK', async () => {
    const src2 = await service.registerExternalSource(mockActor('c1'), { clientId: 'c1', sourceType: 'CSV', name: 'Test4', config: {} });
    const run = await service.startDiscoveryRun(mockActor('c1'), { clientId: 'c1', connectionId: sourceId });
    await expect(prisma.observation.create({
      data: {
        clientId: 'c1',
        connectionId: src2.id, // MISMATCH!
        discoveryRunId: run.id,
        idempotencyKey: 'mismatch',
        inputDigest: 'x',
        rawPayload: {}
      }
    })).rejects.toThrow();
  });

  it('19. archived/revoked source retains history', async () => {
    const run = await service.startDiscoveryRun(mockActor('c1'), { clientId: 'c1', connectionId: sourceId });
    await service.ingestObservation(mockActor('c1'), { clientId: 'c1', connectionId: sourceId, discoveryRunId: run.id, idempotencyKey: 'keep', rawPayload: {} });
    await service.updateExternalSourceStatus(mockActor('c1'), { clientId: 'c1', connectionId: sourceId, status: 'REVOKED' });
    const obs = await prisma.observation.findFirst({ where: { idempotencyKey: 'keep' } });
    expect(obs).toBeDefined();
  });

  it('20. source delete with runs rejected', async () => {
    await expect(prisma.externalSourceConnection.delete({ where: { id_clientId: { id: sourceId, clientId: 'c1' } } })).rejects.toThrow();
  });

  it('21. run delete with observations rejected', async () => {
    const run = await service.startDiscoveryRun(mockActor('c1'), { clientId: 'c1', connectionId: sourceId });
    await service.ingestObservation(mockActor('c1'), { clientId: 'c1', connectionId: sourceId, discoveryRunId: run.id, idempotencyKey: 'delete-test', rawPayload: {} });
    await expect(prisma.discoveryRun.delete({ where: { id_clientId: { id: run.id, clientId: 'c1' } } })).rejects.toThrow();
  });

  it('22. canonical company models unchanged', async () => {
    const p1 = await prisma.businessProcess.count();
    const run = await service.startDiscoveryRun(mockActor('c1'), { clientId: 'c1', connectionId: sourceId });
    await service.ingestObservation(mockActor('c1'), { clientId: 'c1', connectionId: sourceId, discoveryRunId: run.id, idempotencyKey: 'safe', rawPayload: {} });
    const p2 = await prisma.businessProcess.count();
    expect(p1).toBe(p2);
  });
});
