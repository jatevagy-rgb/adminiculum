import { AutomationEntityType } from '../automationEvents/types';

export const AUTOMATION_SUGGESTION_STATE = ['OFFERED', 'PROCESSING', 'ACCEPTED', 'DISMISSED', 'EXPIRED'] as const;
export type AutomationSuggestionState = (typeof AUTOMATION_SUGGESTION_STATE)[number];

export const AUTOMATION_SUGGESTION_TYPES = ['NEXT_STEP', 'ACTION_BUNDLE'] as const;
export type AutomationSuggestionType = (typeof AUTOMATION_SUGGESTION_TYPES)[number];

export const ALLOWED_LEVEL1_ACTION_KEYS = [
  'task.setStatus',
  'task.setDeadline',
  'task.setAssignee',
  'task.addChecklist',
] as const;
export type AllowedLevel1ActionKey = (typeof ALLOWED_LEVEL1_ACTION_KEYS)[number];

export interface BundlePreviewStep {
  order: number;
  actionKey: string;
  payloadClass: string | null;
}

export interface BundlePreview {
  version: 'v1';
  triggerActionKey: string;
  sequenceLength: number;
  sampleCount: number;
  supportCount: number;
  confidence: number;
  steps: BundlePreviewStep[];
}

export interface SuggestionGenerationInput {
  userId: string;
  entityType: AutomationEntityType;
  entityId: string;
  contextKey: string;
  actionKey: string;
  source: 'HUMAN' | 'AUTOMATION';
  triggerEventId?: string;
  actorAuthenticated?: boolean;
}

export type AutomationAutopilotStatus = 'EXECUTED' | 'BLOCKED' | 'NOT_ATTEMPTED';

export interface AutomationAutopilotOutcome {
  attempted: boolean;
  status: AutomationAutopilotStatus;
  reason?: string;
  actionKey?: string;
  suggestionId?: string;
  executionLogId?: string;
  operationToken?: string;
  undoWindowEndsAt?: Date;
}

export interface SuggestionGenerationResult {
  suggestion: AutomationSuggestionSummary | null;
  autopilotExecution: AutomationAutopilotOutcome | null;
}

export interface AutomationSuggestionSummary {
  id: string;
  userId: string;
  entityType: AutomationEntityType;
  entityId: string;
  suggestionType: AutomationSuggestionType;
  suggestedActionKey: string;
  suggestedPayloadClass: string | null;
  bundlePreview: BundlePreview | null;
  confidence: number;
  contextKey: string;
  state: AutomationSuggestionState;
  expiresAt: Date;
  createdAt: Date;
}

export interface SuggestionAcceptRequest {
  operationToken?: string;
  status?: string;
  dueDate?: string;
  assigneeId?: string;
  checklistItem?: string;
  note?: string;
}

export type BundleStepExecutionStatus = 'SUCCESS' | 'FAILED' | 'SKIPPED';

export type AutomationActionPolicy =
  | 'SAFE_AUTOPILOT_ALLOWED'
  | 'USER_APPROVAL_REQUIRED'
  | 'NEVER_AUTOPILOT';

export type AutomationStepRetryability = 'RETRYABLE' | 'MANUAL_RETRY_ONLY' | 'NON_RETRYABLE';

export type AutomationCompensationReadiness =
  | 'NONE'
  | 'COMPENSATION_READY'
  | 'MANUAL_COMPENSATION_REQUIRED';

export interface BundleStepExecutionResult {
  order: number;
  actionKey: string;
  payloadClass: string | null;
  status: BundleStepExecutionStatus;
  actionPolicy: AutomationActionPolicy;
  retryability: AutomationStepRetryability;
  compensationReadiness: AutomationCompensationReadiness;
  compensationHint?: string;
  attemptNumber: number;
  resultSummary?: string;
  failureCode?: string;
  failureMessage?: string;
}

export interface SuggestionAcceptResult {
  executed: true;
  executionLogId: string;
  suggestionId: string;
  suggestionType: AutomationSuggestionType;
  entityId: string;
  operationToken: string;
  actionKey?: string;
  totalSteps: number;
  completedSteps: number;
  failedStep?: BundleStepExecutionResult;
  stepResults: BundleStepExecutionResult[];
}

