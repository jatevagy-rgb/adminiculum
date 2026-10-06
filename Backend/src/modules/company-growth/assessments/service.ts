/**
 * GROW CUSTOMER ASSESSMENT JOURNEY — customer-safe portal service.
 *
 * Composes the backend-owned assessment registry with the Observatory-backed
 * declared-evidence readback. Produces ONLY customer-safe DTOs:
 * - no observation/run/connection ids, no clientId, no raw payload,
 * - no internal scoring keys, no problem-domain keys, no corpus mechanics,
 * - no fabricated maturity percentage or global score.
 *
 * The result directions are customer-safe ASSESSMENT DIRECTIONS that reuse the
 * canonical intervention labels. They are NOT RecommendationCandidate,
 * ImprovementOpportunity, DevelopmentInitiative or Task rows — assessment
 * submission remains declared evidence only.
 */

import { prisma as defaultPrisma } from '../../../prisma/prisma.service';
import { assertClientSafe, InteractionError } from '../../client-interaction/base';
import {
  AssessmentAnswerInput,
  evaluateAssessmentAnswers,
  getAssessmentPack,
  getAssessmentPackVersion,
  listAssessmentPacks,
  validateAssessmentSubmission,
  type AssessmentCondition,
} from './registry';
import { V2_ASSESSMENT_PACKS, V2_PAIN_ROUTES, quickScanRoutes } from './v2Definitions';
import { SURVEY_CATEGORY_LABELS_HU, submitPortalSurveyIntake } from '../../company-observatory/intake';
import { canonicalDigest } from '../../compliance/canonicalDigest';
import { resolveCustomerEvidence } from './evidence';
import {
  listPortalGrowAssessments,
  submitPortalGrowAssessment,
  SafePortalAssessmentSubmission,
} from '../../company-observatory/assessmentIntake';

type Db = typeof defaultPrisma;

export const ASSESSMENT_CUSTOMER_NOTICE_HU =
  'Ez a felmérés az Ön által megadott adatokból készült. A végleges fejlesztési lehetőségeket az Adminiculum további működési adatokkal és szakmai felülvizsgálattal együtt értékeli.';

export interface AssessmentResultFindingDto {
  titleHu: string;
  summaryHu: string;
  nextCheckHu?: string;
  evidence?: AssessmentEvidenceDto[];
}

export interface AssessmentResultDirectionDto {
  labelHu: string;
}

export interface AssessmentEvidenceDto {
  title: string;
  authors: string | null;
  year: number | null;
  doi: string | null;
  locator: string | null;
  boundedClaim: string | null;
  limitations: string | null;
  strengthLabelHu: string;
}

export interface AssessmentResultDto {
  packKey: string;
  packVersion: number;
  titleHu: string;
  completedAt: string;
  findings: AssessmentResultFindingDto[];
  directions: AssessmentResultDirectionDto[];
  evidence: AssessmentEvidenceDto[];
  attentionAreaCount: number;
  unknownAreaCount: number;
  summaryHu: string;
  noticeHu: string;
  routingOptions?: Array<{ packKey: string; titleHu: string }>;
}

export interface AssessmentResultScopeDto {
  /** Scope token for the detail lookup. Never rendered as text in the UI. */
  processId: string | null;
  /** Customer-visible process name resolved server-side; never the raw id. */
  processName: string | null;
  completedAt: string;
  findingCount: number;
  resultAvailable: boolean;
}

export interface AssessmentCatalogueItemDto {
  packKey: string;
  version: number;
  titleHu: string;
  descriptionHu: string;
  estimatedMinutes: number;
  questionCount: number;
  status: 'NOT_STARTED' | 'COMPLETED';
  latestCompletedAt: string | null;
  latestFindingCount: number;
  latestSummaryHu: string | null;
  /**
   * False when a completion exists but its recorded pack version cannot be
   * evaluated. Distinguishes "completed, no attention points" from "completed,
   * result unavailable" so the UI never reports an unevaluable result as healthy.
   */
  latestResultAvailable: boolean;
  allowsProcessReference: boolean;
  /** Latest result per (process) scope, newest first. Empty when not started. */
  resultScopes: AssessmentResultScopeDto[];
}

export interface AssessmentCatalogueDto {
  packs: AssessmentCatalogueItemDto[];
  aggregatedFindings: AssessmentResultFindingDto[];
  aggregatedAttentionAreaCount: number;
  aggregatedUnknownAreaCount: number;
  noticeHu: string;
}

