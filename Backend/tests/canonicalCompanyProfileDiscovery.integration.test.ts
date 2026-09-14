import crypto from 'node:crypto';
import { PrismaClient } from '@prisma/client';
import { answerCompanyProfileQuestion, answerCompanyProfileScreen, getCompanyProfileDiscovery, searchCompanyProfileTeaor25Options } from '../src/modules/client-workspace/companyProfileAnswerService';
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
  let ownsEmployeeCountDefinition = false;

  const discovery = () => getCompanyProfileDiscovery(representativeId, workspaceId, db, { includeCanonicalBaseline: true });

  beforeAll(async () => {
    db = new PrismaClient({ datasources: { db: { url: databaseUrl } } });
    // employee_count is owned outside the provisioning migration (runtime seed);
    // ensure it exists without stealing ownership.
    const existingEmployeeCount = await db.factDefinition.findUnique({ where: { key: 'employee_count' } });
    if (!existingEmployeeCount) {
      await db.factDefinition.create({ data: { key: 'employee_count', domainCode: 'CLIENT_COMPANY_PROFILE', valueType: 'NUMBER', allowedScopeTypes: ['COMPANY'], determinationMethod: 'USER_PROVIDED', overlapPolicy: 'DISALLOW', temporalPolicy: 'OBSERVATION', questionKey: 'employee_count' } });
      ownsEmployeeCountDefinition = true;
    }
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
    if (ownsEmployeeCountDefinition) await db.factDefinition.deleteMany({ where: { key: 'employee_count' } });
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

  it('GROUPED_CLIENT_SCREENS: discovery returns grouped client screens, not just atoms', async () => {
    const result = await discovery();
    const screenKeys = (result.screens as Array<{ screenKey: string }>).map((screen) => screen.screenKey);
    expect(screenKeys).toContain('SCREEN-INTERNATIONAL-SALES');
    expect(screenKeys).toContain('SCREEN-DOCUMENTS-INTRO');
    const international = (result.screens as Array<{ screenKey: string; factBindings: string[] }>).find((screen) => screen.screenKey === 'SCREEN-INTERNATIONAL-SALES');
    expect(international?.factBindings).toEqual(['cross_border_eu_sales', 'export_outside_eu', 'import_into_eu']);
  });

  it('TEAOR_NO_CATALOG_REJECTS_WRITE: structured activity fails closed without a catalogue', async () => {
    resetTeaor25Catalog();
    await expect(answerCompanyProfileQuestion(representativeId, workspaceId, 'primary_teaor25_code', { status: 'ANSWERED', stringValue: '62.01' }, db)).rejects.toMatchObject({ code: 'TEAOR25_CATALOG_NOT_INSTALLED' });
    await expect(answerCompanyProfileQuestion(representativeId, workspaceId, 'additional_teaor25_codes', { status: 'ANSWERED', jsonValue: ['62.01'] }, db)).rejects.toMatchObject({ code: 'TEAOR25_CATALOG_NOT_INSTALLED' });
    const options = await searchCompanyProfileTeaor25Options(representativeId, workspaceId, '62', db);
    expect(options).toEqual({ installed: false, options: [] });
    installTeaor25Catalog([
      { code: '62.01', labelHu: 'Számítógépes programozás' },
      { code: '62.02', labelHu: 'Információs technológiai szaktanácsadás' },
    ], 'integration-test');
  });

  it('TEAOR_AUTOCOMPLETE: returns code with the official Hungarian label', async () => {
    const options = await searchCompanyProfileTeaor25Options(representativeId, workspaceId, 'szamitogepes', db);
    expect(options.installed).toBe(true);
    expect(options.options[0]).toEqual({ code: '62.01', labelHu: 'Számítógépes programozás' });
  });

  it('LEGACY_MAIN_ACTIVITY_PRESERVED: structured TEÁOR never rewrites the legacy free-text fact', async () => {
    const legacyDefinition = await db.factDefinition.findUniqueOrThrow({ where: { key: 'company_main_activity' } });
    expect(legacyDefinition.valueType).toBe('STRING');
    expect(legacyDefinition.questionKey).toBe('company_main_activity');
    const before = await db.clientFact.count({ where: { clientId, factDefinition: { key: 'company_main_activity' } } });
    await answerCompanyProfileQuestion(representativeId, workspaceId, 'primary_teaor25_code', { status: 'ANSWERED', stringValue: '62.02' }, db);
    expect(await db.clientFact.count({ where: { clientId, factDefinition: { key: 'company_main_activity' } } })).toBe(before);
  });

  it('MULTI_FACT_SCREEN_ATOMIC_SAVE + REFRESH_PRESERVES_PROGRESS: save all facts at once, or none', async () => {
    await expect(answerCompanyProfileScreen(representativeId, workspaceId, 'SCREEN-INTERNATIONAL-SALES', { facts: {
      cross_border_eu_sales: { status: 'ANSWERED', booleanValue: true },
      import_into_eu: { status: 'ANSWERED' },
    } }, db)).rejects.toMatchObject({ code: 'CLIENT_PROFILE_ANSWER_INVALID' });
    expect(await db.clientFact.count({ where: { clientId, factDefinition: { key: 'cross_border_eu_sales' } } })).toBe(0);

    await expect(answerCompanyProfileScreen(representativeId, workspaceId, 'SCREEN-INTERNATIONAL-SALES', { facts: {
      cross_border_eu_sales: { status: 'ANSWERED', booleanValue: true },
      export_outside_eu: { status: 'ANSWERED', booleanValue: false },
      import_into_eu: { status: 'ANSWERED', booleanValue: true },
    } }, db)).resolves.toMatchObject({ screenKey: 'SCREEN-INTERNATIONAL-SALES' });

    const refreshed = await discovery();
    expect(refreshed.questions).toEqual(expect.arrayContaining([
      expect.objectContaining({ questionKey: 'cross_border_eu_sales', status: 'ANSWERED', value: true }),
      expect.objectContaining({ questionKey: 'import_into_eu', status: 'ANSWERED', value: true }),
    ]));
    // Progress survives refresh and the import-dependent screen becomes visible.
    expect((refreshed.screens as Array<{ screenKey: string }>).map((screen) => screen.screenKey)).toContain('SCREEN-ENVIRONMENT-IMPORT');
  });

  it('rejects a grouped save that references a fact outside the screen', async () => {
    await expect(answerCompanyProfileScreen(representativeId, workspaceId, 'SCREEN-INTERNATIONAL-SALES', { facts: {
      ai_use: { status: 'ANSWERED', booleanValue: true },
    } }, db)).rejects.toMatchObject({ code: 'CLIENT_PROFILE_ANSWER_INVALID' });
  });
});
