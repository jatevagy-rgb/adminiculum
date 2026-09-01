import express, { Express, NextFunction, Request, Response } from 'express';
import http from 'http';
import { PrismaClient } from '@prisma/client';

/**
 * Time -> Billing Preparation -> Client Reporting convergence (PostgreSQL).
 *
 * Case-first time entry (server-derived compatibility Matter), task/work-package
 * provenance, attribution-safe case reporting, billing preparation (no invented
 * fee), report snapshot stability, DOCX generation, and authorization.
 */
const databaseUrl = process.env.TIME_BILLING_TEST_DATABASE_URL || process.env.MIGRATION_REPLAY_DATABASE_URL;
const describeWithDatabase = databaseUrl ? describe : describe.skip;

jest.mock('../src/middleware/auth', () => ({
  ROLES: { ADMIN: 'ADMIN', PARTNER: 'PARTNER', LAWYER: 'LAWYER', CLIENT: 'CLIENT' },
  authenticate: (req: Request, res: Response, next: NextFunction) => {
    const userId = req.headers['x-test-user-id'];
    if (typeof userId !== 'string') { res.status(401).json({ code: 'NOT_AUTHENTICATED' }); return; }
    req.user = { userId, email: 'tb@example.invalid', role: String(req.headers['x-test-role'] || 'LAWYER') as any, authProvider: 'local-jwt' };
    next();
  },
}));

import timeEntriesRoutes from '../src/routes/timeEntries';
import billingPreparationRoutes from '../src/modules/billing-preparation/routes';
import { getCaseBillingPreparation } from '../src/modules/billing-preparation/service';
import { timesheetReportService } from '../src/modules/timesheet-reports/service';

const P = 'tb-';
const ids = {
  lawyer: `${P}user-lawyer-0000000000000000000000001`,
  outsider: `${P}user-outsider-000000000000000000001`,
  clientA: `${P}client-a-00000000000000000000000001`,
  clientB: `${P}client-b-00000000000000000000000001`,
  multiMatter: `${P}matter-multi-00000000000000000000001`,
  otherMatter: `${P}matter-other-00000000000000000000001`,
  primaryCase: `${P}case-primary-00000000000000000000001`,
  siblingCase: `${P}case-sibling-00000000000000000000001`,
  noMatterCase: `${P}case-nomatter-0000000000000000000001`,
  otherCase: `${P}case-other-000000000000000000000001`,
  workPackage: `${P}wp-primary-0000000000000000000000001`,
  workPackageItem: `${P}wpi-primary-000000000000000000000001`,
  primaryTask: `${P}task-primary-00000000000000000000001`,
  siblingTask: `${P}task-sibling-00000000000000000000001`,
};

const PERIOD = '2026-07';
const WORKDATE = '2026-07-15';

type TestResponse = { status: number; body: any };

function createApp(): Express {
  const app = express();
  app.use(express.json());
  app.use('/time-entries', timeEntriesRoutes);
  app.use('/billing-preparation', billingPreparationRoutes);
  return app;
}

function request(method: 'POST' | 'GET', path: string, body: Record<string, unknown> | null, headers: Record<string, string>): Promise<TestResponse> {
  return new Promise((resolve, reject) => {
    const app = createApp();
    const server = app.listen(0, '127.0.0.1', () => {
      const address = server.address();
      if (!address || typeof address === 'string') return reject(new Error('no address'));
      const payload = body ? JSON.stringify(body) : '';
      const req = http.request({
        hostname: '127.0.0.1', port: address.port, path, method,
        headers: { 'content-type': 'application/json', 'content-length': Buffer.byteLength(payload), ...headers },
      }, (response) => {
        const chunks: Buffer[] = [];
        response.on('data', (c) => chunks.push(Buffer.from(c)));
        response.on('end', () => { server.close(); const text = Buffer.concat(chunks).toString('utf8'); resolve({ status: response.statusCode || 0, body: text ? JSON.parse(text) : null }); });
      });
      req.on('error', (e) => { server.close(); reject(e); });
      req.end(payload);
    });
  });
}

