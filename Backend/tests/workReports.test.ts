import { spawnSync } from 'node:child_process';
import {
  buildCaseReport,
  bucketCaseEntries,
  listReportCases,
  parsePeriodQuery,
  projectClientWorkReportExport,
} from '../src/modules/work-reports/service';
import { renderClientWorkReportPdf } from '../src/modules/work-reports/pdf';
import type { ClientWorkReport } from '../src/modules/work-reports/types';

// ── fixtures ────────────────────────────────────────────────────────────────

function entry(overrides: Record<string, unknown> = {}): any {
  return {
    id: 'te-1',
    workDate: new Date('2026-09-01T00:00:00.000Z'),
    minutes: 60,
    billable: true,
    description: 'Szerződés tervezet előkészítése',
    workType: 'DRAFTING',
    caseId: null,
    matterId: null,
    createdAt: new Date('2026-09-01T10:00:00.000Z'),
    matter: null,
    user: { id: 'user-1', name: 'Ügyvéd Éva' },
    department: null,
    task: null,
    ...overrides,
  } as any;
}

function matterOf(id: string, caseIds: string[]): any {
  return { id, title: 'Munkaügyi ügytárgy', cases: caseIds.map((caseId) => ({ id: caseId })) };
}

function caseRecord(overrides: Record<string, unknown> = {}): any {
  return {
    id: 'case-1',
    caseNumber: 'U-2026/12',
    title: 'Munkaszerződés módosítás',
    status: 'IN_REVIEW',
    completedAt: null,
    matterId: 'matter-1',
    client: { id: 'client-1', name: 'Minta Kft.' },
    matter: { id: 'matter-1', title: 'Munkaügyi ügytárgy' },
    assignedLawyer: { id: 'lawyer-1', name: 'Dr. Kovács Péter' },
    ...overrides,
  } as any;
}

function dbFor(caseRow: any, entries: any[] = [], safeUpdates: any[] = [], extra: Record<string, unknown> = {}): any {
  const extraCase = (extra.case ?? {}) as Record<string, unknown>;
  const extraClient = (extra.client ?? {}) as Record<string, unknown>;
  const extraTimeEntry = (extra.timeEntry ?? {}) as Record<string, unknown>;
  const extraSafeUpdate = (extra.clientSafeUpdate ?? {}) as Record<string, unknown>;
  return {
    case: { findUnique: async () => caseRow, findMany: async () => (caseRow ? [caseRow] : []), ...extraCase },
    client: { findUnique: async () => ({ id: caseRow?.client?.id ?? 'client-1', name: caseRow?.client?.name ?? 'Minta Kft.' }), ...extraClient },
    timeEntry: { findMany: async () => entries, ...extraTimeEntry },
    clientSafeUpdate: { findMany: async () => safeUpdates, ...extraSafeUpdate },
  } as any;
}

const PERIOD_ALL = { startDate: null, endDate: null, dto: { startDate: null, endDate: null } };

const FORBIDDEN_KEY = /\b(rate|hourlyRate|rateVersion|rateScope|rateOverride|netAmount|vatRate|vatAmount|grossAmount|unitPrice|price|fee|amount|currency|adjustment|billing|invoice|money)\b/i;

function assertNoForbiddenKeys(value: unknown, path = '$'): void {
  if (Array.isArray(value)) {
    value.forEach((item, index) => assertNoForbiddenKeys(item, `${path}[${index}]`));
    return;
  }
  if (value !== null && typeof value === 'object') {
    for (const [key, child] of Object.entries(value as Record<string, unknown>)) {
      expect(key).not.toMatch(FORBIDDEN_KEY);
      assertNoForbiddenKeys(child, `${path}.${key}`);
    }
  }
}

