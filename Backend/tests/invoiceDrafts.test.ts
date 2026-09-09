import { Prisma } from '@prisma/client';
import {
  ISSUER_PROFILE_KEY,
  createDraft,
  discardDraft,
  getDraftPdf,
  invoiceDraftMissing,
  patchDraft,
  patchDraftLine,
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
  defaultVatTreatment: 'NORMAL_VAT',
  defaultVatRate: '27',
  defaultPaymentMethod: 'átutalás',
  defaultPaymentTermDays: 8,
};

/** Fake Prisma surface. `timeEntry`/`client`/`hourlyRateVersion` accessors throw
 *  on ANY read — draft logic must only use the persisted snapshots. */
function dbFor(overrides: Record<string, unknown> = {}) {
  const captured: Record<string, unknown> = {};
  const db = {
    user: { findUnique: async () => ({ role: 'ADMIN', status: 'ACTIVE', isActive: true }) },
    systemSetting: {
      findUnique: async ({ where }: any) => (where.key === ISSUER_PROFILE_KEY ? { value: ISSUER, updatedAt: new Date('2026-09-10T00:00:00Z') } : null),
      upsert: async () => ({}),
    },
    clientPortalWorkspace: { findMany: async () => [] },
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

const baseDraft = {
  issuerLegalName: 'X', issuerAddress: 'Y', issuerTaxNumber: '1',
  customerName: 'A', customerAddress: 'B', customerTaxNumber: '2',
  customerTaxNumberRequirement: 'REQUIRED' as const,
  customerTaxNumberCanonical: true,
  performanceDate: new Date(), paymentDueDate: new Date(), paymentMethod: 'átutalás',
  vatTreatment: 'NORMAL_VAT' as const, vatRate: D('27'),
};

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

  it('refuses creation with an incomplete issuer profile and creates NO row', async () => {
    let created = false;
    const { db } = dbFor({
      systemSetting: {
        findUnique: async () => ({ value: { ...ISSUER, taxNumber: null }, updatedAt: new Date() }),
        upsert: async () => ({}),
      },
      invoiceDraft: { findUnique: async () => null, create: async () => { created = true; throw new Error('must not create'); } },
    });
    const err = await createDraft(admin, { billingPreparationId: 'prep-1' }, db).then(() => null).catch((e: any) => e);
    expect(err).toMatchObject({ status: 422, code: 'INVOICE_ISSUER_PROFILE_INCOMPLETE' });
    expect(err.missing).toContain('Szállító adószáma');
    expect(created).toBe(false);
  });

  it('snapshots issuer + customer identity and copies only included persisted rows', async () => {
    const excluded = billingItem({ id: 'item-2', included: false, sourceDescription: 'KIZÁRT', netAmount: D('40000') });
    const { db, captured } = dbFor({
      clientPortalWorkspace: { findMany: async () => [{ mode: 'ORGANIZATION', status: 'ACTIVE' }] },
      billingPreparation: { findUnique: async () => preparation({ items: [billingItem(), excluded] }) },
    });
    const { created, draft } = await createDraft(admin, { billingPreparationId: 'prep-1' }, db);
    expect(created).toBe(true);

    const data = captured.createData as any;
    expect(data.issuerLegalName).toBe('Bálintfy és Társai Ügyvédi Iroda');
    expect(data.issuerTaxNumber).toBe('87654321-1-41');
    expect(data.customerTaxNumberRequirement).toBe('REQUIRED'); // canonical ORGANIZATION workspace
    expect(data.customerTaxNumberCanonical).toBe(true);
    expect(data.customerName).toBe('Demo Kft.');
    expect(data.customerTaxNumber).toBe('12345678-2-42');
    expect(data.currency).toBe('HUF');
    expect(data.status).toBeUndefined(); // schema default DRAFT
    // Teljesítés dátuma is legally material — never guessed from the period.
    expect(data.performanceDate).toBeNull();
    // …and the payment-term default must not derive from that guessed date.
    expect(data.paymentDueDate).toBeNull();
    expect(data.paymentMethod).toBe('átutalás');
    expect(data.vatTreatment).toBe('NORMAL_VAT');
    expect(data.vatRate?.toString()).toBe('27');
    expect(data).not.toHaveProperty('invoiceNumber'); // no official numbering in T6A

    expect(data.lines.create).toHaveLength(1); // excluded row omitted
    const line = data.lines.create[0];
    expect(line.billingItemId).toBe('item-1');
    // Invoice face: quantity 1 tétel at authoritative net — always reconcilable.
    expect(line.quantity.toFixed(4)).toBe('1.0000');
    expect(line.unit).toBe('tétel');
    expect(line.netUnitPrice.toFixed(4)).toBe('75000.0000');
    expect(line.netAmount.toFixed(2)).toBe('75000.00');
    expect(line.vatAmount.toFixed(2)).toBe('20250.00');
    expect(line.grossAmount.toFixed(2)).toBe('95250.00');
    // Billing basis stays visible in the description + annex provenance.
    expect(line.description).toBe('Élő módosítás előtti leírás – őűáé — 1:30 óra · 50 000 Ft/óra');
    expect(line.billingMinutes).toBe(90);
    expect(line.hourlyRate.toString()).toBe('50000');
    expect(draft.totals).toEqual({ netAmount: '75000.00', vatAmount: '20250.00', grossAmount: '95250.00' });
    // Missing-field gate now demands the legal dates from the reviewer.
    expect(draft.missing).toEqual(expect.arrayContaining(['Teljesítés dátuma', 'Fizetési határidő']));
  });

  it('derives the payment-term default only from an explicitly supplied performance date', async () => {
    const { db, captured } = dbFor();
    await createDraft(admin, { billingPreparationId: 'prep-1', performanceDate: '2026-09-30' }, db);
    const data = captured.createData as any;
    expect(data.performanceDate).toEqual(new Date('2026-09-30T00:00:00.000Z'));
    expect(data.paymentDueDate).toEqual(new Date('2026-10-08T00:00:00.000Z')); // +8 nap
  });

  it('treats CASE_RELAY workspaces as canonical organizational evidence', async () => {
    const { db, captured } = dbFor({
      clientPortalWorkspace: { findMany: async () => [{ mode: 'CASE_RELAY', status: 'ACTIVE' }] },
    });
    await createDraft(admin, { billingPreparationId: 'prep-1' }, db);
    expect((captured.createData as any).customerTaxNumberRequirement).toBe('REQUIRED');
    expect((captured.createData as any).customerTaxNumberCanonical).toBe(true);
  });

  it('a canonically resolved tax applicability cannot be overridden by a reviewer', async () => {
    const stored = {
      id: 'draft-1', billingPreparationId: 'prep-1', currency: 'HUF', status: 'DRAFT',
      customerTaxNumberRequirement: 'REQUIRED', customerTaxNumberCanonical: true,
      vatTreatment: 'TAX_EXEMPT', vatRate: null,
      createdAt: new Date('2026-09-10T00:00:00Z'), updatedAt: new Date('2026-09-10T00:00:00Z'),
      lines: [{ id: 'line-1', description: 'Tétel', quantity: D('1'), unit: 'tétel', netUnitPrice: D('1'), netAmount: D('1'), vatTreatment: 'TAX_EXEMPT', vatRate: null, vatAmount: D('0'), grossAmount: D('1'), sortOrder: 0, sourceWorkDate: null, caseNumber: null, caseTitle: null, workerName: null, billingMinutes: 0, hourlyRate: null, billingItemId: 'item-1' }],
    };
    const db = {
      user: { findUnique: async () => ({ role: 'ADMIN', status: 'ACTIVE', isActive: true }) },
      invoiceDraft: { findUnique: async () => stored, update: async ({ data }: any) => ({ ...stored, ...data }) },
      invoiceDraftLine: { update: async () => ({}) },
    } as any;
    await expect(patchDraft(admin, 'draft-1', { customerTaxNumberRequirement: 'NOT_APPLICABLE' }, db))
      .rejects.toMatchObject({ status: 409, code: 'INVOICE_TAX_APPLICABILITY_CANONICAL' });
    // resubmitting the same canonical value stays a no-op
    const same = await patchDraft(admin, 'draft-1', { customerTaxNumberRequirement: 'REQUIRED' }, db);
    expect(same.draft.customer.taxNumberRequirement).toBe('REQUIRED');
    // UNCONFIRMED (non-canonical) drafts still accept a reviewer decision
    const unresolved = { ...stored, customerTaxNumberRequirement: 'UNCONFIRMED', customerTaxNumberCanonical: false };
    const db2 = {
      user: { findUnique: async () => ({ role: 'ADMIN', status: 'ACTIVE', isActive: true }) },
      invoiceDraft: { findUnique: async () => unresolved, update: async ({ data }: any) => ({ ...unresolved, ...data }) },
      invoiceDraftLine: { update: async () => ({}) },
    } as any;
    const decided = await patchDraft(admin, 'draft-1', { customerTaxNumberRequirement: 'NOT_APPLICABLE' }, db2);
    expect(decided.draft.customer.taxNumberRequirement).toBe('NOT_APPLICABLE');
  });

  it('reconciles the invoice face for arbitrary minute counts (61 min @ 50 000 Ft/óra)', async () => {
    const { db, captured } = dbFor({
      billingPreparation: {
        findUnique: async () => preparation({
          items: [billingItem({ billingMinutes: 61, netAmount: D('50833.33') })],
        }),
      },
    });
    await createDraft(admin, { billingPreparationId: 'prep-1' }, db);
    const line = (captured.createData as any).lines.create[0];
    // Face: 1 × 50 833,33 = 50 833,33 — exactly the persisted billing net.
    expect(line.quantity.mul(line.netUnitPrice).toFixed(2)).toBe('50833.33');
    expect(line.netAmount.toFixed(2)).toBe('50833.33');
    expect(line.description).toContain('1:01 óra');
    expect(line.description).toContain('50 000 Ft/óra');
  });

  it('keeps the draft frozen when live TimeEntry and Client mutate afterwards', async () => {
    let stored: any = null;
    let mutated = false;
    const db = {
      user: { findUnique: async () => ({ role: 'ADMIN', status: 'ACTIVE', isActive: true }) },
      systemSetting: { findUnique: async () => ({ value: ISSUER }) },
      clientPortalWorkspace: { findMany: async () => [{ mode: 'ORGANIZATION', status: 'ACTIVE' }] },
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
    expect(again.draft.lines[0].description).toContain('Élő módosítás előtti leírás – őűáé');
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
  });

  it('NORMAL_VAT without a rate is a controlled 422 — never a DB-level 500', async () => {
    const { db } = dbFor({
      systemSetting: {
        findUnique: async () => ({ value: { ...ISSUER, defaultVatRate: null }, updatedAt: new Date() }),
        upsert: async () => ({}),
      },
    });
    await expect(createDraft(admin, { billingPreparationId: 'prep-1' }, db))
      .rejects.toMatchObject({ status: 422, code: 'INVOICE_VAT_RATE_REQUIRED' });
    await expect(createDraft(admin, { billingPreparationId: 'prep-1', vatTreatment: 'NORMAL_VAT', vatRate: null }, db))
      .rejects.toMatchObject({ status: 422, code: 'INVOICE_VAT_RATE_REQUIRED' });
  });

  it('non-normal treatments normalize the rate to null and VAT to zero', async () => {
    const { db, captured } = dbFor();
    // even if a stale rate is supplied alongside a non-normal treatment:
    await createDraft(admin, { billingPreparationId: 'prep-1', vatTreatment: 'TAX_EXEMPT', vatRate: '27' }, db);
    const data = captured.createData as any;
    expect(data.vatTreatment).toBe('TAX_EXEMPT');
    expect(data.vatRate).toBeNull();
    expect(data.lines.create[0].vatRate).toBeNull();
    expect(data.lines.create[0].vatAmount.toFixed(2)).toBe('0.00');
    expect(data.lines.create[0].grossAmount.toFixed(2)).toBe('75000.00');
  });

  it('reports Hungarian missing-field list incl. tax-number applicability', () => {
    expect(invoiceDraftMissing(baseDraft, [{ description: 'Munka' } as any])).toEqual([]);
    expect(invoiceDraftMissing({ ...baseDraft, customerTaxNumber: null }, [{ description: 'M' } as any])).toContain('Ügyfél adószáma');
    expect(invoiceDraftMissing({ ...baseDraft, customerTaxNumber: null, customerTaxNumberRequirement: 'NOT_APPLICABLE' }, [{ description: 'M' } as any])).toEqual([]);
    expect(invoiceDraftMissing({ ...baseDraft, customerTaxNumberRequirement: 'UNCONFIRMED' }, [{ description: 'M' } as any])).toContain('Vevő adószámának alkalmazhatósága');
    const missing = invoiceDraftMissing({ ...baseDraft, performanceDate: null, vatRate: null }, [{ description: 'M' } as any]);
    expect(missing).toEqual(expect.arrayContaining(['Teljesítés dátuma', 'ÁFA kulcs']));
  });

  it('fails PDF generation with a clear 422 while fields are missing', async () => {
    const draft = {
      id: 'draft-1', billingPreparationId: 'prep-1', currency: 'HUF', status: 'DRAFT',
      issuerLegalName: null, issuerAddress: null, issuerTaxNumber: null,
      issuerEuVatNumber: null, issuerRegistrationNumber: null, issuerBankName: null,
      issuerBankAccountNumber: null, issuerEmail: null, issuerPhone: null, issuerLogoPath: null,
      customerTaxNumberRequirement: 'UNCONFIRMED',
      customerName: 'Demo Kft.', customerAddress: null, customerTaxNumber: null, customerVatNumber: null,
      performanceDate: null, draftDate: new Date(), paymentDueDate: null, paymentMethod: null,
      note: null, vatTreatment: 'NORMAL_VAT', vatRate: D('27'),
      lines: [{ description: 'Munka' }],
    };
    const db = dbFor({ invoiceDraft: { findUnique: async () => draft, create: async () => { throw new Error('unreachable'); } } });
    const err = await getDraftPdf(admin, 'draft-1', db.db).then(() => null).catch((e: any) => e);
    expect(err).toMatchObject({ status: 422, code: 'INVOICE_DRAFT_INCOMPLETE' });
    expect(err.missing).toEqual(expect.arrayContaining(['Szállító neve', 'Ügyfél címe', 'Vevő adószámának alkalmazhatósága', 'Teljesítés dátuma', 'Fizetési határidő', 'Fizetési mód']));
  });

  it('patchDraft applies the same VAT combination rules', async () => {
    const stored = {
      id: 'draft-1', billingPreparationId: 'prep-1', currency: 'HUF', status: 'DRAFT',
      customerTaxNumberRequirement: 'REQUIRED', customerTaxNumberCanonical: true,
      vatTreatment: 'TAX_EXEMPT', vatRate: null,
      lines: [{ id: 'line-1', netAmount: D('75000'), vatTreatment: 'TAX_EXEMPT', vatRate: null, vatAmount: D('0'), grossAmount: D('75000') }],
    };
    const db = {
      user: { findUnique: async () => ({ role: 'ADMIN', status: 'ACTIVE', isActive: true }) },
      invoiceDraft: {
        findUnique: async () => stored,
        update: async ({ data }: any) => ({ ...stored, ...data }),
      },
      invoiceDraftLine: { update: async () => ({}) },
    } as any;
    // switching to NORMAL_VAT without a rate → controlled 422
    await expect(patchDraft(admin, 'draft-1', { vatTreatment: 'NORMAL_VAT' }, db))
      .rejects.toMatchObject({ status: 422, code: 'INVOICE_VAT_RATE_REQUIRED' });
  });

  it('patchDraftLine rejects blank descriptions with a controlled 400', async () => {
    const stored = {
      id: 'draft-1', billingPreparationId: 'prep-1', currency: 'HUF', status: 'DRAFT',
      customerTaxNumberRequirement: 'REQUIRED', vatTreatment: 'NORMAL_VAT', vatRate: D('27'),
      lines: [{ id: 'line-1', description: 'Eredeti', netAmount: D('1'), vatAmount: D('0'), grossAmount: D('1') }],
    };
    const db = {
      user: { findUnique: async () => ({ role: 'ADMIN', status: 'ACTIVE', isActive: true }) },
      invoiceDraft: { findUnique: async () => stored },
      invoiceDraftLine: { update: async () => { throw new Error('must not persist null'); } },
    } as any;
    await expect(patchDraftLine(admin, 'draft-1', 'line-1', { description: '   ' }, db))
      .rejects.toMatchObject({ status: 400, code: 'INVOICE_DRAFT_INPUT_INVALID' });
  });

  it('discardDraft only removes DRAFT rows', async () => {
    let deleted = false;
    const db = {
      user: { findUnique: async () => ({ role: 'ADMIN', status: 'ACTIVE', isActive: true }) },
      invoiceDraft: {
        findUnique: async () => ({ id: 'draft-1', status: 'DRAFT', billingPreparationId: 'prep-1', lines: [] }),
        delete: async () => { deleted = true; },
      },
    } as any;
    const result = await discardDraft(admin, 'draft-1', db);
    expect(result).toEqual({ discarded: true, billingPreparationId: 'prep-1' });
    expect(deleted).toBe(true);
    await expect(discardDraft(admin, 'draft-1', dbFor({ invoiceDraft: { findUnique: async () => null } }).db))
      .rejects.toMatchObject({ status: 404, code: 'INVOICE_DRAFT_NOT_FOUND' });
  });
});
