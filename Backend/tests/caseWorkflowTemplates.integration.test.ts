import { PrismaClient } from '@prisma/client';
import crypto from 'crypto';

// The template service uses the shared prisma singleton (DATABASE_URL at import).
// Set it before dynamically importing the modules under test.
const databaseUrl = process.env.WORKFLOW_TEST_DATABASE_URL
  || process.env.PUBLICATION_TEST_DATABASE_URL
  || process.env.CLIENT_IDENTITY_TEST_DATABASE_URL;
const d = databaseUrl ? describe : describe.skip;

d('Workflow templates + DAG instantiation (PostgreSQL)', () => {
  let db: PrismaClient;
  let orch: typeof import('../src/modules/cases/caseWorkflowOrchestration');
  let svc: typeof import('../src/modules/cases/workflowTemplateService');

  const admin = crypto.randomUUID();
  const gyula = crypto.randomUUID();
  const amanda = crypto.randomUUID();
  const csanad = crypto.randomUUID();
  const client = crypto.randomUUID();
  const caseId = crypto.randomUUID();
  const actor = { userId: gyula };

  beforeAll(async () => {
    process.env.DATABASE_URL = databaseUrl;
    orch = await import('../src/modules/cases/caseWorkflowOrchestration');
    svc = await import('../src/modules/cases/workflowTemplateService');
    db = new PrismaClient({ datasources: { db: { url: databaseUrl } } });
    await db.$connect();
    await db.user.createMany({ data: [
      { id: admin, email: `wf-admin-${admin}@t.io`, name: 'WF Admin', role: 'ADMIN', status: 'ACTIVE', isActive: true, skills: [] },
      { id: gyula, email: `wf-gyula-${gyula}@t.io`, name: 'Gyula', role: 'LAWYER', status: 'ACTIVE', isActive: true, skills: [] },
      { id: amanda, email: `wf-amanda-${amanda}@t.io`, name: 'Amanda', role: 'LAWYER', status: 'ACTIVE', isActive: true, skills: [] },
      { id: csanad, email: `wf-csanad-${csanad}@t.io`, name: 'Csanad', role: 'LAWYER', status: 'ACTIVE', isActive: true, skills: [] },
    ] as never });
    await db.client.create({ data: { id: client, name: 'WF Client' } });
    await db.case.create({ data: { id: caseId, caseNumber: `WF-${caseId.slice(0, 6)}`, title: 'WF case', caseType: 'CONTRACT_REVIEW', clientId: client, createdById: gyula, assignedLawyerId: gyula } as never });
  });

  afterAll(async () => { await db?.$disconnect(); });

  it('instantiates the built-in A/B->C triad with correct BLOCKED/TODO + candidate flags', async () => {
    const { workflowInstanceId } = await orch.instantiateCaseWorkflow({
      caseId,
      templateKey: 'CONTRACT_REVIEW_TRIAD',
      actor,
      assigneesByStepKey: { 'legal-review': gyula, 'compliance-check': amanda, 'partner-final-review': csanad },
      fallbackAssigneeId: gyula,
    }, db);
    const tasks = await db.task.findMany({ where: { workflowInstanceId } as never, orderBy: { createdAt: 'asc' } }) as any[];
    const byKey = new Map(tasks.map((t) => [t.workflowStepKey, t]));
    expect(String(byKey.get('legal-review').status)).toBe('TODO');
    expect(String(byKey.get('compliance-check').status)).toBe('TODO');
    expect(String(byKey.get('partner-final-review').status)).toBe('BLOCKED');
    expect(byKey.get('partner-final-review').workflowDependsOnKeys.sort()).toEqual(['compliance-check', 'legal-review']);
    // Assignees mapped by step.
    expect(byKey.get('legal-review').assignedToId).toBe(gyula);
    expect(byKey.get('compliance-check').assignedToId).toBe(amanda);
    expect(byKey.get('partner-final-review').assignedToId).toBe(csanad);
    // Milestone candidates: A + C are candidates, B is not.
    expect(byKey.get('legal-review').workflowPublicMilestoneCandidate).toBe(true);
    expect(byKey.get('compliance-check').workflowPublicMilestoneCandidate).toBe(false);
    expect(byKey.get('partner-final-review').workflowPublicMilestoneCandidate).toBe(true);
  });

  it('activates C exactly once, only after BOTH A and B are done', async () => {
    // Fresh instance to isolate from the previous test.
    const { workflowInstanceId } = await orch.instantiateCaseWorkflow({
      caseId, templateKey: 'CONTRACT_REVIEW_TRIAD', actor,
      assigneesByStepKey: { 'legal-review': gyula, 'compliance-check': amanda, 'partner-final-review': csanad },
      fallbackAssigneeId: gyula,
    }, db);
    const tasks = await db.task.findMany({ where: { workflowInstanceId } as never }) as any[];
    const A = tasks.find((t) => t.workflowStepKey === 'legal-review');
    const B = tasks.find((t) => t.workflowStepKey === 'compliance-check');
    const C = tasks.find((t) => t.workflowStepKey === 'partner-final-review');

    // Complete A only -> C stays BLOCKED.
    await db.task.update({ where: { id: A.id }, data: { status: 'DONE' } as never });
    const r1 = await orch.activateReadyWorkflowSuccessors(A.id, actor, db);
    expect(r1.activated).not.toContain(C.id);
    expect(String((await db.task.findUnique({ where: { id: C.id } }) as any).status)).toBe('BLOCKED');

    // Complete B -> C activates exactly once.
    await db.task.update({ where: { id: B.id }, data: { status: 'DONE' } as never });
    const r2 = await orch.activateReadyWorkflowSuccessors(B.id, actor, db);
    expect(r2.activated).toContain(C.id);
    const cAfter = await db.task.findUnique({ where: { id: C.id } }) as any;
    expect(String(cAfter.status)).toBe('TODO');
    const activatedAt = cAfter.workflowActivatedAt;
    expect(activatedAt).toBeTruthy();

    // Re-running does not re-activate (idempotent).
    const r3 = await orch.activateReadyWorkflowSuccessors(B.id, actor, db);
    expect(r3.activated).not.toContain(C.id);
    const cFinal = await db.task.findUnique({ where: { id: C.id } }) as any;
    expect(cFinal.workflowActivatedAt.getTime()).toBe(new Date(activatedAt).getTime());
  });

  it('enforces DAG validation, version immutability and DB-template instantiation', async () => {
    // Cycle rejected on create.
    await expect(svc.createWorkflowTemplate(admin, {
      name: 'Ciklus', steps: [
        { key: 'a', title: 'A', dependsOn: ['b'] },
        { key: 'b', title: 'B', dependsOn: ['a'] },
      ],
    })).rejects.toMatchObject({ code: 'WORKFLOW_CYCLE_DETECTED' });

    // Create a valid DRAFT, activate it.
    const draft = await svc.createWorkflowTemplate(admin, {
      name: 'Peres triász', key: `wf-accept-${caseId.slice(0, 6)}`,
      steps: [
        { key: 'intake', title: 'Beérkezés', dependsOn: [], publicMilestoneCandidate: true, suggestedMilestoneTitle: 'Az ügy elindult', suggestedWeight: 40 },
        { key: 'final', title: 'Zárás', dependsOn: ['intake'], publicMilestoneCandidate: true, suggestedWeight: 60 },
      ],
    });
    expect(draft.status).toBe('DRAFT');
    const activated = await svc.activateWorkflowTemplate(admin, draft.id);
    expect(activated.status).toBe('ACTIVE');

    // An ACTIVE (used) version is immutable — editing must be denied.
    await expect(svc.updateWorkflowTemplateDraft(admin, draft.id, { name: 'x' }))
      .rejects.toMatchObject({ code: 'WORKFLOW_TEMPLATE_IMMUTABLE' });

    // New version is a fresh DRAFT with the incremented version number.
    const v2 = await svc.createWorkflowTemplateVersion(admin, draft.id, {});
    expect(v2.version).toBe(2);
    expect(v2.status).toBe('DRAFT');

    // Selection list includes the active custom template (DB wins over builtins).
    const selectable = await svc.listWorkflowTemplatesForSelection();
    const mine = selectable.find((t) => t.key === draft.key);
    expect(mine).toBeTruthy();
    expect(mine!.source).toBe('custom');

    // Instantiating the DB template increments usage and snapshots key+version.
    const inst = await orch.instantiateCaseWorkflow({ caseId, templateKey: draft.key, actor, fallbackAssigneeId: gyula }, db);
    expect(inst.templateKey).toBe(draft.key);
    const instTasks = await db.task.findMany({ where: { workflowInstanceId: inst.workflowInstanceId } as never }) as any[];
    expect(instTasks.map((t) => t.workflowStepKey).sort()).toEqual(['final', 'intake']);
    const usedRow = await db.workflowTemplate.findUnique({ where: { id: draft.id } });
    expect(usedRow!.usageCount).toBeGreaterThanOrEqual(1);
  });
});
