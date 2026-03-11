import taskService from '../tasks/services';
import { AutomationEntityType } from '../automationEvents/types';
import {
  ALLOWED_LEVEL1_ACTION_KEYS,
  AllowedLevel1ActionKey,
  AutomationActionPolicy,
  AutomationCompensationReadiness,
  AutomationStepRetryability,
  SuggestionAcceptRequest,
} from './types';

export interface ActionExecutionInput {
  userId: string;
  entityType: AutomationEntityType;
  entityId: string;
  actionKey: string;
  suggestedPayloadClass?: string | null;
  acceptPayload?: SuggestionAcceptRequest;
}

export interface ActionExecutionResult {
  actionKey: AllowedLevel1ActionKey;
  entityType: AutomationEntityType;
  entityId: string;
  resultSummary: string;
}

function normalizeString(value: unknown): string {
  return typeof value === 'string' ? value.trim() : '';
}

class ActionExecutionService {
  isAllowedAction(actionKey: string): actionKey is AllowedLevel1ActionKey {
    return ALLOWED_LEVEL1_ACTION_KEYS.includes(actionKey as AllowedLevel1ActionKey);
  }

  getActionPolicy(actionKey: string): AutomationActionPolicy {
    if (actionKey === 'task.addChecklist') return 'SAFE_AUTOPILOT_ALLOWED';
    if (actionKey === 'task.setAssignee') return 'NEVER_AUTOPILOT';
    return 'USER_APPROVAL_REQUIRED';
  }

  getDefaultRetryability(actionKey: string): AutomationStepRetryability {
    if (actionKey === 'task.setAssignee') return 'MANUAL_RETRY_ONLY';
    if (actionKey === 'task.addChecklist') return 'MANUAL_RETRY_ONLY';
    return 'RETRYABLE';
  }

  getCompensationReadiness(actionKey: string): AutomationCompensationReadiness {
    if (actionKey === 'task.setAssignee') return 'MANUAL_COMPENSATION_REQUIRED';
    if (actionKey === 'task.setStatus' || actionKey === 'task.setDeadline' || actionKey === 'task.addChecklist') {
      return 'COMPENSATION_READY';
    }
    return 'NONE';
  }

  getCompensationHint(actionKey: string): string | undefined {
    if (actionKey === 'task.setStatus') {
      return 'Store previous status to enable deterministic rollback in Level 3.';
    }
    if (actionKey === 'task.setDeadline') {
      return 'Store previous dueDate for compensation path.';
    }
    if (actionKey === 'task.addChecklist') {
      return 'Persist created checklistEntryId to allow delete-on-compensate.';
    }
    if (actionKey === 'task.setAssignee') {
      return 'Reassignment rollback may require manual validation for workload/policy rules.';
    }
    return undefined;
  }

  async execute(input: ActionExecutionInput): Promise<ActionExecutionResult> {
    const actionKey = normalizeString(input.actionKey);
    if (!this.isAllowedAction(actionKey)) {
      throw new Error('UNSUPPORTED_ACTION_KEY');
    }

    if (input.entityType !== 'TASK') {
      throw new Error('ACTION_ENTITY_TYPE_MISMATCH');
    }

    if (actionKey === 'task.setStatus') {
      const candidateStatus = normalizeString(input.acceptPayload?.status) || normalizeString(input.suggestedPayloadClass);
      if (!candidateStatus) {
        throw new Error('status is required for task.setStatus');
      }

      await taskService.setTaskStatus(
        input.entityId,
        candidateStatus,
        input.userId,
        normalizeString(input.acceptPayload?.note) || undefined,
      );

      return {
        actionKey,
        entityType: input.entityType,
        entityId: input.entityId,
        resultSummary: `Task status updated to ${candidateStatus}`,
      };
    }

    if (actionKey === 'task.setDeadline') {
      const dueDateRaw = normalizeString(input.acceptPayload?.dueDate);
      if (!dueDateRaw) {
        throw new Error('dueDate is required for task.setDeadline');
      }

      const parsedDueDate = new Date(dueDateRaw);
      if (Number.isNaN(parsedDueDate.getTime())) {
        throw new Error('dueDate must be a valid ISO datetime');
      }

      await taskService.setTaskDeadline(
        input.entityId,
        parsedDueDate,
        input.userId,
        normalizeString(input.acceptPayload?.note) || undefined,
      );

      return {
        actionKey,
        entityType: input.entityType,
        entityId: input.entityId,
        resultSummary: `Task deadline updated to ${parsedDueDate.toISOString()}`,
      };
    }

    if (actionKey === 'task.setAssignee') {
      const assigneeId = normalizeString(input.acceptPayload?.assigneeId);
      if (!assigneeId) {
        throw new Error('assigneeId is required for task.setAssignee');
      }

      const canAssign = await taskService.canAssign(input.userId, assigneeId);
      if (!canAssign) {
        throw new Error('FORBIDDEN_ASSIGNMENT');
      }

      await taskService.reassignTask(input.entityId, assigneeId, input.userId);

      return {
        actionKey,
        entityType: input.entityType,
        entityId: input.entityId,
        resultSummary: `Task assignee updated to ${assigneeId}`,
      };
    }

    const checklistItem = normalizeString(input.acceptPayload?.checklistItem) || normalizeString(input.suggestedPayloadClass);
    if (!checklistItem) {
      throw new Error('checklistItem is required for task.addChecklist');
    }

    const checklist = await taskService.addTaskChecklistItem(input.entityId, checklistItem, input.userId);

    return {
      actionKey,
      entityType: input.entityType,
      entityId: input.entityId,
      resultSummary: `Checklist item added (${checklist.checklistEntryId})`,
    };
  }
}

export default new ActionExecutionService();
