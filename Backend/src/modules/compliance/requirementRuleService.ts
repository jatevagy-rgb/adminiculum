import { FactScopeType, Prisma, PrismaClient } from '@prisma/client';
import { canonicalDigest } from './canonicalDigest';
import { RULE_AST_V1, type RuleExpression, type RuleNode } from './ruleAst';
import { validateRuleAst } from './ruleAstValidator';

type Db = PrismaClient | Prisma.TransactionClient;

export class RequirementRuleError extends Error {
  constructor(public readonly code: string, message: string) {
    super(message);
    this.name = 'RequirementRuleError';
  }
}

const EDITABLE_CONTENT_FIELDS = new Set([
  'title',
  'normativeStatement',
  'effectiveFrom',
  'effectiveTo',
  'sourceSupportState',
  'specialistRequirement',
  'specialistDomainCode',
]);

const REQUIREMENT_VERSION_CREATE_STATUSES = new Set(['CANDIDATE', 'IN_REVIEW']);

function assertCreateStatus(status: unknown, entity: string): asserts status is 'CANDIDATE' | 'IN_REVIEW' | undefined {
  if (status !== undefined && (typeof status !== 'string' || !REQUIREMENT_VERSION_CREATE_STATUSES.has(status))) {
    throw new RequirementRuleError('LIFECYCLE_STATUS_FORBIDDEN', `${entity} may only be created as CANDIDATE or IN_REVIEW.`);
  }
}

function assertApprovalActor(approvedById: unknown): asserts approvedById is string {
  if (typeof approvedById !== 'string' || approvedById.trim().length === 0) {
    throw new RequirementRuleError('APPROVAL_ACTOR_REQUIRED', 'Approval requires a non-empty approvedById.');
  }
}

function assertValidRuleAst(ast: unknown): asserts ast is RuleExpression {
  const result = validateRuleAst(ast);
  if (!result.valid) {
    throw new RequirementRuleError('RULE_AST_INVALID', result.errors.map((item) => `${item.code} at ${item.path}`).join('; '));
  }
  if (typeof ast !== 'object' || ast === null || !('schemaVersion' in ast) || ast.schemaVersion !== RULE_AST_V1) {
    throw new RequirementRuleError('RULE_SCHEMA_UNSUPPORTED', `Only ${RULE_AST_V1} is supported.`);
  }
}

function collectFactKeys(node: RuleNode, keys: Set<string>): void {
  if (node.kind === 'FACT') {
    keys.add(node.factKey);
    return;
  }
  if (node.kind === 'LITERAL') return;
  if (node.kind === 'NOT') {
    collectFactKeys(node.child, keys);
    return;
  }
  if (node.kind === 'AND' || node.kind === 'OR') {
    node.children.forEach((child) => collectFactKeys(child, keys));
    return;
  }
  if (node.kind !== 'COMPARE') return;
  collectFactKeys(node.left, keys);
  if (node.right.kind === 'FACT') collectFactKeys(node.right, keys);
}

function rangesOverlap(leftStart: Date, leftEnd: Date | null, rightStart: Date, rightEnd: Date | null): boolean {
  return leftStart < (rightEnd ?? new Date('9999-12-31T23:59:59.999Z'))
    && rightStart < (leftEnd ?? new Date('9999-12-31T23:59:59.999Z'));
}

export async function createRequirement(input: {
  key: string;
  jurisdictionCode: string;
  domainCode: string;
  status?: 'ACTIVE' | 'DEPRECATED' | 'RETIRED';
  db?: Db;
}) {
  const { db = new PrismaClient(), ...data } = input;
  if (data.status !== undefined && !['ACTIVE', 'DEPRECATED', 'RETIRED'].includes(data.status)) {
    throw new RequirementRuleError('INVALID_REQUIREMENT_STATUS', 'Requirement status must be ACTIVE, DEPRECATED, or RETIRED.');
  }
  return db.requirement.create({ data });
}

export async function createRequirementVersion(input: {
  requirementId: string;
  versionKey: string;
  title: string;
  normativeStatement: string;
  effectiveFrom: Date;
  effectiveTo?: Date | null;
  sourceSupportState?: 'SUFFICIENT' | 'INCOMPLETE' | 'AMBIGUOUS' | 'MISSING' | 'LEGAL_REVIEW_REQUIRED';
  specialistRequirement?: 'NONE' | 'LEGAL_ONLY' | 'TECHNICAL_CLASSIFICATION_REQUIRED';
  specialistDomainCode?: string | null;
  status?: 'CANDIDATE' | 'IN_REVIEW';
  createdById?: string | null;
  db?: Db;
}) {
  const { db = new PrismaClient(), ...data } = input;
  assertCreateStatus(data.status, 'RequirementVersion');
  if (data.effectiveTo && data.effectiveTo < data.effectiveFrom) {
    throw new RequirementRuleError('INVALID_EFFECTIVE_RANGE', 'effectiveTo must not precede effectiveFrom.');
  }
  return db.requirementVersion.create({ data: data as Prisma.RequirementVersionUncheckedCreateInput });
}

