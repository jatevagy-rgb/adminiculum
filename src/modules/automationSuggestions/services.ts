import { randomUUID } from 'crypto';
import { prisma } from '../../prisma/prisma.service';
import auditService from '../../services/audit.service';
import { getAutomationL3SafePilotConfig } from '../../config/automationPilot';
import taskService from '../tasks/services';
import actionExecutionService from './actionExecution.service';
import {
  ALLOWED_LEVEL1_ACTION_KEYS,
  ActionKeysByPolicyClassEntry,
  AutomationAutopilotOutcome,
  AutomationActionPolicy,
  AutomationCompensationReadiness,
  AutomationOperabilityStatsResponse,
  SuggestionGenerationResult,
  AutomationSuggestionSummary,
  AutomationStepRetryability,
  BundleStepFailureBreakdownEntry,
  BundleStepExecutionResult,
  BundlePreview,
  BundlePreviewStep,
  FailureRateByActionKeyEntry,
  Level1AcceptanceRateByActionKey,
  Level1AcceptanceRateByConfidenceBucket,
  Level1StatsResponse,
  RecentFailedExecutionRecord,
  ReconcileProcessingResponse,
  RetryabilityFailureDistributionEntry,
  SafeAutopilotCandidateEntry,
  SuggestionAcceptRequest,
  SuggestionAcceptResult,
  StuckProcessingStatsResponse,
  StuckProcessingSuggestion,
  SuggestionGenerationInput,
} from './types';

const MIN_SAMPLE_COUNT = 3;
const MIN_CONFIDENCE = 0.7;
const MIN_BUNDLE_SAMPLE_COUNT = 3;
const MIN_BUNDLE_CONFIDENCE = 0.7;
const MIN_BUNDLE_STEPS = 2;
const MAX_BUNDLE_STEPS = 6;
const OFFER_TTL_MINUTES = 20;
const DEFAULT_PROCESSING_MAX_AGE_MINUTES = 30;
const DEFAULT_OPERABILITY_WINDOW_HOURS = 24;
const MAX_OPERABILITY_FAILURE_ROWS = 50;
const MAX_OPERABILITY_BREAKDOWN_ROWS = 200;
const MAX_OPERABILITY_ACTION_ROWS = 1000;
const MAX_OPERABILITY_AUTOPILOT_ROWS = 1000;
const SAFE_AUTOPILOT_PILOT_MIN_SAMPLE = 5;
const SAFE_AUTOPILOT_PILOT_MAX_FAILURE_RATE = 0.05;
const L3_PILOT_ONLY_ACTION_KEY = 'task.addChecklist';
const AUTOPILOT_BLOCKED_CODE = 'AUTOPILOT_BLOCKED';
const AUTOPILOT_IN_PROGRESS_CODE = 'AUTOPILOT_IN_PROGRESS';
const PRIVILEGED_ROLES = new Set(['ADMIN', 'PARTNER', 'LAWYER', 'COLLAB_LAWYER']);
const CONFIDENCE_BUCKETS = [
  { label: '0.70-0.79', min: 0.7, maxExclusive: 0.8 },
  { label: '0.80-0.89', min: 0.8, maxExclusive: 0.9 },
  { label: '0.90-1.00', min: 0.9, maxExclusive: 1.000001 },
] as const;

function toSummary(row: any): AutomationSuggestionSummary {
  return {
    id: row.id,
    userId: row.userId,
    entityType: row.entityType,
    entityId: row.entityId,
    suggestionType: row.suggestionType,
    suggestedActionKey: row.suggestedActionKey,
    suggestedPayloadClass: row.suggestedPayloadClass ?? null,
    bundlePreview: (row.bundlePreview as BundlePreview | null) ?? null,
    confidence: Number(row.confidence),
    contextKey: row.contextKey,
    state: row.state,
    expiresAt: row.expiresAt,
    createdAt: row.createdAt,
  };
}

function normalizeOperationToken(input?: string): string {
  const candidate = typeof input === 'string' ? input.trim() : '';
  return candidate || randomUUID();
}

function buildFailureCode(errorMessage: string): string {
  const normalized = String(errorMessage || 'EXECUTION_FAILED')
    .trim()
    .toUpperCase()
    .replace(/[^A-Z0-9_]+/g, '_')
    .replace(/^_+|_+$/g, '');
  return normalized.slice(0, 80) || 'EXECUTION_FAILED';
}

function extractBundleSteps(rawPreview: unknown): BundlePreviewStep[] {
  if (!rawPreview || typeof rawPreview !== 'object') return [];
  const candidateSteps = (rawPreview as any).steps;
  if (!Array.isArray(candidateSteps)) return [];

  return candidateSteps
    .map((step: any, index: number) => ({
      order: Number(step?.order) || index + 1,
      actionKey: String(step?.actionKey || '').trim(),
      payloadClass:
        typeof step?.payloadClass === 'string' && step.payloadClass.trim().length > 0
          ? step.payloadClass.trim()
          : null,
    }))
    .filter((step: BundlePreviewStep) => Boolean(step.actionKey));
}

function normalizeStoredStepResult(step: any): BundleStepExecutionResult {
  const actionKey = String(step?.actionKey || 'UNKNOWN').trim() || 'UNKNOWN';
  return {
    order: Number(step?.order) || 1,
    actionKey,
    payloadClass: typeof step?.payloadClass === 'string' ? step.payloadClass : null,
    status: (step?.status as BundleStepExecutionResult['status']) || 'FAILED',
    actionPolicy:
      (step?.actionPolicy as AutomationActionPolicy) ||
      (actionKey === 'task.addChecklist'
        ? 'SAFE_AUTOPILOT_ALLOWED'
        : actionKey === 'task.setAssignee'
          ? 'NEVER_AUTOPILOT'
          : 'USER_APPROVAL_REQUIRED'),
    retryability: (step?.retryability as AutomationStepRetryability) || 'MANUAL_RETRY_ONLY',
    compensationReadiness:
      (step?.compensationReadiness as AutomationCompensationReadiness) || 'MANUAL_COMPENSATION_REQUIRED',
    compensationHint: typeof step?.compensationHint === 'string' ? step.compensationHint : undefined,
    attemptNumber: Number(step?.attemptNumber) > 0 ? Number(step.attemptNumber) : 1,
    resultSummary: typeof step?.resultSummary === 'string' ? step.resultSummary : undefined,
    failureCode: typeof step?.failureCode === 'string' ? step.failureCode : undefined,
    failureMessage: typeof step?.failureMessage === 'string' ? step.failureMessage : undefined,
  };
}

function inferRetryabilityFromFailure(failureCode?: string, failureMessage?: string): AutomationStepRetryability {
  const code = String(failureCode || '').toUpperCase();
  const msg = String(failureMessage || '').toLowerCase();

  if (code.includes('FORBIDDEN') || msg.includes('forbidden')) {
    return 'NON_RETRYABLE';
  }
  if (code.includes('UNSUPPORTED') || msg.includes('unsupported')) {
    return 'NON_RETRYABLE';
  }
  if (code.includes('REQUIRED') || msg.includes('required')) {
    return 'MANUAL_RETRY_ONLY';
  }
  if (code.includes('VALID') || msg.includes('valid')) {
    return 'MANUAL_RETRY_ONLY';
  }

  return 'RETRYABLE';
}

class AutomationSuggestionsService {
  private buildStepResult(params: {
    order: number;
    actionKey: string;
    payloadClass: string | null;
    status: 'SUCCESS' | 'FAILED' | 'SKIPPED';
    resultSummary?: string;
    failureCode?: string;
    failureMessage?: string;
    retryability?: AutomationStepRetryability;
  }): BundleStepExecutionResult {
    const actionKey = String(params.actionKey || '').trim() || 'UNKNOWN';
    const actionPolicy = actionExecutionService.getActionPolicy(actionKey);
    const compensationReadiness = actionExecutionService.getCompensationReadiness(actionKey);
    const compensationHint = actionExecutionService.getCompensationHint(actionKey);
    const retryability =
      params.retryability ||
      (params.status === 'FAILED'
        ? inferRetryabilityFromFailure(params.failureCode, params.failureMessage)
        : actionExecutionService.getDefaultRetryability(actionKey));

    return {
      order: params.order,
      actionKey,
      payloadClass: params.payloadClass,
      status: params.status,
      actionPolicy,
      retryability,
      compensationReadiness,
      compensationHint,
      attemptNumber: 1,
      resultSummary: params.resultSummary,
      failureCode: params.failureCode,
      failureMessage: params.failureMessage,
    };
  }