export interface StuckProcessingSuggestion {
  suggestionId: string;
  userId: string;
  entityType: string;
  entityId: string;
  actionKey: string;
  processingStartedAt: Date | null;
  latestExecutionLogId: string | null;
  latestExecutionStatus: string | null;
  latestExecutionStartedAt: Date | null;
  latestExecutionFinishedAt: Date | null;
  recommendedAction: 'SET_OFFERED' | 'SET_ACCEPTED' | 'MANUAL_REVIEW';
}

export interface StuckProcessingStatsResponse {
  count: number;
  maxAgeMinutes: number;
  inspectedAt: Date;
  suggestions: StuckProcessingSuggestion[];
}

export interface ReconcileProcessingResponse {
  applied: boolean;
  maxAgeMinutes: number;
  inspected: number;
  setOffered: number;
  setAccepted: number;
  manualReview: number;
  reconciledAt: Date;
  details: StuckProcessingSuggestion[];
}

export interface Level1AcceptanceRateByActionKey {
  actionKey: string;
  generatedCount: number;
  acceptedCount: number;
  acceptanceRate: number;
}

export interface Level1AcceptanceRateByConfidenceBucket {
  confidenceBucket: string;
  generatedCount: number;
  acceptedCount: number;
  acceptanceRate: number;
}

export interface Level1StatsResponse {
  generatedSuggestionCount: number;
  processingSuggestionCount: number;
  acceptedSuggestionCount: number;
  dismissedSuggestionCount: number;
  expiredSuggestionCount: number;
  failedExecutionCount: number;
  acceptanceRateByActionKey: Level1AcceptanceRateByActionKey[];
  acceptanceRateByConfidenceBucket: Level1AcceptanceRateByConfidenceBucket[];
  generatedAt: Date;
}

export interface RecentFailedExecutionRecord {
  executionLogId: string;
  suggestionId: string | null;
  userId: string;
  entityType: string;
  entityId: string;
  executionMode: 'LEVEL1' | 'LEVEL2' | 'LEVEL3';
  failureCode: string | null;
  resultSummary: string | null;
  createdAt: Date;
  finishedAt: Date | null;
}

export interface BundleStepFailureBreakdownEntry {
  actionKey: string;
  failureCode: string;
  failureCount: number;
  lastSeenAt: Date;
  retryableCount: number;
}

export interface ActionKeysByPolicyClassEntry {
  policy: AutomationActionPolicy;
  actionKeys: string[];
}

export interface FailureRateByActionKeyEntry {
  actionKey: string;
  totalSteps: number;
  failedSteps: number;
  failureRate: number;
}

export interface RetryabilityFailureDistributionEntry {
  retryability: AutomationStepRetryability;
  failureCount: number;
  percentage: number;
}

export interface SafeAutopilotCandidateEntry {
  actionKey: string;
  policy: AutomationActionPolicy;
  totalSteps: number;
  failedSteps: number;
  failureRate: number;
  recommendation: 'PILOT_CANDIDATE' | 'MONITOR_ONLY';
}

export interface AutopilotBlockedReasonEntry {
  reason: string;
  count: number;
}

export interface AutomationOperabilityStatsResponse {
  windowHours: number;
  maxAgeMinutes: number;
  generatedAt: Date;
  recentFailedExecutions: RecentFailedExecutionRecord[];
  bundleStepFailureBreakdown: BundleStepFailureBreakdownEntry[];
  actionKeysByPolicyClass: ActionKeysByPolicyClassEntry[];
  failureRateByActionKey: FailureRateByActionKeyEntry[];
  retryabilityFailureDistribution: RetryabilityFailureDistributionEntry[];
  safeAutopilotCandidates: SafeAutopilotCandidateEntry[];
  autopilotExecutionCount: number;
  autopilotSuccessCount: number;
  autopilotFailureCount: number;
  autopilotSuccessRate: number;
  autopilotFailureRate: number;
  autopilotByActionKey: FailureRateByActionKeyEntry[];
  autopilotBlockedAttempts: number;
  autopilotBlockedReasons: AutopilotBlockedReasonEntry[];
  stuckProcessingCount: number;
}