async function pdfText(bytes: Buffer): Promise<{ text: string; pages: unknown[] }> {
  const script = `const { PDFParse } = require('pdf-parse'); const chunks=[]; process.stdin.on('data', c=>chunks.push(c)); process.stdin.on('end', async()=>{ const parser=new PDFParse({data:Buffer.concat(chunks)}); try { const text=await parser.getText(); process.stdout.write(JSON.stringify({text:text.text,pages:text.pages})); } finally { await parser.destroy(); } });`;
  const result = spawnSync(process.execPath, ['-e', script], { input: bytes, encoding: 'utf8', timeout: 30_000 });
  if (result.status !== 0) throw new Error(result.stderr || 'pdf-parse child process failed');
  return JSON.parse(result.stdout) as { text: string; pages: unknown[] };
}

// ── DTO rate-freeness ───────────────────────────────────────────────────────

describe('rate-free client work report DTO', () => {
  it('contains no rate/amount/billing fields anywhere in the projection', async () => {
    const report = await buildCaseReport(dbFor(caseRecord(), [entry({ caseId: 'case-1', matterId: 'matter-1', matter: matterOf('matter-1', ['case-1']) })]), { caseId: 'case-1', period: PERIOD_ALL });
    expect(report).not.toBeNull();
    expect(report!.kind).toBe('CLIENT_WORK_REPORT_V1');
    assertNoForbiddenKeys(report);
    expect(report!.case.recordedMinutes).toBe(60);
  });

  it('exposes only allowlisted row fields (no billable flag, no ids beyond facts)', () => {
    const row = {
      timeEntryId: 'te-1', workDate: '2026-09-01', workerName: 'Ügyvéd Éva', workType: 'DRAFTING',
      workTypeLabel: 'Szerkesztés', description: 'Szerződés', minutes: 60, hours: 1,
      attributionKind: 'EXACT_CASE', requesterName: null, requesterJobTitle: null,
      organizationGroupName: null, departmentName: null, taskTitle: null,
    };
    assertNoForbiddenKeys(row);
    expect(Object.keys(row)).toEqual([
      'timeEntryId', 'workDate', 'workerName', 'workType', 'workTypeLabel', 'description',
      'minutes', 'hours', 'attributionKind', 'requesterName', 'requesterJobTitle',
      'organizationGroupName', 'departmentName', 'taskTitle',
    ]);
  });
});

// ── aggregation & attribution ───────────────────────────────────────────────

