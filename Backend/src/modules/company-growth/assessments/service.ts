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
  listAssessmentPacks,
  validateAssessmentSubmission,
} from './registry';
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
    }>;
  };
  latestResult: AssessmentResultDto | null;
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
  const pack = getAssessmentPack(packKey);
  if (!pack) {
    throw new InteractionError(404, 'ASSESSMENT_UNKNOWN_PACK', 'Ismeretlen felmérés.');
  }
  // Evaluate with the version the submission was actually recorded under, never
  // the current registry definition: applying new rules to old answers would
  // reinterpret an existing completion (or reject it outright).
  const evaluation = evaluateAssessmentAnswers(pack.packKey, packVersion, answers);
  if (!evaluation) {
    throw new InteractionError(400, 'ASSESSMENT_INVALID_RESULT', 'A felmérés eredménye nem állítható elő.');
  }

  const findings: AssessmentResultFindingDto[] = evaluation.findings.map((f) => ({
    titleHu: f.titleHu,
    summaryHu: f.summaryHu,
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

function latestByPack(submissions: readonly SafePortalAssessmentSubmission[]): Map<string, SafePortalAssessmentSubmission> {
  const out = new Map<string, SafePortalAssessmentSubmission>();
  for (const submission of submissions) {
    // oldest→newest iteration is unnecessary: submissions arrive newest-first,
    // so the first occurrence per pack is the latest.
    if (!out.has(submission.packKey)) out.set(submission.packKey, submission);
  }
  return out;
}

export async function getGrowAssessmentCatalogue(
  identityId: string,
  workspaceId: string,
  db: Db = defaultPrisma,
): Promise<AssessmentCatalogueDto> {
  const { items } = await listPortalGrowAssessments(identityId, workspaceId, db);
  const latest = latestByPack(items);

  const packs: AssessmentCatalogueItemDto[] = [];
  const aggregatedFindings: AssessmentResultFindingDto[] = [];
  const seenFindingTitles = new Set<string>();
  let aggregatedAttentionAreaCount = 0;
  let aggregatedUnknownAreaCount = 0;

  for (const pack of listAssessmentPacks()) {
    const submission = latest.get(pack.packKey);
    if (!submission) {
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
      });
      continue;
    }
    const result = tryBuildResultDto(
      pack.packKey,
      submission.packVersion,
      submission.answers,
      submission.completedAt,
    );
    packs.push({
      packKey: pack.packKey,
      version: pack.version,
      titleHu: pack.titleHu,
      descriptionHu: pack.descriptionHu,
      estimatedMinutes: pack.estimatedMinutes,
      questionCount: pack.questions.length,
      status: 'COMPLETED',
      latestCompletedAt: submission.completedAt,
      latestFindingCount: result ? result.findings.length : 0,
      latestSummaryHu: result ? result.summaryHu : null,
    });

    if (!result) continue;

    aggregatedAttentionAreaCount += result.findings.length;
    aggregatedUnknownAreaCount += result.unknownAreaCount;
    for (const finding of result.findings) {
      if (seenFindingTitles.has(finding.titleHu)) continue;
      seenFindingTitles.add(finding.titleHu);
      aggregatedFindings.push(finding);
    }
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
  db: Db = defaultPrisma,
): Promise<AssessmentDetailDto> {
  const pack = getAssessmentPack(packKey);
  if (!pack) {
    throw new InteractionError(404, 'ASSESSMENT_UNKNOWN_PACK', 'Ismeretlen felmérés.');
  }
  const { items } = await listPortalGrowAssessments(identityId, workspaceId, db);
  // Match on pack key only: a completion recorded under an older pack version
  // must remain visible rather than being hidden once the pack revision changes.
  const submission = items.find((item) => item.packKey === pack.packKey) ?? null;

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
      })),
    },
    latestResult: submission
      ? tryBuildResultDto(pack.packKey, submission.packVersion, submission.answers, submission.completedAt)
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
  input: { answers: unknown; idempotencyKey: string; processId?: string },
  db: Db = defaultPrisma,
): Promise<SubmitGrowAssessmentResponse> {
  // Validate up-front so an unknown pack / bad answer set is rejected before any
  // persistence work. The version must come from the registry: validation
  // requires the supplied version to equal the current pack version, so a
  // hard-coded 1 would reject every submission once a pack advances.
  // Exact validation is enforced again at the intake boundary (defense-in-depth).
  const packDefinition = getAssessmentPack(packKey);
  const validated = validateAssessmentSubmission(packKey, packDefinition?.version ?? 1, input.answers);

  const submission = await submitPortalGrowAssessment(
    identityId,
    workspaceId,
    validated.pack.packKey,
    { answers: validated.answers, idempotencyKey: input.idempotencyKey, processId: input.processId },
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