describeWithDatabase('Time -> billing preparation -> client reporting convergence (PostgreSQL)', () => {
  let db: PrismaClient;
  const lawyerHeaders = { 'x-test-user-id': ids.lawyer, 'x-test-role': 'LAWYER' };

  beforeAll(async () => {
    db = new PrismaClient({ datasources: { db: { url: databaseUrl } } });
    await db.$connect();
    await db.user.createMany({ data: [
      { id: ids.lawyer, email: `${P}lawyer@example.invalid`, name: 'TB Lawyer', role: 'LAWYER', status: 'ACTIVE', isActive: true, skills: [] },
      { id: ids.outsider, email: `${P}outsider@example.invalid`, name: 'TB Outsider', role: 'LAWYER', status: 'ACTIVE', isActive: true, skills: [] },
    ] });
    await db.client.createMany({ data: [{ id: ids.clientA, name: 'TB Client A' }, { id: ids.clientB, name: 'TB Client B' }] });
    await db.matter.createMany({ data: [
      { id: ids.multiMatter, title: 'TB multi-case matter', matterType: 'CONTRACT', clientId: ids.clientA },
      { id: ids.otherMatter, title: 'TB other-client matter', matterType: 'CONTRACT', clientId: ids.clientB },
    ] });
    await db.case.createMany({ data: [
      { id: ids.primaryCase, caseNumber: 'TB-PRIMARY-001', title: 'TB primary case', caseType: 'CONTRACT_REVIEW', clientId: ids.clientA, matterId: ids.multiMatter, createdById: ids.lawyer, assignedLawyerId: ids.lawyer },
      { id: ids.siblingCase, caseNumber: 'TB-SIBLING-001', title: 'TB sibling case', caseType: 'CONTRACT_REVIEW', clientId: ids.clientA, matterId: ids.multiMatter, createdById: ids.lawyer, assignedLawyerId: ids.lawyer },
      { id: ids.noMatterCase, caseNumber: 'TB-NOMATTER-001', title: 'TB no-matter case', caseType: 'CONTRACT_REVIEW', clientId: ids.clientA, createdById: ids.lawyer, assignedLawyerId: ids.lawyer },
      { id: ids.otherCase, caseNumber: 'TB-OTHER-001', title: 'TB other-client case', caseType: 'CONTRACT_REVIEW', clientId: ids.clientB, matterId: ids.otherMatter, createdById: ids.outsider, assignedLawyerId: ids.outsider },
    ] });
    await db.caseWorkPackage.create({ data: { id: ids.workPackage, caseId: ids.primaryCase, createdById: ids.lawyer } });
    await db.caseWorkPackageItem.create({ data: { id: ids.workPackageItem, caseWorkPackageId: ids.workPackage, moduleType: 'TASK_GROUP', moduleKey: 'tb', label: 'TB', order: 1, createdById: ids.lawyer } });
    await db.task.createMany({ data: [
      { id: ids.primaryTask, title: 'TB primary task', taskType: 'OTHER', status: 'IN_PROGRESS', priority: 'MEDIUM', requiredSkills: [], caseId: ids.primaryCase, matterId: ids.multiMatter, assignedToId: ids.lawyer, assignedById: ids.lawyer, workPackageItemId: ids.workPackageItem },
      { id: ids.siblingTask, title: 'TB sibling task', taskType: 'OTHER', status: 'IN_PROGRESS', priority: 'MEDIUM', requiredSkills: [], caseId: ids.siblingCase, matterId: ids.multiMatter, assignedToId: ids.lawyer, assignedById: ids.lawyer },
    ] });
  }, 60_000);

  afterAll(async () => {
    if (!db) return;
    await db.timesheetReportArtifact.deleteMany({ where: { reportInstance: { clientId: { in: [ids.clientA, ids.clientB] } } } }).catch(() => {});
    await db.timesheetReportInstance.deleteMany({ where: { clientId: { in: [ids.clientA, ids.clientB] } } }).catch(() => {});
    await db.timelineEvent.deleteMany({ where: { caseId: { in: [ids.primaryCase, ids.siblingCase, ids.noMatterCase, ids.otherCase] } } }).catch(() => {});
    await db.timeEntry.deleteMany({ where: { matterId: { in: [ids.multiMatter, ids.otherMatter] } } }).catch(() => {});
    await db.task.deleteMany({ where: { id: { startsWith: P } } }).catch(() => {});
    await db.caseWorkPackageItem.deleteMany({ where: { id: { startsWith: P } } }).catch(() => {});
    await db.caseWorkPackage.deleteMany({ where: { id: { startsWith: P } } }).catch(() => {});
    await db.case.deleteMany({ where: { id: { startsWith: P } } }).catch(() => {});
    await db.matter.deleteMany({ where: { id: { startsWith: P } } }).catch(() => {});
    await db.client.deleteMany({ where: { id: { startsWith: P } } }).catch(() => {});
    await db.user.deleteMany({ where: { id: { startsWith: P } } }).catch(() => {});
    await db.$disconnect();
  });

  it('case-first: records time on a Case without a Matter, deriving the compatibility scope server-side', async () => {
    const res = await request('POST', '/time-entries', { workType: 'DRAFTING', description: 'Case-first work', minutes: 20, caseId: ids.primaryCase, workDate: WORKDATE }, lawyerHeaders);
    expect(res.status).toBe(201);
    expect(res.body.matterId).toBe(ids.multiMatter); // derived, never supplied
    expect(res.body.taskId).toBeNull();
  });

  it('fails safely when a Case has no resolvable Matter compatibility scope', async () => {
    const res = await request('POST', '/time-entries', { workType: 'DRAFTING', description: 'Unscoped', minutes: 10, caseId: ids.noMatterCase, workDate: WORKDATE }, lawyerHeaders);
    expect(res).toMatchObject({ status: 409, body: { code: 'TIME_ENTRY_CASE_MATTER_UNRESOLVED' } });
  });

  it('task provenance: task-derived entry keeps taskId and work-package-linked case scope', async () => {
    const res = await request('POST', '/time-entries', { workType: 'DRAFTING', description: 'Billable task work', minutes: 60, taskId: ids.primaryTask, workDate: WORKDATE }, lawyerHeaders);
    expect(res.status).toBe(201);
    expect(res.body.taskId).toBe(ids.primaryTask);
    expect(res.body.matterId).toBe(ids.multiMatter);
    // Seed the remaining fixtures for reporting/billing:
    await db.timeEntry.create({ data: { matterId: ids.multiMatter, taskId: ids.primaryTask, workType: 'DRAFTING', description: 'Non-billable task work', minutes: 30, billable: false, workDate: new Date(WORKDATE), userId: ids.lawyer } });
    await db.timeEntry.create({ data: { matterId: ids.multiMatter, taskId: ids.siblingTask, workType: 'DRAFTING', description: 'Sibling case work', minutes: 45, billable: true, workDate: new Date(WORKDATE), userId: ids.lawyer } });
    await db.timeEntry.create({ data: { matterId: ids.otherMatter, workType: 'DRAFTING', description: 'Other client work', minutes: 99, billable: true, workDate: new Date(WORKDATE), userId: ids.outsider } });
  });

  it('billing preparation: attributes billable/non-billable, keeps ambiguous as review, invents no fee', async () => {
    const prep = await getCaseBillingPreparation(ids.primaryCase, {}, db);
    expect(prep).toBeTruthy();
    expect(prep!.billableMinutes).toBe(60);      // task billable only
    expect(prep!.nonBillableMinutes).toBe(30);   // task non-billable
    expect(prep!.needsReviewMinutes).toBe(20 + 45); // case-first ambiguous + sibling-case time
    expect(prep!.attributedMinutes).toBe(90);
    expect(prep!.rateStatus).toBe('RATE_NOT_CONFIGURED');
    expect(prep!.feeEstimate).toBeNull();
    expect(prep!.billingReadiness).toBe('READY_FOR_BILLING');
  });

  it('unresolved-scope case reports CASE_SCOPE_UNRESOLVED billing readiness', async () => {
    const prep = await getCaseBillingPreparation(ids.noMatterCase, {}, db);
    expect(prep!.billingReadiness).toBe('CASE_SCOPE_UNRESOLVED');
    expect(prep!.billableMinutes).toBe(0);
  });

  it('billing preparation is workforce-only and case-scoped (client blocked, outsider blocked)', async () => {
    const asClient = await request('GET', `/billing-preparation/case/${ids.primaryCase}`, null, { 'x-test-user-id': ids.lawyer, 'x-test-role': 'CLIENT' });
    expect(asClient).toMatchObject({ status: 403, body: { code: 'WORKFORCE_ACCESS_REQUIRED' } });
    const asOutsider = await request('GET', `/billing-preparation/case/${ids.primaryCase}`, null, { 'x-test-user-id': ids.outsider, 'x-test-role': 'LAWYER' });
    expect(asOutsider.status).toBe(403);
    const asLawyer = await request('GET', `/billing-preparation/case/${ids.primaryCase}`, null, lawyerHeaders);
    expect(asLawyer.status).toBe(200);
    expect(asLawyer.body.feeEstimate).toBeNull();
  });

  it('case report autofill includes only safely attributable time and no rate field', async () => {
    const autofill = await timesheetReportService.autofillRows({ reportPeriod: PERIOD, caseId: ids.primaryCase });
    const descriptions = autofill.rows.map((r) => r.description);
    expect(descriptions).toContain('Billable task work');
    expect(descriptions).toContain('Non-billable task work');
    expect(descriptions).not.toContain('Sibling case work');   // sibling-case excluded
    expect(descriptions).not.toContain('Case-first work');      // ambiguous excluded
    expect(descriptions).not.toContain('Other client work');    // other client excluded
    // Client-facing rows never carry rate/billing internals.
    expect(Object.keys(autofill.rows[0])).toEqual(expect.arrayContaining(['date', 'description', 'lawyer', 'hours']));
    expect(autofill.rows.every((r) => !('rate' in (r as any)) && !('fee' in (r as any)))).toBe(true);
  });

  it('billableOnly autofill narrows to billable attributable time', async () => {
    const autofill = await timesheetReportService.autofillRows({ reportPeriod: PERIOD, caseId: ids.primaryCase, billableOnly: true });
    expect(autofill.rows.map((r) => r.description)).toEqual(['Billable task work']);
  });

  it('generated report instance snapshots rows and is stable after a later TimeEntry edit; DOCX artifact belongs to it; no auto-publish', async () => {
    const autofill = await timesheetReportService.autofillRows({ reportPeriod: PERIOD, caseId: ids.primaryCase });
    const instance = await timesheetReportService.createInstance({
      templateId: 'timesheet-corporate-summary-v1', reportPeriod: PERIOD, clientId: ids.clientA, clientName: 'TB Client A', caseId: ids.primaryCase, rows: autofill.rows,
    });
    expect(instance.status).toBe('DRAFT');                 // generation does not auto-publish
    const snapshotHours = instance.totalsSnapshot.totalHours;
    const snapshotRowCount = instance.rows.length;

    // DOCX artifact belongs to this instance.
    await timesheetReportService.renderDocxInstance(instance.id);
    const artifacts = await db.timesheetReportArtifact.findMany({ where: { reportInstanceId: instance.id } });
    expect(artifacts.length).toBeGreaterThan(0);
    expect(artifacts.every((a) => a.reportInstanceId === instance.id)).toBe(true);
    const docx = artifacts.find((a) => a.format === 'DOCX_V1');
    expect(docx?.contentBase64 && docx.contentBase64.length > 0).toBe(true);

    // Later TimeEntry edit must NOT rewrite the generated snapshot.
    const anEntry = await db.timeEntry.findFirst({ where: { taskId: ids.primaryTask, billable: true } });
    await db.timeEntry.update({ where: { id: anEntry!.id }, data: { minutes: 999 } });
    const reloaded = await db.timesheetReportInstance.findUniqueOrThrow({ where: { id: instance.id } });
    expect((reloaded.rows as any[]).length).toBe(snapshotRowCount);
    expect((reloaded.totalsSnapshot as any).totalHours).toBe(snapshotHours);
    // restore for isolation
    await db.timeEntry.update({ where: { id: anEntry!.id }, data: { minutes: 60 } });
  });

  it('unauthorized user cannot mutate another user time entry', async () => {
    const entry = await db.timeEntry.findFirst({ where: { taskId: ids.primaryTask } });
    const res = await request('POST', '/time-entries', { workType: 'DRAFTING', description: 'x', minutes: 5, taskId: ids.primaryTask }, { 'x-test-user-id': ids.outsider, 'x-test-role': 'LAWYER' });
    expect(res.status).toBe(404); // outsider cannot even see the task
    expect(entry).toBeTruthy();
  });
});
