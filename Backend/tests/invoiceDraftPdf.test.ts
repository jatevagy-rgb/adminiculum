import { Prisma } from '@prisma/client';
import { spawnSync } from 'node:child_process';
import { getDraftPdf } from '../src/modules/invoice-drafts/service';

const D = (value: string) => new Prisma.Decimal(value);

function line(overrides: Record<string, unknown> = {}) {
  return {
    id: 'line-1',
    draftId: 'draft-1',
    billingItemId: 'item-1',
    sortOrder: 0,
    description: 'Szerződés előkészítése – őűáé unicode — 1:30 óra · 50 000 Ft/óra',
    quantity: D('1'),
    unit: 'tétel',
    netUnitPrice: D('75000'),
    netAmount: D('75000'),
    vatTreatment: 'NORMAL_VAT',
    vatRate: D('27'),
    vatAmount: D('20250'),
    grossAmount: D('95250'),
    sourceWorkDate: new Date('2026-09-02T00:00:00.000Z'),
    caseNumber: 'U-2026/1',
    caseTitle: 'Szerződés ügy',
    workerName: 'Ügyvéd Éva',
    billingMinutes: 90,
    hourlyRate: D('50000'),
    ...overrides,
  };
}

function draft(overrides: Record<string, unknown> = {}) {
  return {
    id: 'draft-1',
    billingPreparationId: 'prep-1',
    currency: 'HUF',
    status: 'DRAFT',
    issuerLegalName: 'Bálintfy és Társai Ügyvédi Iroda',
    issuerAddress: '1051 Budapest, Fő utca 1.',
    issuerTaxNumber: '87654321-1-41',
    issuerEuVatNumber: null,
    issuerRegistrationNumber: null,
    issuerBankName: 'Teszt Bank',
    issuerBankAccountNumber: '11111111-22222222',
    issuerEmail: null,
    issuerPhone: null,
    customerTaxNumberRequirement: 'REQUIRED',
    customerTaxNumberCanonical: true,
    customerName: 'Őrült Ügyfél Kft.',
    customerAddress: '1052 Budapest, Példa utca 4.',
    customerTaxNumber: '12345678-2-42',
    customerVatNumber: 'HU12345678',
    performanceDate: new Date('2026-09-30T00:00:00.000Z'),
    draftDate: new Date('2026-10-01T00:00:00.000Z'),
    paymentDueDate: new Date('2026-10-15T00:00:00.000Z'),
    paymentMethod: 'átutalás',
    note: 'Tervezeti megjegyzés',
    vatTreatment: 'NORMAL_VAT',
    vatRate: D('27'),
    lines: [line()],
    ...overrides,
  };
}

function dbFor(value: unknown, role = 'ADMIN') {
  return {
    user: { findUnique: async () => ({ role, status: 'ACTIVE', isActive: true }) },
    invoiceDraft: { findUnique: async () => value },
    // The draft PDF must render from the persisted snapshot only.
    get timeEntry() { throw new Error('DRAFT PDF MUST NOT READ LIVE TIMEENTRY'); },
    get client() { throw new Error('DRAFT PDF MUST NOT RE-READ LIVE CLIENT'); },
    get billingPreparation() { throw new Error('DRAFT PDF MUST NOT RE-READ PREPARATION'); },
  } as any;
}

async function pdfText(bytes: Buffer) {
  // pdf-parse uses ESM workers. Run it in a plain Node child (not Jest's VM)
  // against the in-memory bytes, so this proves the actual PDF text layer.
  const script = `const { PDFParse } = require('pdf-parse'); const chunks=[]; process.stdin.on('data', c=>chunks.push(c)); process.stdin.on('end', async()=>{ const parser=new PDFParse({data:Buffer.concat(chunks)}); try { const text=await parser.getText(); process.stdout.write(JSON.stringify({text:text.text,pages:text.pages})); } finally { await parser.destroy(); } });`;
  const result = spawnSync(process.execPath, ['-e', script], { input: bytes, encoding: 'utf8', timeout: 30_000 });
  if (result.status !== 0) throw new Error(result.stderr || 'pdf-parse child process failed');
  return JSON.parse(result.stdout) as { text: string; pages: unknown[] };
}