describe('case time aggregation', () => {
  it('aggregates normal exact-case entries into recorded time', async () => {
    const rows = [
      entry({ id: 'te-1', caseId: 'case-1', matterId: 'matter-1', matter: matterOf('matter-1', ['case-1']), minutes: 60 }),
      entry({ id: 'te-2', caseId: 'case-1', matterId: 'matter-1', matter: matterOf('matter-1', ['case-1']), minutes: 90, workDate: new Date('2026-09-02T00:00:00.000Z') }),
    ];
    const report = await buildCaseReport(dbFor(caseRecord(), rows), { caseId: 'case-1', period: PERIOD_ALL });
    expect(report!.case.recordedMinutes).toBe(150);
    expect(report!.case.recordedEntryCount).toBe(2);
    expect(report!.rows.map((row) => row.timeEntryId)).toEqual(['te-1', 'te-2']);
    expect(report!.rows[0].hours).toBe(1);
    expect(report!.rows[1].hours).toBe(1.5);
    expect(report!.case.zeroTime).toBe(false);
  });

  it('aggregates task-derived case time via the canonical task link', async () => {
    const task = {
      id: 'task-1', title: 'Szerződés tervezet', caseId: 'case-1', matterId: 'matter-1',
      workPackageItem: null, requestedByOrganizationPerson: null,
    };
    const rows = [
      entry({ id: 'te-1', caseId: null, matterId: 'matter-1', matter: matterOf('matter-1', ['case-1']), minutes: 45, task }),
    ];
    const report = await buildCaseReport(dbFor(caseRecord(), rows), { caseId: 'case-1', period: PERIOD_ALL });
    expect(report!.case.recordedMinutes).toBe(45);
    expect(report!.rows[0].attributionKind).toBe('TASK_DERIVED_CASE');
  });

  it('never silently assigns ambiguous historical time', async () => {
    // Matter has two cases; the entry is matter-only (no case, no task).
    const rows = [
      entry({ id: 'te-1', caseId: null, matterId: 'matter-1', matter: matterOf('matter-1', ['case-1', 'case-2']), minutes: 75 }),
    ];
    const report = await buildCaseReport(dbFor(caseRecord(), rows), { caseId: 'case-1', period: PERIOD_ALL });
    expect(report!.case.recordedMinutes).toBe(0);
    expect(report!.rows).toHaveLength(0);
    expect(report!.case.ambiguousMinutes).toBe(75);
    expect(report!.ambiguousRows).toHaveLength(1);
    expect(report!.ambiguousRows[0].attributionKind).toBe('AMBIGUOUS');
  });

  it('puts attributed non-billable entries into the excluded bucket, never the total', async () => {
    const rows = [
      entry({ id: 'te-1', caseId: 'case-1', matterId: 'matter-1', matter: matterOf('matter-1', ['case-1']), minutes: 30, billable: false }),
      entry({ id: 'te-2', caseId: 'case-1', matterId: 'matter-1', matter: matterOf('matter-1', ['case-1']), minutes: 60 }),
    ];
    const report = await buildCaseReport(dbFor(caseRecord(), rows), { caseId: 'case-1', period: PERIOD_ALL });
    expect(report!.case.recordedMinutes).toBe(60);
    expect(report!.case.excludedMinutes).toBe(30);
    expect(report!.excludedRows).toHaveLength(1);
    expect(report!.rows).toHaveLength(1);
  });

  it('skips rows resolved to a sibling case in a multi-case matter', () => {
    const caseRow = caseRecord({ matterId: 'matter-1' });
    const rows = [
      entry({ id: 'te-1', caseId: 'case-2', matterId: 'matter-1', matter: matterOf('matter-1', ['case-1', 'case-2']), minutes: 50 }),
    ];
    const buckets = bucketCaseEntries(caseRow, rows);
    expect(buckets.recordedRows).toHaveLength(0);
    expect(buckets.ambiguousRows).toHaveLength(0);
    expect(buckets.excludedRows).toHaveLength(0);
  });

  it('represents a closed case with zero time honestly', async () => {
    const closed = caseRecord({ status: 'FINAL', completedAt: new Date('2026-09-15T00:00:00.000Z') });
    const report = await buildCaseReport(dbFor(closed, []), { caseId: 'case-1', period: PERIOD_ALL });
    expect(report).not.toBeNull();
    expect(report!.case.zeroTime).toBe(true);
    expect(report!.case.isClosed).toBe(true);
    expect(report!.case.recordedMinutes).toBe(0);
    expect(report!.rows).toHaveLength(0);
  });
});

// ── provenance ──────────────────────────────────────────────────────────────

describe('requester / workgroup / department provenance', () => {
  it('shows canonical requester and group provenance when persisted', async () => {
    const task = {
      id: 'task-1', title: 'HR kérés feldolgozása', caseId: 'case-1', matterId: 'matter-1', workPackageItem: null,
      requestedByOrganizationPerson: {
        id: 'op-1', name: 'Nagy Réka', jobTitle: 'HR vezető',
        organizationGroup: { id: 'g-1', name: 'HR' },
      },
    };
    const rows = [
      entry({
        id: 'te-1', caseId: null, matterId: 'matter-1', matter: matterOf('matter-1', ['case-1']), minutes: 40, task,
        department: { id: 'd-1', name: 'Munkajog' },
      }),
    ];
    const report = await buildCaseReport(dbFor(caseRecord(), rows), { caseId: 'case-1', period: PERIOD_ALL });
    expect(report!.rows[0].requesterName).toBe('Nagy Réka');
    expect(report!.rows[0].requesterJobTitle).toBe('HR vezető');
    expect(report!.rows[0].organizationGroupName).toBe('HR');
    expect(report!.rows[0].departmentName).toBe('Munkajog');
    expect(report!.case.requesterNames).toEqual(['Nagy Réka']);
    expect(report!.case.organizationGroupNames).toEqual(['HR']);
    expect(report!.case.departmentNames).toEqual(['Munkajog']);
  });

  it('keeps missing provenance explicitly unknown (null, never guessed)', async () => {
    const rows = [entry({ id: 'te-1', caseId: 'case-1', matterId: 'matter-1', matter: matterOf('matter-1', ['case-1']), minutes: 20 })];
    const report = await buildCaseReport(dbFor(caseRecord({ assignedLawyer: null }), rows), { caseId: 'case-1', period: PERIOD_ALL });
    expect(report!.rows[0].requesterName).toBeNull();
    expect(report!.rows[0].organizationGroupName).toBeNull();
    expect(report!.rows[0].departmentName).toBeNull();
    expect(report!.case.responsibleLawyerName).toBeNull();
    expect(report!.case.requesterNames).toEqual([]);
  });
});

