import { randomUUID } from 'crypto';
import { prisma as defaultPrisma } from '../../prisma/prisma.service';

type Prisma = typeof defaultPrisma;
type Actor = { userId: string };

export class CaseWorkflowError extends Error {
  constructor(public status: number, public code: string, message: string) {
    super(message);
    this.name = 'CaseWorkflowError';
  }
}

type WorkflowStep = {
  key: string;
  title: string;
  assigneeId?: string | null;
  dependsOn?: string[];
  publicMilestoneCandidate?: boolean;
};

export const WORKFLOW_TEMPLATES: Record<string, { key: string; name: string; version: number; steps: WorkflowStep[] }> = {
  SIMPLE: {
    key: 'SIMPLE',
    name: 'Egyszerű ügyintézés',
    version: 1,
    steps: [{ key: 'responsible-review', title: 'Ügyindító áttekintés', dependsOn: [], publicMilestoneCandidate: true }],
  },
  CONTRACT_REVIEW_TRIAD: {
    key: 'CONTRACT_REVIEW_TRIAD',
    name: 'Szerződés-review',
    version: 1,
    steps: [
      { key: 'legal-review', title: 'Szerződés első jogi átnézése', dependsOn: [], publicMilestoneCandidate: true },
      { key: 'compliance-check', title: 'Ügyfél- és compliance-ellenőrzés', dependsOn: [], publicMilestoneCandidate: false },
      { key: 'partner-final-review', title: 'Végső partneri review', dependsOn: ['legal-review', 'compliance-check'], publicMilestoneCandidate: true },
    ],
  },
};

export function validateWorkflowDag(steps: WorkflowStep[]): void {
  const keys = new Set(steps.map((step) => step.key));
  if (keys.size !== steps.length) throw new CaseWorkflowError(400, 'WORKFLOW_DUPLICATE_STEP', 'Workflow step keys must be unique.');
  for (const step of steps) {
    for (const dependency of step.dependsOn || []) {
      if (dependency === step.key) throw new CaseWorkflowError(400, 'WORKFLOW_SELF_DEPENDENCY', 'A workflow step cannot depend on itself.');
      if (!keys.has(dependency)) throw new CaseWorkflowError(400, 'WORKFLOW_DEPENDENCY_MISSING', 'Workflow dependency must reference a step in the same workflow.');
    }
  }
  const visiting = new Set<string>();
  const visited = new Set<string>();
  const byKey = new Map(steps.map((step) => [step.key, step]));
  const visit = (key: string) => {
    if (visited.has(key)) return;
    if (visiting.has(key)) throw new CaseWorkflowError(400, 'WORKFLOW_CYCLE_DETECTED', 'Workflow dependencies must be acyclic.');
    visiting.add(key);
    for (const dependency of byKey.get(key)?.dependsOn || []) visit(dependency);
    visiting.delete(key);
    visited.add(key);
  };
  for (const key of keys) visit(key);
}

export async function instantiateCaseWorkflow(input: {
  caseId: string;
  templateKey?: string | null;
  actor: Actor;
  assigneesByStepKey?: Record<string, string | null | undefined>;
  fallbackAssigneeId?: string | null;
}, db: Prisma = defaultPrisma) {
  const template = WORKFLOW_TEMPLATES[input.templateKey || 'SIMPLE'] || WORKFLOW_TEMPLATES.SIMPLE;
  validateWorkflowDag(template.steps);
  const workflowInstanceId = randomUUID();
  const now = new Date();
  const tasks = [];
  for (const step of template.steps) {
    const dependencies = step.dependsOn || [];
    tasks.push(await db.task.create({
      data: {
        caseId: input.caseId,
        title: step.title,
        taskType: 'OTHER',
        type: 'CASE_WORKFLOW_STEP',
        priority: 'MEDIUM',
        status: dependencies.length ? 'BLOCKED' : 'TODO',
        assignedToId: input.assigneesByStepKey?.[step.key] || step.assigneeId || input.fallbackAssigneeId || null,
        assignedById: input.actor.userId,
        requiredSkills: [],
        workflowEvent: 'CASE_WORKFLOW_INSTANTIATED',
        workflowInstanceId,
        workflowTemplateKey: template.key,
        workflowTemplateVersion: template.version,
        workflowStepKey: step.key,
        workflowDependsOnKeys: dependencies,
        workflowPublicMilestoneCandidate: Boolean(step.publicMilestoneCandidate),
        workflowActivatedAt: dependencies.length ? null : now,
      } as any,
    }));
  }
  await db.timelineEvent.create({
    data: {
      caseId: input.caseId,
      userId: input.actor.userId,
      eventType: 'CUSTOM',
      type: 'CUSTOM' as any,
      payload: { action: 'CASE_WORKFLOW_INSTANTIATED', workflowInstanceId, templateKey: template.key, templateVersion: template.version },
    } as any,
  });
  return { workflowInstanceId, templateKey: template.key, templateVersion: template.version, tasks };
}

export async function activateReadyWorkflowSuccessors(completedTaskId: string, actor: Actor, db: Prisma = defaultPrisma) {
  const completed = await db.task.findUnique({ where: { id: completedTaskId } }) as any;
  if (!completed?.workflowInstanceId || !completed.workflowStepKey) return { activated: [] as string[] };
  const siblings = await db.task.findMany({ where: { caseId: completed.caseId, workflowInstanceId: completed.workflowInstanceId } as any }) as any[];
  const completedKeys = new Set(siblings.filter((task) => ['DONE'].includes(String(task.status))).map((task) => task.workflowStepKey).filter(Boolean) as string[]);
  const activated: string[] = [];
  for (const candidate of siblings) {
    if (String(candidate.status) !== 'BLOCKED') continue;
    const dependencies = candidate.workflowDependsOnKeys || [];
    if (!dependencies.length || !dependencies.every((key) => completedKeys.has(key))) continue;
    const updated = await db.task.update({
      where: { id: candidate.id },
      data: { status: 'TODO', workflowActivatedAt: new Date() } as any,
      select: { id: true, title: true, assignedToId: true },
    });
    activated.push(updated.id);
    await db.timelineEvent.create({
      data: {
        caseId: completed.caseId,
        userId: actor.userId,
        eventType: 'TASK_ASSIGNED',
        type: 'TASK_ASSIGNED' as any,
        payload: { action: 'WORKFLOW_SUCCESSOR_ACTIVATED', taskId: updated.id, taskTitle: updated.title, assignedTo: updated.assignedToId },
      } as any,
    });
  }
  return { activated };
}