export interface AssessmentDetailDto {
  definition: {
    packKey: string;
    version: number;
    titleHu: string;
    descriptionHu: string;
    estimatedMinutes: number;
    allowsProcessReference: boolean;
    questions: Array<{
      questionKey: string;
      promptHu: string;
      helpTextHu: string | null;
      options: Array<{ value: string; labelHu: string }>;
      when?: AssessmentCondition;
    }>;
  };
  latestResult: AssessmentResultDto | null;
  /** False when a completion exists but its recorded version is not evaluable. */
  latestResultAvailable: boolean;
  /** The process scope this result belongs to; null for unscoped/non-process packs. */
  resultScope: { processId: string | null; processName: string | null } | null;
}

function summaryStatement(attentionAreaCount: number, unknownAreaCount: number): string {
  const parts: string[] = [];
  if (attentionAreaCount > 0) {
    parts.push(`${attentionAreaCount} terület igényel figyelmet.`);
  } else {
    parts.push('A válaszok alapján ezen a területen nem azonosítottunk figyelmet igénylő pontot.');
  }
  if (unknownAreaCount > 0) {
    parts.push(`${unknownAreaCount} területen nincs elég információ.`);
  }
  return parts.join(' ');
}

function buildResultDto(
  packKey: string,
  packVersion: number,
  answers: readonly AssessmentAnswerInput[],
  completedAt: string,
): AssessmentResultDto {
  const pack = getAssessmentPackVersion(packKey, packVersion);
  if (!pack) {
    throw new InteractionError(400, 'ASSESSMENT_INVALID_RESULT', 'A felmérés rögzített verziója nem érhető el.');
  }
  // Evaluate with the version the submission was actually recorded under, never
  // the current registry definition: applying new rules to old answers would
  // reinterpret an existing completion (or reject it outright).
  const evaluation = evaluateAssessmentAnswers(pack.packKey, packVersion, answers);
  if (!evaluation) {
    throw new InteractionError(400, 'ASSESSMENT_INVALID_RESULT', 'A felmérés eredménye nem állítható elő.');
  }

  const findingRows = pack.version >= 2 ? evaluation.findings.slice(0, 4) : evaluation.findings;
  const safeEvidence = (keys: readonly string[]): AssessmentEvidenceDto[] => resolveCustomerEvidence(keys).map(({ corpusKey: _key, strength: _strength, ...safe }) => safe);
  const findings: AssessmentResultFindingDto[] = findingRows.map((f) => ({
    titleHu: f.titleHu,
    summaryHu: f.summaryHu,
    ...(f.nextCheckHu ? { nextCheckHu: f.nextCheckHu, evidence: safeEvidence(f.supportingCorpusKeys) } : {}),
  }));
  const directions: AssessmentResultDirectionDto[] = evaluation.directions.map((d) => ({ labelHu: d.labelHu }));

  // Evidence is tied to the findings actually triggered; deduplicated.
  const corpusKeys: string[] = [];
  for (const finding of evaluation.findings) {
    for (const key of finding.supportingCorpusKeys) {
      if (!corpusKeys.includes(key)) corpusKeys.push(key);
    }
  }
  const evidence: AssessmentEvidenceDto[] = resolveCustomerEvidence(corpusKeys).map((e) => ({
    title: e.title,
    authors: e.authors,
    year: e.year,
    doi: e.doi,
    locator: e.locator,
    boundedClaim: e.boundedClaim,
    limitations: e.limitations,
    strengthLabelHu: e.strengthLabelHu,
  }));

  return {
    packKey: pack.packKey,
    packVersion,
    titleHu: pack.titleHu,
    completedAt,
    findings,
    directions,
    evidence,
    attentionAreaCount: findings.length,
    unknownAreaCount: evaluation.unknownDimensions.length,
    summaryHu: summaryStatement(findings.length, evaluation.unknownDimensions.length),
    noticeHu: ASSESSMENT_CUSTOMER_NOTICE_HU,
    ...(pack.packKey === 'QUICK_SCAN_V2' ? {
      summaryHu: 'A rövid válaszok a következő kérdések kiválasztását segítik. Nem jelentenek minősítést vagy diagnózist.',
      routingOptions: quickScanRoutes(answers).map(key => ({ packKey: key, titleHu: getAssessmentPack(key)!.titleHu })),
    } : {}),
  };
}

/**
 * Version-aware wrapper for read paths. A stored submission recorded under a
 * pack version that can no longer be evaluated (for example after an
 * incompatible pack revision) must not fail the whole catalogue or detail
 * request; such a submission yields null instead.
 */
function tryBuildResultDto(
  packKey: string,
  packVersion: number,
  answers: readonly AssessmentAnswerInput[],
  completedAt: string,
): AssessmentResultDto | null {
  try {
    return buildResultDto(packKey, packVersion, answers, completedAt);
  } catch (error) {
    if (error instanceof InteractionError && error.code === 'ASSESSMENT_INVALID_RESULT') return null;
    throw error;
  }
}