// ── client-safe detail ──────────────────────────────────────────────────────

describe('client-safe matter detail', () => {
  it('includes only PUBLISHED client-safe updates, never drafts or revoked rows', async () => {
    const safeUpdates = [
      { id: 'su-1', caseId: 'case-1', title: 'Állapotfrissítés', body: 'Az ügy lezárult.', category: 'STATUS', status: 'PUBLISHED', publishedAt: new Date('2026-09-10T00:00:00.000Z') },
      { id: 'su-2', caseId: 'case-1', title: 'Belső vázlat', body: 'NE LEGYEN KINN', category: 'GENERAL', status: 'DRAFT', publishedAt: null },
    ];
    const db = {
      case: { findUnique: async () => caseRecord() },
      timeEntry: { findMany: async () => [] },
      clientSafeUpdate: { findMany: async () => safeUpdates },
    } as any;
    const report = await buildCaseReport(db, { caseId: 'case-1', period: PERIOD_ALL });
    expect(report!.safeUpdates).toHaveLength(1);
    expect(report!.safeUpdates[0].title).toBe('Állapotfrissítés');
    expect(report!.safeUpdates[0].categoryLabel).toBe('Állapot');
  });
});

// ── client scoping & listing ────────────────────────────────────────────────

describe('closed-case discovery and client scoping', () => {
  it('lists closed cases even with zero time and keeps other-client rows out', async () => {
    const closedZero = caseRecord({ id: 'case-closed', status: 'ARCHIVED' });
    const otherClientCase = caseRecord({ id: 'case-other', client: { id: 'client-2', name: 'Másik Kft.' }, matterId: 'matter-other', matter: { id: 'matter-other', title: 'Más ügytárgy' } });
    const db = {
      client: { findUnique: async () => ({ id: 'client-1', name: 'Minta Kft.' }) },
      case: { findMany: async () => [closedZero, otherClientCase] },
      timeEntry: { findMany: async () => [] },
    } as any;
    const result = await listReportCases(db, { clientId: 'client-1', period: PERIOD_ALL, viewer: { userId: 'admin-1', role: 'ADMIN' } });
    expect(result).not.toBeNull();
    expect(result!.cases.map((item) => item.caseId)).toEqual(['case-closed']);
    expect(result!.cases[0].zeroTime).toBe(true);
    expect(result!.cases[0].isClosed).toBe(true);
  });

  it('never returns a client list for a missing client', async () => {
    const db = {
      client: { findUnique: async () => null },
      case: { findMany: async () => [] },
      timeEntry: { findMany: async () => [] },
    } as any;
    const result = await listReportCases(db, { clientId: 'ghost', period: PERIOD_ALL, viewer: { userId: 'admin-1', role: 'ADMIN' } });
    expect(result).toBeNull();
  });

  it('validates period days strictly', () => {
    expect(parsePeriodQuery({ startDate: '2026-09-01', endDate: '2026-09-30' })).toMatchObject({ dto: { startDate: '2026-09-01', endDate: '2026-09-30' } });
    expect(parsePeriodQuery({ startDate: 'not-a-date' })).toMatchObject({ invalid: true });
    expect(parsePeriodQuery({ startDate: '2026-12-01', endDate: '2026-09-01' })).toMatchObject({ invalid: true });
  });
});