  private async persistExecutionStepLogs(
    tx: any,
    input: {
      executionLogId: string;
      suggestionId: string | null;
      userId: string;
      entityType: 'TASK' | 'CASE' | 'DOCUMENT';
      entityId: string;
      executionMode: 'LEVEL1' | 'LEVEL2' | 'LEVEL3';
      stepResults: BundleStepExecutionResult[];
      finishedAt: Date;
    },
  ): Promise<void> {
    if (!Array.isArray(input.stepResults) || input.stepResults.length === 0) {
      return;
    }

    await tx.automationExecutionStepLog.createMany({
      data: input.stepResults.map((step) => ({
        executionLogId: input.executionLogId,
        suggestionId: input.suggestionId,
        userId: input.userId,
        entityType: input.entityType,
        entityId: input.entityId,
        executionMode: input.executionMode,
        stepOrder: step.order,
        actionKey: step.actionKey,
        payloadClass: step.payloadClass,
        status: step.status,
        actionPolicy: step.actionPolicy,
        retryability: step.retryability,
        compensationReadiness: step.compensationReadiness,
        compensationHint: step.compensationHint || null,
        attemptNumber: step.attemptNumber,
        resultSummary: step.resultSummary || null,
        failureCode: step.failureCode || null,
        failureDetails: step.failureMessage ? { failureMessage: step.failureMessage } : null,
        executedAt: input.finishedAt,
        finishedAt: input.finishedAt,
      })),
    });
  }

  private buildAcceptResponse(
    executionLogId: string,
    suggestionId: string,
    suggestionType: 'NEXT_STEP' | 'ACTION_BUNDLE',
    entityId: string,
    operationToken: string,
    stepResults: BundleStepExecutionResult[],
    actionKey?: string,
  ): SuggestionAcceptResult {
    const completedSteps = stepResults.filter((step) => step.status === 'SUCCESS').length;
    const failedStep = stepResults.find((step) => step.status === 'FAILED');

    return {
      executed: true,
      executionLogId,
      suggestionId,
      suggestionType,
      entityId,
      operationToken,
      actionKey,
      totalSteps: stepResults.length,
      completedSteps,
      failedStep,
      stepResults,
    };
  }

  private async executeBundleSteps(
    userId: string,
    suggestion: any,
    payload: SuggestionAcceptRequest,
  ): Promise<{ stepResults: BundleStepExecutionResult[]; allSucceeded: boolean }> {
    const steps = extractBundleSteps(suggestion.bundlePreview);
    if (steps.length === 0) {
      throw new Error('BUNDLE_PREVIEW_INVALID');
    }

    const stepResults: BundleStepExecutionResult[] = [];

    for (const step of steps) {
      if (!actionExecutionService.isAllowedAction(step.actionKey)) {
        stepResults.push(this.buildStepResult({
          order: step.order,
          actionKey: step.actionKey,
          payloadClass: step.payloadClass,
          status: 'FAILED',
          failureCode: 'UNSUPPORTED_ACTION_KEY',
          failureMessage: 'Bundle step actionKey is not allowed',
        }));
        return { stepResults, allSucceeded: false };
      }

      const stepPayload: SuggestionAcceptRequest = {
        ...payload,
      };

      if (step.actionKey === 'task.setStatus') {
        stepPayload.status = payload.status || step.payloadClass || undefined;
      } else if (step.actionKey === 'task.addChecklist') {
        stepPayload.checklistItem = payload.checklistItem || step.payloadClass || undefined;
      }

      try {
        const execution = await actionExecutionService.execute({
          userId,
          entityType: suggestion.entityType,
          entityId: suggestion.entityId,
          actionKey: step.actionKey,
          suggestedPayloadClass: step.payloadClass,
          acceptPayload: stepPayload,
        });

        stepResults.push(this.buildStepResult({
          order: step.order,
          actionKey: step.actionKey,
          payloadClass: step.payloadClass,
          status: 'SUCCESS',
          resultSummary: execution.resultSummary,
        }));
      } catch (error) {
        const message = error instanceof Error ? error.message : 'Execution failed';
        stepResults.push(this.buildStepResult({
          order: step.order,
          actionKey: step.actionKey,
          payloadClass: step.payloadClass,
          status: 'FAILED',
          failureCode: buildFailureCode(message),
          failureMessage: message,
        }));

        for (const remainingStep of steps) {
          if (remainingStep.order <= step.order) continue;
          stepResults.push(this.buildStepResult({
            order: remainingStep.order,
            actionKey: remainingStep.actionKey,
            payloadClass: remainingStep.payloadClass,
            status: 'SKIPPED',
            resultSummary: 'Skipped because a previous step failed',
            retryability: 'MANUAL_RETRY_ONLY',
          }));
        }

        return { stepResults, allSucceeded: false };
      }
    }

    return { stepResults, allSucceeded: true };
  }

  private async runLevel1SuggestionExecution(
    userId: string,
    lockedSuggestion: any,
    payload: SuggestionAcceptRequest,
  ): Promise<{ stepResults: BundleStepExecutionResult[]; allSucceeded: boolean }> {
    try {
      const execution = await actionExecutionService.execute({
        userId,
        entityType: lockedSuggestion.entityType,
        entityId: lockedSuggestion.entityId,
        actionKey: lockedSuggestion.suggestedActionKey,
        suggestedPayloadClass: lockedSuggestion.suggestedPayloadClass,
        acceptPayload: payload,
      });

      return {
        allSucceeded: true,
        stepResults: [
          this.buildStepResult({
            order: 1,
            actionKey: lockedSuggestion.suggestedActionKey,
            payloadClass: lockedSuggestion.suggestedPayloadClass ?? null,
            status: 'SUCCESS',
            resultSummary: execution.resultSummary,
          }),
        ],
      };
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Execution failed';
      return {
        allSucceeded: false,
        stepResults: [
          this.buildStepResult({
            order: 1,
            actionKey: lockedSuggestion.suggestedActionKey,
            payloadClass: lockedSuggestion.suggestedPayloadClass ?? null,
            status: 'FAILED',
            failureCode: buildFailureCode(message),
            failureMessage: message,
          }),
        ],
      };
    }
  }

  private async isActionSuppressed(userId: string, actionKey: string): Promise<boolean> {
    const suppression = await (prisma as any).userAutomationSuppression.findFirst({
      where: { userId, suppressionType: 'ACTION_KEY', value: actionKey },
    });
    return Boolean(suppression);
  }

  private async isAnyBundleActionSuppressed(userId: string, steps: BundlePreviewStep[]): Promise<boolean> {
    const uniqueActionKeys = [...new Set(steps.map((step) => String(step.actionKey || '').trim()).filter(Boolean))];
    for (const actionKey of uniqueActionKeys) {
      // sequential checks keep SQL simple and deterministic in MVP phase
      // eslint-disable-next-line no-await-in-loop
      const suppressed = await this.isActionSuppressed(userId, actionKey);
      if (suppressed) return true;
    }
    return false;
  }

  private async generateLevel2BundleSuggestion(input: SuggestionGenerationInput): Promise<AutomationSuggestionSummary | null> {
    const events = await (prisma as any).automationTriggerEvent.findMany({
      where: {
        userId: input.userId,
        source: 'HUMAN',
        contextKey: input.contextKey,
      },
      orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
      select: {
        id: true,
        actionKey: true,
        payloadClass: true,
      },
    });

    type Candidate = {
      sequenceLength: number;
      key: string;
      supportCount: number;
      sampleCount: number;
      confidence: number;
      steps: BundlePreviewStep[];
    };

    const bestByLength = new Map<number, Candidate>();

    for (let sequenceLength = MIN_BUNDLE_STEPS; sequenceLength <= MAX_BUNDLE_STEPS; sequenceLength += 1) {
      const signatureCounts = new Map<string, { count: number; steps: BundlePreviewStep[] }>();
      let sampleCount = 0;

      for (let i = 0; i < events.length; i += 1) {
        const trigger = events[i];
        if (!trigger || trigger.actionKey !== input.actionKey) continue;

        const nextStepsWindow = events.slice(i + 1, i + 1 + sequenceLength);
        if (nextStepsWindow.length !== sequenceLength) continue;

        sampleCount += 1;
        const steps = nextStepsWindow.map((entry: any, index: number) => ({
          order: index + 1,
          actionKey: String(entry.actionKey || ''),
          payloadClass: entry.payloadClass ? String(entry.payloadClass) : null,
        }));

        const signature = steps
          .map((step) => `${step.order}:${step.actionKey}::${step.payloadClass ?? ''}`)
          .join('||');

        const existing = signatureCounts.get(signature);
        if (existing) {
          existing.count += 1;
          signatureCounts.set(signature, existing);
        } else {
          signatureCounts.set(signature, { count: 1, steps });
        }
      }

      if (sampleCount < MIN_BUNDLE_SAMPLE_COUNT || signatureCounts.size === 0) {
        continue;
      }

      let bestSignature: string | null = null;
      let bestSupport = 0;
      let bestSteps: BundlePreviewStep[] = [];

      for (const [signature, stats] of signatureCounts.entries()) {
        if (stats.count > bestSupport) {
          bestSignature = signature;
          bestSupport = stats.count;
          bestSteps = stats.steps;
        }
      }

      if (!bestSignature || bestSupport <= 0 || bestSteps.length !== sequenceLength) {
        continue;
      }

      const confidence = bestSupport / sampleCount;
      if (confidence < MIN_BUNDLE_CONFIDENCE) {
        continue;
      }

      bestByLength.set(sequenceLength, {
        sequenceLength,
        key: bestSignature,
        supportCount: bestSupport,
        sampleCount,
        confidence,
        steps: bestSteps,
      });
    }

    if (bestByLength.size === 0) {
      return null;
    }

    const orderedCandidates = [...bestByLength.values()].sort((a, b) => {
      if (b.confidence !== a.confidence) return b.confidence - a.confidence;
      if (b.supportCount !== a.supportCount) return b.supportCount - a.supportCount;
      if (b.sequenceLength !== a.sequenceLength) return b.sequenceLength - a.sequenceLength;
      return a.key.localeCompare(b.key);
    });

    const winner = orderedCandidates[0];
    if (!winner || winner.steps.length === 0) {
      return null;
    }

    const suppressed = await this.isAnyBundleActionSuppressed(input.userId, winner.steps);
    if (suppressed) {
      return null;
    }

    const existingActive = await this.getCurrentOfferedSuggestion(input.userId, input.entityType, input.entityId);
    if (existingActive) {
      return existingActive;
    }

    const firstStep = winner.steps[0];
    if (!firstStep || !firstStep.actionKey) {
      return null;
    }

    const bundlePreview: BundlePreview = {
      version: 'v1',
      triggerActionKey: input.actionKey,
      sequenceLength: winner.sequenceLength,
      sampleCount: winner.sampleCount,
      supportCount: winner.supportCount,
      confidence: Number(winner.confidence.toFixed(4)),
      steps: winner.steps,
    };

    const expiresAt = new Date(Date.now() + OFFER_TTL_MINUTES * 60 * 1000);
    const created = await (prisma as any).automationSuggestion.create({
      data: {
        userId: input.userId,
        entityType: input.entityType,
        entityId: input.entityId,
        suggestionType: 'ACTION_BUNDLE',
        suggestedActionKey: firstStep.actionKey,
        suggestedPayloadClass: firstStep.payloadClass,
        bundlePreview,
        confidence: bundlePreview.confidence,
        contextKey: input.contextKey,
        state: 'OFFERED',
        expiresAt,
      },
    });

    return toSummary(created);
  }

