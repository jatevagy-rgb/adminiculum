import { Prisma } from '@prisma/client';
import {
  ISSUER_PROFILE_KEY,
  createDraft,
  getDraftPdf,
  invoiceDraftMissing,
  quantityHours,
  vatAmountFor,
} from '../src/modules/invoice-drafts/service';

const D = (value: string) => new Prisma.Decimal(value);

function billingItem(overrides: Record<string, unknown> = {}) {
  return {
    id: 'item-1',
    preparationId: 'prep-1',
    sourceTimeEntryId: 'te-live-must-not-be-read',
    sourceWorkDate: new Date('2026-09-02T00:00:00.000Z'),
    sourceMinutes: 60,
    sourceBillable: true,
    sourceDescription: 'Élő módosítás előtti leírás – őűáé',
    sourceWorkType: 'DRAFTING',
    workerName: 'Ügyvéd Éva',
    caseNumber: 'U-2026/1',
    caseTitle: 'Szerződés',
    included: true,
    billingMinutes: 90,
    invoiceDescription: null,
    rateOverride: null,
    hourlyRate: D('50000'),
    netAmount: D('75000'),
    ...overrides,
  };
}

function preparation(overrides: Record<string, unknown> = {}) {
  return {
    id: 'prep-1',
    clientId: 'client-1',
    status: 'CLOSED',
    currency: 'HUF',
    periodStart: new Date('2026-09-01T00:00:00.000Z'),
    periodEnd: new Date('2026-09-30T00:00:00.000Z'),
    client: {
      id: 'client-1',
      name: 'Demo Kft.',
      address: '1052 Budapest, Példa utca 4.',
      taxNumber: '12345678-2-42',
      vatNumber: 'HU12345678',
    },
    items: [billingItem()],
    ...overrides,
  };
}

const ISSUER = {
  legalName: 'Bálintfy és Társai Ügyvédi Iroda',
  address: '1051 Budapest, Fő utca 1.',
  taxNumber: '87654321-1-41',
  euVatNumber: 'HU87654321',
  registrationNumber: null,
  bankName: 'Teszt Bank',
  bankAccountNumber: '11111111-22222222',
  email: null,
  phone: null,
  logoPath: null,
  defaultVatTreatment: 'NORMAL_VAT',
  defaultVatRate: '27',
  defaultPaymentMethod: 'átutalás',
  defaultPaymentTermDays: 8,
};

/** Fake Prisma surface. `timeEntry` and `client` accessors throw on ANY read —
 *  draft creation must only use the persisted preparation snapshot. */
function dbFor(overrides: Record<string, unknown> = {}) {
  const captured: Record<string, unknown> = {};
  const db = {
    user: { findUnique: async () => ({ role: 'ADMIN', status: 'ACTIVE', isActive: true }) },
    systemSetting: {
      findUnique: async ({ where }: any) => (where.key === ISSUER_PROFILE_KEY ? { value: ISSUER, updatedAt: new Date('2026-09-10T00:00:00Z') } : null),
      upsert: async () => ({}),
    },
    billingPreparation: { findUnique: async () => preparation() },
    invoiceDraft: {
      findUnique: async () => null,
      create: async ({ data }: any) => {
        captured.createData = data;
        return {
          ...data,
          id: 'draft-1',
          createdAt: new Date('2026-09-10T10:00:00Z'),
          updatedAt: new Date('2026-09-10T10:00:00Z'),
          lines: data.lines.create.map((line: any, index: number) => ({ ...line, id: `line-${index}`, draftId: 'draft-1' })),
        };
      },
    },
    get timeEntry() { throw new Error('DRAFT MUST NOT READ LIVE TIMEENTRY'); },
    get client() { throw new Error('DRAFT MUST NOT RE-READ LIVE CLIENT'); },
    get hourlyRateVersion() { throw new Error('DRAFT MUST NOT RE-RESOLVE RATES'); },
    ...overrides,
  } as any;
  return { db, captured };
}

