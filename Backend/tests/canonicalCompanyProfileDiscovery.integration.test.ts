import crypto from 'node:crypto';
import { PrismaClient } from '@prisma/client';
import { answerCompanyProfileQuestion, getCompanyProfileDiscovery } from '../src/modules/client-workspace/companyProfileAnswerService';
import { installTeaor25Catalog, resetTeaor25Catalog } from '../src/modules/client-workspace/teaor25Catalog';

const databaseUrl = process.env.CLIENT_INTERACTION_TEST_DATABASE_URL || process.env.MIGRATION_REPLAY_DATABASE_URL;
const describeWithDatabase = databaseUrl ? describe : describe.skip;

describeWithDatabase('canonical company profile discovery (PostgreSQL)', () => {
  let db: PrismaClient;
  const suffix = crypto.randomUUID();
  const adminId = crypto.randomUUID();
  const clientId = crypto.randomUUID();
  const workspaceId = crypto.randomUUID();
  const representativeId = crypto.randomUUID();

  const discovery = () => getCompanyProfileDiscovery(representativeId, workspaceId, db, { includeCanonicalBaseline: true });

  beforeAll(async () => {
    db = new PrismaClient({ datasources: { db: { url: databaseUrl } } });
    await db.user.create({ data: { id: adminId, email: `canonical-profile-${suffix}@fixture.invalid`, name: 'Canonical profile actor', role: 'ADMIN', status: 'ACTIVE', isActive: true, skills: [] } as never });
    await db.client.create({ data: { id: clientId, name: 'Canonical profile fixture' } });
    await db.clientOperatingProfile.create({ data: { clientId, complianceEnrollmentStatus: 'ENROLLED' } });
    await db.clientPortalWorkspace.create({ data: { id: workspaceId, clientId, name: 'Canonical profile workspace', mode: 'ORGANIZATION', publicReference: `canonical-${suffix}`, createdById: adminId } });
    await db.clientPortalIdentity.create({ data: { id: representativeId, provider: 'ENTRA_EXTERNAL_ID', issuer: `canonical-${suffix}`, subject: 'representative', normalizedEmail: `canonical-${suffix}@fixture.invalid`, emailVerifiedAt: new Date(), displayName: 'Representative', accountType: 'ORGANIZATION_MEMBER', status: 'ACTIVE' } });
    await db.clientPortalWorkspaceMembership.create({ data: { id: crypto.randomUUID(), clientPortalIdentityId: representativeId, workspaceId, status: 'ACTIVE', role: 'REPRESENTATIVE', approvedAt: new Date(), approvedById: adminId } });
    installTeaor25Catalog([
      { code: '62.01', labelHu: 'Számítógépes programozás' },
      { code: '62.02', labelHu: 'Információs technológiai szaktanácsadás' },
    ], 'integration-test');
  });

  afterAll(async () => {
    resetTeaor25Catalog();
    await db.clientFactAnswerState.deleteMany({ where: { clientId } });
    await db.clientFact.deleteMany({ where: { clientId } });
    await db.clientPortalWorkspaceMembership.deleteMany({ where: { workspaceId } });
    await db.clientPortalIdentity.deleteMany({ where: { id: representativeId } });
    await db.clientPortalWorkspace.deleteMany({ where: { id: workspaceId } });
    await db.clientOperatingProfile.deleteMany({ where: { clientId } });
    await db.client.delete({ where: { id: clientId } });
    await db.user.delete({ where: { id: adminId } });
    await db.$disconnect();
  });

  it('BASELINE_QUESTION_RENDERING: returns the canonical baseline and hides unanswered adaptive branches', async () => {
    const result = await discovery();
    const keys = result.questions.map((question) => question.questionKey);
    expect(keys).toEqual(expect.arrayContaining([
      'employee_count',
      'primary_teaor25_code',
      'additional_teaor25_codes',
      'personal_data_processing',
      'ai_use',
      'customer_types',
      'product_market_role',
    ]));
    // Adaptive follow-ups stay closed while their gates are unanswered.
    expect(keys).not.toContain('special_category_data');
    expect(keys).not.toContain('ai_role');
    expect(keys).not.toContain('machinery_activity');
    const teaor = result.questions.find((question) => question.questionKey === 'primary_teaor25_code');
    expect(teaor).toMatchObject({ valueType: 'STRING', codeCatalog: 'TEAOR25' });
    expect(typeof teaor?.why).toBe('string');
    expect(result.questions.some((question) => question.why === undefined)).toBe(false);
  });

  it('TEAOR_PRIMARY + TEAOR_ADDITIONAL: stores structured codes and validates unknown codes', async () => {
    await expect(answerCompanyProfileQuestion(representativeId, workspaceId, 'primary_teaor25_code', { status: 'ANSWERED', stringValue: '99.99' }, db)).rejects.toMatchObject({ code: 'CLIENT_PROFILE_TEAOR25_UNKNOWN' });
    await expect(answerCompanyProfileQuestion(representativeId, workspaceId, 'primary_teaor25_code', { status: 'ANSWERED', stringValue: '62.01' }, db)).resolves.toMatchObject({ status: 'ANSWERED', answered: true });
    await expect(answerCompanyProfileQuestion(representativeId, workspaceId, 'additional_teaor25_codes', { status: 'ANSWERED', jsonValue: ['62.02', '62.02'] }, db)).resolves.toMatchObject({ status: 'ANSWERED', answered: true });
    const primaryFact = await db.clientFact.findFirstOrThrow({ where: { clientId, factDefinition: { key: 'primary_teaor25_code' }, supersededAt: null } });
    expect(primaryFact.stringValue).toBe('62.01');
    const additionalFact = await db.clientFact.findFirstOrThrow({ where: { clientId, factDefinition: { key: 'additional_teaor25_codes' }, supersededAt: null } });
    expect(additionalFact.jsonValue).toEqual(['62.02']);
    const result = await discovery();
    expect(result.questions).toEqual(expect.arrayContaining([
      expect.objectContaining({ questionKey: 'primary_teaor25_code', status: 'ANSWERED', value: '62.01' }),
      expect.objectContaining({ questionKey: 'additional_teaor25_codes', status: 'ANSWERED', value: ['62.02'] }),
    ]));
  });

  it('ADAPTIVE_SHOW_RELEVANT / ADAPTIVE_HIDE_IRRELEVANT: canonical fact state opens and closes branches', async () => {
    await answerCompanyProfileQuestion(representativeId, workspaceId, 'ai_use', { status: 'ANSWERED', booleanValue: false }, db);
    let keys = (await discovery()).questions.map((question) => question.questionKey);
    expect(keys).not.toContain('ai_role');
    await answerCompanyProfileQuestion(representativeId, workspaceId, 'ai_use', { status: 'ANSWERED', booleanValue: true }, db);
    keys = (await discovery()).questions.map((question) => question.questionKey);
    expect(keys).toEqual(expect.arrayContaining(['ai_role', 'ai_high_risk_context', 'ai_customer_facing']));

    keys = (await discovery()).questions.map((question) => question.questionKey);
    expect(keys).not.toContain('special_category_data');
    await answerCompanyProfileQuestion(representativeId, workspaceId, 'personal_data_processing', { status: 'ANSWERED', booleanValue: true }, db);
    keys = (await discovery()).questions.map((question) => question.questionKey);
    expect(keys).toEqual(expect.arrayContaining(['special_category_data', 'cctv_monitoring', 'third_country_data_transfer']));

    await answerCompanyProfileQuestion(representativeId, workspaceId, 'product_market_role', { status: 'ANSWERED', jsonValue: ['Nincs'] }, db);
    keys = (await discovery()).questions.map((question) => question.questionKey);
    expect(keys).not.toContain('machinery_activity');
    await answerCompanyProfileQuestion(representativeId, workspaceId, 'product_market_role', { status: 'ANSWERED', jsonValue: ['Gyártó'] }, db);
    keys = (await discovery()).questions.map((question) => question.questionKey);
    expect(keys).toEqual(expect.arrayContaining(['machinery_activity', 'consumer_products']));
  });

  it('CANONICAL_FACT_PERSISTENCE: the same employee_count fact is reused, not duplicated per module', async () => {
    await answerCompanyProfileQuestion(representativeId, workspaceId, 'employee_count', { status: 'ANSWERED', numberValue: 73 }, db);
    const definitions = await db.factDefinition.findMany({ where: { key: { contains: 'employee_count' } }, select: { key: true } });
    expect(definitions.map((definition) => definition.key)).toEqual(['employee_count']);
    await expect(answerCompanyProfileQuestion(representativeId, workspaceId, 'sites_count', { status: 'ANSWERED', numberValue: 2.5 }, db)).rejects.toMatchObject({ code: 'CLIENT_PROFILE_ANSWER_INVALID' });
    await expect(answerCompanyProfileQuestion(representativeId, workspaceId, 'sites_count', { status: 'ANSWERED', numberValue: 3 }, db)).resolves.toMatchObject({ status: 'ANSWERED' });
  });

  it('CLIENT_SAFE_NO_INTERNAL_IDS: discovery never leaks internal identifiers or raw rule data', async () => {
    const serialized = JSON.stringify(await discovery());
    expect(serialized).not.toContain('factDefinitionId');
    expect(serialized).not.toMatch(/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i);
    expect(serialized).not.toContain('snapshotDigest');
    expect(serialized).not.toContain('ruleVersionId');
  });
});
