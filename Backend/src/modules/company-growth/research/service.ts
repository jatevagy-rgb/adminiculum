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
import { DOMAIN_KEYS, ensureCorpusSeeded, findCorpusEvidenceForDomains, registerInternalEvidence, toEvidenceDTO, projectEvidenceSourceBasis, projectSnapshotEvidenceSummary, EvidenceDTO } from './corpus';
import { computeRoiEstimate, InputValueOrigin, RoiEstimate, RoiProvenanceType, ROI_ENGINE_VERSION } from './roiEngine';
import { deriveProcessSignals, selectInterventions, INTERVENTIONS } from './interventions';
import { projectSnapshotSourceBasis, SourceBasis } from '../observation/sourceBasis';
import {
  GROW_ASSESSMENT_SCHEMA,
  GROW_PAIN_INTAKE_KIND,
  observationsToGrowSignals,
  supersedeAssessmentObservations,
  type GrowSignal,
  type GrowAssessmentFinding,
  type NormalizableObservation,
} from './observationSignals';
import { createInitiative } from '../../client-company/service';
import { createRequestDraft } from '../../client-interaction/requestService';

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
  sourceBasis?: SourceBasis | null;
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
    if (input.measured || input.declared || input.sourceBasis === 'ESTIMATED' || input.sourceBasis === 'DERIVED') {
      return {
        decision: 'NEEDS_MORE_DATA',
        reasons: ['Nincs ellenőrzött külső szakirodalmi bizonyíték ehhez a területhez.'],
      };
    }
    return { decision: 'INSUFFICIENT_EVIDENCE', reasons: ['A diagnózis jelzés belső bizonyíték nélkül áll.'] };
  }
  if (input.measured || input.declared || input.sourceBasis === 'ESTIMATED' || input.sourceBasis === 'DERIVED') {
    return {
      decision: 'SUPPORTED',
      reasons: [
        input.measured
          ? 'Ellenőrzött szakirodalmi bizonyíték + ügyfél-mérési pillanatkép támasztja alá.'
          : input.sourceBasis === 'ESTIMATED'
            ? 'Ellenőrzött szakirodalmi bizonyíték + becsült folyamatadat támasztja alá; nem tényleges mérés.'
            : input.sourceBasis === 'DERIVED'
              ? 'Ellenőrzött szakirodalmi bizonyíték + rögzített folyamatadatból levezetett jelzés támasztja alá.'
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

/**
 * Survey intake category → problem domain.
 *
 * Owned by the fail-closed Observation→Grow normalizer and re-exported here so
 * existing importers keep their contract. There is exactly one canonical map.
 */
export { SURVEY_CATEGORY_TO_DOMAIN } from './observationSignals';

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

/**
 * Derives the honest value origin of a ProcessObservationSnapshot from its
 * recorded provenance. The canonical T2B snapshot computes its metrics from
 * estimated step fields (inputFieldInventory lists `steps.estimated*`), so it
 * is ESTIMATED — never MEASURED. A snapshot whose provenance cannot establish
 * an origin returns null (caller fails closed).
 */
function deriveSnapshotValueOrigin(provenance: unknown): InputValueOrigin | null {
  if (!provenance || typeof provenance !== 'object') return null;
  const inventory: string[] = Array.isArray((provenance as { inputFieldInventory?: unknown }).inputFieldInventory)
    ? ((provenance as { inputFieldInventory: unknown[] }).inputFieldInventory.map((f) => String(f)))
    : [];
  if (inventory.length === 0) return null;
  if (inventory.some((f) => f.includes('estimated'))) return 'ESTIMATED';
  if (inventory.some((f) => f.includes('measured') || f.includes('observed'))) return 'MEASURED';
  return null;
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
    sourceBasis?: SourceBasis | null;
    assessmentFindings?: GrowAssessmentFinding[];
    safetyObservationIds?: string[];
  };
}

function diagnoseProcess(
  process: { id: string; ownerPersonId: string | null },
  latestSnapshot: { id: string; metrics: unknown; provenance: unknown } | null,
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
  const ownerPresent = m.get('PROCESS_OWNER_PRESENT');
  const personChanges = numMetric(m, 'RESPONSIBLE_PERSON_CHANGE_COUNT');
  const totalActive = numMetric(m, 'TOTAL_ACTIVE_MINUTES');
  const handoffs = numMetric(m, 'HANDOFF_STEP_COUNT');
  const projection = projectSnapshotSourceBasis(latestSnapshot.provenance, latestSnapshot.metrics);
  const add = (domainKey: string, severity: DiagnosisRuleOutcome['severity'], codes: string[]) => {
    const bases = projection.metricSourceBasis.filter(metric => codes.includes(metric.code)).map(metric => metric.sourceBasis);
    const sourceBasis = bases.includes('ESTIMATED') ? 'ESTIMATED'
      : bases.length && bases.every(basis => basis === 'DERIVED') ? 'DERIVED' : null;
    out.push({ domainKey, measured: false, declared: false, severity, sourceRefs: { ...refs(severity), sourceBasis } });
  };

  if ((waitingShare != null && waitingShare >= 0.4) || (approvalSteps != null && approvalSteps >= 3)) {
    add('APPROVAL_DELAY', 'HIGH', waitingShare != null && waitingShare >= 0.4 ? ['WAITING_SHARE'] : ['APPROVAL_STEP_COUNT']);
  }
  if (dataEntry != null && dataEntry >= 3) {
    add('DUPLICATE_DATA_ENTRY', 'MEDIUM', ['DATA_ENTRY_STEP_COUNT']);
  }
  if ((systemSwitches != null && systemSwitches >= 3) || (systemCount != null && systemCount >= 4)) {
    add('SYSTEM_SWITCHING', 'MEDIUM', systemSwitches != null && systemSwitches >= 3 ? ['SYSTEM_SWITCH_COUNT'] : ['SYSTEM_COUNT']);
  }
  if (ownerPresent === false || (unassigned != null && unassigned >= 2) || (personChanges != null && personChanges >= 4)) {
    add('UNCLEAR_OWNERSHIP', 'MEDIUM', ownerPresent === false ? ['PROCESS_OWNER_PRESENT'] : unassigned != null && unassigned >= 2 ? ['UNASSIGNED_STEP_COUNT'] : ['RESPONSIBLE_PERSON_CHANGE_COUNT']);
  }
  if (totalActive != null && totalActive >= 240 && (handoffs ?? 0) >= 3) {
    add('MANUAL_ADMIN_LOAD', 'HIGH', ['TOTAL_ACTIVE_MINUTES', 'HANDOFF_STEP_COUNT']);
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

interface RawAssessmentObservationRow {
  id: string;
  observationType: string;
  rawPayload: Prisma.JsonValue;
  observedAt: Date;
  sourceRecordId: string | null;
}

/**
 * Loads exactly one (the latest) GROW_ASSESSMENT_V1 observation per
 * (packKey, workspaceId, processId) scope, in the database.
 *
 * This keeps research correctness AND a hard bound: the result size is the
 * number of assessment scopes, so neither a growing generic-survey history nor
 * repeated retakes can truncate a scope or force the entire declared history to
 * be loaded and sorted in memory on every run.
 */
async function loadLatestAssessmentObservations(
  db: Db,
  clientId: string,
): Promise<RawAssessmentObservationRow[]> {
  return db.$queryRaw<RawAssessmentObservationRow[]>`
    SELECT DISTINCT ON (
      "rawPayload"->>'packKey',
      COALESCE("rawPayload"->'provenance'->>'workspaceId', ''),
      COALESCE("rawPayload"->>'processId', '')
    )
      "id", "observationType", "rawPayload", "observedAt", "sourceRecordId"
    FROM "observations"
    WHERE "clientId" = ${clientId}
      AND "observationType"::text = 'DECLARED_SURVEY'
      AND "rawPayload"->>'schema' IN (${GROW_ASSESSMENT_SCHEMA}, 'GROW_ASSESSMENT_V2')
    ORDER BY
      "rawPayload"->>'packKey',
      COALESCE("rawPayload"->'provenance'->>'workspaceId', ''),
      COALESCE("rawPayload"->>'processId', ''),
      "observedAt" DESC,
      "id" DESC
  `;
}

async function executeRun(
  actor: InternalActor,
  clientId: string,
  runId: string,
  onlyProcessId: string | null,
  db: Db,
): Promise<{ diagnosisCount: number; recommendationCount: number }> {
  // Tenant/process OWNERSHIP, active selection and research SELECTION are three
  // distinct concerns. Load every client process once (ownership), then narrow
  // to ACTIVE ones (eligibility) and finally to the requested run scope.
  // Conflating them would let a targeted run reinterpret another valid
  // process's declared signal as unscoped, or let an archived process's stale
  // scoped signal leak tenant-wide.
  const clientProcesses = await db.businessProcess.findMany({
    where: { clientId },
    orderBy: { createdAt: 'asc' },
  });
  const clientProcessIds = new Set(clientProcesses.map((p) => p.id));
  const clientActiveProcesses = clientProcesses.filter((p) => p.status === 'ACTIVE');
  const clientActiveProcessIds = new Set(clientActiveProcesses.map((p) => p.id));
  const processes = onlyProcessId
    ? clientActiveProcesses.filter((p) => p.id === onlyProcessId)
    : clientActiveProcesses;

  const snapshots = await db.processObservationSnapshot.findMany({
    where: { clientId },
    orderBy: [{ observedAt: 'desc' }, { createdAt: 'desc' }],
  });
  const latestByProcess = new Map<string, (typeof snapshots)[number]>();
  for (const s of snapshots) {
    if (!latestByProcess.has(s.businessProcessId)) latestByProcess.set(s.businessProcessId, s);
  }

  // Bounded loading that stays correct:
  // - non-superseded survey observations keep an explicit newest-50 bound and
  //   are restricted to the canonical pain-intake kind, so assessment rows can
  //   never fill the window and displace a valid survey (and, per the fail-closed
  //   normalizer, a non-pain-intake declared survey contributes no signal anyway);
  // - each assessment scope is reduced to its latest row IN THE DATABASE, so a
  //   growing survey/retake history can neither truncate an assessment scope nor
  //   force the whole declared history to be loaded and sorted every cycle.
  const surveyObs = await db.observation.findMany({
    where: {
      clientId,
      observationType: 'DECLARED_SURVEY',
      rawPayload: { path: ['kind'], equals: GROW_PAIN_INTAKE_KIND },
    },
    orderBy: { observedAt: 'desc' },
    take: 50,
  });
  const assessmentObs = await loadLatestAssessmentObservations(db, clientId);
  const declaredById = new Map<string, NormalizableObservation>();
  for (const obs of [...assessmentObs, ...surveyObs]) {
    declaredById.set(obs.id, {
      id: obs.id,
      observationType: obs.observationType,
      rawPayload: obs.rawPayload,
      observedAt: obs.observedAt,
      sourceRecordId: obs.sourceRecordId,
    });
  }
  const declaredObs = [...declaredById.values()];

  // Single fail-closed normalization boundary. The research engine no longer
  // parses source-specific survey payloads or owns a category→domain map.
  // Assessment observations are first reduced to the LATEST submission per
  // (pack, workspace, process) scope so a retake supersedes the observation it
  // corrects; the generic pain-intake survey is intentionally left untouched.
  const declaredSignals: GrowSignal[] = observationsToGrowSignals(
    supersedeAssessmentObservations(declaredObs),
  );

  // Survey categories are attributed PER OBSERVATION, so an outcome only ever
  // sees the categories of the declarations actually attached to it. Passing
  // every client category to every outcome would let process B's survey alter
  // process A's intervention selection.
  const categoriesByObservation = new Map<string, Set<string>>();
  for (const signal of declaredSignals) {
    if (!signal.provenance.categoryKey) continue;
    let categories = categoriesByObservation.get(signal.observationId);
    if (!categories) {
      categories = new Set<string>();
      categoriesByObservation.set(signal.observationId, categories);
    }
    categories.add(signal.provenance.categoryKey);
  }

  const metricsBySnapshot = new Map<string, Record<string, number | boolean | null>>();
  for (const s of snapshots) metricsBySnapshot.set(s.id, Object.fromEntries(metricMap(s.metrics)));

  const outcomes: DiagnosisRuleOutcome[] = [];

  // Process-scoped declared survey grouping. A declared problem belongs to a
  // (domainKey, businessProcessId) pair — never to a domain alone — so evidence
  // for process B can never collapse into process A's diagnosis. The `null` key
  // is the existing unscoped bucket (surveys submitted without a process).
  type SurveyHit = { observationIds: string[]; businessProcessId: string | null };
  const surveyHitsByDomain = new Map<string, Map<string | null, SurveyHit>>();
  const scopedSignals: GrowSignal[] = [];
  for (const signal of declaredSignals) {
    let businessProcessId: string | null;
    if (!signal.businessProcessId) {
      // True unscoped survey: existing semantics are preserved unchanged.
      businessProcessId = null;
    } else if (!clientProcessIds.has(signal.businessProcessId)) {
      // Fail-closed tenant binding: a foreign/unknown process reference is not
      // trusted and is treated as unscoped rather than attaching to any process.
      businessProcessId = null;
    } else if (!clientActiveProcessIds.has(signal.businessProcessId)) {
      // Same-client but no longer ACTIVE: stale scoped evidence is EXCLUDED, not
      // rewritten to unscoped (which would leak it tenant-wide).
      continue;
    } else if (onlyProcessId && signal.businessProcessId !== onlyProcessId) {
      // Valid ACTIVE same-client process, but outside this targeted run.
      continue;
    } else {
      businessProcessId = signal.businessProcessId;
    }

    scopedSignals.push({ ...signal, businessProcessId });
    // V2 findings are propositions, not category-level negative evidence. Keep
    // each identity separate from metric diagnoses and from other findings.
    if (signal.provenance.assessmentFinding) {
      outcomes.push({
        domainKey: signal.domainKey,
        measured: false,
        declared: true,
        severity: 'MEDIUM',
        sourceRefs: {
          snapshotIds: [], observationIds: [signal.observationId], businessProcessId,
          severity: 'MEDIUM', sourceBasis: 'DECLARED',
          assessmentFindings: [signal.provenance.assessmentFinding],
        },
      });
      continue;
    }
    let byProcess = surveyHitsByDomain.get(signal.domainKey);
    if (!byProcess) {
      byProcess = new Map<string | null, SurveyHit>();
      surveyHitsByDomain.set(signal.domainKey, byProcess);
    }
    const hit = byProcess.get(businessProcessId) ?? { observationIds: [], businessProcessId };
    if (!hit.observationIds.includes(signal.observationId)) hit.observationIds.push(signal.observationId);
    byProcess.set(businessProcessId, hit);
  }

  for (const process of processes) {
    const latest = latestByProcess.get(process.id) ?? null;
    const diags = diagnoseProcess(
      { id: process.id, ownerPersonId: process.ownerPersonId },
      latest ? { id: latest.id, metrics: latest.metrics, provenance: latest.provenance } : null,
    );
    for (const d of diags) {
      const byProcess = surveyHitsByDomain.get(d.domainKey);
      if (byProcess) {
        const ids = new Set<string>();
        // Same-process declared signals converge with this measured diagnosis.
        const scoped = byProcess.get(process.id);
        if (scoped) for (const id of scoped.observationIds) ids.add(id);
        // Unscoped declared signals keep their existing "all measured processes"
        // semantics.
        const unscoped = byProcess.get(null);
        if (unscoped) for (const id of unscoped.observationIds) ids.add(id);
        if (ids.size) {
          d.declared = true;
          d.sourceRefs.observationIds.push(...ids);
        }
      }
      outcomes.push(d);
    }
  }

  // Declared-only outcomes: one per (domain, process) bucket that did not
  // converge with a measured diagnosis of the SAME process. A distinct process
  // is never suppressed by another process's outcome.
  const domainsWithMeasured = new Set(outcomes.filter(o => !o.sourceRefs.assessmentFindings).map((o) => o.domainKey));
  for (const [domain, byProcess] of surveyHitsByDomain) {
    for (const [businessProcessId, hit] of byProcess) {
      if (businessProcessId === null) {
        // Preserve existing unscoped semantics: stand alone only when the domain
        // has no measured diagnosis at all.
        if (domainsWithMeasured.has(domain)) continue;
      } else if (
        outcomes.some((o) => !o.sourceRefs.assessmentFindings && o.domainKey === domain && o.sourceRefs.businessProcessId === businessProcessId)
      ) {
        continue;
      }
      outcomes.push({
        domainKey: domain,
        measured: false,
        declared: true,
        severity: 'MEDIUM',
        sourceRefs: {
          snapshotIds: [],
          observationIds: [...hit.observationIds],
          businessProcessId,
          severity: 'MEDIUM',
          sourceBasis: 'DECLARED',
        },
      });
    }
  }

  let diagnosisCount = 0;
  let recommendationCount = 0;

  for (const outcome of outcomes) {
    const finding = outcome.sourceRefs.assessmentFindings?.[0];
    const safetySignals = scopedSignals.filter(signal =>
      outcome.sourceRefs.observationIds.includes(signal.observationId)
      || ((finding || signal.provenance.assessmentFinding)
        && (signal.businessProcessId === null || signal.businessProcessId === outcome.sourceRefs.businessProcessId)));
    // Cite safeguards separately from the proposition: a deferral is not
    // corroborating evidence for a metric diagnosis and cannot lift its gate.
    const safetyObservationIds = [...new Set(safetySignals.filter(signal => signal.provenance.defersAutomation
      || signal.provenance.categoryKey === 'REWORK' || signal.provenance.categoryKey === 'UNCLEAR_OWNERSHIP')
      .map(signal => signal.observationId))];
    if (safetyObservationIds.length) {
      outcome.sourceRefs.safetyObservationIds = safetyObservationIds;
      outcome.sourceRefs.observationIds = [...new Set([...outcome.sourceRefs.observationIds, ...safetyObservationIds])];
    }
    const labels = finding
      ? { title: finding.titleHu, problem: finding.summaryHu, direction: finding.nextCheckHu ?? finding.summaryHu }
      : DOMAIN_LABELS_HU[outcome.domainKey] ?? DOMAIN_LABELS_HU.GENERAL_FLOW;
    const domain = await db.problemDomain.upsert({
      where: { clientId_key: { clientId, key: outcome.domainKey } },
      create: { clientId, key: outcome.domainKey, name: (DOMAIN_LABELS_HU[outcome.domainKey] ?? labels).title, description: (DOMAIN_LABELS_HU[outcome.domainKey] ?? labels).problem },
      update: {},
    });

    const relevantEvidence = (evidence: { corpusKey: string | null }) => !finding || finding.supportingCorpusKeys.includes(evidence.corpusKey ?? '');
    const verifiedCorpus = (await findCorpusEvidenceForDomains([outcome.domainKey], { verifiedOnly: true }, db)).filter(relevantEvidence);
    const allCorpus = (await findCorpusEvidenceForDomains([outcome.domainKey], {}, db)).filter(relevantEvidence);

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
          kind: outcome.measured ? 'INTERNAL_MEASUREMENT' : 'INTERNAL_OBSERVATION',
          title: outcome.measured ? 'Folyamat-mérési pillanatkép' : 'Folyamatadat-pillanatkép (nem tényleges mérés)',
          locator: `snapshot:${snapId}`,
          strength: outcome.measured ? 'STRONG' : 'MODERATE',
          domainKeys: [outcome.domainKey],
        },
        db,
      );
      internalEvidenceIds.push(ev.id);
    }

    // Evidence sufficiency gate — 6/6 states, only SUPPORTED is actionable.
    const disputedCorpus = (await findCorpusEvidenceForDomains(
      [outcome.domainKey],
      { verificationStatuses: ['DISPUTED'] },
      db,
    )).filter(relevantEvidence);
    const gate = decideSufficiency({
      domainKey: outcome.domainKey,
      verifiedEvidenceCount: verifiedCorpus.length,
      disputedEvidenceCount: disputedCorpus.length,
      measured: outcome.measured,
      declared: outcome.declared,
      sourceBasis: outcome.sourceRefs.sourceBasis,
    });
    const decision = gate.decision;
    const reasons = gate.reasons;

    // Canonical intervention selection (backend-owned taxonomy + guardrails).
    const metrics = outcome.sourceRefs.snapshotIds
      .map((id) => metricsBySnapshot.get(id))
      .find((m): m is Record<string, number | boolean | null> => Boolean(m))
      ?? (finding && outcome.sourceRefs.businessProcessId
        ? metricsBySnapshot.get(latestByProcess.get(outcome.sourceRefs.businessProcessId)?.id ?? '') : undefined) ?? {};
    // Process-scoped categories: only those belonging to observations attached
    // to THIS outcome. Process B's survey can never change process A's
    // interventions.
    const outcomeSurveyCategories = new Set<string>();
    for (const obsId of outcome.sourceRefs.observationIds) {
      const categories = categoriesByObservation.get(obsId);
      if (categories) for (const category of categories) outcomeSurveyCategories.add(category);
    }
    for (const signal of safetySignals) {
      if (signal.provenance.categoryKey) outcomeSurveyCategories.add(signal.provenance.categoryKey);
    }
    const signals = deriveProcessSignals({
      metrics,
      hasSnapshot: outcome.sourceRefs.snapshotIds.length > 0 || Boolean(finding && outcome.sourceRefs.businessProcessId && latestByProcess.has(outcome.sourceRefs.businessProcessId)),
      surveyCategories: [...outcomeSurveyCategories],
      measured: outcome.measured,
      declared: outcome.declared,
    });
    // A V2 deferral stays attached to its exact observations/process. It must
    // survive normalization before the canonical intervention selector runs.
    const deferAutomation = declaredSignals.some(s => s.provenance.defersAutomation && outcome.sourceRefs.observationIds.includes(s.observationId))
      || safetySignals.some(signal => signal.provenance.defersAutomation);
    const interventionCodes = finding ? finding.suggestedInterventionCodes.filter(code => {
      const definition = INTERVENTIONS.find(intervention => intervention.code === code);
      return definition && !(code === 'AUTOMATE_REPETITIVE_STEP' && (deferAutomation || signals.includes('UNASSIGNED_STEPS')))
        && !definition.contraindications.some(signal => signals.includes(signal));
    }) : selectInterventions({
      deferAutomation,
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
      const kind = outcome.severity === 'HIGH' && outcome.sourceRefs.snapshotIds.length > 0 ? 'DEVELOPMENT' : 'QUICK_FIX';
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

function diagnosisSourceBasis(refs: unknown, evidence: EvidenceDTO[]): SourceBasis | null {
  const sourceRefs = refs && typeof refs === 'object' && !Array.isArray(refs) ? refs as Record<string, unknown> : {};
  // New diagnoses carry the basis of the triggering metrics, which may be
  // structural even when the snapshot also contains estimated durations.
  if (sourceRefs.sourceBasis === 'ESTIMATED' || sourceRefs.sourceBasis === 'DERIVED') return sourceRefs.sourceBasis;
  const snapshots = evidence.filter(item => item.locator?.startsWith('snapshot:'));
  if (snapshots.some(item => item.sourceBasis === 'ESTIMATED')) return 'ESTIMATED';
  if (snapshots.length) return snapshots.every(item => item.sourceBasis === 'DERIVED') ? 'DERIVED' : null;
  return Array.isArray(sourceRefs.observationIds) && sourceRefs.observationIds.length ? 'DECLARED' : null;
}

export async function listGrowOpportunities(
  actor: InternalActor,
  clientId: string,
  db: Db = defaultPrisma,
  options: { status?: RecommendationCandidateStatus } = {},
) {
  await assertClientReadAccess(actor, clientId, db as PrismaClient);
  const recs = await db.recommendationCandidate.findMany({
    where: { clientId, status: options.status ?? 'PENDING_REVIEW' },
    include: {
      diagnosis: { include: { problemDomain: true, businessProcess: true } },
      evidenceLinks: { include: { evidence: true } },
      improvementOpportunity: { select: { id: true, status: true, developmentInitiativeId: true } },
    },
    orderBy: { createdAt: 'desc' },
  });
  const evidence = await projectEvidenceSourceBasis(recs.flatMap(r => r.evidenceLinks.map(l => toEvidenceDTO(l.evidence))), clientId, db);
  const evidenceById = new Map(evidence.map(item => [item.id, item]));
  return recs.map((r) => ({
    id: r.id,
    runId: r.runId,
    status: r.status,
    kind: r.kind,
    sufficiency: r.sufficiency,
    sourceBasis: diagnosisSourceBasis(r.diagnosis?.sourceRefs, r.evidenceLinks.map(l => evidenceById.get(l.evidence.id)!)),
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
    evidenceStrength: strongestEvidence(r.evidenceLinks.map((l) => evidenceById.get(l.evidence.id)!)),
    opportunity: r.improvementOpportunity
      ? { id: r.improvementOpportunity.id, status: r.improvementOpportunity.status, developmentInitiativeId: r.improvementOpportunity.developmentInitiativeId }
      : null,
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

  const evidence = await projectEvidenceSourceBasis(r.evidenceLinks.map(l => toEvidenceDTO(l.evidence)), clientId, db);
  const refs = r.diagnosis?.sourceRefs;
  const sourceRefs = refs && typeof refs === 'object' && !Array.isArray(refs) ? refs : null;
  const sourceBasis = diagnosisSourceBasis(sourceRefs, evidence);

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
          summary: projectSnapshotEvidenceSummary(r.diagnosis.summary, evidence),
          domainTitle: r.diagnosis.problemDomain?.name ?? null,
          businessProcess: r.diagnosis.businessProcess
            ? { id: r.diagnosis.businessProcess.id, name: r.diagnosis.businessProcess.name }
            : null,
          sourceRefs: sourceRefs ? {
            ...sourceRefs, sourceBasis,
            ...(Array.isArray(sourceRefs.reasons) ? {
              reasons: sourceRefs.reasons.map(reason => typeof reason === 'string' ? projectSnapshotEvidenceSummary(reason, evidence) : reason),
            } : {}),
          } : r.diagnosis.sourceRefs,
        }
      : null,
    evidence,
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
    o.sourceBasis === 'MEASURED',
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
  const decision = input.decision;
  const status: RecommendationCandidateStatus =
    decision === 'ACCEPT' ? 'ACCEPTED' : decision === 'DECLINE' ? 'DECLINED' : 'NEEDS_MORE_DATA';

  // BE-GROW-004: the whole decision is ONE transaction with a conditional
  // (compare-and-set) update on the recommendation state. The eligibility
  // checks and the state claim happen inside the transaction, so concurrent
  // ACCEPT vs DECLINE (or duplicate ACCEPT) produce exactly one canonical
  // winner and can never leave a contradictory Opportunity/recommendation
  // state. The run-validity check is evaluated on the same snapshot.
  const prisma = db as PrismaClient;
  return prisma.$transaction(async (tx) => {
    const rec = await tx.recommendationCandidate.findFirst({
      where: { id: recommendationId, clientId },
      include: { run: { select: { status: true } } },
    });
    if (!rec) throw new InteractionError(404, 'RECOMMENDATION_NOT_FOUND', 'Recommendation not found for this client.');
    if (decision === 'ACCEPT' && rec.sufficiency !== 'SUPPORTED') {
      throw new InteractionError(422, 'RECOMMENDATION_NOT_SUPPORTED', 'Only SUPPORTED recommendations can be accepted.');
    }
    // Only a recommendation from a COMPLETED run can receive a final human
    // review decision. RUNNING and FAILED runs are not eligible; there is no
    // other stale/supersession policy invented here.
    if (rec.run.status !== 'COMPLETED') {
      throw new InteractionError(409, 'RECOMMENDATION_RUN_NOT_COMPLETED', 'The recommendation run is not completed; it cannot be reviewed.');
    }

    // CAS: claim the pending row. A concurrent winner flips the status first,
    // so the loser matches zero rows and must never overwrite the winner or
    // create a contradictory opportunity.
    const claimed = await tx.recommendationCandidate.updateMany({
      where: { id: rec.id, clientId, status: 'PENDING_REVIEW' },
      data: { status, reviewedById: actor.userId, reviewedAt: new Date(), reviewNote: note },
    });
    if (claimed.count !== 1) {
      throw new InteractionError(409, 'RECOMMENDATION_ALREADY_REVIEWED', 'This recommendation was already reviewed.');
    }

    const updated = await tx.recommendationCandidate.findUniqueOrThrow({ where: { id: rec.id } });

    let opportunity = null;
    if (decision === 'ACCEPT') {
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
// BE-GROW-005 — REQUEST_MORE_INFO handoff to the canonical ClientRequest
// draft/publish/submission lifecycle.
//
// A REQUEST_MORE_INFO review decision alone creates NOTHING customer-facing:
// no published request, no email, no task. The manager then explicitly chooses
// the information source. The customer-source choice creates (or idempotently
// reuses) exactly one DRAFT ClientRequest linked to the originating
// recommendation (and through it, the originating run). Publication stays the
// existing explicit publishRequest step; the customer sees the request only
// through the existing customer request projections after publication. The
// customer response (submission) is traceable back to the recommendation and
// never auto-accepts the recommendation; a rerun/review remains an explicit
// operator action.
// ---------------------------------------------------------------------------

export async function createGrowInfoRequestDraft(
  actor: InternalActor,
  clientId: string,
  recommendationId: string,
  input: {
    caseId?: unknown;
    clientSafeTitle?: unknown;
    clientSafeInstructions?: unknown;
    dueAt?: unknown;
    fields?: unknown;
  } = {},
  db: Db = defaultPrisma,
) {
  requireManager(actor);
  await assertClientReadAccess(actor, clientId, db as PrismaClient);
  const prisma = db as PrismaClient;

  const rec = await prisma.recommendationCandidate.findFirst({ where: { id: recommendationId, clientId } });
  if (!rec) throw new InteractionError(404, 'RECOMMENDATION_NOT_FOUND', 'Recommendation not found for this client.');
  // A customer information request may only originate from an explicit
  // REQUEST_MORE_INFO review decision (status NEEDS_MORE_DATA).
  if (rec.status !== 'NEEDS_MORE_DATA') {
    throw new InteractionError(409, 'RECOMMENDATION_NOT_PENDING_INFO', 'Only a recommendation explicitly reviewed with REQUEST_MORE_INFO can request customer information.');
  }

  // Idempotent create-or-reuse: a repeated click/retry never creates a second
  // request for the same recommendation.
  const existing = await prisma.clientRequest.findFirst({
    where: { recommendationId: rec.id },
    include: { fields: true },
  });
  if (existing) return { request: existing, reused: true };

  try {
    const created = await createRequestDraft(actor, {
      caseId: String(input.caseId || ''),
      type: 'INFORMATION_REQUEST',
      clientSafeTitle: input.clientSafeTitle ?? rec.title,
      clientSafeInstructions: input.clientSafeInstructions,
      dueAt: input.dueAt,
      required: true,
      fields: input.fields ?? [{ type: 'LONG_TEXT', label: 'Válasz', required: true, maxLength: 6000 }],
      growContext: { recommendationId: rec.id },
    }, prisma);
    return { request: created, reused: false };
  } catch (err) {
    // Concurrent duplicate create: the unique [recommendationId] constraint
    // admits exactly one canonical request; the loser reuses the winner.
    if ((err as { code?: string })?.code === 'P2002') {
      const winner = await prisma.clientRequest.findFirst({
        where: { recommendationId: rec.id },
        include: { fields: true },
      });
      if (winner) return { request: winner, reused: true };
    }
    throw err;
  }
}

export async function getGrowInfoRequestReadback(
  actor: InternalActor,
  clientId: string,
  recommendationId: string,
  db: Db = defaultPrisma,
) {
  requireManager(actor);
  await assertClientReadAccess(actor, clientId, db as PrismaClient);
  const prisma = db as PrismaClient;

  const rec = await prisma.recommendationCandidate.findFirst({ where: { id: recommendationId, clientId } });
  if (!rec) throw new InteractionError(404, 'RECOMMENDATION_NOT_FOUND', 'Recommendation not found for this client.');

  const request = await prisma.clientRequest.findFirst({
    where: { recommendationId: rec.id },
    include: {
      fields: { orderBy: { displayOrder: 'asc' } },
      submissions: {
        orderBy: { createdAt: 'desc' },
        include: { fields: true, files: true },
      },
    },
  });

  return {
    recommendation: { id: rec.id, status: rec.status, runId: rec.runId },
    request: request
      ? {
          id: request.id,
          caseId: request.caseId,
          status: request.status,
          clientSafeTitle: request.clientSafeTitle,
          clientSafeInstructions: request.clientSafeInstructions,
          dueAt: request.dueAt,
          publishedAt: request.publishedAt,
          revision: request.revision,
          fields: request.fields.map((f) => ({ id: f.id, label: f.clientSafeLabel, type: f.type, required: f.required })),
          submissions: request.submissions.map((s) => ({
            id: s.id,
            status: s.status,
            submittedAt: s.submittedAt,
            customerNote: s.customerNote,
            answerCount: s.fields.length,
            fileCount: s.files.length,
          })),
        }
      : null,
  };
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

  // The whole handoff is ONE transaction: initiative create + opportunity link
  // + INITIATIVE_STARTED transition commit together or roll back together.
  // The conditional updateMany is the concurrency gate: only the first writer
  // of the still-unlinked opportunity succeeds; a concurrent/retried handoff
  // matches zero rows, throws and rolls back its own initiative.
  const prisma = db as PrismaClient;
  return prisma.$transaction(async (tx) => {
    const opp = await tx.improvementOpportunity.findFirst({
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
    }, tx as unknown as PrismaClient);

    const linked = await tx.improvementOpportunity.updateMany({
      where: { id: opp.id, clientId, developmentInitiativeId: null },
      data: { developmentInitiativeId: initiative.id, status: 'INITIATIVE_STARTED' as ImprovementOpportunityStatus },
    });
    if (linked.count !== 1) {
      throw new InteractionError(409, 'OPPORTUNITY_ALREADY_LINKED', 'Opportunity already handed off to an initiative.');
    }

    const updated = await tx.improvementOpportunity.findUniqueOrThrow({ where: { id: opp.id } });
    return { opportunity: updated, initiative };
  });
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
    if (after.metricVersion !== before.metricVersion) {
      throw new InteractionError(422, 'SNAPSHOT_SCOPE_INCOMPATIBLE', 'Before and after snapshots use incompatible metric versions and cannot be compared.');
    }
  }

  // G1: never relabel an unknown-provenance snapshot. The measurement basis
  // must be derivable from the recorded snapshot provenance, or recording is
  // rejected with an actionable unavailable state.
  const beforeOrigin = deriveSnapshotValueOrigin(before.provenance);
  if (!beforeOrigin) {
    throw new InteractionError(422, 'SNAPSHOT_PROVENANCE_UNKNOWN', 'Before-snapshot carries no value provenance; the measurement basis cannot be established.');
  }
  let afterOrigin: InputValueOrigin | null = null;
  if (after) {
    afterOrigin = deriveSnapshotValueOrigin(after.provenance);
    if (!afterOrigin) {
      throw new InteractionError(422, 'SNAPSHOT_PROVENANCE_UNKNOWN', 'After-snapshot carries no value provenance; the measurement basis cannot be established.');
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
    // Before/after comparison derives the basis from the snapshots' own
    // provenance (canonical snapshots are estimate-based → ESTIMATED).
    // A stated reduction over a calculated snapshot basis stays CALCULATED.
    beforeOrigin: after ? beforeOrigin : (input.expectedActiveReductionPct != null ? 'CALCULATED' : beforeOrigin),
    afterOrigin: after ? afterOrigin : null,
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
