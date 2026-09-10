import { prisma as defaultPrisma } from '../../prisma/prisma.service';
import { InternalActor, assertClientReadAccess } from '../client-interaction/base';
import { isCompanyProfileQuestion, getCompanyProfileQuestion } from '../client-workspace/companyProfileQuestionRegistry';

type Prisma = typeof defaultPrisma;

/**
 * Read-only workforce Compliance workspace projection.
 *
 * Composes the already-materialized RequirementApplicability snapshots,
 * their consumed-fact rows, rule fact dependencies, citations and the
 * operating-profile enrollment flag into one bounded DTO. It performs no
 * evaluation and no writes — the engine remains the only authority.
 */

export interface ComplianceWorkspaceFactRef {
  factKey: string;
  /** Safe product label when the fact is registered as a company-profile question. */
  label: string | null;
  /** Stored typed value, formatted for display. Null when not resolvable. */
  value: string | null;
}

export interface ComplianceWorkspaceMissingFact {
  factKey: string;
  label: string | null;
  /** True when the fact maps to the canonical portal company-profile question flow. */
  profileAnswerable: boolean;
}

export interface ComplianceWorkspaceCitation {
  supportRole: string;
  sourceTitle: string | null;
  canonicalCitation: string | null;
  versionLabel: string | null;
  locator: string | null;
  article: string | null;
  section: string | null;
  paragraph: string | null;
}

export interface ComplianceWorkspaceArea {
  applicabilityId: string;
  requirementKey: string | null;
  title: string;
  domainLabel: string | null;
  outcome: string;
  scopeType: string | null;
  subjectLabel: string | null;
  evaluationAt: string;
  sourceSupportState: string;
  specialistRequirement: string;
  activeFindingId: string | null;
  usedFacts: ComplianceWorkspaceFactRef[];
  missingFacts: ComplianceWorkspaceMissingFact[];
  citations: ComplianceWorkspaceCitation[];
}

export interface ComplianceWorkspaceSummary {
  enrollment: 'ENROLLED' | 'NOT_ENROLLED' | 'SUSPENDED' | null;
  evaluatedCount: number;
  applies: number;
  doesNotApply: number;
  insufficientFacts: number;
  legalReviewRequired: number;
  technicalReviewRequired: number;
  sourceSupportInsufficient: number;
  openFindings: number;
  openProposals: number;
}

export interface ComplianceWorkspaceDto {
  summary: ComplianceWorkspaceSummary;
  /** Most recent snapshot evaluation timestamp, null when nothing was evaluated. */
  evaluatedAt: string | null;
  areas: ComplianceWorkspaceArea[];
}

function toIso(value: Date | string | null | undefined): string | null {
  if (value == null) return null;
  const d = value instanceof Date ? value : new Date(value);
  return Number.isNaN(d.getTime()) ? null : d.toISOString();
}

function decimalToString(value: { toString(): string } | null | undefined): string | null {
  if (value == null) return null;
  const text = value.toString();
  return text.length ? text : null;
}

function factDisplayValue(fact: {
  booleanValue: boolean | null;
  numberValue: { toString(): string } | null;
  stringValue: string | null;
  dateValue: Date | null;
  datetimeValue: Date | null;
  moneyAmount: { toString(): string } | null;
  moneyCurrency: string | null;
  enumValue: string | null;
}): string | null {
  if (fact.booleanValue !== null && fact.booleanValue !== undefined) return fact.booleanValue ? 'Igen' : 'Nem';
  const number = decimalToString(fact.numberValue);
  if (number !== null) return number;
  if (fact.stringValue) return fact.stringValue;
  const money = decimalToString(fact.moneyAmount);
  if (money !== null) return fact.moneyCurrency ? `${money} ${fact.moneyCurrency}` : money;
  if (fact.enumValue) return fact.enumValue;
  const date = toIso(fact.dateValue ?? fact.datetimeValue);
  return date ? date.slice(0, 10) : null;
}

function profileLabel(questionKey: string | null | undefined): string | null {
  if (!questionKey || !isCompanyProfileQuestion(questionKey)) return null;
  return getCompanyProfileQuestion(questionKey).label;
}

