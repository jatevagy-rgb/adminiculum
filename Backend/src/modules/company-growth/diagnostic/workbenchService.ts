import { PrismaClient } from '@prisma/client';
import { prisma as defaultPrisma } from '../../../prisma/prisma.service';
import { InternalActor, assertClientReadAccess } from '../../client-interaction/base';

type Prisma = typeof defaultPrisma;

export type DiagnosticProvenanceClass =
  | 'CANONICAL_STATE'
  | 'DECLARED_OBSERVATION'
  | 'MEASURED_SNAPSHOT'
  | 'RESEARCH_EVIDENCE'
  | 'DERIVED_DIAGNOSIS'
  | 'RECOMMENDATION';

export interface DiagnosticWorkbenchDto {
  client: {
    id: string;
    name: string;
    operatingProfile: {
      provenanceClass: 'CANONICAL_STATE';
      status: string | null;
      complianceEnrollmentStatus: string;
      summary: string | null;
      lastReviewedAt: string | null;
      nextReviewAt: string | null;
    } | null;
  };
  known: {
    facts: Array<{
      id: string;
      provenanceClass: 'CANONICAL_STATE';
      type: string;
      value: string;
      factDefinition: { key: string; domainCode: string; valueType: string } | null;
      scopeType: string | null;
      factSubjectId: string | null;
      verificationStatus: string;
      determinationMethod: string | null;
      observedAt: string | null;
      effectiveAt: string | null;
      validFrom: string;
      validTo: string | null;
      supersededAt: string | null;
    }>;
    processes: Array<{
      id: string;
      provenanceClass: 'CANONICAL_STATE';
      name: string;
      category: string;
      description: string | null;
      criticality: string;
      frequency: string;
      status: string;
      owner: { id: string; name: string } | null;
      organizationGroup: { id: string; name: string } | null;
      steps: Array<{
        id: string;
        position: number;
        name: string;
        stepType: string;
        isApproval: boolean;
        responsiblePerson: { id: string; name: string } | null;
        system: { id: string; name: string; category: string } | null;
        estimatedActiveMinutes: number | null;
        estimatedWaitingMinutes: number | null;
      }>;
    }>;
    systems: Array<{
      id: string;
      provenanceClass: 'CANONICAL_STATE';
      name: string;
      category: string;
      vendor: string | null;
      purpose: string | null;
      status: string;
      owner: { id: string; name: string } | null;
    }>;
  };
  observed: {
    observations: Array<{
      id: string;
      provenanceClass: 'DECLARED_OBSERVATION';
      observationType: string;
      observedAt: string;
      createdAt: string;
      sourceRecordId: string | null;
      inputDigest: string;
      source: { id: string; sourceType: string; name: string };
      discoveryRun: { id: string; status: string; startedAt: string } | null;
    }>;
    processSnapshots: Array<{
      id: string;
      provenanceClass: 'MEASURED_SNAPSHOT';
      businessProcess: { id: string; name: string };
      metricVersion: string;
      observedAt: string;
      inputDigest: string;
      snapshotDigest: string;
      metrics: unknown;
      provenance: unknown;
    }>;
  };
  problems: {
    domains: Array<{ id: string; provenanceClass: 'DERIVED_DIAGNOSIS'; key: string; name: string; description: string | null; status: string }>;
    diagnoses: Array<{
      id: string;
      provenanceClass: 'DERIVED_DIAGNOSIS';
      title: string;
      summary: string | null;
      status: string;
      problemDomain: { id: string; key: string; name: string } | null;
      businessProcess: { id: string; name: string } | null;
      sourceRefs: unknown;
      evidence: Array<{ id: string; title: string; verificationStatus: string; strength: string }>;
    }>;
    sufficiency: Array<{
      recommendationId: string;
      provenanceClass: 'RECOMMENDATION';
      decision: string;
      evidenceCount: number;
    }>;
  };
  proposed: {
    recommendations: Array<{
      id: string;
      provenanceClass: 'RECOMMENDATION';
      title: string;
      problemStatement: string;
      direction: string;
      kind: string;
      impactTags: string[];
      interventionCodes: string[];
      status: string;
      sufficiency: string;
      diagnosisId: string | null;
      domain: { key: string; name: string } | null;
      businessProcess: { id: string; name: string } | null;
      evidence: Array<{ id: string; title: string; verificationStatus: string; strength: string }>;
    }>;
  };
  evidence: {
    records: Array<{
      id: string;
      provenanceClass: 'RESEARCH_EVIDENCE';
      sourceType: string;
      status: string;
      title: string;
      description: string | null;
      validFrom: string | null;
      validUntil: string | null;
      clientFactId: string | null;
      observationId: string | null;
      documentVersionId: string | null;
    }>;
    research: Array<{
      id: string;
      provenanceClass: 'RESEARCH_EVIDENCE';
      kind: string;
      title: string;
      origin: string | null;
      boundedClaim: string | null;
      verificationStatus: string;
      strength: string;
      domainKeys: string[];
    }>;
  };
  missing: {
    hasUnknownFacts: boolean;
    hasUnansweredFactDefinitions: boolean;
    hasConflictingEvidence: boolean;
    insufficientRecommendationCount: number;
    unresolvedItems: Array<{ code: string; message: string }>;
  };
}