function buildScopeDto(submission: SafePortalAssessmentSubmission): AssessmentResultScopeDto {
  const result = tryBuildResultDto(
    submission.packKey,
    submission.packVersion,
    submission.answers,
    submission.completedAt,
  );
  return {
    processId: submission.processId,
    processName: submission.processName,
    completedAt: submission.completedAt,
    findingCount: result ? result.findings.length : 0,
    resultAvailable: result !== null,
  };
}

export async function getGrowAssessmentCatalogue(
  identityId: string,
  workspaceId: string,
  db: Db = defaultPrisma,
): Promise<AssessmentCatalogueDto> {
  const { items } = await listPortalGrowAssessments(identityId, workspaceId, db);

  const packs: AssessmentCatalogueItemDto[] = [];
  const aggregatedFindings: AssessmentResultFindingDto[] = [];
  const seenFindingTitles = new Set<string>();
  let aggregatedAttentionAreaCount = 0;
  let aggregatedUnknownAreaCount = 0;

  // Aggregate across EVERY latest (pack, process) scope, not only the newest
  // scope per pack, so a workspace's other process results are not hidden.
  for (const submission of items) {
    const result = tryBuildResultDto(
      submission.packKey,
      submission.packVersion,
      submission.answers,
      submission.completedAt,
    );
    if (!result) continue;
    aggregatedAttentionAreaCount += result.findings.length;
    aggregatedUnknownAreaCount += result.unknownAreaCount;
    for (const finding of result.findings) {
      if (seenFindingTitles.has(finding.titleHu)) continue;
      seenFindingTitles.add(finding.titleHu);
      aggregatedFindings.push(finding);
    }
  }

  for (const pack of listAssessmentPacks()) {
    // items are newest-first; every (pack, process) scope is retained here so the
    // customer can reach and reopen the result for EACH process.
    const packSubmissions = items.filter((item) => item.packKey === pack.packKey);
    const newest = packSubmissions[0];
    const allowsProcessReference = Boolean(pack.allowsProcessReference);
    const resultScopes = packSubmissions.map(buildScopeDto);

    if (!newest) {
      packs.push({
        packKey: pack.packKey,
        version: pack.version,
        titleHu: pack.titleHu,
        descriptionHu: pack.descriptionHu,
        estimatedMinutes: pack.estimatedMinutes,
        questionCount: pack.questions.length,
        status: 'NOT_STARTED',
        latestCompletedAt: null,
        latestFindingCount: 0,
        latestSummaryHu: null,
        latestResultAvailable: false,
        allowsProcessReference,
        resultScopes: [],
      });
      continue;
    }
    const result = tryBuildResultDto(
      pack.packKey,
      newest.packVersion,
      newest.answers,
      newest.completedAt,
    );
    packs.push({
      packKey: pack.packKey,
      version: pack.version,
      titleHu: pack.titleHu,
      descriptionHu: pack.descriptionHu,
      estimatedMinutes: pack.estimatedMinutes,
      questionCount: pack.questions.length,
      status: 'COMPLETED',
      latestCompletedAt: newest.completedAt,
      latestFindingCount: result ? result.findings.length : 0,
      latestSummaryHu: result ? result.summaryHu : null,
      latestResultAvailable: result !== null,
      allowsProcessReference,
      resultScopes,
    });
  }

  const dto: AssessmentCatalogueDto = {
    packs,
    aggregatedFindings: aggregatedFindings.slice(0, 8),
    aggregatedAttentionAreaCount,
    aggregatedUnknownAreaCount,
    noticeHu: ASSESSMENT_CUSTOMER_NOTICE_HU,
  };
  assertClientSafe(dto);
  return dto;
}

export async function getGrowAssessmentDetail(
  identityId: string,
  workspaceId: string,
  packKey: string,
  processId: string | null = null,
  db: Db = defaultPrisma,
): Promise<AssessmentDetailDto> {
  const pack = getAssessmentPack(packKey);
  if (!pack) {
    throw new InteractionError(404, 'ASSESSMENT_UNKNOWN_PACK', 'Ismeretlen felmérés.');
  }
  const { items } = await listPortalGrowAssessments(identityId, workspaceId, db);
  const packSubmissions = items.filter((item) => item.packKey === pack.packKey);

  let submission: SafePortalAssessmentSubmission | null;
  if (pack.allowsProcessReference && processId) {
    // Server-side scope authority: the requested process must own a completion in
    // THIS authorized workspace. A foreign or unknown process resolves to none.
    submission = packSubmissions.find((item) => item.processId === processId) ?? null;
    if (!submission) {
      throw new InteractionError(404, 'ASSESSMENT_RESULT_SCOPE_NOT_FOUND', 'Ehhez a folyamathoz nincs kitöltés.');
    }
  } else {
    // Unscoped and non-process packs keep the single latest-result behavior.
    submission = packSubmissions[0] ?? null;
  }
  const latestResult = submission
    ? tryBuildResultDto(pack.packKey, submission.packVersion, submission.answers, submission.completedAt)
    : null;

  const dto: AssessmentDetailDto = {
    definition: {
      packKey: pack.packKey,
      version: pack.version,
      titleHu: pack.titleHu,
      descriptionHu: pack.descriptionHu,
      estimatedMinutes: pack.estimatedMinutes,
      allowsProcessReference: Boolean(pack.allowsProcessReference),
      questions: pack.questions.map((q) => ({
        questionKey: q.questionKey,
        promptHu: q.promptHu,
        helpTextHu: q.helpTextHu ?? null,
        options: q.options.map((o) => ({ value: o.value, labelHu: o.labelHu })),
        ...(q.when ? { when: q.when } : {}),
      })),
    },
    latestResult,
    latestResultAvailable: latestResult !== null,
    resultScope: submission
      ? { processId: submission.processId, processName: submission.processName }
      : null,
  };
  assertClientSafe(dto);
  return dto;
}