// ── PDF ─────────────────────────────────────────────────────────────────────

const AMBIG_MARKER = 'BELSŐ-TITOK-AMBIG-7F3A';
const EXCLUDED_MARKER = 'BELSŐ-TITOK-KIZÁRT-9C21';

describe('rate-free work-report PDF', () => {
  async function sampleReport(): Promise<ClientWorkReport> {
    const task = {
      id: 'task-1', title: 'HR kérés feldolgozása', caseId: 'case-1', matterId: 'matter-1', workPackageItem: null,
      requestedByOrganizationPerson: {
        id: 'op-1', name: 'Nagy Réka', jobTitle: 'HR vezető',
        organizationGroup: { id: 'g-1', name: 'HR' },
      },
    };
    const rows = [
      entry({ id: 'te-1', caseId: 'case-1', matterId: 'matter-1', matter: matterOf('matter-1', ['case-1']), minutes: 60, workDate: new Date('2026-09-01T00:00:00.000Z') }),
      entry({ id: 'te-2', caseId: null, matterId: 'matter-1', matter: matterOf('matter-1', ['case-1']), minutes: 30, workDate: new Date('2026-09-02T00:00:00.000Z'), task }),
      entry({ id: 'te-3', caseId: null, matterId: 'matter-1', matter: matterOf('matter-1', ['case-1', 'case-2']), minutes: 75, workDate: new Date('2026-09-03T00:00:00.000Z'), description: `Két ügyre is illik ${AMBIG_MARKER}` }),
      entry({ id: 'te-4', caseId: 'case-1', matterId: 'matter-1', matter: matterOf('matter-1', ['case-1']), minutes: 95, billable: false, description: `Belső egyeztetés ${EXCLUDED_MARKER}` }),
    ];
    const safeUpdates = [
      { id: 'su-1', caseId: 'case-1', title: 'Állapotfrissítés', body: 'Az ügy lezárult.', category: 'STATUS', status: 'PUBLISHED', publishedAt: new Date('2026-09-10T00:00:00.000Z') },
    ];
    const db = {
      case: { findUnique: async () => caseRecord() },
      timeEntry: { findMany: async () => rows },
      clientSafeUpdate: { findMany: async () => safeUpdates },
    } as any;
    const report = await buildCaseReport(db, { caseId: 'case-1', period: { startDate: null, endDate: null, dto: { startDate: '2026-09-01', endDate: '2026-09-30' } } });
    return report!;
  }

  it('renders the client work report and prints no rate, amount, or VAT anywhere', async () => {
    const pdf = await renderClientWorkReportPdf(projectClientWorkReportExport(await sampleReport()));
    expect(pdf.subarray(0, 4).toString()).toBe('%PDF');
    const parsed = await pdfText(pdf);
    const text = parsed.text.replace(/\s+/g, ' ');
    expect(text).toContain('ÜGYFÉL MUNKAJELENTÉS');
    expect(text).toContain('Szerződés tervezet előkészítése');
    expect(text).toContain('Nagy Réka');
    expect(text).toContain('HR');
    expect(text).toContain('ÜGYSZÁM');
    expect(text).toContain('1 ó 30 p');
    expect(text).toContain('ÜGYFÉLNEK KÖZZÉTETT TÁJÉKOZTATÁSOK');
    expect(text).toContain('nem számla');
    for (const forbidden of ['Óradíj', 'Nettó', 'ÁFA', 'Bruttó', 'Ft', 'HUF', 'óradíj', 'nettó']) {
      expect(text).not.toContain(forbidden);
    }
  });

  it('is deterministic for the same frozen report snapshot', async () => {
    const report = projectClientWorkReportExport(await sampleReport());
    const first = await pdfText(await renderClientWorkReportPdf(report));
    const second = await pdfText(await renderClientWorkReportPdf(report));
    expect(second.text).toBe(first.text);
    expect(second.pages.length).toBe(first.pages.length);
  });

  it('keeps the projection reproducible after source changes (snapshot semantics)', async () => {
    const db = {
      case: { findUnique: async () => caseRecord() },
      timeEntry: { findMany: async () => [entry({ id: 'te-1', caseId: 'case-1', matterId: 'matter-1', matter: matterOf('matter-1', ['case-1']), minutes: 45 })] },
      clientSafeUpdate: { findMany: async () => [] },
    } as any;
    const first = await buildCaseReport(db, { caseId: 'case-1', period: PERIOD_ALL });
    const second = await buildCaseReport(db, { caseId: 'case-1', period: PERIOD_ALL });
    const strip = (report: ClientWorkReport) => JSON.stringify({ ...report, generatedAt: null });
    expect(strip(second!)).toBe(strip(first!));
  });
});