  private async safeAudit(
    userId: string,
    action: string,
    entityType: string,
    entityId: string,
    metadata?: Record<string, unknown>,
  ): Promise<void> {
    try {
      await auditService.logAction(userId, action, entityType, entityId, metadata || null);
    } catch (error) {
      console.error('Automation audit write failed:', error);
    }
  }

  private async assertEntityAccess(userId: string, suggestion: any): Promise<void> {
    if (suggestion.entityType !== 'TASK') {
      throw new Error('UNSUPPORTED_ENTITY_TYPE');
    }

    const actor = await (prisma as any).user.findUnique({
      where: { id: userId },
      select: { role: true },
    });

    if (actor?.role && PRIVILEGED_ROLES.has(actor.role)) {
      return;
    }

    const task = await taskService.getTask(suggestion.entityId);
    if (!task) throw new Error('ENTITY_NOT_FOUND');

    const caseCreator = (task as any)?.case?.createdById as string | undefined;
    const assignedLawyer = (task as any)?.case?.assignedLawyerId as string | undefined;
    const assignee = (task as any)?.assignedToId as string | undefined;
    const assigner = (task as any)?.assignedById as string | undefined;

    const hasAccess =
      caseCreator === userId ||
      assignedLawyer === userId ||
      assignee === userId ||
      assigner === userId;

    if (!hasAccess) throw new Error('FORBIDDEN_ENTITY_ACCESS');
  }

  private confidenceBucket(confidenceValue: number): string {
    for (const bucket of CONFIDENCE_BUCKETS) {
      if (confidenceValue >= bucket.min && confidenceValue < bucket.maxExclusive) {
        return bucket.label;
      }
    }
    return 'OTHER';
  }

  private async isAutomationSchemaSanityOk(): Promise<boolean> {
    const queryRawUnsafe = (prisma as any).$queryRawUnsafe;
    if (typeof queryRawUnsafe !== 'function') {
      return true;
    }

    try {
      const tableRows = await queryRawUnsafe("SELECT to_regclass('public.automation_execution_step_logs') AS regclass");
      if (!tableRows?.[0]?.regclass) {
        return false;
      }

      const policyRows = await queryRawUnsafe(
        `SELECT e.enumlabel
         FROM pg_type t
         JOIN pg_enum e ON t.oid = e.enumtypid
         WHERE t.typname = 'AutomationActionPolicy'`,
      );
      return Array.isArray(policyRows) && policyRows.length > 0;
    } catch {
      return false;
    }
  }

  private async hasConflictingSuggestionOrExecution(userId: string, suggestion: any): Promise<boolean> {
    const processingSuggestion = await (prisma as any).automationSuggestion.findFirst({
      where: {
        userId,
        entityType: suggestion.entityType,
        entityId: suggestion.entityId,
        state: 'PROCESSING',
        NOT: { id: suggestion.id },
      },
    });
    if (processingSuggestion) {
      return true;
    }

    const inFlightCutoff = new Date(Date.now() - 5 * 60 * 1000);
    const processingExecution = await (prisma as any).automationExecutionLog.findFirst({
      where: {
        userId,
        entityType: suggestion.entityType,
        entityId: suggestion.entityId,
        status: 'SKIPPED',
        startedAt: { gte: inFlightCutoff },
        finishedAt: null,
      },
      orderBy: [{ startedAt: 'desc' }, { createdAt: 'desc' }],
      select: { id: true },
    });

    return Boolean(processingExecution);
  }

  private async recordAutopilotBlockedAttempt(params: {
    userId: string;
    suggestion: AutomationSuggestionSummary;
    reason: string;
    details?: Record<string, unknown>;
  }): Promise<void> {
    const now = new Date();
    const operationToken = `l3-blocked-${randomUUID()}`;

    try {
      const log = await (prisma as any).automationExecutionLog.create({
        data: {
          userId: params.userId,
          entityType: params.suggestion.entityType,
          entityId: params.suggestion.entityId,
          suggestionId: params.suggestion.id,
          executionMode: 'LEVEL3',
          status: 'SKIPPED',
          operationToken,
          startedAt: now,
          finishedAt: now,
          resultSummary: `L3 SAFE autopilot blocked: ${params.reason}`.slice(0, 1000),
          failureCode: AUTOPILOT_BLOCKED_CODE,
          failureDetails: {
            autopilot: true,
            blocked: true,
            blockedReason: params.reason,
            actionKey: params.suggestion.suggestedActionKey,
            suggestionId: params.suggestion.id,
            ...params.details,
          },
        },
      });

      await this.safeAudit(params.userId, 'AUTOMATION_L3_SAFE_PILOT_BLOCKED', 'AutomationExecutionLog', log.id, {
        suggestionId: params.suggestion.id,
        actionKey: params.suggestion.suggestedActionKey,
        reason: params.reason,
        autopilot: true,
      });
    } catch (error) {
      console.error('Autopilot blocked-attempt logging failed:', error);
    }
  }

