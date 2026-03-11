import { prisma } from '../../prisma/prisma.service';
import auditService from '../../services/audit.service';
import {
  AUTOMATION_SUPPRESSION_TYPES,
  AutomationPreferences,
  AutomationSuppression,
  AutomationSuppressionType,
  CreateAutomationSuppressionRequest,
  CreateAutomationSuppressionResult,
  UpdateAutomationPreferencesRequest,
} from './types';

const DEFAULT_PREFERENCES = {
  suggestionsEnabled: true,
  level1Enabled: true,
  level2Enabled: true,
  level3Enabled: false,
};

function asBooleanOrUndefined(input: unknown, field: string): boolean | undefined {
  if (input === undefined) return undefined;
  if (typeof input !== 'boolean') {
    throw new Error(`${field} must be a boolean`);
  }
  return input;
}

function normalizeSuppressionType(input: unknown): AutomationSuppressionType {
  if (typeof input !== 'string') {
    throw new Error('suppressionType is required');
  }

  const normalized = input.trim().toUpperCase();
  if (!AUTOMATION_SUPPRESSION_TYPES.includes(normalized as AutomationSuppressionType)) {
    throw new Error('Invalid suppressionType. Allowed: ACTION_KEY, TEMPLATE_ID');
  }

  return normalized as AutomationSuppressionType;
}

function normalizeValue(input: unknown): string {
  if (typeof input !== 'string') {
    throw new Error('value is required');
  }

  const value = input.trim();
  if (!value) {
    throw new Error('value is required and cannot be empty');
  }
  return value;
}

function toPreferencesResponse(row: any): AutomationPreferences {
  return {
    id: row.id,
    userId: row.userId,
    suggestionsEnabled: row.suggestionsEnabled,
    level1Enabled: row.level1Enabled,
    level2Enabled: row.level2Enabled,
    level3Enabled: row.level3Enabled,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

function toSuppressionResponse(row: any): AutomationSuppression {
  return {
    id: row.id,
    userId: row.userId,
    suppressionType: row.suppressionType as AutomationSuppressionType,
    value: row.value,
    createdAt: row.createdAt,
  };
}

class AutomationPreferencesService {
  async getPreferences(userId: string): Promise<AutomationPreferences> {
    const existing = await (prisma as any).userAutomationPreference.findUnique({
      where: { userId },
    });

    if (existing) {
      return toPreferencesResponse(existing);
    }

    const created = await (prisma as any).userAutomationPreference.create({
      data: {
        userId,
        ...DEFAULT_PREFERENCES,
      },
    });

    return toPreferencesResponse(created);
  }

  async updatePreferences(userId: string, payload: UpdateAutomationPreferencesRequest): Promise<AutomationPreferences> {
    const suggestionsEnabled = asBooleanOrUndefined(payload.suggestionsEnabled, 'suggestionsEnabled');
    const level1Enabled = asBooleanOrUndefined(payload.level1Enabled, 'level1Enabled');
    const level2Enabled = asBooleanOrUndefined(payload.level2Enabled, 'level2Enabled');
    const level3Enabled = asBooleanOrUndefined(payload.level3Enabled, 'level3Enabled');

    const updated = await (prisma as any).userAutomationPreference.upsert({
      where: { userId },
      create: {
        userId,
        suggestionsEnabled: suggestionsEnabled ?? DEFAULT_PREFERENCES.suggestionsEnabled,
        level1Enabled: level1Enabled ?? DEFAULT_PREFERENCES.level1Enabled,
        level2Enabled: level2Enabled ?? DEFAULT_PREFERENCES.level2Enabled,
        level3Enabled: level3Enabled ?? DEFAULT_PREFERENCES.level3Enabled,
      },
      update: {
        ...(suggestionsEnabled !== undefined ? { suggestionsEnabled } : {}),
        ...(level1Enabled !== undefined ? { level1Enabled } : {}),
        ...(level2Enabled !== undefined ? { level2Enabled } : {}),
        ...(level3Enabled !== undefined ? { level3Enabled } : {}),
      },
    });

    await auditService.logAction(userId, 'AUTOMATION_PREFERENCES_UPDATED', 'UserAutomationPreference', updated.id, {
      suggestionsEnabled: updated.suggestionsEnabled,
      level1Enabled: updated.level1Enabled,
      level2Enabled: updated.level2Enabled,
      level3Enabled: updated.level3Enabled,
    });

    return toPreferencesResponse(updated);
  }

  async createSuppression(userId: string, payload: CreateAutomationSuppressionRequest): Promise<CreateAutomationSuppressionResult> {
    const suppressionType = normalizeSuppressionType(payload.suppressionType);
    const value = normalizeValue(payload.value);

    const existing = await (prisma as any).userAutomationSuppression.findFirst({
      where: {
        userId,
        suppressionType,
        value,
      },
    });

    if (existing) {
      return {
        suppression: toSuppressionResponse(existing),
        created: false,
      };
    }

    const created = await (prisma as any).userAutomationSuppression.create({
      data: {
        userId,
        suppressionType,
        value,
      },
    });

    await auditService.logAction(userId, 'AUTOMATION_SUPPRESSION_CREATED', 'UserAutomationSuppression', created.id, {
      suppressionType,
      value,
    });

    return {
      suppression: toSuppressionResponse(created),
      created: true,
    };
  }

  async listSuppressions(userId: string): Promise<AutomationSuppression[]> {
    const rows = await (prisma as any).userAutomationSuppression.findMany({
      where: { userId },
      orderBy: { createdAt: 'desc' },
    });

    return rows.map((row: any) => toSuppressionResponse(row));
  }

  async deleteSuppression(userId: string, suppressionId: string): Promise<boolean> {
    const existing = await (prisma as any).userAutomationSuppression.findUnique({
      where: { id: suppressionId },
    });

    if (!existing) {
      return false;
    }

    if (existing.userId !== userId) {
      throw new Error('Forbidden suppression access');
    }

    await (prisma as any).userAutomationSuppression.delete({
      where: { id: suppressionId },
    });

    await auditService.logAction(userId, 'AUTOMATION_SUPPRESSION_DELETED', 'UserAutomationSuppression', suppressionId, {
      suppressionType: existing.suppressionType,
      value: existing.value,
    });

    return true;
  }
}

export default new AutomationPreferencesService();