// ── client-export boundary ──────────────────────────────────────────────────

describe('client-export boundary (internal diagnostics never reach the client PDF)', () => {
  async function markerReport(): Promise<ClientWorkReport> {
    const task = {
      id: 'task-1', title: 'HR kérés feldolgozása', caseId: 'case-1', matterId: 'matter-1', workPackageItem: null,
      requestedByOrganizationPerson: {
        id: 'op-1', name: 'Nagy Réka', jobTitle: 'HR vezető',
        organizationGroup: { id: 'g-1', name: 'HR' },
      },
    };
    const rows = [
      entry({ id: 'te-1', caseId: 'case-1', matterId: 'matter-1', matter: matterOf('matter-1', ['case-1']), minutes: 60, workDate: new Date('2026-09-01T00:00:00.000Z') }),
      entry({ id: 'te-2', caseId: null, matterId: 'matter-1', matter: matterOf('matter-1', ['case-1']), minutes: 30, workDate: new Date('2026-09-02T00:00:00.000Z'), task }),
      entry({ id: 'te-3', caseId: null, matterId: 'matter-1', matter: matterOf('matter-1', ['case-1', 'case-2']), minutes: 75, workDate: new Date('2026-09-03T00:00:00.000Z'), description: `Két ügyre is illik ${AMBIG_MARKER}` }),
      entry({ id: 'te-4', caseId: 'case-1', matterId: 'matter-1', matter: matterOf('matter-1', ['case-1']), minutes: 95, billable: false, description: `Belső egyeztetés ${EXCLUDED_MARKER}` }),
    ];
    const db = {
      case: { findUnique: async () => caseRecord() },
      timeEntry: { findMany: async () => rows },
      clientSafeUpdate: { findMany: async () => [] },
    } as any;
    const report = await buildCaseReport(db, { caseId: 'case-1', period: PERIOD_ALL });
    return report!;
  }

  it('keeps ambiguous and excluded records in the internal review response', async () => {
    const report = await markerReport();
    const serialized = JSON.stringify(report);
    expect(report.ambiguousRows.map((row) => row.description)).toContain(`Két ügyre is illik ${AMBIG_MARKER}`);
    expect(report.excludedRows.map((row) => row.description)).toContain(`Belső egyeztetés ${EXCLUDED_MARKER}`);
    expect(serialized).toContain(AMBIG_MARKER);
    expect(serialized).toContain(EXCLUDED_MARKER);
    expect(report.case.recordedMinutes).toBe(90);
    expect(report.case.ambiguousMinutes).toBe(75);
    expect(report.case.excludedMinutes).toBe(95);
  });

  it('excludes ambiguous and excluded rows and aggregates from the client-export DTO', async () => {
    const exportReport = projectClientWorkReportExport(await markerReport());
    expect(Object.keys(exportReport)).toEqual(['kind', 'client', 'period', 'case', 'rows', 'safeUpdates', 'generatedAt']);
    expect(Object.keys(exportReport.case)).toEqual([
      'caseId', 'caseNumber', 'caseTitle', 'caseStatusLabel', 'completedAt', 'matter',
      'responsibleLawyerName', 'requesterNames', 'organizationGroupNames', 'departmentNames',
      'recordedMinutes', 'recordedEntryCount',
    ]);
    const serialized = JSON.stringify(exportReport);
    expect(serialized).not.toContain(AMBIG_MARKER);
    expect(serialized).not.toContain(EXCLUDED_MARKER);
    expect(serialized).not.toContain('ambiguous');
    expect(serialized).not.toContain('excluded');
    expect(exportReport.rows.map((row) => row.timeEntryId)).toEqual(['te-1', 'te-2']);
    expect(exportReport.case.recordedMinutes).toBe(90);
    assertNoForbiddenKeys(exportReport);
  });

  it('never prints ambiguous or excluded content in the client PDF', async () => {
    const pdf = await renderClientWorkReportPdf(projectClientWorkReportExport(await markerReport()));
    const text = (await pdfText(pdf)).text.replace(/\s+/g, ' ');
    expect(text).not.toContain(AMBIG_MARKER);
    expect(text).not.toContain(EXCLUDED_MARKER);
    expect(text).not.toContain('Belső egyeztetés');
    expect(text).not.toContain('BIZONYTALAN HOZZÁRENDELÉSŰ IDŐ');
    expect(text).not.toContain('KIZÁRT MUNKAIDŐ');
    expect(text).not.toContain('belső jellegű');
    expect(text).not.toContain('nem szerepel az összegben');
  });

  it('client PDF totals equal included time only', async () => {
    const pdf = await renderClientWorkReportPdf(projectClientWorkReportExport(await markerReport()));
    const text = (await pdfText(pdf)).text.replace(/\s+/g, ' ');
    expect(text).toContain('1 ó 30 p');
    expect(text).not.toContain('1 ó 15 p');
    expect(text).not.toContain('1 ó 35 p');
    expect(text).toContain('RÖGZÍTETT BEJEGYZÉSEK 2');
  });

  it('preserves the honest zero-time message for a report with no includable rows', async () => {
    const closed = caseRecord({ status: 'FINAL', completedAt: new Date('2026-09-15T00:00:00.000Z') });
    const db = {
      case: { findUnique: async () => closed },
      timeEntry: { findMany: async () => [] },
      clientSafeUpdate: { findMany: async () => [] },
    } as any;
    const report = await buildCaseReport(db, { caseId: 'case-1', period: PERIOD_ALL });
    expect(report!.rows).toHaveLength(0);
    const pdf = await renderClientWorkReportPdf(projectClientWorkReportExport(report!));
    const text = (await pdfText(pdf)).text.replace(/\s+/g, ' ');
    expect(text).toContain('nincs rögzített');
    expect(text).not.toContain(AMBIG_MARKER);
    expect(text).not.toContain(EXCLUDED_MARKER);
  });

  it('still prints published safe updates in the client PDF', async () => {
    const db = {
      case: { findUnique: async () => caseRecord() },
      timeEntry: { findMany: async () => [entry({ id: 'te-1', caseId: 'case-1', matterId: 'matter-1', matter: matterOf('matter-1', ['case-1']), minutes: 60 })] },
      clientSafeUpdate: { findMany: async () => [{ id: 'su-1', caseId: 'case-1', title: 'Állapotfrissítés', body: 'Az ügy lezárult.', category: 'STATUS', status: 'PUBLISHED', publishedAt: new Date('2026-09-10T00:00:00.000Z') }] },
    } as any;
    const report = await buildCaseReport(db, { caseId: 'case-1', period: PERIOD_ALL });
    const pdf = await renderClientWorkReportPdf(projectClientWorkReportExport(report!));
    const text = (await pdfText(pdf)).text.replace(/\s+/g, ' ');
    expect(text).toContain('ÜGYFÉLNEK KÖZZÉTETT TÁJÉKOZTATÁSOK');
    expect(text).toContain('Állapotfrissítés');
    expect(text).toContain('Az ügy lezárult.');
  });
});