  private async executeLevel3SafePilotSuggestion(
    userId: string,
    suggestion: AutomationSuggestionSummary,
    undoWindowMinutes: number,
  ): Promise<AutomationAutopilotOutcome> {
    const operationToken = `l3-${suggestion.id}-${randomUUID()}`;
    const processingStartedAt = new Date();

    const lock = await (prisma as any).automationSuggestion.updateMany({
      where: {
        id: suggestion.id,
        userId,
        state: 'OFFERED',
        expiresAt: { gt: new Date() },
      },
      data: {
        state: 'PROCESSING',
        processingStartedAt,
      },
    });

    if (!lock || lock.count !== 1) {
      await this.recordAutopilotBlockedAttempt({
        userId,
        suggestion,
        reason: 'CONFLICTING_PROCESSING',
      });
      return {
        attempted: true,
        status: 'BLOCKED',
        reason: 'CONFLICTING_PROCESSING',
        actionKey: suggestion.suggestedActionKey,
        suggestionId: suggestion.id,
      };
    }

    const lockedSuggestion = await (prisma as any).automationSuggestion.findUnique({ where: { id: suggestion.id } });
    if (!lockedSuggestion || lockedSuggestion.state !== 'PROCESSING') {
      await this.recordAutopilotBlockedAttempt({
        userId,
        suggestion,
        reason: 'LOCK_FAILED',
      });
      return {
        attempted: true,
        status: 'BLOCKED',
        reason: 'LOCK_FAILED',
        actionKey: suggestion.suggestedActionKey,
        suggestionId: suggestion.id,
      };
    }

    let executionLog: any;
    const startedAt = new Date();
    try {
      executionLog = await (prisma as any).automationExecutionLog.create({
        data: {
          userId,
          entityType: lockedSuggestion.entityType,
          entityId: lockedSuggestion.entityId,
          suggestionId: lockedSuggestion.id,
          executionMode: 'LEVEL3',
          status: 'SKIPPED',
          operationToken,
          startedAt,
          resultSummary: 'L3 SAFE autopilot execution started',
          failureCode: AUTOPILOT_IN_PROGRESS_CODE,
          failureDetails: {
            autopilot: true,
            actionKey: lockedSuggestion.suggestedActionKey,
            phase: 'STARTED',
          },
        },
      });
    } catch (error) {
      await (prisma as any).automationSuggestion.updateMany({
        where: { id: suggestion.id, state: 'PROCESSING' },
        data: { state: 'OFFERED', processingStartedAt: null },
      });

      await this.recordAutopilotBlockedAttempt({
        userId,
        suggestion,
        reason: 'EXECUTION_LOG_CREATE_FAILED',
      });

      return {
        attempted: true,
        status: 'BLOCKED',
        reason: 'EXECUTION_LOG_CREATE_FAILED',
        actionKey: suggestion.suggestedActionKey,
        suggestionId: suggestion.id,
      };
    }

    const execution = await this.runLevel1SuggestionExecution(userId, lockedSuggestion, {
      operationToken,
      checklistItem: lockedSuggestion.suggestedPayloadClass || undefined,
    });

    const finishedAt = new Date();
    const undoWindowEndsAt = new Date(finishedAt.getTime() + undoWindowMinutes * 60 * 1000);
    const success = execution.allSucceeded;
    const primaryFailure = execution.stepResults.find((step) => step.status === 'FAILED');

    await (prisma as any).$transaction(async (tx: any) => {
      await tx.automationExecutionLog.update({
        where: { id: executionLog.id },
        data: {
          status: success ? 'SUCCESS' : 'FAILED',
          resultSummary: success
            ? `L3 SAFE autopilot succeeded (${execution.stepResults.length} step)`
            : (primaryFailure?.failureMessage || 'L3 SAFE autopilot failed').slice(0, 1000),
          failureCode: success ? null : (primaryFailure?.failureCode || 'EXECUTION_FAILED'),
          failureDetails: {
            autopilot: true,
            actionKey: lockedSuggestion.suggestedActionKey,
            operationToken,
            stepResults: execution.stepResults,
          },
          rollbackData: {
            autopilot: true,
            undoWindowMinutes,
            undoWindowEndsAt: undoWindowEndsAt.toISOString(),
          },
          finishedAt,
        },
      });

      await tx.automationSuggestion.update({
        where: { id: lockedSuggestion.id },
        data: { state: success ? 'ACCEPTED' : 'OFFERED', processingStartedAt: null },
      });

      await this.persistExecutionStepLogs(tx, {
        executionLogId: executionLog.id,
        suggestionId: lockedSuggestion.id,
        userId,
        entityType: lockedSuggestion.entityType,
        entityId: lockedSuggestion.entityId,
        executionMode: 'LEVEL3',
        stepResults: execution.stepResults,
        finishedAt,
      });
    });

    await this.safeAudit(userId, 'AUTOMATION_L3_SAFE_PILOT_EXECUTE', 'AutomationExecutionLog', executionLog.id, {
      suggestionId: lockedSuggestion.id,
      actionKey: lockedSuggestion.suggestedActionKey,
      status: success ? 'SUCCESS' : 'FAILED',
      executionMode: 'LEVEL3',
      autopilot: true,
      operationToken,
      undoWindowEndsAt: undoWindowEndsAt.toISOString(),
    });

    return {
      attempted: true,
      status: 'EXECUTED',
      reason: success ? undefined : (primaryFailure?.failureCode || 'EXECUTION_FAILED'),
      actionKey: lockedSuggestion.suggestedActionKey,
      suggestionId: lockedSuggestion.id,
      executionLogId: executionLog.id,
      operationToken,
      undoWindowEndsAt,
    };
  }

  private async maybeRunLevel3SafePilotExecution(
    input: SuggestionGenerationInput,
    preference: any,
    suggestion: AutomationSuggestionSummary,
  ): Promise<AutomationAutopilotOutcome | null> {
    const pilotConfig = getAutomationL3SafePilotConfig();
    const suggestionsEnabled = preference?.suggestionsEnabled ?? true;
    const level3Enabled = preference?.level3Enabled ?? false;
    const actionKey = String(suggestion.suggestedActionKey || '');
    const actionPolicy = actionExecutionService.getActionPolicy(actionKey);

    const blocked = async (reason: string, details?: Record<string, unknown>): Promise<AutomationAutopilotOutcome> => {
      const outcome: AutomationAutopilotOutcome = {
        attempted: true,
        status: 'BLOCKED',
        reason,
        actionKey,
        suggestionId: suggestion.id,
      };
      await this.recordAutopilotBlockedAttempt({ userId: input.userId, suggestion, reason, details });
      return outcome;
    };

    if (!input.userId || input.actorAuthenticated === false) {
      return blocked('USER_NOT_AUTHENTICATED');
    }
    if (!suggestionsEnabled) {
      return blocked('SUGGESTIONS_DISABLED');
    }
    if (!level3Enabled) {
      return blocked('LEVEL3_DISABLED');
    }
    if (!pilotConfig.enabled) {
      return blocked('FEATURE_FLAG_DISABLED');
    }
    if (pilotConfig.cohortUserAllowlist.length === 0) {
      return blocked('COHORT_NOT_CONFIGURED');
    }
    const normalizedUserId = String(input.userId || '').trim().toLowerCase();
    if (!normalizedUserId || !pilotConfig.cohortUserAllowlist.includes(normalizedUserId)) {
      return blocked('COHORT_NOT_ELIGIBLE');
    }
    if (suggestion.suggestionType !== 'NEXT_STEP') {
      return blocked('SUGGESTION_TYPE_NOT_ELIGIBLE');
    }
    if (actionKey !== L3_PILOT_ONLY_ACTION_KEY) {
      return blocked('ACTION_NOT_WHITELISTED');
    }
    if (actionPolicy !== 'SAFE_AUTOPILOT_ALLOWED') {
      return blocked('ACTION_POLICY_NOT_ALLOWED', { actionPolicy });
    }
    if (Number(suggestion.confidence) < pilotConfig.minConfidence) {
      return blocked('LOW_CONFIDENCE', { confidence: suggestion.confidence, minConfidence: pilotConfig.minConfidence });
    }

    const suppressed = await this.isActionSuppressed(input.userId, actionKey);
    if (suppressed) {
      return blocked('ACTION_SUPPRESSED');
    }

    try {
      await this.assertEntityAccess(input.userId, suggestion);
    } catch (error) {
      return blocked('ENTITY_ACCESS_INVALID', {
        error: error instanceof Error ? error.message : 'FORBIDDEN_ENTITY_ACCESS',
      });
    }

    const hasConflict = await this.hasConflictingSuggestionOrExecution(input.userId, suggestion);
    if (hasConflict) {
      return blocked('CONFLICTING_PROCESSING_OR_EXECUTION');
    }

    const schemaSanityOk = await this.isAutomationSchemaSanityOk();
    if (!schemaSanityOk) {
      return blocked('SCHEMA_SANITY_FAILED');
    }

    return this.executeLevel3SafePilotSuggestion(input.userId, suggestion, pilotConfig.undoWindowMinutes);
  }

  getMvpThresholds() {
    return {
      minSampleCount: MIN_SAMPLE_COUNT,
      minConfidence: MIN_CONFIDENCE,
    };
  }

  getLevel2BundleThresholds() {
    return {
      minSampleCount: MIN_BUNDLE_SAMPLE_COUNT,
      minConfidence: MIN_BUNDLE_CONFIDENCE,
      minSteps: MIN_BUNDLE_STEPS,
      maxSteps: MAX_BUNDLE_STEPS,
    };
  }

  async generateSuggestionForEventWithAutopilot(input: SuggestionGenerationInput): Promise<SuggestionGenerationResult> {
    if (input.source !== 'HUMAN') {
      return { suggestion: null, autopilotExecution: null };
    }

    const preference = await (prisma as any).userAutomationPreference.findUnique({
      where: { userId: input.userId },
    });

    const suggestionsEnabled = preference?.suggestionsEnabled ?? true;
    if (!suggestionsEnabled) {
      return { suggestion: null, autopilotExecution: null };
    }

    const active = await this.getCurrentOfferedSuggestion(input.userId, input.entityType, input.entityId);
    if (active) {
      const autopilotExecution = await this.maybeRunLevel3SafePilotExecution(input, preference, active);
      const refreshedActive = await (prisma as any).automationSuggestion.findUnique({ where: { id: active.id } });
      return {
        suggestion: refreshedActive ? toSummary(refreshedActive) : active,
        autopilotExecution,
      };
    }

    const level2Enabled = preference?.level2Enabled ?? true;
    if (level2Enabled) {
      const l2 = await this.generateLevel2BundleSuggestion(input);
      if (l2) {
        return { suggestion: l2, autopilotExecution: null };
      }
    }

    const level1Enabled = preference?.level1Enabled ?? true;
    if (!level1Enabled) {
      return { suggestion: null, autopilotExecution: null };
    }

    const l1 = await this.generateLevel1Suggestion(input);
    if (!l1) {
      return { suggestion: null, autopilotExecution: null };
    }

    const autopilotExecution = await this.maybeRunLevel3SafePilotExecution(input, preference, l1);
    const refreshed = await (prisma as any).automationSuggestion.findUnique({ where: { id: l1.id } });
    return {
      suggestion: refreshed ? toSummary(refreshed) : l1,
      autopilotExecution,
    };
  }

  async generateSuggestionForEvent(input: SuggestionGenerationInput): Promise<AutomationSuggestionSummary | null> {
    const result = await this.generateSuggestionForEventWithAutopilot(input);
    return result.suggestion;
  }