export async function addRequirementCitation(input: {
  requirementVersionId: string;
  legalSourceVersionId: string;
  supportRole: 'PRIMARY' | 'SUPPORTING' | 'CONTEXT';
  locator?: string | null;
  article?: string | null;
  section?: string | null;
  paragraph?: string | null;
  page?: number | null;
  quotedText?: string | null;
  metadata?: Prisma.InputJsonValue | null;
  db?: Db;
}) {
  const { db = new PrismaClient(), ...data } = input;
  const version = await db.requirementVersion.findUnique({ where: { id: data.requirementVersionId }, select: { status: true } });
  if (!version) throw new RequirementRuleError('REQUIREMENT_VERSION_NOT_FOUND', 'RequirementVersion was not found.');
  if (['APPROVED', 'SUPERSEDED', 'RETIRED'].includes(version.status)) {
    throw new RequirementRuleError('CITATION_VERSION_IMMUTABLE', 'Citations cannot be changed after RequirementVersion approval or retirement.');
  }
  return db.requirementCitation.create({ data: data as Prisma.RequirementCitationUncheckedCreateInput });
}

export async function createApplicabilityRuleVersion(input: {
  requirementVersionId: string;
  ruleVersionKey: string;
  astJson: unknown;
  canonicalDigest?: string;
  evaluationScopeType?: FactScopeType | null;
  status?: 'CANDIDATE' | 'IN_REVIEW';
  createdById?: string | null;
  db?: Db;
}) {
  const { db = new PrismaClient(), astJson, canonicalDigest: suppliedDigest, ...data } = input;
  assertCreateStatus(data.status, 'ApplicabilityRuleVersion');
  assertValidRuleAst(astJson);
  const digest = canonicalDigest(astJson);
  if (suppliedDigest !== undefined && suppliedDigest !== digest) {
    throw new RequirementRuleError('DIGEST_MISMATCH', 'Supplied canonical digest does not match the canonical AST digest.');
  }

  const factKeys = new Set<string>();
  collectFactKeys(astJson.node, factKeys);
  const definitions = await db.factDefinition.findMany({ where: { key: { in: [...factKeys] } }, select: { id: true, key: true } });
  const definitionIds = new Map(definitions.map((definition) => [definition.key, definition.id]));
  const rule = await db.applicabilityRuleVersion.create({
    data: {
      ...data,
      schemaVersion: RULE_AST_V1,
      astJson: astJson as unknown as Prisma.InputJsonValue,
      canonicalDigest: digest,
      dependencies: {
        create: [...factKeys].map((factKey) => ({ factKey, resolvedFactDefinitionId: definitionIds.get(factKey) ?? null })),
      },
    } as Prisma.ApplicabilityRuleVersionUncheckedCreateInput,
    include: { dependencies: true },
  });
  return rule;
}

