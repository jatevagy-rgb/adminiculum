import { randomUUID } from 'crypto';
import { PrismaClient } from '@prisma/client';

// Never fall back to a production DATABASE_URL. Run after canonical migration replay.
const databaseUrl = process.env.BILLING_PREP_TEST_DATABASE_URL || process.env.MIGRATION_REPLAY_DATABASE_URL;
const describeDb = databaseUrl ? describe : describe.skip;

import {
  CALCULATION_POLICY_VERSION,
  createPreparation,
  getPreparation,
  listPreparations,
  patchItem,
  refreshPreparation,
  resyncItem,
  setPreparationStatus,
} from '../src/modules/billing-preparations/service';

describeDb('billing preparation review against canonical PostgreSQL schema', () => {
  let db: PrismaClient;
  const prefix = `bp-${randomUUID()}`;
  const clientId = `${prefix}-client`;
  const otherClientId = `${prefix}-other`;
  const admin = { userId: `${prefix}-admin`, role: 'ADMIN' };
  const partner = { userId: `${prefix}-partner`, role: 'PARTNER' };
  const lawyer = { userId: `${prefix}-lawyer`, role: 'LAWYER' };
  const clientRole = { userId: `${prefix}-portal`, role: 'CLIENT' };
  const caseId = `${prefix}-case`;
  const taskId = `${prefix}-task`;
  const personId = `${prefix}-person`;
  const groupId = `${prefix}-group`;
  const otherGroupId = `${prefix}-group2`;
  const departmentId = `${prefix}-dept`;
  const matterId = `${prefix}-matter`;
  const matterOnlyId = `${prefix}-matter-only`;
  const ambiguousId = `${prefix}-matter-ambiguous`;

  const entry = (id: string, fields: Record<string, unknown>) => ({
    id: `${prefix}-${id}`,
    userId: lawyer.userId,
    minutes: 60,
    billable: true,
    workType: 'DRAFTING' as const,
    description: `Leírás ${id}`,
    workDate: new Date('2026-08-10T12:00:00Z'),
    ...fields,
  });

  beforeAll(async () => {
    const url = new URL(databaseUrl!);
    expect(['localhost', '127.0.0.1', '[::1]']).toContain(url.hostname);
    expect(url.pathname).toMatch(/^\/adminiculum_replay/);
    db = new PrismaClient({ datasources: { db: { url: databaseUrl } } });
    for (const actor of [admin, partner, lawyer, clientRole]) {
      await db.user.create({ data: { id: actor.userId, name: actor.role, email: `${actor.userId}@example.invalid`, role: actor.role as any, skills: [] } });
    }
    await db.client.createMany({ data: [{ id: clientId, name: 'Billing client' }, { id: otherClientId, name: 'Other client' }] });
    await db.clientOrganizationGroup.createMany({ data: [
      { id: groupId, clientId, name: 'HR', createdById: admin.userId },
      { id: otherGroupId, clientId, name: 'Pénzügy', createdById: admin.userId },
    ] });
    await db.organizationPerson.create({ data: { id: personId, clientId, organizationGroupId: groupId, name: 'Kérelmező Kata' } });
    await db.department.create({ data: { id: departmentId, clientId, name: 'Jogi' } });
    await db.matter.createMany({ data: [
      { id: matterId, title: 'Egy esetű matter', matterType: 'EMPLOYMENT', clientId },
      { id: matterOnlyId, title: 'Ügy nélküli matter', matterType: 'OTHER', clientId },
      { id: ambiguousId, title: 'Többügyes matter', matterType: 'OTHER', clientId },
      { id: `${prefix}-foreign-matter`, title: 'Más ügyfél mattere', matterType: 'OTHER', clientId: otherClientId },
    ] });
    await db.case.createMany({ data: [
      { id: caseId, caseNumber: `${prefix}-U1`, title: 'Ügy 1', caseType: 'OTHER', clientId, matterId, createdById: admin.userId },
      { id: `${prefix}-case-a`, caseNumber: `${prefix}-UA`, title: 'Ügy A', caseType: 'OTHER', clientId, matterId: ambiguousId, createdById: admin.userId },
      { id: `${prefix}-case-b`, caseNumber: `${prefix}-UB`, title: 'Ügy B', caseType: 'OTHER', clientId, matterId: ambiguousId, createdById: admin.userId },
      { id: `${prefix}-foreign-case`, caseNumber: `${prefix}-UX`, title: 'Más ügyfél ügye', caseType: 'OTHER', clientId: otherClientId, createdById: admin.userId },
    ] });
    await db.task.create({ data: { id: taskId, title: 'Feladat', taskType: 'OTHER', caseId, matterId, requestedByOrganizationPersonId: personId } });
    // Work-package provenance path: Task → CaseWorkPackageItem → CaseWorkPackage → Case.
    const workPackageId = `${prefix}-wp`;
    const workPackageItemId = `${prefix}-wpi`;
    await db.caseWorkPackage.create({ data: { id: workPackageId, caseId, createdById: admin.userId } });
    await db.caseWorkPackageItem.create({ data: { id: workPackageItemId, caseWorkPackageId: workPackageId, moduleType: 'TASK_GROUP', moduleKey: 'munka', label: 'Munkacsomag elem', createdById: admin.userId } });
    await db.task.create({ data: { id: `${prefix}-wp-task`, title: 'Csomagfeladat', taskType: 'OTHER', caseId, matterId, workPackageItemId } });
    await db.hourlyRateVersion.create({ data: { id: randomUUID(), clientId, caseId: null, effectiveFrom: new Date('2026-01-01T00:00:00Z'), currency: 'HUF', hourlyRate: '40000', mode: 'EXPLICIT_RATE', createdById: admin.userId } });
    await db.hourlyRateVersion.create({ data: { id: randomUUID(), clientId, caseId, effectiveFrom: new Date('2026-08-01T00:00:00Z'), currency: 'HUF', hourlyRate: '50000', mode: 'EXPLICIT_RATE', createdById: admin.userId } });

    await db.timeEntry.createMany({ data: [
      entry('exact', { caseId, matterId }),                                    // EXACT_CASE
      entry('task', { taskId, matterId }),                                     // TASK_DERIVED_CASE + requester
      entry('matteronly', { matterId: matterOnlyId }),                         // MATTER_ONLY
      entry('ambiguous', { matterId: ambiguousId }),                           // AMBIGUOUS
      entry('nonbillable', { caseId, matterId, billable: false }),             // non-billable
      entry('zero', { caseId, matterId, minutes: 0 }),                         // zero minute
      entry('norating', { caseId, matterId, workDate: new Date('2025-08-10T12:00:00Z') }), // outside period
      entry('foreign', { caseId: `${prefix}-foreign-case` }),                  // cross-client
      entry('dept', { caseId, matterId, departmentId }),                       // department
      entry('wp', { taskId: `${prefix}-wp-task`, matterId }),                  // Task→WorkPackageItem provenance
    ] });
  });

  afterAll(async () => { await db?.$disconnect(); });

  it('creates one preparation for client+period with per-entry captured state and no cross-client leakage', async () => {
    const result = await createPreparation(admin, { clientId, periodStart: '2026-08-01', periodEnd: '2026-08-31' }, db);
    expect(result.created).toBe(true);
    const workspace = await getPreparation(admin, result.preparation.id, db);
    expect(workspace.preparation.calculationPolicyVersion).toBe(CALCULATION_POLICY_VERSION);
    const ids = workspace.items.map((item) => item.sourceTimeEntryId);
    expect(new Set(ids).size).toBe(ids.length);
    expect(ids).not.toContain(`${prefix}-norating`);   // outside period
    expect(ids).not.toContain(`${prefix}-foreign`);   // cross-client never leaks
    expect(ids).toEqual(expect.arrayContaining([`${prefix}-exact`, `${prefix}-task`, `${prefix}-matteronly`, `${prefix}-ambiguous`, `${prefix}-nonbillable`, `${prefix}-dept`]));

    const taskRow = workspace.items.find((item) => item.sourceTimeEntryId === `${prefix}-task`)!;
    expect(taskRow.attributionKind).toBe('TASK_DERIVED_CASE');
    expect(taskRow.reviewStatus).toBe('OK');
    expect(taskRow.source.requester?.name).toBe('Kérelmező Kata');
    expect(taskRow.source.organizationGroup?.name).toBe('HR');
    expect(taskRow.rate.scope).toBe('CASE');
    expect(taskRow.billing.effectiveHourlyRate).toBe('50000.0000');
    expect(taskRow.billing.netAmount).toBe('50000.00');
    expect(taskRow.billing.included).toBe(true);

    const deptRow = workspace.items.find((item) => item.sourceTimeEntryId === `${prefix}-dept`)!;
    expect(deptRow.source.department?.name).toBe('Jogi'); // internal, separate from org group

    const statusById = new Map(workspace.items.map((item) => [item.sourceTimeEntryId, item.reviewStatus]));
    expect(statusById.get(`${prefix}-exact`)).toBe('OK');
    expect(statusById.get(`${prefix}-matteronly`)).toBe('REVIEW_REQUIRED');
    expect(statusById.get(`${prefix}-ambiguous`)).toBe('REVIEW_REQUIRED');
    expect(statusById.get(`${prefix}-nonbillable`)).toBe('NON_BILLABLE');
    expect(statusById.get(`${prefix}-zero`)).toBe('ZERO_MINUTES');
  });

  it('Task → CaseWorkPackageItem → CaseWorkPackage provenance resolves to the canonical case', async () => {
    const { preparation } = await createPreparation(admin, { clientId, periodStart: '2026-08-01', periodEnd: '2026-08-31' }, db);
    const workspace = await getPreparation(admin, preparation.id, db);
    const row = workspace.items.find((item) => item.sourceTimeEntryId === `${prefix}-wp`)!;
    // Billing must not diverge from the canonical attribution engine: the
    // work-package task path resolves the same case, passes the client guard,
    // receives the case-scoped rate, and is never matter-only.
    expect(row.attributionKind).toBe('TASK_DERIVED_CASE');
    expect(row.reviewStatus).toBe('OK');
    expect(row.source.case?.id).toBe(caseId);
    expect(row.source.case?.caseNumber).toBe(`${prefix}-U1`);
    expect(row.rate.scope).toBe('CASE');
    expect(row.billing.effectiveHourlyRate).toBe('50000.0000');
    expect(row.billing.netAmount).toBe('50000.00');
    expect(row.billing.included).toBe(true);
  });

  it('reopening the same client+period returns the persistent preparation (no regeneration)', async () => {
    const again = await createPreparation(admin, { clientId, periodStart: '2026-08-01', periodEnd: '2026-08-31' }, db);
    expect(again.created).toBe(false);
    const list = await listPreparations(admin, clientId, db);
    expect(list).toHaveLength(1);
  });

  it('persists include/exclude, invoice text, downward write-down with reason, and rejects upward', async () => {
    const { preparation } = await createPreparation(admin, { clientId, periodStart: '2026-08-01', periodEnd: '2026-08-31' }, db);
    const workspace = await getPreparation(admin, preparation.id, db);
    const row = workspace.items.find((item) => item.sourceTimeEntryId === `${prefix}-exact`)!;

    await expect(patchItem(admin, preparation.id, row.id, { billingMinutes: 90 }, db)).rejects.toMatchObject({ code: 'BILLING_MINUTES_UPWARD_FORBIDDEN' });
    await expect(patchItem(admin, preparation.id, row.id, { billingMinutes: 30 }, db)).rejects.toMatchObject({ code: 'BILLING_MINUTES_REASON_REQUIRED' });
    const patched = await patchItem(admin, preparation.id, row.id, { billingMinutes: 30, adjustmentReason: 'Jóvoltból', invoiceDescription: 'Ügyfél felé megjelenő szöveg' }, db);
    expect(patched.billing.billingMinutes).toBe(30);
    expect(patched.billing.invoiceDescription).toBe('Ügyfél felé megjelenő szöveg');
    expect(patched.billing.netAmount).toBe('25000.00'); // 30 × 50000 / 60
    const excluded = await patchItem(admin, preparation.id, row.id, { included: false }, db);
    expect(excluded.billing.included).toBe(false);
    // The source TimeEntry is untouched by billing adjustments.
    const source = await db.timeEntry.findUnique({ where: { id: `${prefix}-exact` } });
    expect(source?.minutes).toBe(60);
    expect(source?.description).toBe('Leírás exact');
  });

  it('row rate override persists with reason+author and never touches HourlyRateVersion', async () => {
    const { preparation } = await createPreparation(admin, { clientId, periodStart: '2026-08-01', periodEnd: '2026-08-31' }, db);
    const workspace = await getPreparation(admin, preparation.id, db);
    const row = workspace.items.find((item) => item.sourceTimeEntryId === `${prefix}-task`)!;
    await expect(patchItem(admin, preparation.id, row.id, { rateOverride: '61000' }, db)).rejects.toMatchObject({ code: 'RATE_OVERRIDE_REASON_REQUIRED' });
    const patched = await patchItem(admin, preparation.id, row.id, { rateOverride: '61000', rateOverrideReason: 'Egyezmény' }, db);
    expect(patched.billing.rateOverride).toBe('61000.0000');
    expect(patched.billing.rateOverrideById).toBe(admin.userId);
    expect(patched.billing.netAmount).toBe('61000.00');
    const rates = await db.hourlyRateVersion.count({ where: { clientId } });
    expect(rates).toBe(2); // unchanged — overrides never write back to rate history
  });

  it('detects source changes and relational requester/group changes as STALE, then resyncs', async () => {
    const { preparation } = await createPreparation(admin, { clientId, periodStart: '2026-08-01', periodEnd: '2026-08-31' }, db);
    // factual change on the TimeEntry itself
    await db.timeEntry.update({ where: { id: `${prefix}-exact` }, data: { minutes: 120 } });
    // relational change only on the requester's organization group
    await db.organizationPerson.update({ where: { id: personId }, data: { organizationGroupId: otherGroupId } });

    const staleView = await getPreparation(admin, preparation.id, db);
    const staleRow = staleView.items.find((item) => item.sourceTimeEntryId === `${prefix}-exact`)!;
    const taskRow = staleView.items.find((item) => item.sourceTimeEntryId === `${prefix}-task`)!;
    expect(staleRow.reviewStatus).toBe('STALE');
    expect(staleRow.billing.billingMinutes).toBe(30); // adjustments preserved, not silently overwritten
    expect(taskRow.reviewStatus).toBe('STALE');

    const resynced = await resyncItem(admin, preparation.id, taskRow.id, db);
    expect(resynced.resynced).toBe(true);
    expect(resynced.item.reviewStatus).toBe('OK');
    expect(resynced.item.source.organizationGroup?.name).toBe('Pénzügy');

    await expect(patchItem(admin, preparation.id, staleRow.id, { included: true }, db)).rejects.toMatchObject({ code: 'BILLING_ITEM_NOT_INCLUDABLE' });

    const refreshed = await refreshPreparation(admin, preparation.id, db);
    expect(refreshed.resynced).toBe(1);
    const after = await getPreparation(admin, preparation.id, db);
    const fixed = after.items.find((item) => item.sourceTimeEntryId === `${prefix}-exact`)!;
    expect(fixed.source.minutes).toBe(120);
    // stale item resync clamps write-downs to the new recorded amount
    expect(fixed.billing.billingMinutes).toBe(30);
  });

  it('MATTER_ONLY rows become includable only after explicit review acknowledgment', async () => {
    const { preparation } = await createPreparation(admin, { clientId, periodStart: '2026-08-01', periodEnd: '2026-08-31' }, db);
    const workspace = await getPreparation(admin, preparation.id, db);
    const row = workspace.items.find((item) => item.sourceTimeEntryId === `${prefix}-matteronly`)!;
    expect(row.reviewStatus).toBe('REVIEW_REQUIRED');
    expect(row.billing.included).toBe(false);
    await expect(patchItem(admin, preparation.id, row.id, { included: true }, db)).rejects.toMatchObject({ code: 'BILLING_ITEM_NOT_INCLUDABLE' });
    const reviewed = await patchItem(admin, preparation.id, row.id, { markReviewed: true, included: true }, db);
    expect(reviewed.billing.included).toBe(true);
    expect(reviewed.billing.netAmount).toBe('40000.00'); // client default rate applies
  });

  it('denies non-managers including CLIENT portal identities', async () => {
    const { preparation } = await createPreparation(admin, { clientId, periodStart: '2026-08-01', periodEnd: '2026-08-31' }, db);
    await expect(getPreparation(lawyer, preparation.id, db)).rejects.toMatchObject({ status: 403 });
    await expect(getPreparation(clientRole, preparation.id, db)).rejects.toMatchObject({ status: 403 });
    await expect(createPreparation(partner, { clientId, periodStart: '2026-09-01', periodEnd: '2026-09-30' }, db)).resolves.toMatchObject({ created: true });
    await expect(createPreparation(lawyer, { clientId, periodStart: '2026-10-01', periodEnd: '2026-10-31' }, db)).rejects.toMatchObject({ status: 403 });
  });

  it('DB write-down CHECK bypasses the service: reason required when billingMinutes < sourceMinutes', async () => {
    const { preparation } = await createPreparation(admin, { clientId, periodStart: '2026-08-01', periodEnd: '2026-08-31' }, db);
    const item = await db.billingPreparationItem.findFirstOrThrow({ where: { preparationId: preparation.id, sourceTimeEntryId: `${prefix}-exact` } });
    // Raw SQL, no service layer: a write-down without reason must fail.
    await expect(db.$executeRaw`
      UPDATE "billing_preparation_items"
      SET "billingMinutes" = "sourceMinutes" - 1, "adjustmentReason" = NULL, "updatedAt" = now()
      WHERE "id" = ${item.id}`).rejects.toThrow();
    await expect(db.$executeRaw`
      UPDATE "billing_preparation_items"
      SET "billingMinutes" = "sourceMinutes" - 1, "adjustmentReason" = '   ', "updatedAt" = now()
      WHERE "id" = ${item.id}`).rejects.toThrow();
    // With a non-blank reason the same write-down is accepted.
    await expect(db.$executeRaw`
      UPDATE "billing_preparation_items"
      SET "billingMinutes" = "sourceMinutes" - 1, "adjustmentReason" = 'Engedmény', "updatedAt" = now()
      WHERE "id" = ${item.id}`).resolves.toBe(1);
    // Restoring the full amount may retain the recorded reason.
    await expect(db.$executeRaw`
      UPDATE "billing_preparation_items"
      SET "billingMinutes" = "sourceMinutes", "updatedAt" = now()
      WHERE "id" = ${item.id}`).resolves.toBe(1);
  });

  it('close re-derives live status: STALE included rows block, excluded stale rows do not', async () => {
    // fresh client so this close matrix is independent of earlier mutations
    const cid = `${prefix}-close-client`;
    const mid = `${prefix}-close-matter`;
    const kase = `${prefix}-close-case`;
    await db.client.create({ data: { id: cid, name: 'Close client' } });
    await db.matter.create({ data: { id: mid, title: 'Close matter', matterType: 'OTHER', clientId: cid } });
    await db.case.create({ data: { id: kase, caseNumber: `${prefix}-UC`, title: 'Close case', caseType: 'OTHER', clientId: cid, matterId: mid, createdById: admin.userId } });
    await db.hourlyRateVersion.create({ data: { id: randomUUID(), clientId: cid, caseId: null, effectiveFrom: new Date('2026-01-01T00:00:00Z'), currency: 'HUF', hourlyRate: '30000', mode: 'EXPLICIT_RATE', createdById: admin.userId } });
    await db.timeEntry.createMany({ data: [
      { id: `${prefix}-keep`, userId: lawyer.userId, minutes: 60, billable: true, workType: 'DRAFTING', description: 'marad', workDate: new Date('2026-08-10T12:00:00Z'), caseId: kase, matterId: mid },
      { id: `${prefix}-willstale`, userId: lawyer.userId, minutes: 30, billable: true, workType: 'REVIEW', description: 'megváltozik', workDate: new Date('2026-08-11T12:00:00Z'), caseId: kase, matterId: mid },
      { id: `${prefix}-excludedstale`, userId: lawyer.userId, minutes: 10, billable: false, workType: 'ADMIN', description: 'kizárt', workDate: new Date('2026-08-12T12:00:00Z'), caseId: kase, matterId: mid },
    ] });

    const { preparation } = await createPreparation(admin, { clientId: cid, periodStart: '2026-08-01', periodEnd: '2026-08-31' }, db);
    const workspace = await getPreparation(admin, preparation.id, db);
    const willStale = workspace.items.find((item) => item.sourceTimeEntryId === `${prefix}-willstale`)!;
    expect(willStale.billing.included).toBe(true); // included + OK at creation

    // 1) included OK rows → close succeeds
    await expect(setPreparationStatus(admin, preparation.id, 'CLOSED', db)).resolves.toMatchObject({ preparation: { status: 'CLOSED' } });
    await setPreparationStatus(admin, preparation.id, 'OPEN', db);

    // 2) an included row becomes STALE → close is rejected
    await db.timeEntry.update({ where: { id: `${prefix}-willstale` }, data: { minutes: 45 } });
    // and the excluded row also changes — exclusion must not block closing
    await db.timeEntry.update({ where: { id: `${prefix}-excludedstale` }, data: { minutes: 20 } });
    await expect(setPreparationStatus(admin, preparation.id, 'CLOSED', db)).rejects.toMatchObject({ status: 409, code: 'BILLING_PREP_CLOSE_BLOCKED' });

    // 3) explicit resync restores validity → close succeeds
    const resynced = await resyncItem(admin, preparation.id, willStale.id, db);
    expect(resynced.item.reviewStatus).toBe('OK');
    await expect(setPreparationStatus(admin, preparation.id, 'CLOSED', db)).resolves.toMatchObject({ preparation: { status: 'CLOSED' } });

    // 4) closed preparation rejects edits; reopen guarded by unique open-per-period
    await expect(patchItem(admin, preparation.id, willStale.id, { included: false }, db)).rejects.toMatchObject({ code: 'BILLING_PREP_CLOSED' });
    const reopened = await setPreparationStatus(admin, preparation.id, 'OPEN', db);
    expect(reopened.preparation.status).toBe('OPEN');
  });
});
