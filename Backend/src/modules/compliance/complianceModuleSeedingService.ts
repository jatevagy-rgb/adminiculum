/**
 * COMPLIANCE DISCOVERY 2.0 — MODULE RULE FAMILY PROVISIONING (DB runtime)
 *
 * Authors the three representative verticals (GDPR / whistleblowing / NIS2)
 * into the EXISTING compliance models so the canonical evaluator can consume
 * them:
 *
 *   ComplianceDomain + LegalSource + LegalSourceVersion
 *     -> Requirement -> RequirementVersion -> RequirementCitation
 *     -> ApplicabilityRuleVersion (+ ApplicabilityRuleFactDependency)
 *     -> RequirementControlMap -> ControlDefinition
 *
 * Additive and idempotent: re-running never duplicates rows and never mutates an
 * approved version. No new compliance model is introduced.
 */

import { Prisma, PrismaClient } from '@prisma/client';
import {
  COMPLIANCE_MODULE_RULE_FAMILIES,
  type ComplianceRuleFamilyDefinition,
} from './moduleRuleFamilies';
import {
  addRequirementCitation,
  approveApplicabilityRuleVersion,
  approveRequirementVersion,
  createApplicabilityRuleVersion,
  createRequirement,
  createRequirementVersion,
} from './requirementRuleService';

type Db = PrismaClient;

export interface ComplianceModuleSeedResult {
  readonly domains: number;
  readonly legalSources: number;
  readonly requirements: number;
  readonly ruleVersions: number;
  readonly controlDefinitions: number;
  readonly skipped: number;
}

const JURISDICTION_BY_SOURCE: Readonly<Record<string, string>> = {
  'EU-32016R0679': 'EU',
  'EU-32022L2555': 'EU',
  'HU-011': 'HU',
  'HU-031': 'HU',
};

const CONTROL_TYPE_BY_PREFIX: Readonly<Record<string, 'ORGANIZATIONAL' | 'TECHNICAL' | 'PROCEDURAL' | 'LEGAL' | 'PHYSICAL'>> = {
  'C-DATA': 'ORGANIZATIONAL',
  'C-WB': 'PROCEDURAL',
  'C-CYBER': 'TECHNICAL',
};

const DOMAIN_LABELS: Readonly<Record<string, string>> = {
  DATA_PROTECTION: 'Adatvédelem',
  WHISTLEBLOWING: 'Visszaélés-bejelentés',
  CYBERSECURITY: 'Kiberbiztonság',
};

async function ensureDomain(db: Db, code: string): Promise<boolean> {
  const existing = await db.complianceDomain.findFirst({ where: { code } });
  if (existing) return false;
  await db.complianceDomain.create({ data: { code, label: DOMAIN_LABELS[code] ?? code } });
  return true;
}

async function ensureLegalSource(db: Db, family: ComplianceRuleFamilyDefinition): Promise<{ id: string; created: boolean }> {
  const existing = await db.legalSource.findFirst({ where: { sourceKey: family.legalSourceKey } });
  if (existing) return { id: existing.id, created: false };
  const created = await db.legalSource.create({
    data: {
      sourceKey: family.legalSourceKey,
      jurisdictionCode: JURISDICTION_BY_SOURCE[family.legalSourceKey] ?? family.jurisdictionCode,
      instrumentType: 'LEGISLATION',
      status: 'CANDIDATE',
    },
  });
  return { id: created.id, created: true };
}

async function ensureLegalSourceVersion(db: Db, legalSourceId: string): Promise<string> {
  const existing = await db.legalSourceVersion.findFirst({ where: { legalSourceId, legalVersionKey: 'V1' } });
  if (existing) return existing.id;
  const created = await db.legalSourceVersion.create({
    data: { legalSourceId, legalVersionKey: 'V1', status: 'ACTIVE', reviewStatus: 'APPROVED' },
  });
  return created.id;
}

async function ensureControlDefinition(db: Db, control: ComplianceRuleFamilyDefinition['controls'][number]): Promise<boolean> {
  const existing = await db.controlDefinition.findFirst({ where: { key: control.controlKey } });
  if (existing) return false;
  const prefix = control.controlKey.split('-').slice(0, 2).join('-');
  await db.controlDefinition.create({
    data: {
      key: control.controlKey,
      title: control.titleHu,
      description: control.evidenceQuestionHu,
      type: (CONTROL_TYPE_BY_PREFIX[prefix] ?? 'ORGANIZATIONAL') as never,
      defaultReviewCadenceDays: control.reviewCadenceDays,
    },
  });
  return true;
}