export async function approveRequirementVersion(id: string, approvedById: string, db: Db = new PrismaClient()) {
  assertApprovalActor(approvedById);
  const normalizedApprovedById = approvedById.trim();
  const approve = async (tx: Db) => {
  const version = await tx.requirementVersion.findUnique({ where: { id } });
  if (!version) throw new RequirementRuleError('REQUIREMENT_VERSION_NOT_FOUND', 'RequirementVersion was not found.');
  if (version.sourceSupportState !== 'SUFFICIENT') {
    throw new RequirementRuleError('SOURCE_SUPPORT_INSUFFICIENT', 'Only SUFFICIENT source support may be approved.');
  }
  const primaryCitation = await tx.requirementCitation.findFirst({ where: { requirementVersionId: id, supportRole: 'PRIMARY' }, select: { id: true } });
  if (!primaryCitation) {
    throw new RequirementRuleError('PRIMARY_CITATION_REQUIRED', 'At least one PRIMARY citation is required before approval.');
  }
  const approved = await tx.requirementVersion.findMany({ where: { requirementId: version.requirementId, status: 'APPROVED', id: { not: id } }, select: { effectiveFrom: true, effectiveTo: true } });
  if (approved.some((other) => rangesOverlap(version.effectiveFrom, version.effectiveTo, other.effectiveFrom, other.effectiveTo))) {
    throw new RequirementRuleError('EFFECTIVE_PERIOD_OVERLAP', 'Approved RequirementVersion effective periods may not overlap.');
  }
  return tx.requirementVersion.update({ where: { id }, data: { status: 'APPROVED', approvedAt: new Date(), approvedById: normalizedApprovedById } });
  };
  if (db instanceof PrismaClient) {
    return db.$transaction((tx) => approve(tx), { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
  }
  return approve(db);
}

export async function approveApplicabilityRuleVersion(id: string, approvedById: string, db: Db = new PrismaClient()) {
  assertApprovalActor(approvedById);
  const normalizedApprovedById = approvedById.trim();
  const rule = await db.applicabilityRuleVersion.findUnique({ where: { id }, include: { requirementVersion: true, dependencies: { include: { resolvedFactDefinition: { select: { valueType: true, allowedScopeTypes: true } } } } } });
  if (!rule) throw new RequirementRuleError('RULE_VERSION_NOT_FOUND', 'ApplicabilityRuleVersion was not found.');
  if (rule.requirementVersion.status !== 'APPROVED') throw new RequirementRuleError('REQUIREMENT_VERSION_NOT_APPROVED', 'The parent RequirementVersion must be approved first.');
  if (!rule.evaluationScopeType) throw new RequirementRuleError('RULE_SCOPE_UNRESOLVED', 'A rule scope must be resolved before approval.');
  if (rule.dependencies.some((dependency) => !dependency.resolvedFactDefinition)) throw new RequirementRuleError('UNRESOLVED_FACT_DEPENDENCY', 'Every approved rule dependency must resolve to a FactDefinition.');
  const unsupported = rule.dependencies.find((dependency) => !['BOOLEAN', 'NUMBER', 'DATE', 'STRING'].includes(dependency.resolvedFactDefinition!.valueType));
  if (unsupported) throw new RequirementRuleError('UNSUPPORTED_FACT_TYPE', `Fact dependency ${unsupported.factKey} has an unsupported approval type.`);
  const scopeMismatch = rule.dependencies.find((dependency) => !dependency.resolvedFactDefinition!.allowedScopeTypes.includes(rule.evaluationScopeType!));
  if (scopeMismatch) throw new RequirementRuleError('RULE_SCOPE_DEPENDENCY_MISMATCH', `Fact dependency ${scopeMismatch.factKey} is not available in the rule evaluation scope.`);
  return db.applicabilityRuleVersion.update({ where: { id }, data: { status: 'APPROVED', approvedAt: new Date(), approvedById: normalizedApprovedById } });
}

export async function supersedeRequirementVersion(id: string, successorId: string, db: Db = new PrismaClient()) {
  const [current, successor] = await Promise.all([
    db.requirementVersion.findUnique({ where: { id }, select: { requirementId: true } }),
    db.requirementVersion.findUnique({ where: { id: successorId }, select: { requirementId: true } }),
  ]);
  if (!current || !successor) throw new RequirementRuleError('REQUIREMENT_VERSION_NOT_FOUND', 'RequirementVersion was not found.');
  if (id === successorId) throw new RequirementRuleError('SELF_SUPERSESSION', 'A RequirementVersion cannot supersede itself.');
  if (current.requirementId !== successor.requirementId) throw new RequirementRuleError('CROSS_REQUIREMENT_SUPERSESSION', 'Supersession must stay within one Requirement.');
  return db.requirementVersion.update({ where: { id }, data: { supersededById: successorId, status: 'SUPERSEDED' } });
}

export async function supersedeApplicabilityRuleVersion(id: string, successorId: string, db: Db = new PrismaClient()) {
  const [current, successor] = await Promise.all([
    db.applicabilityRuleVersion.findUnique({ where: { id }, select: { requirementVersionId: true } }),
    db.applicabilityRuleVersion.findUnique({ where: { id: successorId }, select: { requirementVersionId: true } }),
  ]);
  if (!current || !successor) throw new RequirementRuleError('RULE_VERSION_NOT_FOUND', 'ApplicabilityRuleVersion was not found.');
  if (id === successorId) throw new RequirementRuleError('SELF_SUPERSESSION', 'An ApplicabilityRuleVersion cannot supersede itself.');
  if (current.requirementVersionId !== successor.requirementVersionId) throw new RequirementRuleError('CROSS_RULE_PARENT_SUPERSESSION', 'Rule supersession must stay within one RequirementVersion.');
  return db.applicabilityRuleVersion.update({ where: { id }, data: { supersededById: successorId, status: 'SUPERSEDED' } });
}

export async function updateRequirementVersion(id: string, input: Record<string, unknown>, db: Db = new PrismaClient()) {
  if (typeof input !== 'object' || input === null || Array.isArray(input)) {
    throw new RequirementRuleError('LIFECYCLE_FIELD_FORBIDDEN', 'RequirementVersion updates must be an object containing editable content fields only.');
  }
  const keys = Object.keys(input);
  if (keys.some((key) => !EDITABLE_CONTENT_FIELDS.has(key))) {
    throw new RequirementRuleError('LIFECYCLE_FIELD_FORBIDDEN', 'RequirementVersion lifecycle and identity fields cannot be changed through the generic update path.');
  }
  const current = await db.requirementVersion.findUnique({ where: { id } });
  if (!current) throw new RequirementRuleError('REQUIREMENT_VERSION_NOT_FOUND', 'RequirementVersion was not found.');
  if (current.status === 'APPROVED') {
    throw new RequirementRuleError('APPROVED_VERSION_IMMUTABLE', 'Approved RequirementVersion content is immutable; create a new version.');
  }
  return db.requirementVersion.update({ where: { id }, data: input as Prisma.RequirementVersionUncheckedUpdateInput });
}
