/**
 * GROW — research & recommendation orchestration service.
 *
 * Pipeline (reconstructed to the interrupted implementation's contracts):
 *
 *   canonical inputs (processes, latest snapshots, declared survey
 *   observations)
 *     → RecommendationRun (idempotent per [clientId, idempotencyKey])
 *     → ProblemDomain + DiagnosisCandidate rows (deterministic rules only)
 *     → SufficiencyDecision gate (VERIFIED corpus + internal signal)
 *     → RecommendationCandidate rows in PENDING_REVIEW
 *     → human review (requireManager; reviewedById recorded)
 *         · ACCEPT            → ImprovementOpportunity only
 *         · DECLINE           → status DECLINED
 *         · REQUEST_MORE_INFO → status NEEDS_MORE_DATA
 *     → separate explicit initiative handoff reusing createInitiative
 *     → OutcomeMeasurement: before/after ProcessObservationSnapshot on the
 *       same client + same process, deterministic ROI with provenance.
 *
 * Nothing here writes findings, tasks, or initiatives without the human step.
 */

import {
  SufficiencyDecision,
  ImprovementOpportunityStatus,
  Prisma,
  PrismaClient,
  RecommendationCandidateStatus,
  RecommendationRunStatus,
} from '@prisma/client';
import { prisma as defaultPrisma } from '../../../prisma/prisma.service';
import {
  InteractionError,
  InternalActor,
  assertClientReadAccess,
  safeText,
} from '../../client-interaction/base';
import { DOMAIN_KEYS, ensureCorpusSeeded, findCorpusEvidenceForDomains, registerInternalEvidence, toEvidenceDTO } from './corpus';
import { computeRoiEstimate, RoiEstimate, RoiProvenanceType, ROI_ENGINE_VERSION } from './roiEngine';
import { deriveProcessSignals, selectInterventions } from './interventions';
import { createInitiative } from '../../client-company/service';

type Db = PrismaClient | Prisma.TransactionClient;

const MANAGER_ROLES = new Set(['ADMIN', 'PARTNER']);

function requireManager(actor: InternalActor): void {
  if (!actor?.userId || !MANAGER_ROLES.has(String(actor.role || ''))) {
    throw new InteractionError(403, 'GROW_REVIEW_FORBIDDEN', 'Only managers may review grow recommendations.');
  }
}

export function canRunGrowResearch(actor: InternalActor): boolean {
  return Boolean(actor?.userId) && MANAGER_ROLES.has(String(actor.role || ''));
}

/**
 * Deterministic evidence-sufficiency gate (all six states reachable):
 *   SUPPORTED            verified external evidence + internal signal
 *   NEEDS_MORE_DATA      internal signal, but no verified external evidence
 *   INSUFFICIENT_EVIDENCE no internal signal and no verified evidence
 *   CONFLICTING_EVIDENCE  both verified and disputed evidence exist
 *   OUT_OF_SCOPE          domain is not a Grow process domain
 *   HUMAN_DOMAIN_REVIEW   only disputed evidence exists -> expert required
 * Only SUPPORTED is actionable.
 */
export function decideSufficiency(input: {
  domainKey: string;
  verifiedEvidenceCount: number;
  disputedEvidenceCount: number;
  measured: boolean;
  declared: boolean;
}): { decision: SufficiencyDecision; reasons: string[] } {
  const knownDomain = (DOMAIN_KEYS as readonly string[]).includes(input.domainKey);
  if (!knownDomain) {
    return {
      decision: 'OUT_OF_SCOPE',
      reasons: ['A jelzés nem a Grow folyamat-domainjei közé tartozik — más szakterületi folyamatra tartozhat.'],
    };
  }
  if (input.verifiedEvidenceCount > 0 && input.disputedEvidenceCount > 0) {
    return {
      decision: 'CONFLICTING_EVIDENCE',
      reasons: ['A rendelkezésre álló bizonyítékok ellentmondásosak. Szakértői felülvizsgálat szükséges.'],
    };
  }
  if (input.disputedEvidenceCount > 0 && input.verifiedEvidenceCount === 0) {
    return {
      decision: 'HUMAN_DOMAIN_REVIEW',
      reasons: ['Szakértői felülvizsgálat szükséges, mielőtt javaslatot adunk.'],
    };
  }
  if (input.verifiedEvidenceCount === 0) {
    if (input.measured || input.declared) {
      return {
        decision: 'NEEDS_MORE_DATA',
        reasons: ['Nincs ellenőrzött külső szakirodalmi bizonyíték ehhez a területhez.'],
      };
    }
    return { decision: 'INSUFFICIENT_EVIDENCE', reasons: ['A diagnózis jelzés belső bizonyíték nélkül áll.'] };
  }
  if (input.measured || input.declared) {
    return {
      decision: 'SUPPORTED',
      reasons: [
        input.measured
          ? 'Ellenőrzött szakirodalmi bizonyíték + ügyfél-mérési pillanatkép támasztja alá.'
          : 'Ellenőrzött szakirodalmi bizonyíték + deklarált megfigyelés támasztja alá.',
      ],
    };
  }
  return {
    decision: 'INSUFFICIENT_EVIDENCE',
    reasons: ['Van ellenőrzött külső bizonyíték, de hiányzik az ügyfél-oldali belső jelzés.'],
  };
}