async function ensureRequirementControlMap(db: Db, requirementVersionId: string, controlDefinitionId: string, rationale: string): Promise<boolean> {
  const existing = await db.requirementControlMap.findFirst({ where: { requirementVersionId, controlDefinitionId } });
  if (existing) return false;
  await db.requirementControlMap.create({ data: { requirementVersionId, controlDefinitionId, rationale } });
  return true;
}

/**
 * Seeds one rule family. Returns how many rows were created. Existing approved
 * RequirementVersion / ApplicabilityRuleVersion rows are reused untouched.
 */
export async function seedComplianceRuleFamily(db: Db, actorUserId: string, family: ComplianceRuleFamilyDefinition): Promise<{ created: boolean; controlDefinitions: number }> {
  await ensureDomain(db, family.domainCode);
  const source = await ensureLegalSource(db, family);
  const legalSourceVersionId = await ensureLegalSourceVersion(db, source.id);

  let controlDefinitions = 0;
  for (const control of family.controls) {
    if (await ensureControlDefinition(db, control)) controlDefinitions += 1;
  }

  let requirement = await db.requirement.findFirst({ where: { key: family.requirementKey, jurisdictionCode: family.jurisdictionCode } });
  if (!requirement) {
    requirement = await createRequirement({ key: family.requirementKey, jurisdictionCode: family.jurisdictionCode, domainCode: family.domainCode, db });
  }

  let requirementVersion = await db.requirementVersion.findFirst({ where: { requirementId: requirement.id, versionKey: 'V1' }, include: { citations: true } });
  if (!requirementVersion) {
    requirementVersion = await createRequirementVersion({
      requirementId: requirement.id,
      versionKey: 'V1',
      title: family.titleHu,
      normativeStatement: family.normativeStatementHu,
      effectiveFrom: new Date('2020-01-01T00:00:00Z'),
      sourceSupportState: family.sourceSupportState,
      specialistRequirement: family.specialistRequirement,
      specialistDomainCode: family.specialistRequirement === 'LEGAL_ONLY' ? family.domainCode : null,
      db,
    }) as typeof requirementVersion;
    await addRequirementCitation({ requirementVersionId: requirementVersion.id, legalSourceVersionId, supportRole: 'PRIMARY', locator: family.locatorHu, db });
  }
  if (requirementVersion.status !== 'APPROVED') {
    await approveRequirementVersion(requirementVersion.id, actorUserId, db);
  }

  const existingRule = await db.applicabilityRuleVersion.findFirst({ where: { requirementVersionId: requirementVersion.id, ruleVersionKey: 'R1' } });
  if (!existingRule) {
    const rule = await createApplicabilityRuleVersion({
      requirementVersionId: requirementVersion.id,
      ruleVersionKey: 'R1',
      evaluationScopeType: 'COMPANY',
      astJson: family.ast,
      db,
    });
    await approveApplicabilityRuleVersion(rule.id, actorUserId, db);
  }

  for (const control of family.controls) {
    const definition = await db.controlDefinition.findFirstOrThrow({ where: { key: control.controlKey } });
    await ensureRequirementControlMap(db, requirementVersion.id, definition.id, control.evidenceQuestionHu);
  }

  return { created: !existingRule, controlDefinitions };
}

/** Seeds every declarative module rule family. Idempotent. */
export async function seedComplianceModuleRuleFamilies(db: Db, actorUserId: string): Promise<ComplianceModuleSeedResult> {
  let requirements = 0;
  let ruleVersions = 0;
  let controlDefinitions = 0;
  let skipped = 0;
  for (const family of COMPLIANCE_MODULE_RULE_FAMILIES) {
    const before = await db.applicabilityRuleVersion.findFirst({ where: { requirementVersion: { requirement: { key: family.requirementKey } }, ruleVersionKey: 'R1' } });
    const result = await seedComplianceRuleFamily(db, actorUserId, family);
    requirements += 1;
    if (before) skipped += 1;
    else ruleVersions += 1;
    controlDefinitions += result.controlDefinitions;
  }
  return {
    domains: Object.keys(DOMAIN_LABELS).length,
    legalSources: new Set(COMPLIANCE_MODULE_RULE_FAMILIES.map((family) => family.legalSourceKey)).size,
    requirements,
    ruleVersions,
    controlDefinitions,
    skipped,
  };
}

/** Structured control/evidence journey for a seeded control. */
export async function controlSeedForRule(ruleId: string) {
  return COMPLIANCE_MODULE_RULE_FAMILIES.find((family) => family.ruleId === ruleId)?.controls ?? [];
}
