import { Prisma } from '@prisma/client';
import { spawnSync } from 'node:child_process';
import { getPreparationPdf } from '../src/modules/billing-preparations/service';

const D = (value: string) => new Prisma.Decimal(value);

function item(overrides: Record<string, unknown> = {}) {
  return {
    id: 'row-1', preparationId: 'prep-1', sourceTimeEntryId: 'time-entry-that-must-not-be-read', sourceFingerprint: 'private',
    sourceWorkDate: new Date('2026-09-01T00:00:00.000Z'), sourceMinutes: 60, sourceBillable: true,
    sourceDescription: 'Szerződés előkészítése – Őrült ügyfél – űrlap', sourceWorkType: 'DRAFTING',
    workerId: 'worker-1', workerName: 'Ügyvéd Éva', caseId: 'case-1', caseNumber: 'U-2026/1', caseTitle: 'Szerződés',
    taskId: null, taskTitle: null, requesterId: null, requesterName: null, requesterJobTitle: null,
    organizationGroupId: null, organizationGroupName: null, departmentId: null, departmentName: null, attributionKind: 'EXACT_CASE',
    rateVersionId: 'rate-private', rateScope: 'CASE', hourlyRate: D('50000'), rateCurrency: 'HUF',
    included: true, billingMinutes: 60, invoiceDescription: null, rateOverride: null, rateOverrideReason: null,
    rateOverrideById: null, rateOverrideAt: null, adjustmentReason: null, reviewedAt: null, reviewedById: null,
    netAmount: D('50000'), createdAt: new Date(), updatedAt: new Date(), updatedById: 'admin-1', ...overrides,
  } as any;
}

function preparation(status: 'OPEN' | 'CLOSED' = 'CLOSED', items = [item()]) {
  return {
    id: 'prep-1', clientId: 'client-1', periodStart: new Date('2026-09-01T00:00:00.000Z'), periodEnd: new Date('2026-09-30T00:00:00.000Z'),
    currency: 'HUF', calculationPolicyVersion: 'PER_ENTRY_MINUTES_X_RATE_HALF_UP_2DP_V1', status,
    createdAt: new Date(), updatedAt: new Date(), createdById: 'admin-1', closedAt: status === 'CLOSED' ? new Date() : null,
    closedById: status === 'CLOSED' ? 'admin-1' : null, client: { name: 'Őrült Ügyfél Kft.' }, items,
  } as any;
}

function dbFor(prep: any, role = 'ADMIN') {
  return {
    user: { findUnique: async () => ({ role, status: 'ACTIVE', isActive: true }) },
    billingPreparation: { findUnique: async () => prep },
    // Export is forbidden from accessing current TimeEntry rows.
    get timeEntry() { throw new Error('PDF export must not read live TimeEntry'); },
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

describe('closed billing-preparation PDF snapshot export', () => {
  const admin = { userId: 'admin-1', role: 'ADMIN' } as any;

  it('fails closed for OPEN, denies non-reviewers, and reports missing preparations', async () => {
    await expect(getPreparationPdf(admin, 'prep-1', dbFor(preparation('OPEN')))).rejects.toMatchObject({ status: 409, code: 'BILLING_PREP_PDF_REQUIRES_CLOSED' });
    await expect(getPreparationPdf({ userId: 'lawyer-1', role: 'LAWYER' }, 'prep-1', dbFor(preparation(), 'LAWYER'))).rejects.toMatchObject({ status: 403, code: 'BILLING_ACCESS_FORBIDDEN' });
    await expect(getPreparationPdf(admin, 'missing', dbFor(null))).rejects.toMatchObject({ status: 404, code: 'BILLING_PREP_NOT_FOUND' });
  });

  it('renders only included, persisted rows and totals with Hungarian Unicode', async () => {
    const excluded = item({ id: 'excluded', included: false, sourceDescription: 'KIZÁRT BELSŐ TÉTEL', billingMinutes: 90, netAmount: D('75000') });
    const overridden = item({ id: 'override', invoiceDescription: 'Rögzített egyedi díjas munka', rateOverride: D('61000'), netAmount: D('61000') });
    const pdf = await getPreparationPdf(admin, 'prep-1', dbFor(preparation('CLOSED', [item(), excluded, overridden])));
    expect(pdf.subarray(0, 4).toString()).toBe('%PDF');
    const text = await pdfText(pdf);
    expect(text.text).toContain('SZÁMLÁZÁSI ÖSSZESÍTŐ');
    expect(text.text).toContain('Szerződés előkészítése – Őrült ügyfél – űrlap');
    expect(text.text).toContain('Rögzített egyedi díjas munka');
    expect(text.text).not.toContain('KIZÁRT BELSŐ TÉTEL');
    expect(text.text).toContain('Óradíj');
    expect(text.text).toContain('61 000 Ft');
    expect(text.text).toContain('Összes számlázandó idő: 2:00 óra');
    expect(text.text).toContain('Összes nettó: 111 000 Ft');
  });

  it('allows PARTNER and paginates long captured descriptions without live-source reads', async () => {
    const rows = Array.from({ length: 48 }, (_, index) => item({
      id: `row-${index}`, sourceDescription: `Hosszú rögzített leírás ${index}: ${'szöveg '.repeat(24)}`,
    }));
    const pdf = await getPreparationPdf({ userId: 'partner-1', role: 'PARTNER' } as any, 'prep-1', dbFor(preparation('CLOSED', rows), 'PARTNER'));
    const parsed = await pdfText(pdf);
    expect(parsed.pages.length).toBeGreaterThan(1);
    expect(parsed.text).toContain('Hosszú rögzített leírás 47');
  });
});
