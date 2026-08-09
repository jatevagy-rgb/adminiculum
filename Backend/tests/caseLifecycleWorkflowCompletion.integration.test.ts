import { PrismaClient } from '@prisma/client';
import crypto from 'crypto';
import { deriveTaskCapabilities } from '../src/modules/cases/workItems';

// ---- Defect 1: pure capability logic (no DB) --------------------------------
describe('Workflow-step vs document-review completion capability (Defect 1)', () => {
  const wf = { status: 'IN_REVIEW', assignedToId: 'u1', assignedById: 'u2', workflowInstanceId: 'wfi-1' };
  const doc = { status: 'IN_REVIEW', assignedToId: 'u1', assignedById: 'u2' };

  it('a workflow-step assignee CAN complete their own step', () => {
    expect(deriveTaskCapabilities(wf, 'u1', 'LAWYER').canApprove).toBe(true);
    expect(deriveTaskCapabilities(wf, 'u1', 'LAWYER').canReturnForCorrection).toBe(true);
  });
  it('a document-review task still requires an INDEPENDENT reviewer (no self-approval)', () => {
    expect(deriveTaskCapabilities(doc, 'u1', 'LAWYER').canApprove).toBe(false);
  });
  it('an independent reviewer can approve a document-review task', () => {
    expect(deriveTaskCapabilities(doc, 'u3', 'ADMIN').canApprove).toBe(true);
  });
  it('a workflow-step supervisor can approve even without a reviewer role', () => {
    expect(deriveTaskCapabilities(wf, 'u2', 'LEGAL_ASSISTANT').canApprove).toBe(true);
  });
});

// ---- Integration (PostgreSQL): end-to-end completion + forced close ---------
const databaseUrl = process.env.WORKFLOW_TEST_DATABASE_URL
  || process.env.PUBLICATION_TEST_DATABASE_URL
  || process.env.CLIENT_IDENTITY_TEST_DATABASE_URL;
const d = databaseUrl ? describe : describe.skip;

d('Workflow completion + forced case close (PostgreSQL)', () => {
  let db: PrismaClient;
  let orch: typeof import('../src/modules/cases/caseWorkflowOrchestration');
  let tasks: typeof import('../src/modules/tasks/services');
  let lifecycle: typeof import('../src/modules/cases/lifecycleService');

  const admin = crypto.randomUUID();
  const gyula = crypto.randomUUID();
  const amanda = crypto.randomUUID();
  const csanad = crypto.randomUUID();
  const client = crypto.randomUUID();

  beforeAll(async () => {
    process.env.DATABASE_URL = databaseUrl;
    orch = await import('../src/modules/cases/caseWorkflowOrchestration');
    tasks = await import('../src/modules/tasks/services');
    lifecycle = await import('../src/modules/cases/lifecycleService');
    db = new PrismaClient({ datasources: { db: { url: databaseUrl } } });
    await db.$connect();
    await db.user.createMany({ data: [
      { id: admin, email: `lc-admin-${admin}@t.io`, name: 'Admin', role: 'ADMIN', status: 'ACTIVE', isActive: true, skills: [] },
      { id: gyula, email: `lc-gyula-${gyula}@t.io`, name: 'Gyula', role: 'LAWYER', status: 'ACTIVE', isActive: true, skills: [] },
      { id: amanda, email: `lc-amanda-${amanda}@t.io`, name: 'Amanda', role: 'LAWYER', status: 'ACTIVE', isActive: true, skills: [] },
      { id: csanad, email: `lc-csanad-${csanad}@t.io`, name: 'Csanad', role: 'LAWYER', status: 'ACTIVE', isActive: true, skills: [] },
    ] as never });
    await db.client.create({ data: { id: client, name: 'LC Client' } });
  });
  afterAll(async () => { await db?.$disconnect(); });

  async function freshTriadCase() {
    const caseId = crypto.randomUUID();
    await db.case.create({ data: { id: caseId, caseNumber: `LC-${caseId.slice(0, 6)}`, title: 'LC case', caseType: 'CONTRACT_REVIEW', clientId: client, createdById: gyula, assignedLawyerId: gyula } as never });
    await orch.instantiateCaseWorkflow({
      caseId, templateKey: 'CONTRACT_REVIEW_TRIAD', actor: { userId: gyula },
      assigneesByStepKey: { 'legal-review': gyula, 'compliance-check': amanda, 'partner-final-review': csanad },
      fallbackAssigneeId: gyula,
    }, db);
    const rows = await db.task.findMany({ where: { caseId } as never }) as any[];
    return {
      caseId,
      A: rows.find((t) => t.workflowStepKey === 'legal-review'),
      B: rows.find((t) => t.workflowStepKey === 'compliance-check'),
      C: rows.find((t) => t.workflowStepKey === 'partner-final-review'),
    };
  }

  it('completes workflow steps through the ordinary lifecycle and activates C exactly once', async () => {
    const { caseId, A, B, C } = await freshTriadCase();
    // A: TODO -> IN_PROGRESS -> IN_REVIEW -> DONE (assignee gyula drives + completes)
    await tasks.startTask(A.id, gyula);
    await tasks.submitTask(A.id, gyula);
    await tasks.completeTask(A.id, gyula, true);
    expect(String((await db.task.findUnique({ where: { id: A.id } }) as any).status)).toBe('DONE');
    // C still blocked (only 1/2 predecessors done).
    expect(String((await db.task.findUnique({ where: { id: C.id } }) as any).status)).toBe('BLOCKED');

    // B: complete via admin (independent) — also allowed for a workflow step.
    await tasks.startTask(B.id, amanda);
    await tasks.submitTask(B.id, amanda);
    await tasks.completeTask(B.id, admin, true);
    expect(String((await db.task.findUnique({ where: { id: B.id } }) as any).status)).toBe('DONE');

    // C activates exactly once.
    const cAfter = await db.task.findUnique({ where: { id: C.id } }) as any;
    expect(String(cAfter.status)).toBe('TODO');
    expect(cAfter.workflowActivatedAt).toBeTruthy();
    void caseId;
  });

  it('blocks an ordinary close while workflow tasks are open, and a forced close cancels them (Defect 2)', async () => {
    const { caseId } = await freshTriadCase();
    // Non-forced close is blocked by the open workflow tasks.
    await expect(lifecycle.closeCase(caseId, { userId: gyula, role: 'LAWYER' }, {}))
      .rejects.toMatchObject({ code: 'CLOSURE_BLOCKED' });

    // Forced close cancels every open task and finalizes the case.
    await lifecycle.closeCase(caseId, { userId: gyula, role: 'LAWYER' }, { force: true });
    const openAfter = await db.task.count({ where: { caseId, status: { notIn: ['DONE', 'COMPLETED', 'CANCELLED'] } } as never });
    expect(openAfter).toBe(0);
    const caseRow = await db.case.findUnique({ where: { id: caseId } }) as any;
    expect(['FINAL', 'ARCHIVED']).toContain(String(caseRow.status));
    // No successor was activated by the cancellation (C was cancelled, not DONE).
    const anyActivatedByCancel = await db.task.count({ where: { caseId, status: 'TODO', workflowActivatedAt: { not: null } } as never });
    expect(anyActivatedByCancel).toBe(0);

    // Then archive succeeds (CLOSED -> ARCHIVED).
    await lifecycle.archiveCase(caseId, { userId: gyula, role: 'LAWYER' });
    expect(String((await db.case.findUnique({ where: { id: caseId } }) as any).status)).toBe('ARCHIVED');
  });
});
