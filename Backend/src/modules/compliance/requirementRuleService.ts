import { Prisma, PrismaClient } from '@prisma/client';
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

const CONTENT_FIELDS = new Set([
  'requirementId',
  'versionKey',
  'title',
  'normativeStatement',
  'effectiveFrom',
  'effectiveTo',
  'sourceSupportState',
  'specialistRequirement',
  'specialistDomainCode',
]);

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
  status?: 'CANDIDATE' | 'IN_REVIEW' | 'APPROVED' | 'SUPERSEDED' | 'RETIRED';
  db?: Db;
}) {
  const { db = new PrismaClient(), ...data } = input;
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
  return db.requirementCitation.create({ data: data as Prisma.RequirementCitationUncheckedCreateInput });
}

export async function createApplicabilityRuleVersion(input: {
  requirementVersionId: string;
  ruleVersionKey: string;
  astJson: unknown;
  canonicalDigest?: string;
  status?: 'CANDIDATE' | 'IN_REVIEW';
  createdById?: string | null;
  db?: Db;
}) {
  const { db = new PrismaClient(), astJson, canonicalDigest: suppliedDigest, ...data } = input;
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

export async function approveRequirementVersion(id: string, db: Db = new PrismaClient()) {
  const approve = async (tx: Db) => {
  const version = await tx.requirementVersion.findUnique({ where: { id } });
  if (!version) throw new RequirementRuleError('REQUIREMENT_VERSION_NOT_FOUND', 'RequirementVersion was not found.');
  if (version.sourceSupportState !== 'SUFFICIENT') {
    throw new RequirementRuleError('SOURCE_SUPPORT_INSUFFICIENT', 'Only SUFFICIENT source support may be approved.');
  }
  const approved = await tx.requirementVersion.findMany({ where: { requirementId: version.requirementId, status: 'APPROVED', id: { not: id } }, select: { effectiveFrom: true, effectiveTo: true } });
  if (approved.some((other) => rangesOverlap(version.effectiveFrom, version.effectiveTo, other.effectiveFrom, other.effectiveTo))) {
    throw new RequirementRuleError('EFFECTIVE_PERIOD_OVERLAP', 'Approved RequirementVersion effective periods may not overlap.');
  }
  return tx.requirementVersion.update({ where: { id }, data: { status: 'APPROVED', approvedAt: new Date() } });
  };
  if (db instanceof PrismaClient) {
    return db.$transaction((tx) => approve(tx), { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
  }
  return approve(db);
}

export async function approveApplicabilityRuleVersion(id: string, db: Db = new PrismaClient()) {
  const rule = await db.applicabilityRuleVersion.findUnique({ where: { id }, include: { requirementVersion: true, dependencies: { include: { resolvedFactDefinition: { select: { valueType: true } } } } } });
  if (!rule) throw new RequirementRuleError('RULE_VERSION_NOT_FOUND', 'ApplicabilityRuleVersion was not found.');
  if (rule.requirementVersion.status !== 'APPROVED') throw new RequirementRuleError('REQUIREMENT_VERSION_NOT_APPROVED', 'The parent RequirementVersion must be approved first.');
  if (rule.dependencies.some((dependency) => !dependency.resolvedFactDefinition)) throw new RequirementRuleError('UNRESOLVED_FACT_DEPENDENCY', 'Every approved rule dependency must resolve to a FactDefinition.');
  const unsupported = rule.dependencies.find((dependency) => !['BOOLEAN', 'NUMBER', 'DATE', 'STRING'].includes(dependency.resolvedFactDefinition!.valueType));
  if (unsupported) throw new RequirementRuleError('UNSUPPORTED_FACT_TYPE', `Fact dependency ${unsupported.factKey} has an unsupported approval type.`);
  return db.applicabilityRuleVersion.update({ where: { id }, data: { status: 'APPROVED', approvedAt: new Date() } });
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
  const current = await db.requirementVersion.findUnique({ where: { id } });
  if (!current) throw new RequirementRuleError('REQUIREMENT_VERSION_NOT_FOUND', 'RequirementVersion was not found.');
  if (current.status === 'APPROVED' && Object.keys(input).some((key) => CONTENT_FIELDS.has(key))) {
    throw new RequirementRuleError('APPROVED_VERSION_IMMUTABLE', 'Approved RequirementVersion content is immutable; create a new version.');
  }
  return db.requirementVersion.update({ where: { id }, data: input as Prisma.RequirementVersionUncheckedUpdateInput });
}
