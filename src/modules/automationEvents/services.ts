import { createHash } from 'crypto';
import { prisma } from '../../prisma/prisma.service';
import {
  AUTOMATION_ENTITY_TYPES,
  AUTOMATION_EVENT_SOURCES,
  AutomationEntityType,
  AutomationEventContext,
  AutomationEventIngestRequest,
  AutomationEventSource,
  StoredAutomationTriggerEvent,
} from './types';

const PAYLOAD_CLASS_ALLOWED = /^[A-Z0-9_\-.:]{1,64}$/i;

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function stableNormalize(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value.map((entry) => stableNormalize(entry));
  }

  if (isPlainObject(value)) {
    const sortedKeys = Object.keys(value).sort((a, b) => a.localeCompare(b));
    const normalized: Record<string, unknown> = {};
    for (const key of sortedKeys) {
      normalized[key] = stableNormalize(value[key]);
    }
    return normalized;
  }

  return value;
}

function buildHashedContextKey(entityType: AutomationEntityType, screen: string, context?: AutomationEventContext): string {
  if (!context || !isPlainObject(context) || Object.keys(context).length === 0) {
    return `fallback:${entityType}:${screen}`;
  }

  const normalizedContext = stableNormalize(context);
  const stableString = JSON.stringify(normalizedContext);
  const digest = createHash('sha256').update(stableString).digest('hex').slice(0, 24);
  return `ctx:${entityType}:${screen}:${digest}`;
}

function toNonEmptyTrimmedString(value: unknown): string {
  if (typeof value !== 'string') return '';
  return value.trim();
}

function normalizeSource(value: unknown): AutomationEventSource {
  if (typeof value !== 'string') return 'HUMAN';
  const normalized = value.trim().toUpperCase();
  if (AUTOMATION_EVENT_SOURCES.includes(normalized as AutomationEventSource)) {
    return normalized as AutomationEventSource;
  }
  throw new Error('Invalid source. Allowed: HUMAN, AUTOMATION');
}

function normalizeEntityType(value: unknown): AutomationEntityType {
  if (typeof value !== 'string') {
    throw new Error('entityType is required');
  }

  const normalized = value.trim().toUpperCase();
  if (!AUTOMATION_ENTITY_TYPES.includes(normalized as AutomationEntityType)) {
    throw new Error('Invalid entityType. Allowed: TASK, CASE, DOCUMENT');
  }

  return normalized as AutomationEntityType;
}

function normalizePayloadClass(value: unknown): string | null {
  if (value === undefined || value === null || value === '') {
    return null;
  }

  if (typeof value !== 'string') {
    throw new Error('payloadClass must be a string bucket/category value');
  }

  const trimmed = value.trim();
  if (!trimmed) return null;

  if (!PAYLOAD_CLASS_ALLOWED.test(trimmed)) {
    throw new Error('payloadClass must be a bucket/category token (no raw text)');
  }

  return trimmed;
}

function normalizeContext(value: unknown): AutomationEventContext | undefined {
  if (value === undefined || value === null) return undefined;
  if (!isPlainObject(value)) {
    throw new Error('context must be an object when provided');
  }
  return value;
}

class AutomationEventsService {
  async ingest(userId: string, payload: AutomationEventIngestRequest): Promise<StoredAutomationTriggerEvent> {
    if (!userId) {
      throw new Error('User not authenticated');
    }

    const entityType = normalizeEntityType(payload.entityType);
    const entityId = toNonEmptyTrimmedString(payload.entityId);
    const screen = toNonEmptyTrimmedString(payload.screen);
    const actionType = toNonEmptyTrimmedString(payload.actionType);
    const actionKey = toNonEmptyTrimmedString(payload.actionKey);
    const source = normalizeSource(payload.source);
    const payloadClass = normalizePayloadClass(payload.payloadClass);
    const context = normalizeContext(payload.context);

    if (!entityId) {
      throw new Error('entityId is required');
    }
    if (!screen) {
      throw new Error('screen is required');
    }
    if (!actionType) {
      throw new Error('actionType is required');
    }
    if (!actionKey) {
      throw new Error('actionKey is required and cannot be empty');
    }

    const contextKey = buildHashedContextKey(entityType, screen, context);

    const created = await (prisma as any).automationTriggerEvent.create({
      data: {
        userId,
        entityType,
        entityId,
        screen,
        actionType,
        actionKey,
        payloadClass,
        contextKey,
        source,
      },
    });

    return {
      id: created.id,
      userId: created.userId,
      entityType: created.entityType as AutomationEntityType,
      entityId: created.entityId,
      screen: created.screen,
      actionType: created.actionType,
      actionKey: created.actionKey,
      payloadClass: created.payloadClass,
      contextKey: created.contextKey,
      source: created.source as AutomationEventSource,
      createdAt: created.createdAt,
    };
  }
}

export default new AutomationEventsService();