  async getCurrentOfferedSuggestion(
    userId: string,
    entityType: string,
    entityId: string,
  ): Promise<AutomationSuggestionSummary | null> {
    const now = new Date();

    await (prisma as any).automationSuggestion.updateMany({
      where: {
        userId,
        entityType,
        entityId,
        state: 'OFFERED',
        expiresAt: { lte: now },
      },
      data: { state: 'EXPIRED' },
    });

    const existing = await (prisma as any).automationSuggestion.findFirst({
      where: {
        userId,
        entityType,
        entityId,
        state: 'OFFERED',
        expiresAt: { gt: now },
      },
      orderBy: { createdAt: 'desc' },
    });

    return existing ? toSummary(existing) : null;
  }

  async dismissSuggestion(userId: string, suggestionId: string): Promise<boolean> {
    const suggestion = await (prisma as any).automationSuggestion.findUnique({ where: { id: suggestionId } });
    if (!suggestion) return false;
    if (suggestion.userId !== userId) throw new Error('FORBIDDEN_SUGGESTION_ACCESS');

    await (prisma as any).automationSuggestion.update({
      where: { id: suggestionId },
      data: { state: 'DISMISSED', processingStartedAt: null },
    });

    await this.safeAudit(userId, 'AUTOMATION_SUGGESTION_DISMISSED', 'AutomationSuggestion', suggestionId, {
      entityType: suggestion.entityType,
      entityId: suggestion.entityId,
      suggestedActionKey: suggestion.suggestedActionKey,
    });

    return true;
  }

  async acceptSuggestion(userId: string, suggestionId: string, payload: SuggestionAcceptRequest): Promise<SuggestionAcceptResult> {
    const operationToken = normalizeOperationToken(payload?.operationToken);

    const existingByToken = await (prisma as any).automationExecutionLog.findUnique({
      where: { operationToken },
    });
    if (existingByToken) {
      if (existingByToken.userId !== userId || existingByToken.suggestionId !== suggestionId) {
        throw new Error('OPERATION_TOKEN_CONFLICT');
      }

      const linkedSuggestion = await (prisma as any).automationSuggestion.findUnique({ where: { id: suggestionId } });
      if (existingByToken.status === 'SUCCESS') {
        const linkedType = (linkedSuggestion?.suggestionType || 'NEXT_STEP') as 'NEXT_STEP' | 'ACTION_BUNDLE';
        const storedStepResults = Array.isArray(existingByToken?.failureDetails?.stepResults)
          ? (existingByToken.failureDetails.stepResults as any[]).map((step) => normalizeStoredStepResult(step))
          : [
              this.buildStepResult({
                order: 1,
                actionKey: linkedSuggestion?.suggestedActionKey || 'UNKNOWN',
                payloadClass: linkedSuggestion?.suggestedPayloadClass ?? null,
                status: 'SUCCESS' as const,
                resultSummary: existingByToken.resultSummary || 'Execution succeeded',
              }),
            ];
        return {
          ...this.buildAcceptResponse(
            existingByToken.id,
            suggestionId,
            linkedType,
            linkedSuggestion?.entityId || existingByToken.entityId,
            operationToken,
            storedStepResults,
            linkedSuggestion?.suggestedActionKey || 'UNKNOWN',
          ),
        };
      }
      if (existingByToken.status === 'FAILED') throw new Error('OPERATION_ALREADY_FAILED');
      throw new Error('OPERATION_IN_PROGRESS');
    }

    const suggestion = await (prisma as any).automationSuggestion.findUnique({ where: { id: suggestionId } });
    if (!suggestion) throw new Error('SUGGESTION_NOT_FOUND');
    if (suggestion.userId !== userId) throw new Error('FORBIDDEN_SUGGESTION_ACCESS');
    const isLevel1 = suggestion.suggestionType === 'NEXT_STEP';
    const isLevel2Bundle = suggestion.suggestionType === 'ACTION_BUNDLE';
    if (!isLevel1 && !isLevel2Bundle) throw new Error('SUGGESTION_TYPE_NOT_SUPPORTED');

    if (isLevel1 && !ALLOWED_LEVEL1_ACTION_KEYS.includes(suggestion.suggestedActionKey as any)) {
      throw new Error('UNSUPPORTED_ACTION_KEY');
    }

    if (isLevel2Bundle) {
      const steps = extractBundleSteps(suggestion.bundlePreview);
      if (steps.length === 0) throw new Error('BUNDLE_PREVIEW_INVALID');
      for (const step of steps) {
        if (!actionExecutionService.isAllowedAction(step.actionKey)) throw new Error('UNSUPPORTED_ACTION_KEY');
      }
    }

    if (suggestion.state === 'PROCESSING') throw new Error('SUGGESTION_ALREADY_PROCESSING');
    if (suggestion.state === 'ACCEPTED' || suggestion.state === 'DISMISSED' || suggestion.state === 'EXPIRED') {
      throw new Error('SUGGESTION_ALREADY_PROCESSED');
    }
    if (suggestion.state !== 'OFFERED') throw new Error('SUGGESTION_NOT_OFFERED');

    const now = new Date();
    if (suggestion.expiresAt <= now) {
      await (prisma as any).automationSuggestion.updateMany({
        where: { id: suggestionId, userId, state: 'OFFERED', expiresAt: { lte: now } },
        data: { state: 'EXPIRED' },
      });
      throw new Error('SUGGESTION_EXPIRED');
    }

    const preference = await (prisma as any).userAutomationPreference.findUnique({ where: { userId } });
    const suggestionsEnabled = preference?.suggestionsEnabled ?? true;
    const level1Enabled = preference?.level1Enabled ?? true;
    const level2Enabled = preference?.level2Enabled ?? true;
    if (!suggestionsEnabled) throw new Error(isLevel2Bundle ? 'LEVEL2_DISABLED' : 'LEVEL1_DISABLED');
    if (isLevel1 && !level1Enabled) throw new Error('LEVEL1_DISABLED');
    if (isLevel2Bundle && !level2Enabled) throw new Error('LEVEL2_DISABLED');

    const suppressed = await this.isActionSuppressed(userId, suggestion.suggestedActionKey);
    if (suppressed) throw new Error('ACTION_SUPPRESSED');

    if (isLevel2Bundle) {
      const steps = extractBundleSteps(suggestion.bundlePreview);
      const anySuppressed = await this.isAnyBundleActionSuppressed(userId, steps);
      if (anySuppressed) throw new Error('ACTION_SUPPRESSED');
    }

    await this.assertEntityAccess(userId, suggestion);

    const processingStartedAt = new Date();
    const lock = await (prisma as any).automationSuggestion.updateMany({
      where: { id: suggestionId, userId, state: 'OFFERED', expiresAt: { gt: now } },
      data: { state: 'PROCESSING', processingStartedAt },
    });
    if (!lock || lock.count !== 1) {
      const latest = await (prisma as any).automationSuggestion.findUnique({ where: { id: suggestionId } });
      if (latest?.state === 'PROCESSING') throw new Error('SUGGESTION_ALREADY_PROCESSING');
      throw new Error('SUGGESTION_ALREADY_PROCESSED');
    }

    const lockedSuggestion = await (prisma as any).automationSuggestion.findUnique({ where: { id: suggestionId } });
    if (!lockedSuggestion || lockedSuggestion.state !== 'PROCESSING') throw new Error('SUGGESTION_LOCK_FAILED');

    let executionLog: any;
    const executionStartedAt = new Date();
    const executionMode = isLevel2Bundle ? 'LEVEL2' : 'LEVEL1';
    try {
      executionLog = await (prisma as any).automationExecutionLog.create({
        data: {
          userId,
          entityType: lockedSuggestion.entityType,
          entityId: lockedSuggestion.entityId,
          suggestionId: lockedSuggestion.id,
          executionMode,
          status: 'SKIPPED',
          operationToken,
          startedAt: executionStartedAt,
          resultSummary: 'Execution started',
        },
      });
    } catch (error) {
      await (prisma as any).automationSuggestion.updateMany({
        where: { id: suggestionId, state: 'PROCESSING' },
        data: { state: 'OFFERED', processingStartedAt: null },
      });

      const message = error instanceof Error ? error.message : '';
      if (message.includes('Unique constraint') || message.includes('operationToken')) {
        throw new Error('OPERATION_IN_PROGRESS');
      }
      throw error;
    }

    try {
      const execution = isLevel2Bundle
        ? await this.executeBundleSteps(userId, lockedSuggestion, payload)
        : await this.runLevel1SuggestionExecution(userId, lockedSuggestion, payload);

      const primarySummary = execution.stepResults
        .map((step) => `${step.order}:${step.actionKey}:${step.status}`)
        .join(' | ')
        .slice(0, 1000);

      const overallSuccess = execution.allSucceeded;

      const finishedAt = new Date();
      await (prisma as any).$transaction(async (tx: any) => {
        await tx.automationExecutionLog.update({
          where: { id: executionLog.id },
          data: {
            status: overallSuccess ? 'SUCCESS' : 'FAILED',
            resultSummary: overallSuccess ? `Bundle execution succeeded (${execution.stepResults.length} step)` : primarySummary,
            finishedAt,
            failureCode: overallSuccess
              ? null
              : execution.stepResults.find((step) => step.status === 'FAILED')?.failureCode || 'EXECUTION_FAILED',
            failureDetails: {
              operationToken,
              suggestionType: lockedSuggestion.suggestionType,
              stepResults: execution.stepResults,
            },
          },
        });

        await tx.automationSuggestion.update({
          where: { id: lockedSuggestion.id },
          data: { state: overallSuccess ? 'ACCEPTED' : 'OFFERED', processingStartedAt: null },
        });

        await this.persistExecutionStepLogs(tx, {
          executionLogId: executionLog.id,
          suggestionId: lockedSuggestion.id,
          userId,
          entityType: lockedSuggestion.entityType,
          entityId: lockedSuggestion.entityId,
          executionMode,
          stepResults: execution.stepResults,
          finishedAt,
        });
      });

      if (!overallSuccess) {
        throw new Error(execution.stepResults.find((step) => step.status === 'FAILED')?.failureMessage || 'Execution failed');
      }

      await this.safeAudit(userId, 'AUTOMATION_SUGGESTION_ACCEPT', 'AutomationSuggestion', lockedSuggestion.id, {
        actionKey: lockedSuggestion.suggestedActionKey,
        entityType: lockedSuggestion.entityType,
        entityId: lockedSuggestion.entityId,
        executionLogId: executionLog.id,
        operationToken,
        suggestionType: lockedSuggestion.suggestionType,
        totalSteps: execution.stepResults.length,
      });

      await this.safeAudit(userId, 'AUTOMATION_ACTION_EXECUTE', 'AutomationExecutionLog', executionLog.id, {
        suggestionId: lockedSuggestion.id,
        actionKey: lockedSuggestion.suggestedActionKey,
        entityType: lockedSuggestion.entityType,
        entityId: lockedSuggestion.entityId,
        executionMode,
        status: 'SUCCESS',
        operationToken,
        stepResults: execution.stepResults,
      });

      return this.buildAcceptResponse(
        executionLog.id,
        lockedSuggestion.id,
        lockedSuggestion.suggestionType,
        lockedSuggestion.entityId,
        operationToken,
        execution.stepResults,
        lockedSuggestion.suggestedActionKey,
      );
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Execution failed';
      const failureCode = buildFailureCode(message);
      const finishedAt = new Date();

      const latestLogState = await (prisma as any).automationExecutionLog.findUnique({ where: { id: executionLog.id } });
      if (latestLogState?.status === 'FAILED' || latestLogState?.status === 'SUCCESS') {
        throw error;
      }

      await (prisma as any).$transaction(async (tx: any) => {
        const syntheticFailureStep = this.buildStepResult({
          order: 1,
          actionKey: lockedSuggestion?.suggestedActionKey || 'UNKNOWN',
          payloadClass: lockedSuggestion?.suggestedPayloadClass ?? null,
          status: 'FAILED',
          failureCode,
          failureMessage: message,
        });

        await tx.automationExecutionLog.update({
          where: { id: executionLog.id },
          data: {
            status: 'FAILED',
            resultSummary: message.slice(0, 1000),
            failureCode,
            failureDetails: { error: message, operationToken },
            finishedAt,
          },
        });

        await tx.automationSuggestion.update({
          where: { id: suggestionId },
          data: { state: 'OFFERED', processingStartedAt: null },
        });

        await this.persistExecutionStepLogs(tx, {
          executionLogId: executionLog.id,
          suggestionId: lockedSuggestion?.id || null,
          userId,
          entityType: lockedSuggestion?.entityType || 'TASK',
          entityId: lockedSuggestion?.entityId || suggestionId,
          executionMode,
          stepResults: [syntheticFailureStep],
          finishedAt,
        });
      });

      await this.safeAudit(userId, 'AUTOMATION_ACTION_EXECUTE', 'AutomationExecutionLog', executionLog.id, {
        suggestionId: lockedSuggestion.id,
        actionKey: lockedSuggestion.suggestedActionKey,
        entityType: lockedSuggestion.entityType,
        entityId: lockedSuggestion.entityId,
        executionMode,
        status: 'FAILED',
        operationToken,
        error: message,
      });

      throw error;
    }
  }

