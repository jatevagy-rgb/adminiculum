import crypto from 'crypto';
import { PrismaClient } from '@prisma/client';
import { assertFactSubjectScope, validateTypedFactValue } from '../src/modules/compliance-foundation/service';

const databaseUrl = process.env.CLIENT_INTERACTION_TEST_DATABASE_URL
  || process.env.CLIENT_IDENTITY_TEST_DATABASE_URL
  || process.env.MIGRATION_REPLAY_DATABASE_URL;
const describeWithDatabase = databaseUrl ? describe : describe.skip;

describeWithDatabase('Phase 6 Slice A foundation (PostgreSQL)', () => {
  let db: PrismaClient;
  const suffix = crypto.randomUUID();
  const clientA = crypto.randomUUID();
  const clientB = crypto.randomUUID();
  const definitionString = crypto.randomUUID();
  const definitionBoolean = crypto.randomUUID();
  const definitionNumber = crypto.randomUUID();
  const subjectEmployee = crypto.randomUUID();
  const legacyFact = crypto.randomUUID();
  const sourceId = crypto.randomUUID();
  const versionA = crypto.randomUUID();
  const versionB = crypto.randomUUID();
  const captureA = crypto.randomUUID();
  const captureB = crypto.randomUUID();

  beforeAll(async () => {
    process.env.DATABASE_URL = databaseUrl;
    db = new PrismaClient({ datasources: { db: { url: databaseUrl } } });
    await db.client.createMany({ data: [
      { id: clientA, name: `Synthetic Phase 6 A ${suffix}` },
      { id: clientB, name: `Synthetic Phase 6 B ${suffix}` },
    ] });
    await db.factDefinition.createMany({ data: [
      { id: definitionString, key: `SYNTHETIC_STRING_${suffix}`, domainCode: 'TEST', valueType: 'STRING', allowedScopeTypes: ['COMPANY'], determinationMethod: 'USER_PROVIDED', overlapPolicy: 'ALLOW', temporalPolicy: 'OBSERVATION' },
      { id: definitionBoolean, key: `SYNTHETIC_BOOLEAN_${suffix}`, domainCode: 'TEST', valueType: 'BOOLEAN', allowedScopeTypes: ['EMPLOYEE'], determinationMethod: 'DERIVED', overlapPolicy: 'ALLOW', temporalPolicy: 'EVENT' },
      { id: definitionNumber, key: `SYNTHETIC_NUMBER_${suffix}`, domainCode: 'TEST', valueType: 'NUMBER', allowedScopeTypes: ['COMPANY'], determinationMethod: 'USER_PROVIDED', overlapPolicy: 'DISALLOW', temporalPolicy: 'REFERENCE_PERIOD' },
    ] });
    await db.factSubject.create({ data: { id: subjectEmployee, clientId: clientA, scopeType: 'EMPLOYEE', subjectKey: `employee-${suffix}` } });
    await db.clientFact.create({ data: { id: legacyFact, clientId: clientA, type: 'LEGACY_SYNTHETIC', value: 'retained', validFrom: new Date('2026-01-01T00:00:00Z') } });
    await db.legalSource.create({ data: { id: sourceId, sourceKey: `synthetic-source-${suffix}`, jurisdictionCode: 'HU', instrumentType: 'LEGISLATION', status: 'CANDIDATE', updatedAt: new Date() } });
  });

  afterAll(async () => {
    await db?.legalSourceCapture.deleteMany({ where: { id: { in: [captureA, captureB] } } });
    await db?.legalSourceVersion.deleteMany({ where: { id: { in: [versionA, versionB] } } });
    await db?.legalSource.deleteMany({ where: { id: sourceId } });
    await db?.clientFact.deleteMany({ where: { clientId: { in: [clientA, clientB] } } });
    await db?.factSubject.deleteMany({ where: { id: subjectEmployee } });
    await db?.factDefinition.deleteMany({ where: { id: { in: [definitionString, definitionBoolean, definitionNumber] } } });
    await db?.client.deleteMany({ where: { id: { in: [clientA, clientB] } } });
    await db?.$disconnect();
  });

  it('keeps legacy rows and accepts typed string, boolean and numeric facts', async () => {
    const legacy = await db.clientFact.findUnique({ where: { id: legacyFact } });
    expect(legacy?.value).toBe('retained');

    const stringValue = validateTypedFactValue({ valueType: 'STRING', allowedScopeTypes: ['COMPANY'] }, { stringValue: 'synthetic-value' });
    const booleanValue = validateTypedFactValue({ valueType: 'BOOLEAN', allowedScopeTypes: ['EMPLOYEE'] }, { booleanValue: true });
    const numberValue = validateTypedFactValue({ valueType: 'NUMBER', allowedScopeTypes: ['COMPANY'] }, { numberValue: '12.50' });
    await db.clientFact.createMany({ data: [
      { clientId: clientA, type: 'PHASE6_STRING', value: 'legacy-projection', validFrom: new Date(), factDefinitionId: definitionString, scopeType: 'COMPANY', ...stringValue },
      { clientId: clientA, type: 'PHASE6_BOOLEAN', value: 'true', validFrom: new Date(), factDefinitionId: definitionBoolean, factSubjectId: subjectEmployee, scopeType: 'EMPLOYEE', ...booleanValue },
      { clientId: clientA, type: 'PHASE6_NUMBER', value: '12.50', validFrom: new Date(), factDefinitionId: definitionNumber, scopeType: 'COMPANY', referencePeriodStart: new Date('2026-01-01T00:00:00Z'), referencePeriodEnd: new Date('2026-03-31T00:00:00Z'), ...numberValue },
    ] as never });
    const typed = await db.clientFact.count({ where: { clientId: clientA, factDefinitionId: { not: null } } });
    expect(typed).toBe(3);
  });

  it('rejects invalid typed shapes and enforces subject tenant/scope validation', () => {
    expect(() => validateTypedFactValue({ valueType: 'BOOLEAN', allowedScopeTypes: ['COMPANY'] }, { booleanValue: true, stringValue: 'extra' })).toThrow('Exactly one typed value');
    expect(() => validateTypedFactValue({ valueType: 'NUMBER', allowedScopeTypes: ['COMPANY'] }, { numberValue: 'not-a-number' })).toThrow('finite number');
    expect(() => assertFactSubjectScope({ allowedScopeTypes: ['EMPLOYEE'] }, { clientId: clientB, scopeType: 'EMPLOYEE' }, clientA, 'EMPLOYEE')).toThrow('belongs to another client');
    expect(() => assertFactSubjectScope({ allowedScopeTypes: ['COMPANY'] }, { clientId: clientA, scopeType: 'EMPLOYEE' }, clientA, 'COMPANY')).toThrow('must not have a FactSubject');
  });

  it('preserves legal source identity, multiple versions and multiple captures', async () => {
    await db.legalSourceVersion.createMany({ data: [
      { id: versionA, legalSourceId: sourceId, legalVersionKey: '2026-01', effectiveFrom: new Date('2026-01-01T00:00:00Z'), status: 'ACTIVE', reviewStatus: 'APPROVED' },
      { id: versionB, legalSourceId: sourceId, legalVersionKey: '2026-07', effectiveFrom: new Date('2026-07-01T00:00:00Z'), status: 'CANDIDATE', reviewStatus: 'VERSION_AMBIGUOUS' },
    ] });
    await db.legalSourceCapture.createMany({ data: [
      { id: captureA, legalSourceVersionId: versionA, sourceSha256: 'a'.repeat(64), sourceUri: 'https://synthetic.invalid/a.txt', provenance: { format: 'TXT' }, completeness: 'COMPLETE', captureStatus: 'REVIEWED' },
      { id: captureB, legalSourceVersionId: versionA, sourceSha256: 'b'.repeat(64), sourceUri: 'https://synthetic.invalid/a.pdf', provenance: { format: 'PDF' }, completeness: 'PARTIAL', ambiguityStatus: 'POSSIBLE_DUPLICATE' },
    ] });
    await expect(db.legalSourceVersion.create({ data: { legalSourceId: sourceId, legalVersionKey: '2026-01', status: 'CANDIDATE', reviewStatus: 'UNREVIEWED' } })).rejects.toMatchObject({ code: 'P2002' });
    await expect(db.legalSourceCapture.create({ data: { legalSourceVersionId: versionA, sourceSha256: 'a'.repeat(64) } })).rejects.toMatchObject({ code: 'P2002' });
    const captures = await db.legalSourceCapture.findMany({ where: { legalSourceVersionId: versionA }, orderBy: { capturedAt: 'asc' } });
    expect(captures).toHaveLength(2);
    expect(captures.map((capture) => capture.sourceSha256)).toEqual(['a'.repeat(64), 'b'.repeat(64)]);
  });
});