/**
 * The persisted snapshot is the authoritative record of which facts the
 * evaluator found missing. An unconsumed rule dependency is NOT proof of a
 * gap — the fact may exist but be malformed/conflicting, or evaluation may
 * have stopped earlier for review/source-support reasons. Returns null when
 * the snapshot does not carry a usable list (nothing may be guessed).
 */
function snapshotMissingFactKeys(snapshotJson: unknown): string[] | null {
  if (!snapshotJson || typeof snapshotJson !== 'object') return null;
  const keys = (snapshotJson as { missingFactKeys?: unknown }).missingFactKeys;
  if (!Array.isArray(keys)) return null;
  return keys.filter((key): key is string => typeof key === 'string');
}

export async function getComplianceWorkspace(
  actor: InternalActor,
  clientId: string,
  prisma: Prisma = defaultPrisma,
): Promise<ComplianceWorkspaceDto> {
  await assertClientReadAccess(actor, clientId, prisma);

  // Mirror the canonical resolver (resolveEffectiveRequirementRuleVersion):
  // only snapshots produced by the currently authoritative lifecycle count as
  // current state — an APPROVED requirement version inside its effective
  // window and its current APPROVED, non-superseded rule version.
  const now = new Date();
  const [profile, snapshots, openFindings, openProposals] = await Promise.all([
    prisma.clientOperatingProfile.findUnique({
      where: { clientId },
      select: { complianceEnrollmentStatus: true },
    }),
    prisma.requirementApplicability.findMany({
      where: {
        clientId,
        requirementVersion: {
          status: 'APPROVED',
          effectiveFrom: { lte: now },
          OR: [{ effectiveTo: null }, { effectiveTo: { gt: now } }],
        },
        ruleVersion: { status: 'APPROVED', supersededById: null },
      },
      orderBy: [{ evaluationAt: 'desc' }, { createdAt: 'desc' }],
      select: {
        id: true,
        requirementVersionId: true,
        ruleVersionId: true,
        outcome: true,
        scopeType: true,
        factSubjectId: true,
        evaluationAt: true,
        sourceSupportState: true,
        specialistRequirement: true,
        // Internal read only: the persisted snapshot is the sole authority
        // for missingFactKeys; it is never projected into the DTO.
        snapshotJson: true,
        requirementVersion: {
          select: {
            title: true,
            requirement: { select: { key: true, domain: { select: { label: true } } } },
            citations: {
              select: {
                supportRole: true,
                locator: true,
                article: true,
                section: true,
                paragraph: true,
                legalSourceVersion: {
                  select: {
                    versionLabel: true,
                    legalSource: { select: { canonicalCitation: true, title: true } },
                  },
                },
              },
            },
          },
        },
        ruleVersion: {
          select: {
            dependencies: {
              select: {
                factKey: true,
                resolvedFactDefinition: { select: { questionKey: true } },
              },
            },
          },
        },
        facts: { select: { factKey: true, clientFactId: true, factDefinitionId: true } },
        findings: { select: { id: true, status: true } },
      },
    }),
    prisma.assessmentFinding.count({ where: { clientId, status: { not: 'RESOLVED' } } }),
    prisma.complianceProposal.count({ where: { clientId, status: 'PROPOSED' } }),
  ]);

  // Latest snapshot wins per (requirementVersion, ruleVersion, scope, subject):
  // rows arrive ordered by evaluationAt/createdAt desc, so first-seen is current.
  const current = new Map<string, (typeof snapshots)[number]>();
  for (const row of snapshots) {
    const dedupeKey = [row.requirementVersionId, row.ruleVersionId, row.scopeType, row.factSubjectId ?? ''].join('|');
    if (!current.has(dedupeKey)) current.set(dedupeKey, row);
  }

  const subjectIds = new Set<string>();
  const usedFactIds = new Set<string>();
  for (const row of current.values()) {
    if (row.factSubjectId) subjectIds.add(row.factSubjectId);
    for (const fact of row.facts) usedFactIds.add(fact.clientFactId);
  }
  const subjects = subjectIds.size
    ? await prisma.factSubject.findMany({
        where: { clientId, id: { in: [...subjectIds] } },
        select: { id: true, displayLabel: true, subjectKey: true },
      })
    : [];
  const clientFacts = usedFactIds.size
    ? await prisma.clientFact.findMany({
        where: { clientId, id: { in: [...usedFactIds] } },
        select: {
          id: true,
          booleanValue: true,
          numberValue: true,
          stringValue: true,
          dateValue: true,
          datetimeValue: true,
          moneyAmount: true,
          moneyCurrency: true,
          enumValue: true,
          factDefinition: { select: { questionKey: true } },
        },
      })
    : [];
  const subjectLabelById = new Map<string, string | null>(
    subjects.map((subject) => [subject.id, subject.displayLabel?.trim() || subject.subjectKey?.trim() || null]),
  );
  const factById = new Map(clientFacts.map((fact) => [fact.id, fact]));

  const areas: ComplianceWorkspaceArea[] = [...current.values()].map((row) => {
    const dependencies = new Map(
      (row.ruleVersion?.dependencies ?? []).map((dependency) => [dependency.factKey, dependency]),
    );
    const persistedMissingKeys = snapshotMissingFactKeys(row.snapshotJson);
    const missingFacts: ComplianceWorkspaceMissingFact[] = (persistedMissingKeys ?? []).map((factKey) => {
      const questionKey = dependencies.get(factKey)?.resolvedFactDefinition?.questionKey ?? null;
      return {
        factKey,
        label: profileLabel(questionKey),
        profileAnswerable: isCompanyProfileQuestion(questionKey),
      };
    });

    return {
      applicabilityId: row.id,
      requirementKey: row.requirementVersion?.requirement.key ?? null,
      title: row.requirementVersion?.title ?? 'Ismeretlen követelmény',
      domainLabel: row.requirementVersion?.requirement.domain?.label ?? null,
      outcome: String(row.outcome),
      scopeType: row.scopeType ? String(row.scopeType) : null,
      subjectLabel: row.factSubjectId ? subjectLabelById.get(row.factSubjectId) ?? null : null,
      evaluationAt: toIso(row.evaluationAt) || '',
      sourceSupportState: String(row.sourceSupportState),
      specialistRequirement: String(row.specialistRequirement),
      activeFindingId: row.findings.find((finding) => finding.status !== 'RESOLVED')?.id ?? null,
      usedFacts: row.facts.map((fact) => {
        const clientFact = factById.get(fact.clientFactId);
        return {
          factKey: fact.factKey,
          label: profileLabel(clientFact?.factDefinition?.questionKey),
          value: clientFact ? factDisplayValue(clientFact) : null,
        };
      }),
      missingFacts,
      citations: (row.requirementVersion?.citations ?? []).map((citation) => ({
        supportRole: String(citation.supportRole),
        sourceTitle: citation.legalSourceVersion?.legalSource?.title ?? null,
        canonicalCitation: citation.legalSourceVersion?.legalSource?.canonicalCitation ?? null,
        versionLabel: citation.legalSourceVersion?.versionLabel ?? null,
        locator: citation.locator,
        article: citation.article,
        section: citation.section,
        paragraph: citation.paragraph,
      })),
    };
  });

  const summary: ComplianceWorkspaceSummary = {
    enrollment: (profile?.complianceEnrollmentStatus as ComplianceWorkspaceSummary['enrollment']) ?? null,
    evaluatedCount: areas.length,
    applies: areas.filter((area) => area.outcome === 'APPLIES').length,
    doesNotApply: areas.filter((area) => area.outcome === 'DOES_NOT_APPLY').length,
    insufficientFacts: areas.filter((area) => area.outcome === 'INSUFFICIENT_FACTS').length,
    legalReviewRequired: areas.filter((area) => area.outcome === 'LEGAL_REVIEW_REQUIRED').length,
    technicalReviewRequired: areas.filter((area) => area.outcome === 'TECHNICAL_REVIEW_REQUIRED').length,
    sourceSupportInsufficient: areas.filter((area) => area.outcome === 'SOURCE_SUPPORT_INSUFFICIENT').length,
    openFindings,
    openProposals,
  };

  return {
    summary,
    evaluatedAt: areas[0]?.evaluationAt || null,
    areas,
  };
}