  async getLevel1Stats(): Promise<Level1StatsResponse> {
    const [
      generatedSuggestionCount,
      processingSuggestionCount,
      acceptedSuggestionCount,
      dismissedSuggestionCount,
      expiredSuggestionCount,
      failedExecutionCount,
      generatedSuggestions,
    ] = await Promise.all([
      (prisma as any).automationSuggestion.count({ where: { suggestionType: 'NEXT_STEP' } }),
      (prisma as any).automationSuggestion.count({ where: { suggestionType: 'NEXT_STEP', state: 'PROCESSING' } }),
      (prisma as any).automationSuggestion.count({ where: { suggestionType: 'NEXT_STEP', state: 'ACCEPTED' } }),
      (prisma as any).automationSuggestion.count({ where: { suggestionType: 'NEXT_STEP', state: 'DISMISSED' } }),
      (prisma as any).automationSuggestion.count({ where: { suggestionType: 'NEXT_STEP', state: 'EXPIRED' } }),
      (prisma as any).automationExecutionLog.count({ where: { executionMode: 'LEVEL1', status: 'FAILED' } }),
      (prisma as any).automationSuggestion.findMany({
        where: { suggestionType: 'NEXT_STEP' },
        select: { suggestedActionKey: true, confidence: true, state: true },
      }),
    ]);

    const byAction = new Map<string, { generated: number; accepted: number }>();
    const byBucket = new Map<string, { generated: number; accepted: number }>();
    for (const row of generatedSuggestions) {
      const actionKey = String(row.suggestedActionKey || 'UNKNOWN');
      const state = String(row.state || '');
      const confidence = Number(row.confidence || 0);
      const bucket = this.confidenceBucket(confidence);

      const actionStats = byAction.get(actionKey) || { generated: 0, accepted: 0 };
      actionStats.generated += 1;
      if (state === 'ACCEPTED') actionStats.accepted += 1;
      byAction.set(actionKey, actionStats);

      const bucketStats = byBucket.get(bucket) || { generated: 0, accepted: 0 };
      bucketStats.generated += 1;
      if (state === 'ACCEPTED') bucketStats.accepted += 1;
      byBucket.set(bucket, bucketStats);
    }

    const acceptanceRateByActionKey: Level1AcceptanceRateByActionKey[] = Array.from(byAction.entries())
      .map(([actionKey, stats]) => ({
        actionKey,
        generatedCount: stats.generated,
        acceptedCount: stats.accepted,
        acceptanceRate: stats.generated > 0 ? Number((stats.accepted / stats.generated).toFixed(4)) : 0,
      }))
      .sort((a, b) => a.actionKey.localeCompare(b.actionKey));

    const acceptanceRateByConfidenceBucket: Level1AcceptanceRateByConfidenceBucket[] = Array.from(byBucket.entries())
      .map(([confidenceBucket, stats]) => ({
        confidenceBucket,
        generatedCount: stats.generated,
        acceptedCount: stats.accepted,
        acceptanceRate: stats.generated > 0 ? Number((stats.accepted / stats.generated).toFixed(4)) : 0,
      }))
      .sort((a, b) => a.confidenceBucket.localeCompare(b.confidenceBucket));

    return {
      generatedSuggestionCount,
      processingSuggestionCount,
      acceptedSuggestionCount,
      dismissedSuggestionCount,
      expiredSuggestionCount,
      failedExecutionCount,
      acceptanceRateByActionKey,
      acceptanceRateByConfidenceBucket,
      generatedAt: new Date(),
    };
  }

