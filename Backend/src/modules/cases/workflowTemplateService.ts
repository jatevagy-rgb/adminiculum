/**
 * DB-backed workflow template administration (Beállítások → Munkafolyamatok).
 *
 * Reuses the EXISTING workflow DAG engine (validateWorkflowDag, the built-in
 * WORKFLOW_TEMPLATES, instantiateCaseWorkflow, successor auto-activation). This
 * module only persists workforce-authored templates and enforces versioning /
 * snapshot immutability:
 *
 *   - a (key, version) row is immutable once it leaves DRAFT (ACTIVE/ARCHIVED);
 *     editing an ACTIVE template creates a NEW version instead of mutating it;
 *   - instantiated Cases snapshot the template key + version onto their tasks
 *     (see instantiateCaseWorkflow), so later template edits never touch an
 *     existing Case;
 *   - activation runs DAG validation and demotes the previously ACTIVE version
 *     of the same key to ARCHIVED.
 */
import { prisma } from '../../prisma/prisma.service';
import { validateWorkflowDag, listBuiltinWorkflowTemplates, type WorkflowTemplateSummary } from './caseWorkflowOrchestration';

export class WorkflowTemplateError extends Error {
  constructor(public status: number, public code: string, message: string) {
    super(message);
    this.name = 'WorkflowTemplateError';
  }
}

export type TemplateStep = {
  key: string;
  title: string;
  dependsOn: string[];
  publicMilestoneCandidate: boolean;
  defaultAssigneeId: string | null;
  suggestedMilestoneTitle: string | null;
  suggestedMilestoneDescription: string | null;
  suggestedWeight: number | null;
  dueOffsetDays: number | null;
};

const KEY_RE = /^[a-z0-9][a-z0-9-]{0,63}$/;

function str(value: unknown, max: number): string | null {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  return trimmed ? trimmed.slice(0, max) : null;
}

function slug(value: unknown): string | null {
  const s = str(value, 64);
  if (!s) return null;
  const normalized = s.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
  return KEY_RE.test(normalized) ? normalized : null;
}

function normalizeSteps(input: unknown): TemplateStep[] {
  if (!Array.isArray(input) || input.length === 0) {
    throw new WorkflowTemplateError(400, 'WORKFLOW_TEMPLATE_NO_STEPS', 'A munkafolyamatnak legalább egy lépése legyen.');
  }
  if (input.length > 25) throw new WorkflowTemplateError(400, 'WORKFLOW_TEMPLATE_TOO_MANY_STEPS', 'Túl sok lépés.');
  const steps: TemplateStep[] = input.map((raw, index) => {
    const entry = (raw && typeof raw === 'object') ? raw as Record<string, unknown> : {};
    const key = slug(entry.key) || slug(entry.title) || `step-${index + 1}`;
    const title = str(entry.title, 200);
    if (!title) throw new WorkflowTemplateError(400, 'WORKFLOW_TEMPLATE_STEP_TITLE', 'Minden lépéshez cím kell.');
    const dependsOn = Array.isArray(entry.dependsOn)
      ? [...new Set(entry.dependsOn.map((d) => slug(d)).filter(Boolean) as string[])]
      : [];
    const weightRaw = entry.suggestedWeight;
    const weight = typeof weightRaw === 'number' && Number.isFinite(weightRaw) && weightRaw > 0 ? Math.round(weightRaw) : null;
    const offsetRaw = entry.dueOffsetDays;
    const dueOffsetDays = typeof offsetRaw === 'number' && Number.isFinite(offsetRaw) ? Math.round(offsetRaw) : null;
    return {
      key,
      title,
      dependsOn,
      publicMilestoneCandidate: Boolean(entry.publicMilestoneCandidate),
      defaultAssigneeId: str(entry.defaultAssigneeId, 64),
      suggestedMilestoneTitle: str(entry.suggestedMilestoneTitle, 200),
      suggestedMilestoneDescription: str(entry.suggestedMilestoneDescription, 2000),
      suggestedWeight: weight,
      dueOffsetDays,
    };
  });
  // Reuse the existing DAG validator (unique keys, self/missing dependency, cycles).
  validateWorkflowDag(steps.map((s) => ({ key: s.key, title: s.title, dependsOn: s.dependsOn })));
  return steps;
}

function toAdminDto(row: any) {
  return {
    id: row.id,
    key: row.key,
    name: row.name,
    description: row.description ?? null,
    version: row.version,
    status: row.status,
    caseTypes: row.caseTypes ?? [],
    steps: (row.steps ?? []) as TemplateStep[],
    usageCount: row.usageCount ?? 0,
    createdAt: row.createdAt instanceof Date ? row.createdAt.toISOString() : row.createdAt,
    updatedAt: row.updatedAt instanceof Date ? row.updatedAt.toISOString() : row.updatedAt,
  };
}