export interface SubmitGrowAssessmentResponse {
  submission: {
    packKey: string;
    packVersion: number;
    replayed: boolean;
    completedAt: string;
  };
  result: AssessmentResultDto;
}

export async function submitGrowAssessment(
  identityId: string,
  workspaceId: string,
  packKey: string,
  input: { answers: unknown; idempotencyKey: string; processId?: string; packVersion?: number },
  db: Db = defaultPrisma,
): Promise<SubmitGrowAssessmentResponse> {
  // Validate up-front so an unknown pack / bad answer set is rejected before any
  // persistence work. The version must come from the registry: validation
  // requires the supplied version to equal the current pack version, so a
  // hard-coded 1 would reject every submission once a pack advances.
  // Exact validation is enforced again at the intake boundary (defense-in-depth).
  const packDefinition = getAssessmentPack(packKey);
  const validated = validateAssessmentSubmission(packKey, input.packVersion ?? (packDefinition?.version === 1 ? 1 : undefined), input.answers);

  const submission = await submitPortalGrowAssessment(
    identityId,
    workspaceId,
    validated.pack.packKey,
    { answers: validated.answers, idempotencyKey: input.idempotencyKey, processId: input.processId, packVersion: validated.pack.version },
    db,
  );

  const result = buildResultDto(
    validated.pack.packKey,
    validated.pack.version,
    validated.answers,
    submission.completedAt,
  );
  assertClientSafe(result);
  return { submission, result };
}

export async function getGrowAdaptiveJourney(identityId: string, workspaceId: string, db: Db = defaultPrisma) {
  const { items } = await listPortalGrowAssessments(identityId, workspaceId, db);
  const dto = {
    resumeScope: canonicalDigest({ identityId, workspaceId, journey: 'GROW_V2' }),
    categories: Object.entries(SURVEY_CATEGORY_LABELS_HU).map(([value, labelHu]) => ({ value, labelHu })),
    branches: V2_ASSESSMENT_PACKS.filter(p => p.packKey !== 'QUICK_SCAN_V2' && p.packKey !== 'PROCESS_STABILITY_REWORK_V2').map(p => ({ packKey: p.packKey, titleHu: p.titleHu })),
    history: items.filter(i => i.packVersion >= 2).map(i => ({ processId: i.processId, processName: i.processName, result: tryBuildResultDto(i.packKey, i.packVersion, i.answers, i.completedAt) })),
    noticeHu: ASSESSMENT_CUSTOMER_NOTICE_HU,
  };
  assertClientSafe(dto);
  return dto;
}

export async function submitGrowAdaptivePain(identityId: string, workspaceId: string, input: { categories: unknown; freeText?: string; idempotencyKey: string }, db: Db = defaultPrisma) {
  const categories = input.categories;
  if (!Array.isArray(categories) || categories.length < 1 || categories.length > 3 || new Set(categories).size !== categories.length || categories.some(c => typeof c !== 'string' || !Object.hasOwn(V2_PAIN_ROUTES, c))) {
    throw new InteractionError(400, 'GROW_V2_INVALID_CATEGORIES', 'Válasszon egy–három különböző témát.');
  }
  // Reuse the canonical declared-survey producer; no process is required at entry.
  const submission = await submitPortalSurveyIntake(identityId, workspaceId, { categories, freeText: input.freeText, idempotencyKey: input.idempotencyKey }, db);
  const keys = [...new Set(categories.map(c => V2_PAIN_ROUTES[c]))];
  // Multiple signals ask the customer to choose ONE next branch, never all of them.
  const routes = keys.map(key => ({ packKey: key, titleHu: getAssessmentPack(key)!.titleHu }));
  return { routes, message: submission.message };
}