  async getOperabilityStats(
    windowHours = DEFAULT_OPERABILITY_WINDOW_HOURS,
    maxAgeMinutes = DEFAULT_PROCESSING_MAX_AGE_MINUTES,
  ): Promise<AutomationOperabilityStatsResponse> {
    const safeWindowHours = Number.isFinite(windowHours) && windowHours > 0 ? Math.floor(windowHours) : DEFAULT_OPERABILITY_WINDOW_HOURS;
    const since = new Date(Date.now() - safeWindowHours * 60 * 60 * 1000);

    const [failedRows, stepFailureRows, allStepRows, autopilotLogRows, autopilotStepRows, stuck] = await Promise.all([
      (prisma as any).automationExecutionLog.findMany({
        where: { status: 'FAILED', createdAt: { gte: since } },
        orderBy: { createdAt: 'desc' },
        take: MAX_OPERABILITY_FAILURE_ROWS,
        select: {
          id: true,
          suggestionId: true,
          userId: true,
          entityType: true,
          entityId: true,
          executionMode: true,
          failureCode: true,
          resultSummary: true,
          createdAt: true,
          finishedAt: true,
        },
      }),
      (prisma as any).automationExecutionStepLog.findMany({
        where: {
          executionMode: 'LEVEL2',
          status: 'FAILED',
          createdAt: { gte: since },
        },
        orderBy: { createdAt: 'desc' },
        take: MAX_OPERABILITY_BREAKDOWN_ROWS,
        select: {
          actionKey: true,
          failureCode: true,
          retryability: true,
          createdAt: true,
        },
      }),
      (prisma as any).automationExecutionStepLog.findMany({
        where: {
          createdAt: { gte: since },
        },
        orderBy: { createdAt: 'desc' },
        take: MAX_OPERABILITY_ACTION_ROWS,
        select: {
          actionKey: true,
          status: true,
          actionPolicy: true,
          retryability: true,
        },
      }),
      (prisma as any).automationExecutionLog.findMany({
        where: {
          executionMode: 'LEVEL3',
          createdAt: { gte: since },
        },
        orderBy: { createdAt: 'desc' },
        take: MAX_OPERABILITY_AUTOPILOT_ROWS,
        select: {
          id: true,
          status: true,
          failureCode: true,
          failureDetails: true,
          createdAt: true,
        },
      }),
      (prisma as any).automationExecutionStepLog.findMany({
        where: {
          executionMode: 'LEVEL3',
          createdAt: { gte: since },
        },
        orderBy: { createdAt: 'desc' },
        take: MAX_OPERABILITY_AUTOPILOT_ROWS,
        select: {
          actionKey: true,
          status: true,
        },
      }),
      this.getStuckProcessingSuggestions(maxAgeMinutes),
    ]);

    const recentFailedExecutions: RecentFailedExecutionRecord[] = failedRows.map((row: any) => ({
      executionLogId: row.id,
      suggestionId: row.suggestionId ?? null,
      userId: row.userId,
      entityType: row.entityType,
      entityId: row.entityId,
      executionMode: row.executionMode,
      failureCode: row.failureCode ?? null,
      resultSummary: row.resultSummary ?? null,
      createdAt: row.createdAt,
      finishedAt: row.finishedAt ?? null,
    }));

    const breakdownMap = new Map<string, BundleStepFailureBreakdownEntry>();
    for (const row of stepFailureRows) {
      const actionKey = String(row.actionKey || 'UNKNOWN');
      const failureCode = String(row.failureCode || 'EXECUTION_FAILED');
      const key = `${actionKey}::${failureCode}`;
      const existing = breakdownMap.get(key);
      const retryableInc = row.retryability === 'RETRYABLE' ? 1 : 0;
      if (!existing) {
        breakdownMap.set(key, {
          actionKey,
          failureCode,
          failureCount: 1,
          lastSeenAt: row.createdAt,
          retryableCount: retryableInc,
        });
      } else {
        existing.failureCount += 1;
        existing.retryableCount += retryableInc;
        if (row.createdAt > existing.lastSeenAt) {
          existing.lastSeenAt = row.createdAt;
        }
      }
    }

    const bundleStepFailureBreakdown = Array.from(breakdownMap.values()).sort((a, b) => {
      if (b.failureCount !== a.failureCount) return b.failureCount - a.failureCount;
      return b.lastSeenAt.getTime() - a.lastSeenAt.getTime();
    });

    const actionKeysByPolicyMap = new Map<AutomationActionPolicy, Set<string>>();
    const totalByActionMap = new Map<string, number>();
    const failedByActionMap = new Map<string, number>();
    const retryabilityFailureMap = new Map<AutomationStepRetryability, number>();

    for (const actionKey of ALLOWED_LEVEL1_ACTION_KEYS) {
      const policy = actionExecutionService.getActionPolicy(actionKey);
      const entry = actionKeysByPolicyMap.get(policy) || new Set<string>();
      entry.add(actionKey);
      actionKeysByPolicyMap.set(policy, entry);
    }

    for (const row of allStepRows as Array<{ actionKey: string; status: string; actionPolicy: AutomationActionPolicy; retryability: AutomationStepRetryability }>) {
      const actionKey = String(row.actionKey || 'UNKNOWN');
      totalByActionMap.set(actionKey, (totalByActionMap.get(actionKey) || 0) + 1);

      const policy = row.actionPolicy || actionExecutionService.getActionPolicy(actionKey);
      const entry = actionKeysByPolicyMap.get(policy) || new Set<string>();
      entry.add(actionKey);
      actionKeysByPolicyMap.set(policy, entry);

      if (row.status === 'FAILED') {
        failedByActionMap.set(actionKey, (failedByActionMap.get(actionKey) || 0) + 1);
        const retryability = (row.retryability || 'MANUAL_RETRY_ONLY') as AutomationStepRetryability;
        retryabilityFailureMap.set(retryability, (retryabilityFailureMap.get(retryability) || 0) + 1);
      }
    }

    const actionKeysByPolicyClass: ActionKeysByPolicyClassEntry[] = (['SAFE_AUTOPILOT_ALLOWED', 'USER_APPROVAL_REQUIRED', 'NEVER_AUTOPILOT'] as const)
      .map((policy) => ({
        policy,
        actionKeys: Array.from(actionKeysByPolicyMap.get(policy) || []).sort(),
      }));

    const failureRateByActionKey: FailureRateByActionKeyEntry[] = Array.from(totalByActionMap.entries())
      .map(([actionKey, totalSteps]) => {
        const failedSteps = failedByActionMap.get(actionKey) || 0;
        return {
          actionKey,
          totalSteps,
          failedSteps,
          failureRate: totalSteps > 0 ? Number((failedSteps / totalSteps).toFixed(4)) : 0,
        };
      })
      .sort((a, b) => {
        if (b.totalSteps !== a.totalSteps) return b.totalSteps - a.totalSteps;
        return a.actionKey.localeCompare(b.actionKey);
      });

    const totalFailedForDistribution = Array.from(retryabilityFailureMap.values()).reduce((sum, n) => sum + n, 0);
    const retryabilityFailureDistribution: RetryabilityFailureDistributionEntry[] = (
      ['RETRYABLE', 'MANUAL_RETRY_ONLY', 'NON_RETRYABLE'] as const
    ).map((retryability) => {
      const failureCount = retryabilityFailureMap.get(retryability) || 0;
      return {
        retryability,
        failureCount,
        percentage: totalFailedForDistribution > 0 ? Number((failureCount / totalFailedForDistribution).toFixed(4)) : 0,
      };
    });

    const safeAutopilotCandidates: SafeAutopilotCandidateEntry[] = actionKeysByPolicyClass
      .find((entry) => entry.policy === 'SAFE_AUTOPILOT_ALLOWED')
      ?.actionKeys.map((actionKey) => {
        const totalSteps = totalByActionMap.get(actionKey) || 0;
        const failedSteps = failedByActionMap.get(actionKey) || 0;
        const failureRate = totalSteps > 0 ? Number((failedSteps / totalSteps).toFixed(4)) : 0;
        const isPilotCandidate = totalSteps >= SAFE_AUTOPILOT_PILOT_MIN_SAMPLE && failureRate <= SAFE_AUTOPILOT_PILOT_MAX_FAILURE_RATE;
        return {
          actionKey,
          policy: 'SAFE_AUTOPILOT_ALLOWED' as const,
          totalSteps,
          failedSteps,
          failureRate,
          recommendation: isPilotCandidate ? 'PILOT_CANDIDATE' as const : 'MONITOR_ONLY' as const,
        };
      })
      .sort((a, b) => {
        if (a.recommendation !== b.recommendation) {
          return a.recommendation === 'PILOT_CANDIDATE' ? -1 : 1;
        }
        if (b.totalSteps !== a.totalSteps) return b.totalSteps - a.totalSteps;
        return a.failureRate - b.failureRate;
      }) || [];

    const autopilotExecutionCount = (autopilotLogRows as any[]).filter(
      (row) => row.status === 'SUCCESS' || row.status === 'FAILED',
    ).length;
    const autopilotSuccessCount = (autopilotLogRows as any[]).filter((row) => row.status === 'SUCCESS').length;
    const autopilotFailureCount = (autopilotLogRows as any[]).filter((row) => row.status === 'FAILED').length;
    const autopilotSuccessRate =
      autopilotExecutionCount > 0 ? Number((autopilotSuccessCount / autopilotExecutionCount).toFixed(4)) : 0;
    const autopilotFailureRate =
      autopilotExecutionCount > 0 ? Number((autopilotFailureCount / autopilotExecutionCount).toFixed(4)) : 0;

    const autopilotByActionTotals = new Map<string, { total: number; failed: number }>();
    const bumpAutopilotByAction = (actionKey: string, status: string): void => {
      const normalized = String(actionKey || 'UNKNOWN').trim() || 'UNKNOWN';
      const entry = autopilotByActionTotals.get(normalized) || { total: 0, failed: 0 };
      entry.total += 1;
      if (status === 'FAILED') entry.failed += 1;
      autopilotByActionTotals.set(normalized, entry);
    };

    for (const stepRow of autopilotStepRows as Array<{ actionKey: string; status: string }>) {
      bumpAutopilotByAction(stepRow.actionKey, stepRow.status);
    }

    for (const logRow of autopilotLogRows as any[]) {
      if (logRow.status !== 'SKIPPED') continue;
      const actionKey = String(logRow?.failureDetails?.actionKey || '').trim();
      if (actionKey) {
        bumpAutopilotByAction(actionKey, logRow.status);
      }
    }

    const autopilotByActionKey: FailureRateByActionKeyEntry[] = Array.from(autopilotByActionTotals.entries())
      .map(([actionKey, totals]) => ({
        actionKey,
        totalSteps: totals.total,
        failedSteps: totals.failed,
        failureRate: totals.total > 0 ? Number((totals.failed / totals.total).toFixed(4)) : 0,
      }))
      .sort((a, b) => {
        if (b.totalSteps !== a.totalSteps) return b.totalSteps - a.totalSteps;
        return a.actionKey.localeCompare(b.actionKey);
      });

    const blockedReasonMap = new Map<string, number>();
    let autopilotBlockedAttempts = 0;
    for (const row of autopilotLogRows as any[]) {
      if (row.status === 'SKIPPED' && row.failureCode === AUTOPILOT_BLOCKED_CODE) {
        autopilotBlockedAttempts += 1;
        const reason = String(row?.failureDetails?.blockedReason || 'UNKNOWN');
        blockedReasonMap.set(reason, (blockedReasonMap.get(reason) || 0) + 1);
      }
    }
    const autopilotBlockedReasons = Array.from(blockedReasonMap.entries())
      .map(([reason, count]) => ({ reason, count }))
      .sort((a, b) => {
        if (b.count !== a.count) return b.count - a.count;
        return a.reason.localeCompare(b.reason);
      });

    return {
      windowHours: safeWindowHours,
      maxAgeMinutes: stuck.maxAgeMinutes,
      generatedAt: new Date(),
      recentFailedExecutions,
      bundleStepFailureBreakdown,
      actionKeysByPolicyClass,
      failureRateByActionKey,
      retryabilityFailureDistribution,
      safeAutopilotCandidates,
      autopilotExecutionCount,
      autopilotSuccessCount,
      autopilotFailureCount,
      autopilotSuccessRate,
      autopilotFailureRate,
      autopilotByActionKey,
      autopilotBlockedAttempts,
      autopilotBlockedReasons,
      stuckProcessingCount: stuck.count,
    };
  }