// Selection list for New Case: latest ACTIVE DB version per key, merged over
// the built-in templates (DB wins on key collision).
export async function listWorkflowTemplatesForSelection(): Promise<WorkflowTemplateSummary[]> {
  const active = await prisma.workflowTemplate.findMany({
    where: { status: 'ACTIVE' },
    orderBy: [{ key: 'asc' }, { version: 'desc' }],
  });
  const latestByKey = new Map<string, any>();
  for (const row of active) if (!latestByKey.has(row.key)) latestByKey.set(row.key, row);
  const dbSummaries: WorkflowTemplateSummary[] = [...latestByKey.values()].map((row) => ({
    key: row.key,
    name: row.name,
    version: row.version,
    source: 'custom' as const,
    steps: ((row.steps ?? []) as TemplateStep[]).map((s) => ({
      key: s.key, title: s.title, dependsOn: s.dependsOn || [], publicMilestoneCandidate: Boolean(s.publicMilestoneCandidate),
    })),
  }));
  const dbKeys = new Set(dbSummaries.map((t) => t.key));
  const builtins = listBuiltinWorkflowTemplates().filter((t) => !dbKeys.has(t.key));
  return [...dbSummaries, ...builtins];
}

// Admin list: every DB template row (all versions), newest first.
export async function listWorkflowTemplatesAdmin() {
  const rows = await prisma.workflowTemplate.findMany({ orderBy: [{ key: 'asc' }, { version: 'desc' }] });
  return rows.map(toAdminDto);
}

export async function getWorkflowTemplateAdmin(id: string) {
  const row = await prisma.workflowTemplate.findUnique({ where: { id } });
  if (!row) throw new WorkflowTemplateError(404, 'WORKFLOW_TEMPLATE_NOT_FOUND', 'A sablon nem található.');
  return toAdminDto(row);
}

export async function createWorkflowTemplate(userId: string, body: any) {
  const name = str(body?.name, 200);
  if (!name) throw new WorkflowTemplateError(400, 'WORKFLOW_TEMPLATE_NAME', 'A sablon neve kötelező.');
  const key = slug(body?.key) || slug(name);
  if (!key) throw new WorkflowTemplateError(400, 'WORKFLOW_TEMPLATE_KEY', 'Érvénytelen sablonkulcs.');
  const existing = await prisma.workflowTemplate.findFirst({ where: { key } });
  if (existing) throw new WorkflowTemplateError(409, 'WORKFLOW_TEMPLATE_KEY_TAKEN', 'Ilyen kulcsú sablon már létezik.');
  const steps = normalizeSteps(body?.steps);
  const row = await prisma.workflowTemplate.create({
    data: {
      key, name,
      description: str(body?.description, 2000),
      version: 1,
      status: 'DRAFT',
      caseTypes: Array.isArray(body?.caseTypes) ? (body.caseTypes.map((c: unknown) => str(c, 64)).filter(Boolean) as string[]) : [],
      steps: steps as any,
      createdById: userId,
    } as any,
  });
  return toAdminDto(row);
}

// Only DRAFT rows are editable. An ACTIVE/ARCHIVED (used) version is immutable —
// callers must create a new version instead.
export async function updateWorkflowTemplateDraft(_userId: string, id: string, body: any) {
  const row = await prisma.workflowTemplate.findUnique({ where: { id } });
  if (!row) throw new WorkflowTemplateError(404, 'WORKFLOW_TEMPLATE_NOT_FOUND', 'A sablon nem található.');
  if (row.status !== 'DRAFT') {
    throw new WorkflowTemplateError(409, 'WORKFLOW_TEMPLATE_IMMUTABLE', 'Aktivált verzió nem módosítható; hozz létre új verziót.');
  }
  const data: any = {};
  if (body?.name !== undefined) { const n = str(body.name, 200); if (!n) throw new WorkflowTemplateError(400, 'WORKFLOW_TEMPLATE_NAME', 'A sablon neve kötelező.'); data.name = n; }
  if (body?.description !== undefined) data.description = str(body.description, 2000);
  if (body?.caseTypes !== undefined) data.caseTypes = Array.isArray(body.caseTypes) ? (body.caseTypes.map((c: unknown) => str(c, 64)).filter(Boolean) as string[]) : [];
  if (body?.steps !== undefined) data.steps = normalizeSteps(body.steps) as any;
  const updated = await prisma.workflowTemplate.update({ where: { id }, data });
  return toAdminDto(updated);
}

// New DRAFT version of an existing key, seeded from the latest version (or the
// body's steps). Never mutates prior versions.
export async function createWorkflowTemplateVersion(userId: string, id: string, body: any) {
  const base = await prisma.workflowTemplate.findUnique({ where: { id } });
  if (!base) throw new WorkflowTemplateError(404, 'WORKFLOW_TEMPLATE_NOT_FOUND', 'A sablon nem található.');
  const max = await prisma.workflowTemplate.aggregate({ where: { key: base.key }, _max: { version: true } });
  const nextVersion = (max._max.version ?? base.version) + 1;
  const steps = body?.steps !== undefined ? normalizeSteps(body.steps) : (base.steps as unknown as TemplateStep[]);
  const row = await prisma.workflowTemplate.create({
    data: {
      key: base.key,
      name: str(body?.name, 200) || base.name,
      description: body?.description !== undefined ? str(body.description, 2000) : base.description,
      version: nextVersion,
      status: 'DRAFT',
      caseTypes: base.caseTypes,
      steps: steps as any,
      createdById: userId,
    } as any,
  });
  return toAdminDto(row);
}

