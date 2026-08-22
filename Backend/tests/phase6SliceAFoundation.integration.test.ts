import crypto from 'crypto';
import { PrismaClient } from '@prisma/client';
import { assertFactSubjectLinkedEntityScope, assertFactSubjectScope, validateTypedFactValue } from '../src/modules/compliance-foundation/service';

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
  const definitionMoney = crypto.randomUUID();
  const subjectEmployee = crypto.randomUUID();
  const subjectContractA = crypto.randomUUID();
  const subjectPersonA = crypto.randomUUID();
  const contractA = crypto.randomUUID();
  const contractB = crypto.randomUUID();
  const personA = crypto.randomUUID();
  const personB = crypto.randomUUID();
  const legacyFact = crypto.randomUUID();
  const sourceId = crypto.randomUUID();
  const sourceBId = crypto.randomUUID();
  const versionA = crypto.randomUUID();
  const versionB = crypto.randomUUID();
  const versionB1 = crypto.randomUUID();
  const captureA = crypto.randomUUID();
  const captureB = crypto.randomUUID();
  const captureC = crypto.randomUUID();

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
      { id: definitionMoney, key: `SYNTHETIC_MONEY_${suffix}`, domainCode: 'TEST', valueType: 'MONEY', allowedScopeTypes: ['COMPANY'], determinationMethod: 'USER_PROVIDED', overlapPolicy: 'ALLOW', temporalPolicy: 'OBSERVATION' },
    ] });
    await db.factSubject.create({ data: { id: subjectEmployee, clientId: clientA, scopeType: 'EMPLOYEE', subjectKey: `employee-${suffix}` } });
    await db.contractRecord.createMany({ data: [
      { id: contractA, clientId: clientA, title: `Contract A ${suffix}`, contractType: 'EMPLOYMENT' },
      { id: contractB, clientId: clientB, title: `Contract B ${suffix}`, contractType: 'EMPLOYMENT' },
    ] });
    await db.organizationPerson.createMany({ data: [
      { id: personA, clientId: clientA, name: `Person A ${suffix}` },
      { id: personB, clientId: clientB, name: `Person B ${suffix}` },
    ] });
    await db.factSubject.createMany({ data: [
      { id: subjectContractA, clientId: clientA, scopeType: 'CONTRACT', subjectKey: `contract-${suffix}`, contractRecordId: contractA },
      { id: subjectPersonA, clientId: clientA, scopeType: 'EMPLOYEE', subjectKey: `person-${suffix}`, organizationPersonId: personA },
    ] });
    await db.clientFact.create({ data: { id: legacyFact, clientId: clientA, type: 'LEGACY_SYNTHETIC', value: 'retained', validFrom: new Date('2026-01-01T00:00:00Z') } });
    await db.legalSource.create({ data: { id: sourceId, sourceKey: `synthetic-source-${suffix}`, jurisdictionCode: 'HU', instrumentType: 'LEGISLATION', status: 'CANDIDATE', updatedAt: new Date() } });
    await db.legalSource.create({ data: { id: sourceBId, sourceKey: `synthetic-source-b-${suffix}`, jurisdictionCode: 'HU', instrumentType: 'LEGISLATION', status: 'CANDIDATE', updatedAt: new Date() } });
  });

  afterAll(async () => {
    await db?.legalSourceCapture.deleteMany({ where: { id: { in: [captureA, captureB, captureC] } } });
    await db?.legalSourceVersion.deleteMany({ where: { id: { in: [versionA, versionB, versionB1] } } });
    await db?.legalSource.deleteMany({ where: { id: { in: [sourceId, sourceBId] } } });
    await db?.clientFact.deleteMany({ where: { clientId: { in: [clientA, clientB] } } });
    await db?.factSubject.deleteMany({ where: { id: { in: [subjectEmployee, subjectContractA, subjectPersonA] } } });
    await db?.organizationPerson.deleteMany({ where: { id: { in: [personA, personB] } } });
    await db?.contractRecord.deleteMany({ where: { id: { in: [contractA, contractB] } } });
    await db?.factDefinition.deleteMany({ where: { id: { in: [definitionString, definitionBoolean, definitionNumber, definitionMoney] } } });
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

  it('validates MONEY and representative enum/temporal value types', () => {
    const money = validateTypedFactValue({ valueType: 'MONEY', allowedScopeTypes: ['COMPANY'] }, { moneyAmount: '12.50', moneyCurrency: 'HUF' });
    expect(Object.keys(money).sort()).toEqual(['moneyAmount', 'moneyCurrency']);
    expect(() => validateTypedFactValue({ valueType: 'MONEY', allowedScopeTypes: ['COMPANY'] }, { moneyAmount: '12.50' })).toThrow('ISO 4217');
    expect(() => validateTypedFactValue({ valueType: 'MONEY', allowedScopeTypes: ['COMPANY'] }, { moneyCurrency: 'HUF' })).toThrow('Exactly one typed value');
    expect(() => validateTypedFactValue({ valueType: 'MONEY', allowedScopeTypes: ['COMPANY'] }, { moneyAmount: '12.50', moneyCurrency: 'huf' })).toThrow('ISO 4217');
    expect(() => validateTypedFactValue({ valueType: 'MONEY', allowedScopeTypes: ['COMPANY'] }, { moneyAmount: '12.50', moneyCurrency: 'HUF', numberValue: 1 })).toThrow('Exactly one typed value');

    expect(validateTypedFactValue({ valueType: 'ENUM', allowedScopeTypes: ['COMPANY'], allowedEnumValues: ['A'] }, { enumValue: 'A' }).enumValue).toBe('A');
    expect(validateTypedFactValue({ valueType: 'DATE', allowedScopeTypes: ['COMPANY'] }, { dateValue: '2026-01-01' }).dateValue).toBe('2026-01-01');
    expect(validateTypedFactValue({ valueType: 'DATETIME', allowedScopeTypes: ['COMPANY'] }, { datetimeValue: '2026-01-01T00:00:00Z' }).datetimeValue).toBe('2026-01-01T00:00:00Z');
    expect(validateTypedFactValue({ valueType: 'JURISDICTION', allowedScopeTypes: ['COMPANY'] }, { enumValue: 'HU' }).enumValue).toBe('HU');
    expect(validateTypedFactValue({ valueType: 'PERIOD', allowedScopeTypes: ['COMPANY'] }, { jsonValue: { start: '2026-01-01', end: '2026-03-31' } }).jsonValue).toEqual({ start: '2026-01-01', end: '2026-03-31' });
  });

  it('enforces same-client FactSubject links for contracts and people', async () => {
    await expect(assertFactSubjectLinkedEntityScope(db, { clientId: clientA, scopeType: 'CONTRACT', contractRecordId: contractA })).resolves.toBeUndefined();
    await expect(assertFactSubjectLinkedEntityScope(db, { clientId: clientA, scopeType: 'CONTRACT', contractRecordId: contractB })).rejects.toThrow('linked entity is invalid');
    await expect(assertFactSubjectLinkedEntityScope(db, { clientId: clientA, scopeType: 'EMPLOYEE', organizationPersonId: personA })).resolves.toBeUndefined();
    await expect(assertFactSubjectLinkedEntityScope(db, { clientId: clientA, scopeType: 'EMPLOYEE', organizationPersonId: personB })).rejects.toThrow('linked entity is invalid');
  });

  it('enforces money and temporal database CHECK constraints', async () => {
    const validMoney = validateTypedFactValue({ valueType: 'MONEY', allowedScopeTypes: ['COMPANY'] }, { moneyAmount: '12.50', moneyCurrency: 'HUF' });
    await expect(db.clientFact.create({ data: { clientId: clientA, type: 'PHASE6_MONEY_VALID', value: '12.50 HUF', validFrom: new Date(), factDefinitionId: definitionMoney, scopeType: 'COMPANY', ...validMoney } as never })).resolves.toBeDefined();
    await expect(db.clientFact.create({ data: { clientId: clientA, type: 'PHASE6_MONEY_AMOUNT_ONLY', value: '12.50', validFrom: new Date(), factDefinitionId: definitionMoney, scopeType: 'COMPANY', moneyAmount: '12.50' } as never })).rejects.toThrow();
    await expect(db.clientFact.create({ data: { clientId: clientA, type: 'PHASE6_MONEY_CURRENCY_ONLY', value: 'HUF', validFrom: new Date(), factDefinitionId: definitionMoney, scopeType: 'COMPANY', moneyCurrency: 'HUF' } as never })).rejects.toThrow();
    await expect(db.clientFact.create({ data: { clientId: clientA, type: 'PHASE6_MONEY_LOWERCASE', value: '12.50 huf', validFrom: new Date(), factDefinitionId: definitionMoney, scopeType: 'COMPANY', moneyAmount: '12.50', moneyCurrency: 'huf' } as never })).rejects.toThrow();
    await expect(db.clientFact.create({ data: { clientId: clientA, type: 'PHASE6_PERIOD_INVALID', value: 'invalid', validFrom: new Date(), factDefinitionId: definitionNumber, scopeType: 'COMPANY', referencePeriodStart: new Date('2026-03-31T00:00:00Z'), referencePeriodEnd: new Date('2026-01-01T00:00:00Z') } as never })).rejects.toThrow();
  });

  it('preserves legal source identity, multiple versions and multiple captures', async () => {
    await db.legalSourceVersion.createMany({ data: [
      { id: versionA, legalSourceId: sourceId, legalVersionKey: '2026-01', effectiveFrom: new Date('2026-01-01T00:00:00Z'), status: 'ACTIVE', reviewStatus: 'APPROVED' },
      { id: versionB, legalSourceId: sourceId, legalVersionKey: '2026-07', effectiveFrom: new Date('2026-07-01T00:00:00Z'), status: 'CANDIDATE', reviewStatus: 'VERSION_AMBIGUOUS' },
      { id: versionB1, legalSourceId: sourceBId, legalVersionKey: '2026-01', effectiveFrom: new Date('2026-01-01T00:00:00Z'), status: 'ACTIVE', reviewStatus: 'APPROVED' },
    ] });
    await db.legalSourceCapture.createMany({ data: [
      { id: captureA, legalSourceVersionId: versionA, sourceSha256: 'a'.repeat(64), sourceUri: 'https://synthetic.invalid/a.txt', provenance: { format: 'TXT' }, completeness: 'COMPLETE', captureStatus: 'REVIEWED' },
      { id: captureB, legalSourceVersionId: versionA, sourceSha256: 'b'.repeat(64), sourceUri: 'https://synthetic.invalid/a.pdf', provenance: { format: 'PDF' }, completeness: 'PARTIAL', ambiguityStatus: 'POSSIBLE_DUPLICATE' },
      { id: captureC, legalSourceVersionId: versionA, sourceSha256: '0123456789abcdef'.repeat(4), sourceUri: 'https://synthetic.invalid/a.bin', provenance: { format: 'BIN' }, completeness: 'COMPLETE', captureStatus: 'CAPTURED' },
    ] });
    await expect(db.legalSourceVersion.create({ data: { legalSourceId: sourceId, legalVersionKey: '2026-01', status: 'CANDIDATE', reviewStatus: 'UNREVIEWED' } })).rejects.toMatchObject({ code: 'P2002' });
    await expect(db.legalSourceCapture.create({ data: { legalSourceVersionId: versionA, sourceSha256: 'a'.repeat(64) } })).rejects.toMatchObject({ code: 'P2002' });
    const captures = await db.legalSourceCapture.findMany({ where: { legalSourceVersionId: versionA }, orderBy: { capturedAt: 'asc' } });
    expect(captures).toHaveLength(3);
    expect(captures.map((capture) => capture.sourceSha256)).toEqual(expect.arrayContaining(['a'.repeat(64), 'b'.repeat(64), '0123456789abcdef'.repeat(4)]));

    for (const sourceSha256 of ['a'.repeat(63), 'a'.repeat(65), 'A'.repeat(64), 'g'.repeat(64), 'not-a-digest']) {
      await expect(db.legalSourceCapture.create({ data: { legalSourceVersionId: versionA, sourceSha256 } })).rejects.toThrow();
    }

    await expect(db.legalSourceVersion.update({ where: { id: versionA }, data: { supersededById: versionB } })).resolves.toMatchObject({ supersededById: versionB });
    await expect(db.legalSourceVersion.update({ where: { id: versionA }, data: { supersededById: versionA } })).rejects.toThrow();
    await expect(db.legalSourceVersion.update({ where: { id: versionA }, data: { supersededById: versionB1 } })).rejects.toThrow();

    await expect(db.legalSourceVersion.delete({ where: { id: versionB } })).rejects.toThrow();

    await db.legalSource.delete({ where: { id: sourceId } });
    await expect(db.legalSourceVersion.findMany({ where: { id: { in: [versionA, versionB] } } })).resolves.toHaveLength(0);
    await expect(db.legalSourceCapture.findMany({ where: { legalSourceVersionId: { in: [versionA, versionB] } } })).resolves.toHaveLength(0);
  });
});