  async getStuckProcessingSuggestions(maxAgeMinutes = DEFAULT_PROCESSING_MAX_AGE_MINUTES): Promise<StuckProcessingStatsResponse> {
    const safeMaxAge = Number.isFinite(maxAgeMinutes) && maxAgeMinutes > 0 ? Math.floor(maxAgeMinutes) : DEFAULT_PROCESSING_MAX_AGE_MINUTES;
    const cutoff = new Date(Date.now() - safeMaxAge * 60 * 1000);

    const processingRows = await (prisma as any).automationSuggestion.findMany({
      where: {
        state: 'PROCESSING',
        OR: [{ processingStartedAt: { lte: cutoff } }, { processingStartedAt: null }],
      },
      select: {
        id: true,
        userId: true,
        entityType: true,
        entityId: true,
        suggestedActionKey: true,
        processingStartedAt: true,
      },
      orderBy: { processingStartedAt: 'asc' },
    });

    const suggestions: StuckProcessingSuggestion[] = [];
    for (const row of processingRows) {
      const latestLog = await (prisma as any).automationExecutionLog.findFirst({
        where: { suggestionId: row.id },
        orderBy: [{ startedAt: 'desc' }, { createdAt: 'desc' }],
        select: { id: true, status: true, startedAt: true, finishedAt: true },
      });

      let recommendedAction: StuckProcessingSuggestion['recommendedAction'] = 'MANUAL_REVIEW';
      if (latestLog?.status === 'SUCCESS') recommendedAction = 'SET_ACCEPTED';
      else if (latestLog?.status === 'FAILED') recommendedAction = 'SET_OFFERED';

      suggestions.push({
        suggestionId: row.id,
        userId: row.userId,
        entityType: row.entityType,
        entityId: row.entityId,
        actionKey: row.suggestedActionKey,
        processingStartedAt: row.processingStartedAt,
        latestExecutionLogId: latestLog?.id || null,
        latestExecutionStatus: latestLog?.status || null,
        latestExecutionStartedAt: latestLog?.startedAt || null,
        latestExecutionFinishedAt: latestLog?.finishedAt || null,
        recommendedAction,
      });
    }

    return {
      count: suggestions.length,
      maxAgeMinutes: safeMaxAge,
      inspectedAt: new Date(),
      suggestions,
    };
  }

  async reconcileStuckProcessing(maxAgeMinutes = DEFAULT_PROCESSING_MAX_AGE_MINUTES, apply = false): Promise<ReconcileProcessingResponse> {
    const snapshot = await this.getStuckProcessingSuggestions(maxAgeMinutes);

    let setOffered = 0;
    let setAccepted = 0;
    let manualReview = 0;

    if (apply) {
      for (const item of snapshot.suggestions) {
        if (item.recommendedAction === 'SET_OFFERED') {
          const updated = await (prisma as any).automationSuggestion.updateMany({
            where: { id: item.suggestionId, state: 'PROCESSING' },
            data: { state: 'OFFERED', processingStartedAt: null },
          });
          if (updated?.count === 1) setOffered += 1;
          continue;
        }

        if (item.recommendedAction === 'SET_ACCEPTED') {
          const updated = await (prisma as any).automationSuggestion.updateMany({
            where: { id: item.suggestionId, state: 'PROCESSING' },
            data: { state: 'ACCEPTED', processingStartedAt: null },
          });
          if (updated?.count === 1) setAccepted += 1;
          continue;
        }

        manualReview += 1;
      }
    } else {
      for (const item of snapshot.suggestions) {
        if (item.recommendedAction === 'SET_OFFERED') setOffered += 1;
        else if (item.recommendedAction === 'SET_ACCEPTED') setAccepted += 1;
        else manualReview += 1;
      }
    }

    return {
      applied: Boolean(apply),
      maxAgeMinutes: snapshot.maxAgeMinutes,
      inspected: snapshot.count,
      setOffered,
      setAccepted,
      manualReview,
      reconciledAt: new Date(),
      details: snapshot.suggestions,
    };
  }

  async generateLevel1Suggestion(
    input: SuggestionGenerationInput,
  ): Promise<AutomationSuggestionSummary | null> {
    if (input.source !== 'HUMAN') {
      return null;
    }

    const preference = await (prisma as any).userAutomationPreference.findUnique({
      where: { userId: input.userId },
    });

    const suggestionsEnabled = preference?.suggestionsEnabled ?? true;
    const level1Enabled = preference?.level1Enabled ?? true;
    if (!suggestionsEnabled || !level1Enabled) {
      return null;
    }

    const active = await this.getCurrentOfferedSuggestion(
      input.userId,
      input.entityType,
      input.entityId,
    );
    if (active) {
      return active;
    }

    const events = await (prisma as any).automationTriggerEvent.findMany({
      where: {
        userId: input.userId,
        source: 'HUMAN',
        contextKey: input.contextKey,
      },
      orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
      select: {
        id: true,
        actionKey: true,
        payloadClass: true,
        createdAt: true,
      },
    });

    type NextStats = {
      count: number;
      payloadClassCounts: Map<string, number>;
    };

    const nextCounts = new Map<string, NextStats>();
    let sampleCount = 0;

    for (let i = 0; i < events.length - 1; i += 1) {
      const current = events[i];
      const next = events[i + 1];
      if (!current || !next) continue;
      if (current.actionKey !== input.actionKey) continue;

      sampleCount += 1;

      const existingStats = nextCounts.get(next.actionKey) ?? {
        count: 0,
        payloadClassCounts: new Map<string, number>(),
      };

      existingStats.count += 1;

      if (next.payloadClass) {
        existingStats.payloadClassCounts.set(
          next.payloadClass,
          (existingStats.payloadClassCounts.get(next.payloadClass) ?? 0) + 1,
        );
      }

      nextCounts.set(next.actionKey, existingStats);
    }

    if (sampleCount < MIN_SAMPLE_COUNT || nextCounts.size === 0) {
      return null;
    }

    let topActionKey: string | null = null;
    let topCount = 0;
    let topPayloadClass: string | null = null;

    for (const [candidateActionKey, stats] of nextCounts.entries()) {
      if (stats.count > topCount) {
        topCount = stats.count;
        topActionKey = candidateActionKey;

        let payloadWinner: string | null = null;
        let payloadWinnerCount = 0;
        for (const [pc, pcCount] of stats.payloadClassCounts.entries()) {
          if (pcCount > payloadWinnerCount) {
            payloadWinnerCount = pcCount;
            payloadWinner = pc;
          }
        }
        topPayloadClass = payloadWinner;
      }
    }

    if (!topActionKey || topCount <= 0) {
      return null;
    }

    const confidence = topCount / sampleCount;
    if (confidence < MIN_CONFIDENCE) {
      return null;
    }

    const suppressed = await this.isActionSuppressed(input.userId, topActionKey);
    if (suppressed) {
      return null;
    }

    const existingActive = await this.getCurrentOfferedSuggestion(
      input.userId,
      input.entityType,
      input.entityId,
    );
    if (existingActive) {
      return existingActive;
    }

    const expiresAt = new Date(Date.now() + OFFER_TTL_MINUTES * 60 * 1000);

    const created = await (prisma as any).automationSuggestion.create({
      data: {
        userId: input.userId,
        entityType: input.entityType,
        entityId: input.entityId,
        suggestionType: 'NEXT_STEP',
        suggestedActionKey: topActionKey,
        suggestedPayloadClass: topPayloadClass,
        confidence,
        contextKey: input.contextKey,
        state: 'OFFERED',
        expiresAt,
      },
    });

    return toSummary(created);
  }
}

export default new AutomationSuggestionsService();

