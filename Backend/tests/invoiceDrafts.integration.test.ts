import { randomUUID } from 'crypto';
import { PrismaClient } from '@prisma/client';

// Never fall back to a production DATABASE_URL. Run after canonical migration replay.
const databaseUrl = process.env.INVOICE_DRAFT_TEST_DATABASE_URL || process.env.MIGRATION_REPLAY_DATABASE_URL;
const describeDb = databaseUrl ? describe : describe.skip;

import {
  createPreparation,
  getPreparationPdf,
  patchItem,
  setPreparationStatus,
} from '../src/modules/billing-preparations/service';
import {
  ISSUER_PROFILE_KEY,
  createDraft,
  discardDraft,
  getDraft,
  getDraftPdf,
  patchDraft,
  patchDraftLine,
  putIssuerProfile,
} from '../src/modules/invoice-drafts/service';

const ISSUER_VALUE = {
  legalName: 'Bálintfy és Társai Ügyvédi Iroda',
  address: '1051 Budapest, Fő utca 1.',
  taxNumber: '87654321-1-41',
  defaultVatRate: '27',
  defaultPaymentMethod: 'átutalás',
  defaultPaymentTermDays: 8,
};

describeDb('T6A invoice draft against canonical PostgreSQL schema', () => {
  let db: PrismaClient;
  const prefix = `id-${randomUUID()}`;
  const admin = { userId: `${prefix}-admin`, role: 'ADMIN' };
  const partner = { userId: `${prefix}-partner`, role: 'PARTNER' };
  const lawyer = { userId: `${prefix}-lawyer`, role: 'LAWYER' };

  async function seedClient(suffix: string, opts: { workspaceMode?: 'ORGANIZATION' | 'INDIVIDUAL' | 'CASE_RELAY'; withIdentity?: boolean; minutes?: number } = {}) {
    const clientId = `${prefix}-${suffix}`;
    const matterId = `${clientId}-matter`;
    const caseId = `${clientId}-case`;
    const entryId = `${clientId}-entry`;
    await db.client.create({
      data: {
        id: clientId,
        name: `${suffix} Kft.`,
        ...(opts.withIdentity ? { address: '1052 Budapest, Példa utca 4.', taxNumber: '12345678-2-42', vatNumber: 'HU12345678' } : {}),
      },
    });
    if (opts.workspaceMode) {
      await db.clientPortalWorkspace.create({
        data: { id: `${clientId}-ws`, clientId, name: `${suffix} munkatér`, mode: opts.workspaceMode, publicReference: `${prefix}-${suffix}-ws`, createdById: admin.userId },
      });
    }
    await db.matter.create({ data: { id: matterId, title: 'Matter', matterType: 'OTHER', clientId } });
    await db.case.create({ data: { id: caseId, caseNumber: `${clientId}-U1`, title: 'Ügy', caseType: 'OTHER', clientId, matterId, createdById: admin.userId } });
    await db.hourlyRateVersion.create({ data: { id: randomUUID(), clientId, caseId: null, effectiveFrom: new Date('2026-01-01T00:00:00Z'), currency: 'HUF', hourlyRate: '40000', mode: 'EXPLICIT_RATE', createdById: admin.userId } });
    await db.timeEntry.create({
      data: { id: entryId, userId: lawyer.userId, minutes: opts.minutes ?? 60, billable: true, workType: 'DRAFTING', description: `Munka ${suffix}`, workDate: new Date('2026-09-05T12:00:00Z'), caseId, matterId },
    });
    return { clientId, entryId };
  }

  async function closedPreparation(clientId: string) {
    const { preparation } = await createPreparation(admin, { clientId, periodStart: '2026-09-01', periodEnd: '2026-09-30' }, db);
    await setPreparationStatus(admin, preparation.id, 'CLOSED', db);
    return preparation.id;
  }

  beforeAll(async () => {
    const url = new URL(databaseUrl!);
    expect(['localhost', '127.0.0.1', '[::1]']).toContain(url.hostname);
    expect(url.pathname).toMatch(/^\/adminiculum_replay/);
    db = new PrismaClient({ datasources: { db: { url: databaseUrl } } });
    for (const actor of [admin, partner, lawyer]) {
      await db.user.create({ data: { id: actor.userId, name: actor.role, email: `${actor.userId}@example.invalid`, role: actor.role as any, skills: [] } });
    }
    await db.systemSetting.upsert({
      where: { key: ISSUER_PROFILE_KEY },
      create: { key: ISSUER_PROFILE_KEY, value: ISSUER_VALUE },
      update: { value: ISSUER_VALUE },
    });
  });

  afterAll(async () => { await db?.$disconnect(); });

  it('blocks creation on OPEN prep and non-reviewers; creates frozen snapshots on CLOSED', async () => {
    const { clientId, entryId } = await seedClient('main', { workspaceMode: 'ORGANIZATION', withIdentity: true });
    const { preparation } = await createPreparation(admin, { clientId, periodStart: '2026-09-01', periodEnd: '2026-09-30' }, db);
    await expect(createDraft(admin, { billingPreparationId: preparation.id }, db))
      .rejects.toMatchObject({ status: 409, code: 'INVOICE_DRAFT_REQUIRES_CLOSED' });
    await setPreparationStatus(admin, preparation.id, 'CLOSED', db);
    await expect(createDraft(lawyer, { billingPreparationId: preparation.id }, db))
      .rejects.toMatchObject({ status: 403, code: 'BILLING_ACCESS_FORBIDDEN' });

    const result = await createDraft(partner, { billingPreparationId: preparation.id, performanceDate: '2026-09-30' }, db);
    expect(result.created).toBe(true);
    const draft = result.draft;
    expect(draft.status).toBe('DRAFT');
    expect(draft.currency).toBe('HUF');
    expect(draft.issuer.legalName).toBe('Bálintfy és Társai Ügyvédi Iroda');
    expect(draft.customer.name).toBe('main Kft.');
    expect(draft.customer.taxNumber).toBe('12345678-2-42');
    expect(draft.customer.taxNumberRequirement).toBe('REQUIRED');
    expect(draft.customer.taxNumberCanonical).toBe(true);
    expect(draft.performanceDate).toBe('2026-09-30');
    expect(draft.paymentDueDate).toBe('2026-10-08'); // derived only from the explicit performance date
    expect(draft.lines).toHaveLength(1);
    expect(draft.lines[0].quantity).toBe('1.0000');
    expect(draft.lines[0].unit).toBe('tétel');
    expect(draft.lines[0].netUnitPrice).toBe('40000.0000');
    expect(draft.lines[0].netAmount).toBe('40000.00');
    expect(draft.lines[0].vatAmount).toBe('10800.00');
    expect(draft.lines[0].grossAmount).toBe('50800.00');
    expect(draft.lines[0].description).toContain('1:00 óra · 40 000 Ft/óra');
    expect(draft.totals).toEqual({ netAmount: '40000.00', vatAmount: '10800.00', grossAmount: '50800.00' });
    expect(draft).not.toHaveProperty('invoiceNumber');
    expect(draft.missing).toEqual([]);

    // Mutate live sources — the draft stays frozen.
    await db.timeEntry.update({ where: { id: entryId }, data: { minutes: 999, description: 'KÉSŐBB MÓDOSÍTOTT' } });
    await db.client.update({ where: { id: clientId }, data: { name: 'KÉSŐBB ÁTNEVEZETT Kft.', taxNumber: '99999999-9-99' } });
    const reloaded = await getDraft(admin, draft.id, db);
    expect(reloaded.draft.customer.name).toBe('main Kft.');
    expect(reloaded.draft.customer.taxNumber).toBe('12345678-2-42');
    expect(reloaded.draft.lines[0].description).toContain('Munka main');
    expect(reloaded.draft.totals.netAmount).toBe('40000.00');

    // VAT edit recomputes lines in Decimal; blank line description is a 400.
    const patched = await patchDraft(admin, draft.id, { vatRate: '25' }, db);
    expect(patched.draft.lines[0].vatAmount).toBe('10000.00');
    expect(patched.draft.lines[0].grossAmount).toBe('50000.00');
    await expect(patchDraftLine(admin, draft.id, draft.lines[0].id, { description: '  ' }, db))
      .rejects.toMatchObject({ status: 400, code: 'INVOICE_DRAFT_INPUT_INVALID' });

    const pdf = await getDraftPdf(admin, draft.id, db);
    expect(pdf.subarray(0, 4).toString()).toBe('%PDF');

    // Canonical applicability is locked: a reviewer cannot bypass it to NOT_APPLICABLE.
    await expect(patchDraft(admin, draft.id, { customerTaxNumberRequirement: 'NOT_APPLICABLE' }, db))
      .rejects.toMatchObject({ status: 409, code: 'INVOICE_TAX_APPLICABILITY_CANONICAL' });
  });

  it('61 minutes @ 40 000 Ft/óra reconciles exactly on the invoice face', async () => {
    const { clientId } = await seedClient('arb61', { workspaceMode: 'ORGANIZATION', withIdentity: true, minutes: 61 });
    const prepId = await closedPreparation(clientId);
    const { draft } = await createDraft(admin, { billingPreparationId: prepId }, db);
    // persisted billing net: 40 000 × 61 / 60 = 40 666,67 (HALF_UP 2dp)
    expect(draft.lines[0].netAmount).toBe('40666.67');
    expect(draft.lines[0].quantity).toBe('1.0000');
    expect(draft.lines[0].netUnitPrice).toBe('40666.6700');
    expect(draft.lines[0].description).toContain('1:01 óra');
  });

  it('keeps the existing Számlázási összesítő PDF working alongside the draft', async () => {
    const prep = await db.billingPreparation.findFirstOrThrow({ where: { clientId: `${prefix}-main` } });
    const pdf = await getPreparationPdf(admin, prep.id, db);
    expect(pdf.subarray(0, 4).toString()).toBe('%PDF');
  });

  it('gates issuer profile writes to ADMIN, merges updates, and blocks draft creation until complete', async () => {
    await expect(putIssuerProfile(partner, { legalName: 'Más' }, db)).rejects.toMatchObject({ status: 403, code: 'INVOICE_ISSUER_ADMIN_ONLY' });
    const saved = await putIssuerProfile(admin, { bankName: 'Példa Bank' }, db);
    expect(saved.profile.bankName).toBe('Példa Bank');
    expect(saved.profile.legalName).toBe('Bálintfy és Társai Ügyvédi Iroda');
    await expect(putIssuerProfile(admin, { defaultVatRate: '101' }, db)).rejects.toMatchObject({ status: 400 });

    // Temporarily strip the profile: draft creation must fail without a row.
    const { clientId } = await seedClient('noiss', { workspaceMode: 'ORGANIZATION', withIdentity: true });
    const prepId = await closedPreparation(clientId);
    await db.systemSetting.update({ where: { key: ISSUER_PROFILE_KEY }, data: { value: { taxNumber: null, legalName: null, address: null } } });
    const err = await createDraft(admin, { billingPreparationId: prepId }, db).then(() => null).catch((e: any) => e);
    expect(err).toMatchObject({ status: 422, code: 'INVOICE_ISSUER_PROFILE_INCOMPLETE' });
    expect(err.missing).toEqual(expect.arrayContaining(['Szállító neve', 'Szállító címe', 'Szállító adószáma']));
    expect(await db.invoiceDraft.findUnique({ where: { billingPreparationId: prepId } })).toBeNull();
    // Restore; retry must now succeed — and the old gate no longer blocks.
    await db.systemSetting.update({ where: { key: ISSUER_PROFILE_KEY }, data: { value: ISSUER_VALUE } });
    const ok = await createDraft(admin, { billingPreparationId: prepId }, db);
    expect(ok.created).toBe(true);
  });

  it('models customer tax-number applicability: organization/CASE_RELAY REQUIRED, individual NOT_APPLICABLE, unknown UNCONFIRMED', async () => {
    const { clientId: ind } = await seedClient('indi', { workspaceMode: 'INDIVIDUAL', withIdentity: false });
    const indPrep = await closedPreparation(ind);
    const indDraft = await createDraft(admin, { billingPreparationId: indPrep, paymentMethod: 'készpénz', performanceDate: '2026-09-30' }, db);
    expect(indDraft.draft.customer.taxNumberRequirement).toBe('NOT_APPLICABLE');
    expect(indDraft.draft.customer.taxNumberCanonical).toBe(true);
    expect(indDraft.draft.missing).toEqual(expect.arrayContaining(['Ügyfél címe'])); // address still required
    expect(indDraft.draft.missing).not.toContain('Ügyfél adószáma');
    await patchDraft(admin, indDraft.draft.id, { customerAddress: '1053 Budapest, Magyar utca 2.' }, db);
    const pdf = await getDraftPdf(admin, indDraft.draft.id, db);
    expect(pdf.subarray(0, 4).toString()).toBe('%PDF'); // individual: valid without tax number
    // …but a canonical NOT_APPLICABLE cannot be flipped to REQUIRED either.
    await expect(patchDraft(admin, indDraft.draft.id, { customerTaxNumberRequirement: 'REQUIRED' }, db))
      .rejects.toMatchObject({ status: 409, code: 'INVOICE_TAX_APPLICABILITY_CANONICAL' });

    // CASE_RELAY is a canonical organizational mode in the product UI.
    const { clientId: relay } = await seedClient('relay', { workspaceMode: 'CASE_RELAY', withIdentity: true });
    const relayPrep = await closedPreparation(relay);
    const relayDraft = await createDraft(admin, { billingPreparationId: relayPrep }, db);
    expect(relayDraft.draft.customer.taxNumberRequirement).toBe('REQUIRED');
    expect(relayDraft.draft.customer.taxNumberCanonical).toBe(true);
    await expect(patchDraft(admin, relayDraft.draft.id, { customerTaxNumberRequirement: 'NOT_APPLICABLE' }, db))
      .rejects.toMatchObject({ status: 409, code: 'INVOICE_TAX_APPLICABILITY_CANONICAL' });

    const { clientId: unk } = await seedClient('unk', { withIdentity: true }); // no workspace evidence
    const unkPrep = await closedPreparation(unk);
    const unkDraft = await createDraft(admin, { billingPreparationId: unkPrep }, db);
    expect(unkDraft.draft.customer.taxNumberRequirement).toBe('UNCONFIRMED');
    expect(unkDraft.draft.customer.taxNumberCanonical).toBe(false);
    expect(unkDraft.draft.missing).toContain('Vevő adószámának alkalmazhatósága');
    await expect(getDraftPdf(admin, unkDraft.draft.id, db)).rejects.toMatchObject({ status: 422, code: 'INVOICE_DRAFT_INCOMPLETE' });
    const resolved = await patchDraft(admin, unkDraft.draft.id, { customerTaxNumberRequirement: 'REQUIRED' }, db);
    expect(resolved.draft.missing).not.toContain('Vevő adószámának alkalmazhatósága');
  });

  it('draft blocks reopen; explicit discard permits reopen; reclose snapshots anew', async () => {
    const { clientId } = await seedClient('life', { workspaceMode: 'ORGANIZATION', withIdentity: true });
    const prepId = await closedPreparation(clientId);
    const a = await createDraft(admin, { billingPreparationId: prepId }, db);
    expect(a.created).toBe(true);

    await expect(setPreparationStatus(admin, prepId, 'OPEN', db))
      .rejects.toMatchObject({ status: 409, code: 'BILLING_PREP_INVOICE_DRAFT_EXISTS' });
    expect((await db.billingPreparation.findUniqueOrThrow({ where: { id: prepId } })).status).toBe('CLOSED');

    await discardDraft(admin, a.draft.id, db);
    expect(await db.invoiceDraft.findUnique({ where: { billingPreparationId: prepId } })).toBeNull();

    await setPreparationStatus(admin, prepId, 'OPEN', db); // now allowed
    const item = await db.billingPreparationItem.findFirstOrThrow({ where: { preparationId: prepId } });
    await patchItem(admin, prepId, item.id, { billingMinutes: 30, adjustmentReason: 'Jóvoltból' }, db);
    await setPreparationStatus(admin, prepId, 'CLOSED', db);

    const b = await createDraft(admin, { billingPreparationId: prepId }, db);
    expect(b.created).toBe(true);
    expect(b.draft.id).not.toBe(a.draft.id);
    expect(b.draft.lines[0].netAmount).toBe('20000.00'); // new authoritative snapshot
  });

  it('concurrent creates resolve to exactly one draft', async () => {
    const { clientId } = await seedClient('race', { workspaceMode: 'ORGANIZATION', withIdentity: true });
    const prepId = await closedPreparation(clientId);
    const [r1, r2] = await Promise.all([
      createDraft(admin, { billingPreparationId: prepId }, db),
      createDraft(partner, { billingPreparationId: prepId }, db),
    ]);
    expect(r1.draft.id).toBe(r2.draft.id);
    expect([r1.created, r2.created].filter(Boolean)).toHaveLength(1);
    expect(await db.invoiceDraft.count({ where: { billingPreparationId: prepId } })).toBe(1);
  });
});