describe('T6A invoice draft — snapshot-only creation', () => {
  const admin = { userId: 'admin-1', role: 'ADMIN' } as any;

  it('requires a CLOSED preparation', async () => {
    const { db } = dbFor({ billingPreparation: { findUnique: async () => preparation({ status: 'OPEN' }) } });
    await expect(createDraft(admin, { billingPreparationId: 'prep-1' }, db)).rejects.toMatchObject({ status: 409, code: 'INVOICE_DRAFT_REQUIRES_CLOSED' });
  });

  it('denies non-reviewers', async () => {
    const { db } = dbFor({ user: { findUnique: async () => ({ role: 'LAWYER', status: 'ACTIVE', isActive: true }) } });
    await expect(createDraft({ userId: 'lawyer-1', role: 'LAWYER' } as any, { billingPreparationId: 'prep-1' }, db)).rejects.toMatchObject({ status: 403, code: 'BILLING_ACCESS_FORBIDDEN' });
  });

  it('snapshots issuer + customer identity and copies only included persisted rows', async () => {
    const excluded = billingItem({ id: 'item-2', included: false, sourceDescription: 'KIZÁRT', netAmount: D('40000') });
    const { db, captured } = dbFor({
      billingPreparation: { findUnique: async () => preparation({ items: [billingItem(), excluded] }) },
    });
    const { created, draft } = await createDraft(admin, { billingPreparationId: 'prep-1' }, db);
    expect(created).toBe(true);

    const data = captured.createData as any;
    expect(data.issuerLegalName).toBe('Bálintfy és Társai Ügyvédi Iroda');
    expect(data.issuerTaxNumber).toBe('87654321-1-41');
    expect(data.customerName).toBe('Demo Kft.');
    expect(data.customerTaxNumber).toBe('12345678-2-42');
    expect(data.customerVatNumber).toBe('HU12345678');
    expect(data.currency).toBe('HUF');
    expect(data.status).toBeUndefined(); // schema default DRAFT
    expect(data.performanceDate).toEqual(preparation().periodEnd);
    expect(data.paymentDueDate).toEqual(new Date('2026-10-08T00:00:00.000Z'));
    expect(data.paymentMethod).toBe('átutalás');
    expect(data.vatTreatment).toBe('NORMAL_VAT');
    expect(data.vatRate?.toString()).toBe('27');
    expect(data).not.toHaveProperty('invoiceNumber'); // no official numbering in T6A

    expect(data.lines.create).toHaveLength(1); // excluded row omitted
    const line = data.lines.create[0];
    expect(line.billingItemId).toBe('item-1');
    expect(line.quantity.toFixed(4)).toBe('1.5000');
    expect(line.unit).toBe('óra');
    expect(line.netAmount.toFixed(2)).toBe('75000.00');
    expect(line.vatAmount.toFixed(2)).toBe('20250.00');
    expect(line.grossAmount.toFixed(2)).toBe('95250.00');
    expect(line.sourceWorkDate).toEqual(billingItem().sourceWorkDate);
    expect(line.billingMinutes).toBe(90);
    expect(draft.totals).toEqual({ netAmount: '75000.00', vatAmount: '20250.00', grossAmount: '95250.00' });
  });

  it('keeps the draft frozen when live TimeEntry and Client mutate afterwards', async () => {
    let stored: any = null;
    let mutated = false;
    const db = {
      user: { findUnique: async () => ({ role: 'ADMIN', status: 'ACTIVE', isActive: true }) },
      systemSetting: { findUnique: async () => ({ value: ISSUER }) },
      billingPreparation: {
        findUnique: async () => (mutated
          ? preparation({
              client: { id: 'client-1', name: 'KÉSŐBB ÁTNEVEZETT ÜGYFÉL', address: 'Másik cím 9.', taxNumber: '99999999-9-99', vatNumber: null },
              items: [billingItem({ sourceDescription: 'ÉLŐ FORRÁS MÓDOSÍTVA', billingMinutes: 300, netAmount: D('250000') })],
            })
          : preparation()),
      },
      invoiceDraft: {
        findUnique: async () => stored,
        create: async ({ data }: any) => {
          stored = { ...data, id: 'draft-1', createdAt: new Date(), updatedAt: new Date(), lines: data.lines.create.map((l: any, i: number) => ({ ...l, id: `line-${i}` })) };
          return stored;
        },
      },
      get timeEntry() { throw new Error('DRAFT MUST NOT READ LIVE TIMEENTRY'); },
      get client() { throw new Error('DRAFT MUST NOT RE-READ LIVE CLIENT'); },
      get hourlyRateVersion() { throw new Error('DRAFT MUST NOT RE-RESOLVE RATES'); },
    } as any;

    const first = await createDraft(admin, { billingPreparationId: 'prep-1' }, db);
    expect(first.created).toBe(true);
    const frozen = first.draft;

    mutated = true; // live TimeEntry + Client identity now differ from the snapshot
    const again = await createDraft(admin, { billingPreparationId: 'prep-1' }, db);
    expect(again.created).toBe(false);
    expect(again.draft.customer.name).toBe('Demo Kft.');
    expect(again.draft.customer.taxNumber).toBe('12345678-2-42');
    expect(again.draft.lines[0].description).toBe('Élő módosítás előtti leírás – őűáé');
    expect(again.draft.lines[0].quantity).toBe('1.5000');
    expect(again.draft.totals.netAmount).toBe('75000.00');
    expect(again.draft).toEqual(frozen);
  });

  it('computes VAT with Decimal HALF_UP and never hardcodes a rate', () => {
    expect(vatAmountFor(D('75000'), 'NORMAL_VAT', D('27')).toFixed(2)).toBe('20250.00');
    expect(vatAmountFor(D('16.67'), 'NORMAL_VAT', D('27')).toFixed(2)).toBe('4.50');
    expect(vatAmountFor(D('16.66'), 'NORMAL_VAT', D('25')).toFixed(2)).toBe('4.17'); // 4.165 → HALF_UP
    expect(vatAmountFor(D('75000'), 'TAX_EXEMPT', null).toFixed(2)).toBe('0.00');
    expect(vatAmountFor(D('75000'), 'REVERSE_CHARGE', null).toFixed(2)).toBe('0.00');
    expect(vatAmountFor(D('75000'), 'OUT_OF_SCOPE', null).toFixed(2)).toBe('0.00');
    expect(quantityHours(90).toFixed(4)).toBe('1.5000');
    expect(quantityHours(60).toFixed(4)).toBe('1.0000');
  });

  it('reports Hungarian missing-field list before PDF generation', () => {
    const complete = {
      issuerLegalName: 'X', issuerAddress: 'Y', issuerTaxNumber: '1',
      customerName: 'A', customerAddress: 'B', customerTaxNumber: '2',
      performanceDate: new Date(), paymentDueDate: new Date(), paymentMethod: 'átutalás',
      vatTreatment: 'NORMAL_VAT' as const, vatRate: D('27'),
    };
    expect(invoiceDraftMissing(complete, [{ description: 'Munka' } as any])).toEqual([]);
    const missing = invoiceDraftMissing(
      { ...complete, customerTaxNumber: null, performanceDate: null, vatRate: null },
      [{ description: 'Munka' } as any],
    );
    expect(missing).toEqual(expect.arrayContaining(['Ügyfél adószáma', 'Teljesítés dátuma', 'ÁFA kulcs']));
    expect(missing).not.toContain('Fizetési határidő');
  });

  it('fails PDF generation with a clear 422 while fields are missing', async () => {
    const draft = {
      id: 'draft-1', billingPreparationId: 'prep-1', currency: 'HUF', status: 'DRAFT',
      issuerLegalName: null, issuerAddress: null, issuerTaxNumber: null,
      issuerEuVatNumber: null, issuerRegistrationNumber: null, issuerBankName: null,
      issuerBankAccountNumber: null, issuerEmail: null, issuerPhone: null, issuerLogoPath: null,
      customerName: 'Demo Kft.', customerAddress: null, customerTaxNumber: null, customerVatNumber: null,
      performanceDate: null, draftDate: new Date(), paymentDueDate: null, paymentMethod: null,
      note: null, vatTreatment: 'NORMAL_VAT', vatRate: null,
      lines: [{ description: 'Munka' }],
    };
    const db = dbFor({ invoiceDraft: { findUnique: async () => draft, create: async () => { throw new Error('unreachable'); } } });
    await expect(getDraftPdf(admin, 'draft-1', db.db)).rejects.toMatchObject({ status: 422, code: 'INVOICE_DRAFT_INCOMPLETE' });
  });
});
