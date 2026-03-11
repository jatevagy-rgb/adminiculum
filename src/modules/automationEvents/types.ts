export const AUTOMATION_ENTITY_TYPES = ['TASK', 'CASE', 'DOCUMENT'] as const;
export type AutomationEntityType = (typeof AUTOMATION_ENTITY_TYPES)[number];

export const AUTOMATION_EVENT_SOURCES = ['HUMAN', 'AUTOMATION'] as const;
export type AutomationEventSource = (typeof AUTOMATION_EVENT_SOURCES)[number];

export interface AutomationEventContext {
  [key: string]: unknown;
}

export interface AutomationEventIngestRequest {
  entityType: AutomationEntityType;
  entityId: string;
  screen: string;
  actionType: string;
  actionKey: string;
  payloadClass?: string;
  source?: AutomationEventSource;
  context?: AutomationEventContext;
}

export interface StoredAutomationTriggerEvent {
  id: string;
  userId: string;
  entityType: AutomationEntityType;
  entityId: string;
  screen: string;
  actionType: string;
  actionKey: string;
  payloadClass: string | null;
  contextKey: string;
  source: AutomationEventSource;
  createdAt: Date;
}

export interface AutomationEventIngestAutopilotExecution {
  attempted: boolean;
  status: 'EXECUTED' | 'BLOCKED' | 'NOT_ATTEMPTED';
  reason?: string;
  actionKey?: string;
  suggestionId?: string;
  executionLogId?: string;
  operationToken?: string;
  undoWindowEndsAt?: Date;
}

