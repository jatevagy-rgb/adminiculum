import { randomUUID } from 'crypto';
import { PrismaClient } from '@prisma/client';

// Never fall back to a production DATABASE_URL. Run after canonical migration replay.
const databaseUrl = process.env.INVOICE_DRAFT_TEST_DATABASE_URL || process.env.MIGRATION_REPLAY_DATABASE_URL;
const describeDb = databaseUrl ? describe : describe.skip;

import {
  createPreparation,
  getPreparationPdf,
  setPreparationStatus,
} from '../src/modules/billing-preparations/service';
import {
  ISSUER_PROFILE_KEY,
  createDraft,
  getDraft,
  getDraftPdf,
  patchDraft,
  putIssuerProfile,
} from '../src/modules/invoice-drafts/service';

describeDb('T6A invoice draft against canonical PostgreSQL schema', () => {
  let db: PrismaClient;
  const prefix = `id-${randomUUID()}`;
  const clientId = `${prefix}-client`;
  const admin = { userId: `${prefix}-admin`, role: 'ADMIN' };
  const partner = { userId: `${prefix}-partner`, role: 'PARTNER' };
  const lawyer = { userId: `${prefix}-lawyer`, role: 'LAWYER' };
  const caseId = `${prefix}-case`;
  const matterId = `${prefix}-matter`;
  const entryId = `${prefix}-entry`;
  const excludedEntryId = `${prefix}-excluded`;

  beforeAll(async () => {
    const url = new URL(databaseUrl!);
    expect(['localhost', '127.0.0.1', '[::1]']).toContain(url.hostname);
    expect(url.pathname).toMatch(/^\/adminiculum_replay/);
    db = new PrismaClient({ datasources: { db: { url: databaseUrl } } });
    for (const actor of [admin, partner, lawyer]) {
      await db.user.create({ data: { id: actor.userId, name: actor.role, email: `${actor.userId}@example.invalid`, role: actor.role as any, skills: [] } });
    }
    await db.client.create({
      data: {
        id: clientId,
        name: 'Demo Kft.',
        address: '1052 Budapest, Példa utca 4.',
        taxNumber: '12345678-2-42',
        vatNumber: 'HU12345678',
      },
    });
    await db.matter.create({ data: { id: matterId, title: 'Matter', matterType: 'OTHER', clientId } });
    await db.case.create({ data: { id: caseId, caseNumber: `${prefix}-U1`, title: 'Ügy', caseType: 'OTHER', clientId, matterId, createdById: admin.userId } });
    await db.hourlyRateVersion.create({ data: { id: randomUUID(), clientId, caseId: null, effectiveFrom: new Date('2026-01-01T00:00:00Z'), currency: 'HUF', hourlyRate: '40000', mode: 'EXPLICIT_RATE', createdById: admin.userId } });
    await db.timeEntry.createMany({ data: [
      { id: entryId, userId: lawyer.userId, minutes: 60, billable: true, workType: 'DRAFTING', description: 'Szerződés készítése', workDate: new Date('2026-09-05T12:00:00Z'), caseId, matterId },
      { id: excludedEntryId, userId: lawyer.userId, minutes: 30, billable: false, workType: 'INTERNAL_MEETING', description: 'Kizárt belső munka', workDate: new Date('2026-09-06T12:00:00Z'), caseId, matterId },
    ] });
    await db.systemSetting.upsert({
      where: { key: ISSUER_PROFILE_KEY },
      create: { key: ISSUER_PROFILE_KEY, value: { legalName: 'Bálintfy és Társai Ügyvédi Iroda', address: '1051 Budapest, Fő utca 1.', taxNumber: '87654321-1-41', defaultVatRate: '27', defaultPaymentMethod: 'átutalás', defaultPaymentTermDays: 8 } },
      update: {},
    });
  });

  afterAll(async () => { await db?.$disconnect(); });

  it('blocks draft creation while the preparation is OPEN, then succeeds on CLOSED with snapshots', async () => {
    const { preparation } = await createPreparation(admin, { clientId, periodStart: '2026-09-01', periodEnd: '2026-09-30' }, db);
    await expect(createDraft(admin, { billingPreparationId: preparation.id }, db))
      .rejects.toMatchObject({ status: 409, code: 'INVOICE_DRAFT_REQUIRES_CLOSED' });
    await expect(createDraft(lawyer, { billingPreparationId: preparation.id }, db))
      .rejects.toMatchObject({ status: 403, code: 'BILLING_ACCESS_FORBIDDEN' });

    await setPreparationStatus(admin, preparation.id, 'CLOSED', db);

    const result = await createDraft(partner, { billingPreparationId: preparation.id }, db);
    expect(result.created).toBe(true);
    const draft = result.draft;
    expect(draft.status).toBe('DRAFT');
    expect(draft.billingPreparationId).toBe(preparation.id);
    expect(draft.currency).toBe('HUF');
    expect(draft.issuer.legalName).toBe('Bálintfy és Társai Ügyvédi Iroda');
    expect(draft.issuer.taxNumber).toBe('87654321-1-41');
    expect(draft.customer.name).toBe('Demo Kft.');
    expect(draft.customer.address).toBe('1052 Budapest, Példa utca 4.');
    expect(draft.customer.taxNumber).toBe('12345678-2-42');
    expect(draft.lines).toHaveLength(1); // excluded/non-billable row omitted
    expect(draft.lines[0].quantity).toBe('1.0000');
    expect(draft.lines[0].netAmount).toBe('40000.00');
    expect(draft.lines[0].vatAmount).toBe('10800.00'); // 40000 × 27% HALF_UP
    expect(draft.lines[0].grossAmount).toBe('50800.00');
    expect(draft.totals).toEqual({ netAmount: '40000.00', vatAmount: '10800.00', grossAmount: '50800.00' });
    expect(draft).not.toHaveProperty('invoiceNumber');
    expect(draft.missing).toEqual([]);

    // Idempotent: second create returns the existing draft.
    const again = await createDraft(admin, { billingPreparationId: preparation.id }, db);
    expect(again.created).toBe(false);
    expect(again.draft.id).toBe(draft.id);

    // Mutate live sources: draft stays frozen.
    await db.timeEntry.update({ where: { id: entryId }, data: { minutes: 999, description: 'KÉSŐBB MÓDOSÍTOTT ÉLŐ FORRÁS' } });
    await db.client.update({ where: { id: clientId }, data: { name: 'KÉSŐBB ÁTNEVEZETT Kft.', taxNumber: '99999999-9-99' } });
    const reloaded = await getDraft(admin, draft.id, db);
    expect(reloaded.draft.customer.name).toBe('Demo Kft.');
    expect(reloaded.draft.customer.taxNumber).toBe('12345678-2-42');
    expect(reloaded.draft.lines[0].description).toBe('Szerződés készítése');
    expect(reloaded.draft.lines[0].quantity).toBe('1.0000');
    expect(reloaded.draft.totals.netAmount).toBe('40000.00');

    // Draft edits recompute VAT lines in Decimal; PDF gate honors the stored row.
    const patched = await patchDraft(admin, draft.id, { vatRate: '25', paymentMethod: 'készpénz' }, db);
    expect(patched.draft.vatRate).toBe('25');
    expect(patched.draft.lines[0].vatAmount).toBe('10000.00');
    expect(patched.draft.lines[0].grossAmount).toBe('50000.00');
    expect(patched.draft.paymentMethod).toBe('készpénz');

    const pdf = await getDraftPdf(admin, draft.id, db);
    expect(pdf.subarray(0, 4).toString()).toBe('%PDF');
  });

  it('keeps the existing Számlázási összesítő PDF working alongside the draft', async () => {
    const prep = await db.billingPreparation.findFirstOrThrow({ where: { clientId } });
    const pdf = await getPreparationPdf(admin, prep.id, db);
    expect(pdf.subarray(0, 4).toString()).toBe('%PDF');
  });

  it('gates issuer profile writes to ADMIN and stores them in SystemSetting', async () => {
    await expect(putIssuerProfile(partner, { legalName: 'Más' }, db)).rejects.toMatchObject({ status: 403, code: 'INVOICE_ISSUER_ADMIN_ONLY' });
    const saved = await putIssuerProfile(admin, { bankName: 'Példa Bank', defaultVatRate: '27' }, db);
    expect(saved.profile.bankName).toBe('Példa Bank');
    expect(saved.profile.legalName).toBe('Bálintfy és Társai Ügyvédi Iroda'); // merged, not clobbered
    await expect(putIssuerProfile(admin, { defaultVatRate: '101' }, db)).rejects.toMatchObject({ status: 400, code: 'ISSUER_PROFILE_INVALID' });
  });

  it('rejects PDF generation with the Hungarian missing list when required fields are empty', async () => {
    const client2 = `${prefix}-client2`;
    await db.client.create({ data: { id: client2, name: 'Hiányos Kft.' } });
    const { preparation } = await createPreparation(admin, { clientId: client2, periodStart: '2026-09-01', periodEnd: '2026-09-30' }, db);
    await setPreparationStatus(admin, preparation.id, 'CLOSED', db);
    const { draft } = await createDraft(admin, { billingPreparationId: preparation.id, vatRate: '27', paymentMethod: 'átutalás' }, db);
    expect(draft.lines).toHaveLength(0);
    const err = await getDraftPdf(admin, draft.id, db).then(() => null).catch((e: any) => e);
    expect(err).toMatchObject({ status: 422, code: 'INVOICE_DRAFT_INCOMPLETE' });
    expect(err.missing).toEqual(expect.arrayContaining(['Ügyfél címe', 'Ügyfél adószáma', 'Tételsor']));
  });
});