// ---------------------------------------------------------------------------
// Hungarian label contracts (stable domain keys → customer-facing language)
// ---------------------------------------------------------------------------

export const DOMAIN_LABELS_HU: Record<string, { title: string; problem: string; direction: string }> = {
  MANUAL_ADMIN_LOAD: {
    title: 'Túl sok kézi adminisztráció',
    problem: 'A folyamat sok kézi lépést tartalmaz, ami időt visz és hibalehetőséget hordoz.',
    direction: 'Érdemes a kézi lépések csökkentését vagy sablonosítását megvizsgálni.',
  },
  APPROVAL_DELAY: {
    title: 'Lassú jóváhagyások / várakozás',
    problem: 'A folyamat várakozási aránya magas; a jóváhagyási pontoknál torlódik a munka.',
    direction: 'Érdemes a jóváhagyási pontokat és felelősöket átnézni.',
  },
  DUPLICATE_DATA_ENTRY: {
    title: 'Ugyanazokat az adatokat többször rögzítjük',
    problem: 'Több adatrögzítő lépés ismétlődik, ami duplikált munkát jelent.',
    direction: 'Érdemes az adatrögzítést egyszeri pontra vonni, a többiből átemelni.',
  },
  SYSTEM_SWITCHING: {
    title: 'Túl sok rendszer között kell váltani',
    problem: 'A folyamat sok különböző rendszert érint, rendszerközi váltásokkal.',
    direction: 'Érdemes a rendszerhasználatot egyszerűsíteni vagy integrálni.',
  },
  UNCLEAR_OWNERSHIP: {
    title: 'Nem egyértelmű, ki miért felel',
    problem: 'Felelős nélküli lépések vagy gyakori felelősváltás látszik a folyamatban.',
    direction: 'Érdemes a lépés-felelősöket és a folyamatfelelőst tisztázni.',
  },
  REWORK: {
    title: 'Sok a javítás / újramunka',
    problem: 'Az elvégzett munka egy része javításra, újramunkára megy el.',
    direction: 'Érdemes a bemeneti minőséget és a visszacsatolást erősíteni.',
  },
  UNMEASURED_COST: {
    title: 'Nehéz mérni, mi mennyi idő és pénz',
    problem: 'A folyamat idő- és költségterhelése nem látszik elég jól.',
    direction: 'Érdemes a folyamat lépésenkénti időbecslését rögzíteni.',
  },
  GENERAL_FLOW: {
    title: 'Általános folyamat-probléma',
    problem: 'A jelzés alapján a folyamat működését érdemes közelebbről megnézni.',
    direction: 'Érdemes a folyamatot lépésről lépésre felvázolni és mérni.',
  },
};

/** Survey intake category → problem domain. */
export const SURVEY_CATEGORY_TO_DOMAIN: Record<string, string> = {
  MANUAL_ADMIN: 'MANUAL_ADMIN_LOAD',
  SLOW_APPROVAL: 'APPROVAL_DELAY',
  DUPLICATE_DATA: 'DUPLICATE_DATA_ENTRY',
  TOO_MANY_SYSTEMS: 'SYSTEM_SWITCHING',
  UNCLEAR_OWNERSHIP: 'UNCLEAR_OWNERSHIP',
  REWORK: 'REWORK',
  UNMEASURED_COST: 'UNMEASURED_COST',
  GENERAL_CONCERN: 'GENERAL_FLOW',
};

// ---------------------------------------------------------------------------
// Snapshot helpers — work on the T2A metric array persisted in the snapshot.
// ---------------------------------------------------------------------------

type MetricRow = { code: string; value: number | boolean | null; unit: string };

function metricMap(metrics: unknown): Map<string, number | boolean | null> {
  const map = new Map<string, number | boolean | null>();
  if (Array.isArray(metrics)) {
    for (const m of metrics as MetricRow[]) {
      if (m && typeof m.code === 'string') map.set(m.code, m.value);
    }
  }
  return map;
}

function numMetric(map: Map<string, number | boolean | null>, code: string): number | null {
  const v = map.get(code);
  return typeof v === 'number' && Number.isFinite(v) ? v : null;
}

/** Estimated monthly run frequency from the process' declared frequency. */
function frequencyToMonthlyRuns(frequency: string | null | undefined): number {
  switch (String(frequency || '').toUpperCase()) {
    case 'DAILY': return 20;
    case 'WEEKLY': return 4;
    case 'MONTHLY': return 1;
    case 'QUARTERLY': return 1 / 3;
    case 'ANNUAL': return 1 / 12;
    default: return 4;
  }
}