describe('T6A invoice-draft PDF (SZÁMLATERVEZET — NEM SZÁMLA)', () => {
  const admin = { userId: 'admin-1', role: 'ADMIN' } as any;

  it('renders a complete draft face + annex with Hungarian Unicode, and never an invoice identity', async () => {
    const pdf = await getDraftPdf(admin, 'draft-1', dbFor(draft()));
    expect(pdf.subarray(0, 4).toString()).toBe('%PDF');
    const { text } = await pdfText(pdf);

    expect(text).toContain('SZÁMLATERVEZET');
    expect(text).toContain('NEM SZÁMLA');
    expect(text).toContain('nem minősül kiállított számlának');
    expect(text).toContain('SZÁLLÍTÓ');
    expect(text).toContain('VEVŐ');
    expect(text).toContain('Bálintfy és Társai Ügyvédi Iroda');
    expect(text).toContain('Őrült Ügyfél Kft.');
    expect(text).toContain('12345678-2-42');
    expect(text).toContain('Teljesítés dátuma');
    expect(text).toContain('Fizetési határidő');
    expect(text).toContain('átutalás');
    expect(text).toContain('HUF');
    expect(text).toContain('Megnevezés');
    expect(text).toContain('Bruttó végösszeg');
    expect(text).toContain('95 250 Ft');
    expect(text).toContain('Szerződés előkészítése');
    expect(text).toContain('ELSZÁMOLÁSI MELLÉKLET');
    expect(text).toContain('Ügyvéd Éva');
    expect(text).toContain('1:30');
    expect(text).toContain('tétel');

    // Legal safety: no official invoice identity, no NAV wording.
    expect(text).not.toContain('Számlaszám'); // exact-case: "Bankszámlaszám" is legitimate
    expect(text).not.toMatch(/Számla sorszáma/i);
    expect(text).not.toContain('NAV');
    expect(text).not.toMatch(/tranzakciós azonosító/i);
    // No internal billing-review technical data on the document.
    expect(text).not.toContain('prep-1');
    expect(text).not.toContain('draft-1');
    expect(text).not.toContain('REVIEW_REQUIRED');
  });

  it('denies non-reviewers and reports missing fields instead of rendering', async () => {
    await expect(getDraftPdf({ userId: 'l', role: 'LAWYER' } as any, 'draft-1', dbFor(draft(), 'LAWYER')))
      .rejects.toMatchObject({ status: 403, code: 'BILLING_ACCESS_FORBIDDEN' });
    await expect(getDraftPdf(admin, 'missing', dbFor(null)))
      .rejects.toMatchObject({ status: 404, code: 'INVOICE_DRAFT_NOT_FOUND' });
    const incomplete = draft({ customerTaxNumber: null, performanceDate: null });
    await expect(getDraftPdf(admin, 'draft-1', dbFor(incomplete)))
      .rejects.toMatchObject({
        status: 422,
        code: 'INVOICE_DRAFT_INCOMPLETE',
        missing: expect.arrayContaining(['Ügyfél adószáma', 'Teljesítés dátuma']),
      });
    // private individual: tax number legitimately not applicable
    const individual = draft({ customerTaxNumber: null, customerTaxNumberRequirement: 'NOT_APPLICABLE' });
    expect((await getDraftPdf(admin, 'draft-1', dbFor(individual))).subarray(0, 4).toString()).toBe('%PDF');
    // unconfirmed applicability blocks until a reviewer resolves it
    await expect(getDraftPdf(admin, 'draft-1', dbFor(draft({ customerTaxNumberRequirement: 'UNCONFIRMED' }))))
      .rejects.toMatchObject({ status: 422, code: 'INVOICE_DRAFT_INCOMPLETE', missing: expect.arrayContaining(['Vevő adószámának alkalmazhatósága']) });
  });

  it('renders correctly without a logo and marks non-normal VAT treatments explicitly', async () => {
    const pdf = await getDraftPdf(admin, 'draft-1', dbFor(draft({
      vatTreatment: 'TAX_EXEMPT', vatRate: null,
      lines: [line({ vatTreatment: 'TAX_EXEMPT', vatRate: null, vatAmount: D('0'), grossAmount: D('75000') })],
    })));
    const { text } = await pdfText(pdf);
    expect(text).toContain('SZÁMLATERVEZET');
    expect(text).toContain('Mentes');
    expect(text).toContain('mentes az adó alól');
  });
});
