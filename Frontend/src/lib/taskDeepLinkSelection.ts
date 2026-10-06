import type { TaskLifecycleListItem, TaskSubmissionWorkflow } from "./taskLifecycleApi";

export function resolveTaskSelection<T extends { id: string }>(
  taskId: string | null,
  tasks: readonly T[],
  manualTaskId: string | null,
  dismissedTaskId: string | null = null,
): string | null {
  if (taskId) {
    if (dismissedTaskId === taskId) return null;
    return tasks.some((task) => task.id === taskId) ? taskId : null;
  }

  return manualTaskId;
}

/**
 * Maps the guarded workflow read (GET /tasks/:taskId/workflow) onto the
 * lifecycle-list item shape consumed by TaskSubmissionWorkspace, so an
 * actor-authorized non-list task can be opened through the exact canonical
 * workflow presentation without ever being added to the personal list.
 *
 * The personal list is never broadened: this mapping only feeds the workspace
 * for a deep-link target that is absent from GET /tasks.
 */
export function taskLifecycleItemFromWorkflow(workflow: TaskSubmissionWorkflow): TaskLifecycleListItem {
  const task = workflow.task;
  return {
    id: task.id,
    title: task.title,
    description: task.description,
    status: task.status,
    priority: task.priority,
    dueDate: task.dueDate,
    matterId: task.matterId,
    assignedToId: task.assignee?.id ?? null,
    sourceCommunicationId: null,
    case: {
      id: task.case.id,
      caseNumber: task.case.caseNumber,
      clientName: task.case.client.name,
      matterType: "",
      title: task.case.title,
      clientId: task.case.client.id,
      clientColorKey: null,
    },
    attentionCategory: null,
    estimatedMinutes: null,
    activeSubmissionId: workflow.activeDraft?.id ?? null,
    currentSubmittedRevisionId: workflow.latestSubmittedRevision?.id ?? null,
    approvedRevisionId: null,
    submissionStatus: workflow.latestSubmittedRevision?.status ?? null,
    submissionRevision: workflow.latestSubmittedRevision?.revisionNumber ?? null,
    submittedAt: workflow.latestSubmittedRevision?.submittedAt ?? null,
    assignedReviewer: workflow.currentReviewer ?? null,
    plannedReviewerId: null,
    plannedReviewer: null,
    requestedAttention: null,
    latestDecisionType: null,
    latestDecisionAt: null,
    returnedCorrectionDeadline: null,
    externalActionRequired: false,
    externalActionType: null,
    externalCompletedAt: null,
    nextActionCode: workflow.nextActionCode,
  };
}