// ---------------------------------------------------------------------------
// Diagnosis rules — deterministic; each outcome records which signal class
// (measured snapshot vs declared survey observation) supports it.
// ---------------------------------------------------------------------------

interface DiagnosisRuleOutcome {
  domainKey: string;
  measured: boolean;
  declared: boolean;
  severity: 'HIGH' | 'MEDIUM' | 'LOW';
  sourceRefs: {
    snapshotIds: string[];
    observationIds: string[];
    businessProcessId: string | null;
    severity: 'HIGH' | 'MEDIUM' | 'LOW';
  };
}

function diagnoseProcess(
  process: { id: string; ownerPersonId: string | null },
  latestSnapshot: { id: string; metrics: unknown } | null,
): DiagnosisRuleOutcome[] {
  const out: DiagnosisRuleOutcome[] = [];
  const refs = (severity: 'HIGH' | 'MEDIUM' | 'LOW') => ({
    snapshotIds: latestSnapshot ? [latestSnapshot.id] : [],
    observationIds: [] as string[],
    businessProcessId: process.id,
    severity,
  });

  if (!latestSnapshot) {
    out.push({
      domainKey: 'UNMEASURED_COST',
      measured: false,
      declared: false,
      severity: 'LOW',
      sourceRefs: refs('LOW'),
    });
    return out;
  }

  const m = metricMap(latestSnapshot.metrics);
  const waitingShare = numMetric(m, 'WAITING_SHARE');
  const approvalSteps = numMetric(m, 'APPROVAL_STEP_COUNT');
  const dataEntry = numMetric(m, 'DATA_ENTRY_STEP_COUNT');
  const systemSwitches = numMetric(m, 'SYSTEM_SWITCH_COUNT');
  const systemCount = numMetric(m, 'SYSTEM_COUNT');
  const unassigned = numMetric(m, 'UNASSIGNED_STEP_COUNT');
  const ownerPresent = m.get('PROCESS_OWNER_PRESENT') === true;
  const personChanges = numMetric(m, 'RESPONSIBLE_PERSON_CHANGE_COUNT');
  const totalActive = numMetric(m, 'TOTAL_ACTIVE_MINUTES');
  const handoffs = numMetric(m, 'HANDOFF_STEP_COUNT');

  if ((waitingShare != null && waitingShare >= 0.4) || (approvalSteps != null && approvalSteps >= 3)) {
    out.push({ domainKey: 'APPROVAL_DELAY', measured: true, declared: false, severity: 'HIGH', sourceRefs: refs('HIGH') });
  }
  if (dataEntry != null && dataEntry >= 3) {
    out.push({ domainKey: 'DUPLICATE_DATA_ENTRY', measured: true, declared: false, severity: 'MEDIUM', sourceRefs: refs('MEDIUM') });
  }
  if ((systemSwitches != null && systemSwitches >= 3) || (systemCount != null && systemCount >= 4)) {
    out.push({ domainKey: 'SYSTEM_SWITCHING', measured: true, declared: false, severity: 'MEDIUM', sourceRefs: refs('MEDIUM') });
  }
  if (!ownerPresent || (unassigned != null && unassigned >= 2) || (personChanges != null && personChanges >= 4)) {
    out.push({ domainKey: 'UNCLEAR_OWNERSHIP', measured: true, declared: false, severity: 'MEDIUM', sourceRefs: refs('MEDIUM') });
  }
  if (totalActive != null && totalActive >= 240 && (handoffs ?? 0) >= 3) {
    out.push({ domainKey: 'MANUAL_ADMIN_LOAD', measured: true, declared: false, severity: 'HIGH', sourceRefs: refs('HIGH') });
  }

  return out;
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

export interface RunResearchCycleResult {
  runId: string;
  status: RecommendationRunStatus;
  diagnosisCount: number;
  recommendationCount: number;
  replayed: boolean;
}

/**
 * Starts (or idempotently replays) a research/recommendation cycle for the
 * client. Retry-safe: the same idempotencyKey returns the existing run.
 */
export async function runResearchCycle(
  actor: InternalActor,
  clientId: string,
  input: { businessProcessId?: string; idempotencyKey?: string } = {},
  db: Db = defaultPrisma,
): Promise<RunResearchCycleResult> {
  requireManager(actor);
  await assertClientReadAccess(actor, clientId, db as PrismaClient);
  const idempotencyKey = safeText(input.idempotencyKey, 'idempotencyKey', 128, false) ?? null;

  if (idempotencyKey) {
    const existing = await db.recommendationRun.findUnique({
      where: { clientId_idempotencyKey: { clientId, idempotencyKey } },
    });
    if (existing) {
      const [diagnosisCount, recommendationCount] = await Promise.all([
        db.diagnosisCandidate.count({ where: { runId: existing.id, clientId } }),
        db.recommendationCandidate.count({ where: { runId: existing.id, clientId } }),
      ]);
      return { runId: existing.id, status: existing.status, diagnosisCount, recommendationCount, replayed: true };
    }
  }

  await ensureCorpusSeeded(db);

  const run = await db.recommendationRun.create({
    data: { clientId, status: 'RUNNING', idempotencyKey },
  });

  try {
    const result = await executeRun(actor, clientId, run.id, input.businessProcessId ?? null, db);
    await db.recommendationRun.update({
      where: { id_clientId: { id: run.id, clientId } },
      data: { status: 'COMPLETED', completedAt: new Date() },
    });
    return { runId: run.id, status: 'COMPLETED', ...result, replayed: false };
  } catch (err) {
    await db.recommendationRun.update({
      where: { id_clientId: { id: run.id, clientId } },
      data: { status: 'FAILED', completedAt: new Date() },
    });
    throw err;
  }
}

async function executeRun(
  actor: InternalActor,
  clientId: string,
  runId: string,
  onlyProcessId: string | null,
  db: Db,
): Promise<{ diagnosisCount: number; recommendationCount: number }> {
  const processes = await db.businessProcess.findMany({
    where: { clientId, status: 'ACTIVE', ...(onlyProcessId ? { id: onlyProcessId } : {}) },
    orderBy: { createdAt: 'asc' },
  });

  const snapshots = await db.processObservationSnapshot.findMany({
    where: { clientId },
    orderBy: [{ observedAt: 'desc' }, { createdAt: 'desc' }],
  });
  const latestByProcess = new Map<string, (typeof snapshots)[number]>();
  for (const s of snapshots) {
    if (!latestByProcess.has(s.businessProcessId)) latestByProcess.set(s.businessProcessId, s);
  }

  const declaredObs = await db.observation.findMany({
    where: { clientId, observationType: 'DECLARED_SURVEY' },
    orderBy: { observedAt: 'desc' },
    take: 50,
  });

  const allSurveyCategories: string[] = [];
  for (const obs of declaredObs) {
    const payload = obs.rawPayload as { categories?: string[] } | null;
    if (Array.isArray(payload?.categories)) allSurveyCategories.push(...payload!.categories!.map(String));
  }

  const metricsBySnapshot = new Map<string, Record<string, number | boolean | null>>();
  for (const s of snapshots) metricsBySnapshot.set(s.id, Object.fromEntries(metricMap(s.metrics)));

  const outcomes: DiagnosisRuleOutcome[] = [];
  const surveyDomainHits = new Map<string, { observationIds: string[] }>();
  for (const obs of declaredObs) {
    const payload = obs.rawPayload as { categories?: string[] } | null;
    const categories = Array.isArray(payload?.categories) ? payload!.categories! : [];
    for (const cat of categories) {
      const domain = SURVEY_CATEGORY_TO_DOMAIN[String(cat)] ?? 'GENERAL_FLOW';
      const hit = surveyDomainHits.get(domain) ?? { observationIds: [] };
      hit.observationIds.push(obs.id);
      surveyDomainHits.set(domain, hit);
    }
  }

  for (const process of processes) {
    const latest = latestByProcess.get(process.id) ?? null;
    const diags = diagnoseProcess(
      { id: process.id, ownerPersonId: process.ownerPersonId },
      latest ? { id: latest.id, metrics: latest.metrics } : null,
    );
    for (const d of diags) {
      const survey = surveyDomainHits.get(d.domainKey);
      if (survey) {
        d.declared = true;
        d.sourceRefs.observationIds.push(...survey.observationIds);
      }
      outcomes.push(d);
    }
  }

  // Survey-declared domains with no measured process counterpart still surface
  // as declared-only diagnoses (they gate to NEEDS_MORE_DATA at most).
  for (const [domain, hit] of surveyDomainHits) {
    if (!outcomes.some((o) => o.domainKey === domain)) {
      outcomes.push({
        domainKey: domain,
        measured: false,
        declared: true,
        severity: 'MEDIUM',
        sourceRefs: { snapshotIds: [], observationIds: hit.observationIds, businessProcessId: null, severity: 'MEDIUM' },
      });
    }
  }

  let diagnosisCount = 0;
  let recommendationCount = 0;

  for (const outcome of outcomes) {
    const labels = DOMAIN_LABELS_HU[outcome.domainKey] ?? DOMAIN_LABELS_HU.GENERAL_FLOW;
    const domain = await db.problemDomain.upsert({
      where: { clientId_key: { clientId, key: outcome.domainKey } },
      create: { clientId, key: outcome.domainKey, name: labels.title, description: labels.problem },
      update: {},
    });

    const verifiedCorpus = await findCorpusEvidenceForDomains([outcome.domainKey], { verifiedOnly: true }, db);
    const allCorpus = await findCorpusEvidenceForDomains([outcome.domainKey], {}, db);

    // Register internal signals as client-internal evidence so they are citable
    // in the evidence drawer with provenance.
    const internalEvidenceIds: string[] = [];
    for (const obsId of outcome.sourceRefs.observationIds) {
      const ev = await registerInternalEvidence(
        actor,
        {
          clientId,
          corpusKey: `obs:${obsId}`,
          kind: 'INTERNAL_OBSERVATION',
          title: 'Deklarált megfigyelés (strukturált intake)',
          locator: `observation:${obsId}`,
          strength: 'MODERATE',
          domainKeys: [outcome.domainKey],
        },
        db,
      );
      internalEvidenceIds.push(ev.id);
    }
    for (const snapId of outcome.sourceRefs.snapshotIds) {
      const ev = await registerInternalEvidence(
        actor,
        {
          clientId,
          corpusKey: `snap:${snapId}`,
          kind: 'INTERNAL_MEASUREMENT',
          title: 'Folyamat-mérési pillanatkép',
          locator: `snapshot:${snapId}`,
          strength: 'STRONG',
          domainKeys: [outcome.domainKey],
        },
        db,
      );
      internalEvidenceIds.push(ev.id);
    }

    // Evidence sufficiency gate — 6/6 states, only SUPPORTED is actionable.
    const disputedCorpus = await findCorpusEvidenceForDomains(
      [outcome.domainKey],
      { verificationStatuses: ['DISPUTED'] },
      db,
    );
    const gate = decideSufficiency({
      domainKey: outcome.domainKey,
      verifiedEvidenceCount: verifiedCorpus.length,
      disputedEvidenceCount: disputedCorpus.length,
      measured: outcome.measured,
      declared: outcome.declared,
    });
    const decision = gate.decision;
    const reasons = gate.reasons;

    // Canonical intervention selection (backend-owned taxonomy + guardrails).
    const metrics = outcome.sourceRefs.snapshotIds
      .map((id) => metricsBySnapshot.get(id))
      .find((m): m is Record<string, number | boolean | null> => Boolean(m)) ?? {};
    const signals = deriveProcessSignals({
      metrics,
      surveyCategories: allSurveyCategories,
      measured: outcome.measured,
      declared: outcome.declared,
    });
    const interventionCodes = selectInterventions({
      domainKey: outcome.domainKey,
      signals,
      measured: outcome.measured,
    });

    const diagnosis = await db.diagnosisCandidate.create({
      data: {
        clientId,
        runId,
        problemDomainId: domain.id,
        businessProcessId: outcome.sourceRefs.businessProcessId,
        title: labels.title,
        summary: `${labels.problem} — Bizonyíték-döntés: ${decision}. ${reasons.join(' ')}`,
        status: decision === 'INSUFFICIENT_EVIDENCE' ? 'NEEDS_MORE_DATA' : 'OPEN',
        sourceRefs: { ...outcome.sourceRefs, sufficiency: decision, reasons } as unknown as Prisma.InputJsonValue,
      },
    });
    diagnosisCount += 1;

    const diagnosisEvidenceLinks = [
      ...allCorpus.map((e) => e.id),
      ...internalEvidenceIds,
    ];
    for (const evidenceId of diagnosisEvidenceLinks) {
      await db.diagnosisEvidenceLink.upsert({
        where: { diagnosisId_evidenceId: { diagnosisId: diagnosis.id, evidenceId } },
        create: { diagnosisId: diagnosis.id, evidenceId },
        update: {},
      });
    }

    // Only gate-passing diagnoses produce a recommendation candidate;
    // INSUFFICIENT_EVIDENCE stays a diagnosis row but never reaches the feed.
    if (decision === 'SUPPORTED' || decision === 'NEEDS_MORE_DATA') {
      const kind = outcome.severity === 'HIGH' && outcome.measured ? 'DEVELOPMENT' : 'QUICK_FIX';
      const rec = await db.recommendationCandidate.create({
        data: {
          clientId,
          runId,
          diagnosisId: diagnosis.id,
          status: 'PENDING_REVIEW' as RecommendationCandidateStatus,
          kind,
          title: labels.title,
          problemStatement: labels.problem,
          direction: labels.direction,
          impactTags: [outcome.domainKey, outcome.severity],
          interventionCodes,
          sufficiency: decision,
        },
      });
      recommendationCount += 1;

      for (const evidenceId of diagnosisEvidenceLinks) {
        await db.recommendationEvidenceLink.upsert({
          where: { recommendationId_evidenceId: { recommendationId: rec.id, evidenceId } },
          create: { recommendationId: rec.id, evidenceId },
          update: {},
        });
      }
    }
  }

  return { diagnosisCount, recommendationCount };
}

// ---------------------------------------------------------------------------
// Read DTOs for the five screens
// ---------------------------------------------------------------------------

function strongestEvidence(evidences: { verificationStatus: string; strength: string }[]): string {
  if (evidences.some((e) => e.verificationStatus === 'VERIFIED' && e.strength === 'STRONG')) return 'STRONG';
  if (evidences.some((e) => e.verificationStatus === 'VERIFIED')) return 'MODERATE';
  return 'WEAK';
}

export async function listGrowOpportunities(
  actor: InternalActor,
  clientId: string,
  db: Db = defaultPrisma,
) {
  await assertClientReadAccess(actor, clientId, db as PrismaClient);
  const recs = await db.recommendationCandidate.findMany({
    where: { clientId, status: 'PENDING_REVIEW' },
    include: {
      diagnosis: { include: { problemDomain: true, businessProcess: true } },
      evidenceLinks: { include: { evidence: true } },
    },
    orderBy: { createdAt: 'desc' },
  });
  return recs.map((r) => ({
    id: r.id,
    runId: r.runId,
    status: r.status,
    kind: r.kind,
    sufficiency: r.sufficiency,
    actionable: r.sufficiency === 'SUPPORTED',
    interventionCodes: r.interventionCodes,
    title: r.title,
    problemStatement: r.problemStatement,
    direction: r.direction,
    impactTags: r.impactTags,
    domainKey: r.diagnosis?.problemDomain?.key ?? null,
    businessProcess: r.diagnosis?.businessProcess
      ? { id: r.diagnosis.businessProcess.id, name: r.diagnosis.businessProcess.name }
      : null,
    evidenceStrength: strongestEvidence(r.evidenceLinks.map((l) => l.evidence)),
    createdAt: r.createdAt.toISOString(),
  }));
}

export async function getOpportunityDetail(
  actor: InternalActor,
  clientId: string,
  recommendationId: string,
  db: Db = defaultPrisma,
) {
  await assertClientReadAccess(actor, clientId, db as PrismaClient);
  const r = await db.recommendationCandidate.findFirst({
    where: { id: recommendationId, clientId },
    include: {
      diagnosis: { include: { problemDomain: true, businessProcess: true } },
      evidenceLinks: { include: { evidence: true } },
      improvementOpportunity: true,
      reviewedBy: { select: { id: true, name: true } },
    },
  });
  if (!r) throw new InteractionError(404, 'RECOMMENDATION_NOT_FOUND', 'Recommendation not found for this client.');

  return {
    id: r.id,
    runId: r.runId,
    status: r.status,
    kind: r.kind,
    sufficiency: r.sufficiency,
    actionable: r.sufficiency === 'SUPPORTED',
    interventionCodes: r.interventionCodes,
    title: r.title,
    problemStatement: r.problemStatement,
    direction: r.direction,
    impactTags: r.impactTags,
    diagnosis: r.diagnosis
      ? {
          id: r.diagnosis.id,
          title: r.diagnosis.title,
          summary: r.diagnosis.summary,
          domainTitle: r.diagnosis.problemDomain?.name ?? null,
          businessProcess: r.diagnosis.businessProcess
            ? { id: r.diagnosis.businessProcess.id, name: r.diagnosis.businessProcess.name }
            : null,
          sourceRefs: r.diagnosis.sourceRefs,
        }
      : null,
    evidence: r.evidenceLinks.map((l) => toEvidenceDTO(l.evidence)),
    review: r.reviewedById
      ? { byId: r.reviewedById, byName: r.reviewedBy?.name ?? null, at: r.reviewedAt?.toISOString() ?? null, note: r.reviewNote }
      : null,
    opportunity: r.improvementOpportunity
      ? { id: r.improvementOpportunity.id, status: r.improvementOpportunity.status, developmentInitiativeId: r.improvementOpportunity.developmentInitiativeId }
      : null,
    createdAt: r.createdAt.toISOString(),
  };
}

export async function listGrowHome(
  actor: InternalActor,
  clientId: string,
  db: Db = defaultPrisma,
) {
  await assertClientReadAccess(actor, clientId, db as PrismaClient);
  const [opportunities, initiatives, outcomes] = await Promise.all([
    listGrowOpportunities(actor, clientId, db),
    db.developmentInitiative.findMany({
      where: { clientId },
      orderBy: { updatedAt: 'desc' },
      take: 50,
    }),
    db.outcomeMeasurement.findMany({
      where: { clientId },
      include: { businessProcess: { select: { id: true, name: true } } },
      orderBy: { createdAt: 'desc' },
      take: 50,
    }),
  ]);

  const supported = opportunities.filter((o) => o.sufficiency === 'SUPPORTED');
  const evidenceBacked = opportunities.filter((o) => o.evidenceStrength === 'STRONG' || o.evidenceStrength === 'MODERATE');
  const measurementBacked = opportunities.filter((o) =>
    (o as { diagnosis?: unknown }) && o.impactTags.length > 0 && o.evidenceStrength === 'STRONG',
  );

  return {
    canRunResearch: canRunGrowResearch(actor),
    opportunityCounts: {
      total: opportunities.length,
      supported: supported.length,
      evidenceBacked: evidenceBacked.length,
      measurementBacked: measurementBacked.length,
    },
    topOpportunities: opportunities.slice(0, 3),
    activeInitiatives: initiatives
      .filter((i) => ['PLANNED', 'ACTIVE', 'ON_HOLD'].includes(i.status))
      .map((i) => ({ id: i.id, title: i.title, status: i.status })),
    completedOutcomes: outcomes.map((o) => ({
      id: o.id,
      businessProcess: o.businessProcess ? { id: o.businessProcess.id, name: o.businessProcess.name } : null,
      basis: o.basis,
      synthetic: o.synthetic,
      createdAt: o.createdAt.toISOString(),
    })),
  };
}

// ---------------------------------------------------------------------------
// Human review — ACCEPT creates ImprovementOpportunity only.
// ---------------------------------------------------------------------------

export async function reviewRecommendation(
  actor: InternalActor,
  clientId: string,
  recommendationId: string,
  input: { decision: 'ACCEPT' | 'DECLINE' | 'REQUEST_MORE_INFO'; note?: string },
  db: Db = defaultPrisma,
) {
  requireManager(actor);
  await assertClientReadAccess(actor, clientId, db as PrismaClient);
  const note = safeText(input.note, 'note', 2000, false) ?? null;

  const rec = await db.recommendationCandidate.findFirst({ where: { id: recommendationId, clientId } });
  if (!rec) throw new InteractionError(404, 'RECOMMENDATION_NOT_FOUND', 'Recommendation not found for this client.');
  if (rec.status !== 'PENDING_REVIEW') {
    throw new InteractionError(409, 'RECOMMENDATION_ALREADY_REVIEWED', 'This recommendation was already reviewed.');
  }
  if (input.decision === 'ACCEPT' && rec.sufficiency !== 'SUPPORTED') {
    throw new InteractionError(422, 'RECOMMENDATION_NOT_SUPPORTED', 'Only SUPPORTED recommendations can be accepted.');
  }

  const prisma = db as PrismaClient;
  return prisma.$transaction(async (tx) => {
    const status: RecommendationCandidateStatus =
      input.decision === 'ACCEPT' ? 'ACCEPTED' : input.decision === 'DECLINE' ? 'DECLINED' : 'NEEDS_MORE_DATA';
    const updated = await tx.recommendationCandidate.update({
      where: { id_clientId: { id: rec.id, clientId } },
      data: { status, reviewedById: actor.userId, reviewedAt: new Date(), reviewNote: note },
    });

    let opportunity = null;
    if (input.decision === 'ACCEPT') {
      opportunity = await tx.improvementOpportunity.create({
        data: {
          clientId,
          recommendationId: rec.id,
          title: rec.title,
          problem: rec.problemStatement,
          direction: rec.direction,
          kind: rec.kind,
          impactTags: rec.impactTags,
          evidenceStrength: 'MODERATE',
          status: 'OPEN' as ImprovementOpportunityStatus,
        },
      });
    }

    return { recommendation: updated, opportunity };
  });
}

// ---------------------------------------------------------------------------
// Separate initiative handoff — reuses the canonical createInitiative contract.
// ---------------------------------------------------------------------------

export async function startInitiativeFromOpportunity(
  actor: InternalActor,
  clientId: string,
  opportunityId: string,
  input: { title?: string; reason?: string; currentState?: string; targetState?: string; priority?: string; caseId?: string } = {},
  db: Db = defaultPrisma,
) {
  requireManager(actor);
  await assertClientReadAccess(actor, clientId, db as PrismaClient);

  const opp = await db.improvementOpportunity.findFirst({
    where: { id: opportunityId, clientId },
    include: { recommendation: true },
  });
  if (!opp) throw new InteractionError(404, 'OPPORTUNITY_NOT_FOUND', 'Opportunity not found for this client.');
  if (opp.developmentInitiativeId) {
    throw new InteractionError(409, 'OPPORTUNITY_ALREADY_LINKED', 'Opportunity already handed off to an initiative.');
  }

  const initiative = await createInitiative(actor, clientId, {
    title: input.title ?? opp.title,
    reason: input.reason ?? opp.problem,
    currentState: input.currentState ?? opp.problem,
    targetState: input.targetState ?? opp.direction,
    priority: input.priority,
    caseId: input.caseId,
    status: 'PLANNED',
  }, db as PrismaClient);

  const updated = await db.improvementOpportunity.update({
    where: { id: opp.id },
    data: { developmentInitiativeId: initiative.id, status: 'INITIATIVE_STARTED' as ImprovementOpportunityStatus },
  });

  return { opportunity: updated, initiative };
}

// ---------------------------------------------------------------------------
// Outcome measurement + ROI.
// ---------------------------------------------------------------------------

export async function recordOutcomeMeasurement(
  actor: InternalActor,
  clientId: string,
  opportunityId: string,
  input: {
    businessProcessId: string;
    beforeSnapshotId: string;
    afterSnapshotId?: string;
    expectedActiveReductionPct?: number;
    runsPerMonth?: number;
    hourlyCostHuf?: { low: number; base: number; high: number };
    peopleAffected?: number;
    synthetic?: boolean;
    note?: string;
    provenanceType?: RoiProvenanceType;
  },
  db: Db = defaultPrisma,
) {
  requireManager(actor);
  await assertClientReadAccess(actor, clientId, db as PrismaClient);
  const note = safeText(input.note, 'note', 2000, false) ?? null;

  const opp = await db.improvementOpportunity.findFirst({ where: { id: opportunityId, clientId } });
  if (!opp) throw new InteractionError(404, 'OPPORTUNITY_NOT_FOUND', 'Opportunity not found for this client.');

  const process = await db.businessProcess.findFirst({ where: { id: input.businessProcessId, clientId } });
  if (!process) throw new InteractionError(404, 'BUSINESS_PROCESS_NOT_FOUND', 'Business process not found for this client.');

  const before = await db.processObservationSnapshot.findFirst({
    where: { id: input.beforeSnapshotId, clientId, businessProcessId: process.id },
  });
  if (!before) throw new InteractionError(422, 'SNAPSHOT_NOT_IN_PROCESS', 'Before-snapshot must belong to the same client and process.');

  let after: typeof before | null = null;
  if (input.afterSnapshotId) {
    after = await db.processObservationSnapshot.findFirst({
      where: { id: input.afterSnapshotId, clientId, businessProcessId: process.id },
    });
    if (!after) throw new InteractionError(422, 'SNAPSHOT_NOT_IN_PROCESS', 'After-snapshot must belong to the same client and process.');
    if (after.observedAt < before.observedAt) {
      throw new InteractionError(422, 'SNAPSHOT_ORDER_INVALID', 'After-snapshot must not precede the before-snapshot.');
    }
  }

  const beforeM = metricMap(before.metrics);
  const afterM = after ? metricMap(after.metrics) : null;

  const roi: RoiEstimate = computeRoiEstimate({
    runsPerMonth: input.runsPerMonth ?? frequencyToMonthlyRuns(process.frequency),
    beforeActiveMinutes: numMetric(beforeM, 'TOTAL_ACTIVE_MINUTES'),
    beforeWaitingMinutes: numMetric(beforeM, 'TOTAL_WAITING_MINUTES'),
    afterActiveMinutes: afterM ? numMetric(afterM, 'TOTAL_ACTIVE_MINUTES') : null,
    afterWaitingMinutes: afterM ? numMetric(afterM, 'TOTAL_WAITING_MINUTES') : null,
    expectedActiveReductionPct: input.expectedActiveReductionPct ?? null,
    hourlyCostHuf: input.hourlyCostHuf ?? null,
    peopleAffected: input.peopleAffected ?? null,
    provenanceType: input.provenanceType ?? null,
  });

  const metricsSummary = {
    metricVersion: before.metricVersion,
    before: Object.fromEntries(beforeM),
    after: afterM ? Object.fromEntries(afterM) : null,
    comparable: afterM != null && after!.metricVersion === before.metricVersion,
  };

  const prisma = db as PrismaClient;
  const created = await prisma.$transaction(async (tx) => {
    const outcome = await tx.outcomeMeasurement.create({
      data: {
        clientId,
        opportunityId: opp.id,
        developmentInitiativeId: opp.developmentInitiativeId,
        businessProcessId: process.id,
        beforeSnapshotId: before.id,
        afterSnapshotId: after?.id ?? null,
        basis: roi.basis,
        metricsSummary: metricsSummary as unknown as Prisma.InputJsonValue,
        roi: {
          ...roi,
          provenance: { ...roi.provenance, recordedById: actor.userId },
        } as unknown as Prisma.InputJsonValue,
        synthetic: Boolean(input.synthetic),
        note,
        recordedById: actor.userId,
      },
    });
    await tx.improvementOpportunity.update({
      where: { id: opp.id },
      data: { status: 'OUTCOME_RECORDED' as ImprovementOpportunityStatus },
    });
    return outcome;
  });

  return created;
}

export async function listOutcomeMeasurements(
  actor: InternalActor,
  clientId: string,
  db: Db = defaultPrisma,
) {
  await assertClientReadAccess(actor, clientId, db as PrismaClient);
  const rows = await db.outcomeMeasurement.findMany({
    where: { clientId },
    include: {
      businessProcess: { select: { id: true, name: true } },
      opportunity: { include: { recommendation: { select: { title: true } } } },
      recordedBy: { select: { id: true, name: true } },
      developmentInitiative: { select: { id: true, title: true, status: true } },
    },
    orderBy: { createdAt: 'desc' },
  });
  return rows.map((o) => ({
    id: o.id,
    basis: o.basis,
    synthetic: o.synthetic,
    businessProcess: o.businessProcess ? { id: o.businessProcess.id, name: o.businessProcess.name } : null,
    opportunityTitle: o.opportunity?.recommendation?.title ?? null,
    initiative: o.developmentInitiative
      ? { id: o.developmentInitiative.id, title: o.developmentInitiative.title, status: o.developmentInitiative.status }
      : null,
    metricsSummary: o.metricsSummary,
    roi: o.roi,
    note: o.note,
    recordedBy: o.recordedBy ? { id: o.recordedBy.id, name: o.recordedBy.name } : null,
    createdAt: o.createdAt.toISOString(),
  }));
}

export { ROI_ENGINE_VERSION };