// Copy to a brand-new key as a DRAFT v1.
export async function duplicateWorkflowTemplate(userId: string, id: string, body: any) {
  const base = await prisma.workflowTemplate.findUnique({ where: { id } });
  if (!base) throw new WorkflowTemplateError(404, 'WORKFLOW_TEMPLATE_NOT_FOUND', 'A sablon nem található.');
  const name = str(body?.name, 200) || `${base.name} (másolat)`;
  const key = slug(body?.key) || slug(name);
  if (!key) throw new WorkflowTemplateError(400, 'WORKFLOW_TEMPLATE_KEY', 'Érvénytelen sablonkulcs.');
  const existing = await prisma.workflowTemplate.findFirst({ where: { key } });
  if (existing) throw new WorkflowTemplateError(409, 'WORKFLOW_TEMPLATE_KEY_TAKEN', 'Ilyen kulcsú sablon már létezik.');
  const row = await prisma.workflowTemplate.create({
    data: {
      key, name,
      description: base.description,
      version: 1,
      status: 'DRAFT',
      caseTypes: base.caseTypes,
      steps: base.steps as any,
      createdById: userId,
    } as any,
  });
  return toAdminDto(row);
}

// Validate the DAG, mark ACTIVE, and demote any previously-ACTIVE version of the
// same key to ARCHIVED (that older version stays immutable and any Cases already
// instantiated from it keep their task snapshot).
export async function activateWorkflowTemplate(_userId: string, id: string) {
  const row = await prisma.workflowTemplate.findUnique({ where: { id } });
  if (!row) throw new WorkflowTemplateError(404, 'WORKFLOW_TEMPLATE_NOT_FOUND', 'A sablon nem található.');
  if (row.status === 'ACTIVE') return toAdminDto(row);
  if (row.status === 'ARCHIVED') throw new WorkflowTemplateError(409, 'WORKFLOW_TEMPLATE_ARCHIVED', 'Archivált verzió nem aktiválható; hozz létre új verziót.');
  const steps = (row.steps ?? []) as unknown as TemplateStep[];
  validateWorkflowDag(steps.map((s) => ({ key: s.key, title: s.title, dependsOn: s.dependsOn })));
  const updated = await prisma.$transaction(async (tx) => {
    await tx.workflowTemplate.updateMany({ where: { key: row.key, status: 'ACTIVE', id: { not: row.id } }, data: { status: 'ARCHIVED' } });
    return tx.workflowTemplate.update({ where: { id }, data: { status: 'ACTIVE' } });
  });
  return toAdminDto(updated);
}

export async function archiveWorkflowTemplate(_userId: string, id: string) {
  const row = await prisma.workflowTemplate.findUnique({ where: { id } });
  if (!row) throw new WorkflowTemplateError(404, 'WORKFLOW_TEMPLATE_NOT_FOUND', 'A sablon nem található.');
  const updated = await prisma.workflowTemplate.update({ where: { id }, data: { status: 'ARCHIVED' } });
  return toAdminDto(updated);
}

// Resolve a template (key) for instantiation: the latest ACTIVE DB version wins,
// otherwise a built-in. Returns null when neither exists.
export async function resolveTemplateForInstantiation(templateKey: string): Promise<{ key: string; name: string; version: number; steps: TemplateStep[]; templateId: string | null } | null> {
  const dbRow = await prisma.workflowTemplate.findFirst({
    where: { key: templateKey, status: 'ACTIVE' },
    orderBy: { version: 'desc' },
  });
  if (dbRow) {
    return { key: dbRow.key, name: dbRow.name, version: dbRow.version, steps: (dbRow.steps ?? []) as unknown as TemplateStep[], templateId: dbRow.id };
  }
  const builtin = listBuiltinWorkflowTemplates().find((t) => t.key === templateKey);
  if (builtin) {
    return {
      key: builtin.key, name: builtin.name, version: builtin.version, templateId: null,
      steps: builtin.steps.map((s) => ({
        key: s.key, title: s.title, dependsOn: s.dependsOn, publicMilestoneCandidate: s.publicMilestoneCandidate,
        defaultAssigneeId: null, suggestedMilestoneTitle: null, suggestedMilestoneDescription: null, suggestedWeight: null, dueOffsetDays: null,
      })),
    };
  }
  return null;
}

export async function incrementTemplateUsage(templateId: string): Promise<void> {
  await prisma.workflowTemplate.update({ where: { id: templateId }, data: { usageCount: { increment: 1 } } }).catch(() => undefined);
}