function iso(value: Date | null | undefined): string | null {
  return value ? value.toISOString() : null;
}

function evidenceSummary(row: { id: string; title: string; verificationStatus: string; strength: string }) {
  return {
    id: row.id,
    title: row.title,
    verificationStatus: row.verificationStatus,
    strength: row.strength,
  };
}

export async function getDiagnosticWorkbench(
  actor: InternalActor,
  clientId: string,
  prisma: Prisma = defaultPrisma,
): Promise<DiagnosticWorkbenchDto> {
  await assertClientReadAccess(actor, clientId, prisma as PrismaClient);
  const now = new Date();

  const [
    client,
    facts,
    processes,
    systems,
    observations,
    snapshots,
    domains,
    diagnoses,
    recommendations,
    evidenceRecords,
    researchEvidence,
    answerStates,
  ] = await Promise.all([
    prisma.client.findUnique({
      where: { id: clientId },
      select: {
        id: true,
        name: true,
        operatingProfile: {
          select: {
            status: true,
            complianceEnrollmentStatus: true,
            summary: true,
            lastReviewedAt: true,
            nextReviewAt: true,
          },
        },
      },
    }),
    prisma.clientFact.findMany({
      where: {
        clientId,
        supersededAt: null,
        OR: [{ validTo: null }, { validTo: { gte: now } }],
      },
      orderBy: [{ updatedAt: 'desc' }, { id: 'asc' }],
      take: 200,
      select: {
        id: true,
        type: true,
        value: true,
        scopeType: true,
        factSubjectId: true,
        verificationStatus: true,
        determinationMethod: true,
        observedAt: true,
        effectiveAt: true,
        validFrom: true,
        validTo: true,
        supersededAt: true,
        factDefinition: { select: { key: true, domainCode: true, valueType: true } },
      },
    }),
    prisma.businessProcess.findMany({
      where: { clientId, status: { not: 'ARCHIVED' } },
      orderBy: { name: 'asc' },
      include: {
        ownerPerson: { select: { id: true, name: true } },
        organizationGroup: { select: { id: true, name: true } },
        steps: {
          orderBy: [{ position: 'asc' }, { id: 'asc' }],
          include: {
            responsiblePerson: { select: { id: true, name: true } },
            system: { select: { id: true, name: true, category: true } },
          },
        },
      },
    }),
    prisma.businessSystem.findMany({
      where: { clientId, status: { not: 'ARCHIVED' } },
      orderBy: { name: 'asc' },
      include: { ownerPerson: { select: { id: true, name: true } } },
    }),
    prisma.observation.findMany({
      where: { clientId },
      orderBy: [{ observedAt: 'desc' }, { id: 'asc' }],
      take: 200,
      select: {
        id: true,
        observationType: true,
        observedAt: true,
        createdAt: true,
        sourceRecordId: true,
        inputDigest: true,
        connection: { select: { id: true, sourceType: true, name: true } },
        discoveryRun: { select: { id: true, status: true, startedAt: true } },
      },
    }),
    prisma.processObservationSnapshot.findMany({
      where: { clientId },
      orderBy: [{ observedAt: 'desc' }, { id: 'asc' }],
      take: 200,
      select: {
        id: true,
        businessProcessId: true,
        metricVersion: true,
        observedAt: true,
        inputDigest: true,
        snapshotDigest: true,
        metrics: true,
        provenance: true,
        businessProcess: { select: { id: true, name: true } },
      },
    }),
    prisma.problemDomain.findMany({
      where: { clientId, status: 'ACTIVE' },
      orderBy: { name: 'asc' },
      select: { id: true, key: true, name: true, description: true, status: true },
    }),
    prisma.diagnosisCandidate.findMany({
      where: { clientId },
      orderBy: { createdAt: 'desc' },
      take: 200,
      select: {
        id: true,
        title: true,
        summary: true,
        status: true,
        sourceRefs: true,
        problemDomain: { select: { id: true, key: true, name: true } },
        businessProcess: { select: { id: true, name: true } },
        evidenceLinks: {
          select: {
            evidence: { select: { id: true, title: true, verificationStatus: true, strength: true } },
          },
        },
      },
    }),
    prisma.recommendationCandidate.findMany({
      where: { clientId },
      orderBy: { createdAt: 'desc' },
      take: 200,
      select: {
        id: true,
        title: true,
        problemStatement: true,
        direction: true,
        kind: true,
        impactTags: true,
        interventionCodes: true,
        status: true,
        sufficiency: true,
        diagnosisId: true,
        diagnosis: {
          select: {
            problemDomain: { select: { key: true, name: true } },
            businessProcess: { select: { id: true, name: true } },
          },
        },
        evidenceLinks: {
          select: {
            evidence: { select: { id: true, title: true, verificationStatus: true, strength: true } },
          },
        },
      },
    }),
    prisma.evidenceRecord.findMany({
      where: { clientId },
      orderBy: { createdAt: 'desc' },
      take: 200,
      select: {
        id: true,
        sourceType: true,
        status: true,
        title: true,
        description: true,
        validFrom: true,
        validUntil: true,
        clientFactId: true,
        observationId: true,
        documentVersionId: true,
      },
    }),
    prisma.researchEvidence.findMany({
      where: { OR: [{ clientId }, { clientId: null }] },
      orderBy: [{ verificationStatus: 'desc' }, { title: 'asc' }],
      take: 200,
      select: {
        id: true,
        kind: true,
        title: true,
        origin: true,
        boundedClaim: true,
        verificationStatus: true,
        strength: true,
        domainKeys: true,
      },
    }),
    prisma.clientFactAnswerState.findMany({
      where: { clientId },
      select: { status: true },
    }),
  ]);

  if (!client) {
    return {
      client: {
        id: clientId,
        name: '',
        operatingProfile: null,
      },
      known: { facts: [], processes: [], systems: [] },
      observed: { observations: [], processSnapshots: [] },
      problems: { domains: [], diagnoses: [], sufficiency: [] },
      proposed: { recommendations: [] },
      evidence: { records: [], research: [] },
      missing: {
        hasUnknownFacts: false,
        hasUnansweredFactDefinitions: false,
        hasConflictingEvidence: false,
        insufficientRecommendationCount: 0,
        unresolvedItems: [{ code: 'CLIENT_NOT_FOUND', message: 'Client not found.' }],
      },
    };
  }

  const diagnosisDtos = diagnoses.map((row) => ({
    id: row.id,
    provenanceClass: 'DERIVED_DIAGNOSIS' as const,
    title: row.title,
    summary: row.summary,
    status: row.status,
    problemDomain: row.problemDomain,
    businessProcess: row.businessProcess,
    sourceRefs: row.sourceRefs,
    evidence: row.evidenceLinks.map(({ evidence }) => evidenceSummary(evidence)),
  }));

  const recommendationDtos = recommendations.map((row) => ({
    id: row.id,
    provenanceClass: 'RECOMMENDATION' as const,
    title: row.title,
    problemStatement: row.problemStatement,
    direction: row.direction,
    kind: row.kind,
    impactTags: row.impactTags,
    interventionCodes: row.interventionCodes,
    status: row.status,
    sufficiency: row.sufficiency,
    diagnosisId: row.diagnosisId,
    domain: row.diagnosis?.problemDomain ?? null,
    businessProcess: row.diagnosis?.businessProcess ?? null,
    evidence: row.evidenceLinks.map(({ evidence }) => evidenceSummary(evidence)),
  }));

  const hasUnknownFacts =
    facts.some((fact) => fact.value.trim().toUpperCase() === 'UNKNOWN') ||
    answerStates.some((answerState) => answerState.status === 'UNKNOWN');
  const hasConflictingEvidence =
    recommendations.some((recommendation) => recommendation.sufficiency === 'CONFLICTING_EVIDENCE') ||
    diagnoses.some((diagnosis) => diagnosis.evidenceLinks.some(({ evidence }) => evidence.verificationStatus === 'DISPUTED'));
  const insufficientRecommendationCount = recommendations.filter((recommendation) =>
    ['NEEDS_MORE_DATA', 'INSUFFICIENT_EVIDENCE', 'CONFLICTING_EVIDENCE', 'HUMAN_DOMAIN_REVIEW'].includes(recommendation.sufficiency),
  ).length;

  return {
    client: {
      id: client.id,
      name: client.name,
      operatingProfile: client.operatingProfile
        ? {
            provenanceClass: 'CANONICAL_STATE' as const,
            status: client.operatingProfile.status,
            complianceEnrollmentStatus: client.operatingProfile.complianceEnrollmentStatus,
            summary: client.operatingProfile.summary,
            lastReviewedAt: iso(client.operatingProfile.lastReviewedAt),
            nextReviewAt: iso(client.operatingProfile.nextReviewAt),
          }
        : null,
    },
    known: {
      facts: facts.map((fact) => ({
        id: fact.id,
        provenanceClass: 'CANONICAL_STATE' as const,
        type: fact.type,
        value: fact.value,
        factDefinition: fact.factDefinition,
        scopeType: fact.scopeType,
        factSubjectId: fact.factSubjectId,
        verificationStatus: fact.verificationStatus,
        determinationMethod: fact.determinationMethod,
        observedAt: iso(fact.observedAt),
        effectiveAt: iso(fact.effectiveAt),
        validFrom: fact.validFrom.toISOString(),
        validTo: iso(fact.validTo),
        supersededAt: iso(fact.supersededAt),
      })),
      processes: processes.map((process) => ({
        id: process.id,
        provenanceClass: 'CANONICAL_STATE' as const,
        name: process.name,
        category: process.category,
        description: process.description,
        criticality: process.criticality,
        frequency: process.frequency,
        status: process.status,
        owner: process.ownerPerson,
        organizationGroup: process.organizationGroup,
        steps: process.steps.map((step) => ({
          id: step.id,
          position: step.position,
          name: step.name,
          stepType: step.stepType,
          isApproval: step.isApproval,
          responsiblePerson: step.responsiblePerson,
          system: step.system,
          estimatedActiveMinutes: step.estimatedActiveMinutes,
          estimatedWaitingMinutes: step.estimatedWaitingMinutes,
        })),
      })),
      systems: systems.map((system) => ({
        id: system.id,
        provenanceClass: 'CANONICAL_STATE' as const,
        name: system.name,
        category: system.category,
        vendor: system.vendor,
        purpose: system.purpose,
        status: system.status,
        owner: system.ownerPerson,
      })),
    },
    observed: {
      observations: observations.map((observation) => ({
        id: observation.id,
        provenanceClass: 'DECLARED_OBSERVATION' as const,
        observationType: observation.observationType,
        observedAt: observation.observedAt.toISOString(),
        createdAt: observation.createdAt.toISOString(),
        sourceRecordId: observation.sourceRecordId,
        inputDigest: observation.inputDigest,
        source: observation.connection,
        discoveryRun: observation.discoveryRun
          ? {
              id: observation.discoveryRun.id,
              status: observation.discoveryRun.status,
              startedAt: observation.discoveryRun.startedAt.toISOString(),
            }
          : null,
      })),
      processSnapshots: snapshots.map((snapshot) => ({
        id: snapshot.id,
        provenanceClass: 'MEASURED_SNAPSHOT' as const,
        businessProcess: snapshot.businessProcess,
        metricVersion: snapshot.metricVersion,
        observedAt: snapshot.observedAt.toISOString(),
        inputDigest: snapshot.inputDigest,
        snapshotDigest: snapshot.snapshotDigest,
        metrics: snapshot.metrics,
        provenance: snapshot.provenance,
      })),
    },
    problems: {
      domains: domains.map((domain) => ({
        id: domain.id,
        provenanceClass: 'DERIVED_DIAGNOSIS' as const,
        key: domain.key,
        name: domain.name,
        description: domain.description,
        status: domain.status,
      })),
      diagnoses: diagnosisDtos,
      sufficiency: recommendationDtos.map((recommendation) => ({
        recommendationId: recommendation.id,
        provenanceClass: 'RECOMMENDATION' as const,
        decision: recommendation.sufficiency,
        evidenceCount: recommendation.evidence.length,
      })),
    },
    proposed: { recommendations: recommendationDtos },
    evidence: {
      records: evidenceRecords.map((record) => ({
        id: record.id,
        provenanceClass: 'RESEARCH_EVIDENCE' as const,
        sourceType: record.sourceType,
        status: record.status,
        title: record.title,
        description: record.description,
        validFrom: iso(record.validFrom),
        validUntil: iso(record.validUntil),
        clientFactId: record.clientFactId,
        observationId: record.observationId,
        documentVersionId: record.documentVersionId,
      })),
      research: researchEvidence.map((record) => ({
        id: record.id,
        provenanceClass: 'RESEARCH_EVIDENCE' as const,
        kind: record.kind,
        title: record.title,
        origin: record.origin,
        boundedClaim: record.boundedClaim,
        verificationStatus: record.verificationStatus,
        strength: record.strength,
        domainKeys: record.domainKeys,
      })),
    },
    missing: {
      hasUnknownFacts,
      hasUnansweredFactDefinitions: false,
      hasConflictingEvidence,
      insufficientRecommendationCount,
      unresolvedItems: [
        ...(hasUnknownFacts ? [{ code: 'UNKNOWN_CANONICAL_FACT', message: 'At least one current canonical fact is explicitly unknown.' }] : []),
        ...(hasConflictingEvidence ? [{ code: 'CONFLICTING_EVIDENCE', message: 'At least one diagnosis or recommendation has conflicting evidence.' }] : []),
        ...(insufficientRecommendationCount > 0
          ? [{ code: 'INSUFFICIENT_RECOMMENDATION_DATA', message: 'Some recommendations require more data or human domain review.' }]
          : []),
      ],
    },
  };
}
