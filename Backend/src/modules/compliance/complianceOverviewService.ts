import { prisma as defaultPrisma } from '../../prisma/prisma.service';
import { InternalActor, assertClientReadAccess, assertClientSafe, InteractionError } from '../client-interaction/base';

type Prisma = typeof defaultPrisma;

function requireComplianceManager(actor: InternalActor): void {
  if (!actor?.userId || !['ADMIN', 'PARTNER'].includes(String(actor.role || ''))) {
    throw new InteractionError(403, 'COMPLIANCE_DIAGNOSTICS_FORBIDDEN', 'Compliance diagnostics require an authorized manager.');
  }
}

export async function listUnresolvedRuleScopes(
  actor: InternalActor,
  prisma: Prisma = defaultPrisma,
): Promise<Array<{ requirementVersionId: string; ruleVersionId: string; reason: 'RULE_SCOPE_UNRESOLVED' }>> {
  requireComplianceManager(actor);
  const rows = await prisma.applicabilityRuleVersion.findMany({
    where: { status: 'APPROVED', supersededById: null, evaluationScopeType: null },
    orderBy: [{ requirementVersionId: 'asc' }, { id: 'asc' }],
    select: { requirementVersionId: true, id: true },
  });
  return rows.map((row) => ({ requirementVersionId: row.requirementVersionId, ruleVersionId: row.id, reason: 'RULE_SCOPE_UNRESOLVED' as const }));
}

export interface ComplianceOverviewFindingDto {
  id: string;
  title: string;
  description: string | null;
  recommendation: string | null;
  severity: string;
  operationalStatus: string;
  applicabilityStatus: string | null;
  requirementKey: string | null;
  scopeType: string | null;
  subjectLabel: string | null;
}

/**
 * Bounded internal workforce projection. Requirement wording is deliberately
 * taken from the immutable version pinned by the finding's applicability row.
 */
export async function getComplianceOverview(
  actor: InternalActor,
  clientId: string,
  prisma: Prisma = defaultPrisma,
): Promise<{ findings: ComplianceOverviewFindingDto[] }> {
  await assertClientReadAccess(actor, clientId, prisma);

  const findings = await prisma.assessmentFinding.findMany({
    where: { clientId },
    orderBy: [{ createdAt: 'desc' }, { id: 'asc' }],
    select: {
      id: true,
      title: true,
      description: true,
      recommendation: true,
      severity: true,
      status: true,
      scopeType: true,
      factSubjectId: true,
      requirementApplicability: {
        select: {
          outcome: true,
          requirementVersion: { select: { title: true, requirement: { select: { key: true } } } },
        },
      },
    },
  });

  const subjectIds = [...new Set(findings.map((finding) => finding.factSubjectId).filter((id): id is string => Boolean(id)))];
  const subjects = subjectIds.length
    ? await prisma.factSubject.findMany({
      where: { clientId, id: { in: subjectIds } },
      select: { id: true, displayLabel: true, subjectKey: true },
    })
    : [];
  const subjectLabels = new Map(subjects.map((subject) => [subject.id, subject.displayLabel?.trim() || subject.subjectKey?.trim() || null]));

  const dto = {
    findings: findings.map((finding) => {
      const applicability = finding.requirementApplicability;
      return {
        id: finding.id,
        title: applicability?.requirementVersion.title || finding.title,
        description: finding.description,
        recommendation: finding.recommendation,
        severity: String(finding.severity),
        operationalStatus: String(finding.status),
        applicabilityStatus: applicability?.outcome ? String(applicability.outcome) : null,
        requirementKey: applicability?.requirementVersion.requirement.key || null,
        scopeType: finding.scopeType ? String(finding.scopeType) : null,
        subjectLabel: finding.factSubjectId ? subjectLabels.get(finding.factSubjectId) || null : null,
      };
    }),
  };
  assertClientSafe(dto);
  return dto;
}
