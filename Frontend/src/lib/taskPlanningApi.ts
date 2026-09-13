import { fetchApi } from "./api";
import type { AttentionCategory } from "./attentionCategory";

/**
 * Task type catalogue + planned work roles (additive).
 * Legacy TaskType stays; catalogue entries supply a label snapshot + defaults.
 */

export interface TaskDefinitionDTO {
  id: string;
  clientId: string | null;
  label: string;
  description: string | null;
  status: "ACTIVE" | "ARCHIVED";
  defaultEstimatedMinutes: number | null;
  defaultAttentionCategory: AttentionCategory | null;
  createdAt: string;
  updatedAt: string;
}

export interface TaskCollaboratorDTO {
  taskId: string;
  userId: string;
  addedById: string | null;
  createdAt: string;
  user?: { id: string; name?: string | null; email?: string | null } | null;
}

export const taskPlanningApi = {
  listDefinitions(clientId?: string | null) {
    const query = clientId ? `?clientId=${encodeURIComponent(clientId)}` : "";
    return fetchApi<{ items: TaskDefinitionDTO[] }>(`/tasks/task-definitions${query}`);
  },
  createDefinition(payload: {
    label: string;
    description?: string;
    clientId?: string | null;
    defaultEstimatedMinutes?: number | null;
    defaultAttentionCategory?: AttentionCategory | null;
  }) {
    return fetchApi<TaskDefinitionDTO>("/tasks/task-definitions", { method: "POST", body: JSON.stringify(payload) });
  },
  updateDefinition(id: string, payload: {
    label?: string;
    description?: string | null;
    defaultEstimatedMinutes?: number | null;
    defaultAttentionCategory?: AttentionCategory | null;
  }) {
    return fetchApi<TaskDefinitionDTO>(`/tasks/task-definitions/${encodeURIComponent(id)}`, { method: "PATCH", body: JSON.stringify(payload) });
  },
  archiveDefinition(id: string) {
    return fetchApi<TaskDefinitionDTO>(`/tasks/task-definitions/${encodeURIComponent(id)}/archive`, { method: "POST" });
  },
  listCollaborators(taskId: string) {
    return fetchApi<{ items: TaskCollaboratorDTO[] }>(`/tasks/${encodeURIComponent(taskId)}/collaborators`);
  },
  addCollaborator(taskId: string, userId: string) {
    return fetchApi<TaskCollaboratorDTO>(`/tasks/${encodeURIComponent(taskId)}/collaborators/${encodeURIComponent(userId)}`, { method: "PUT" });
  },
  removeCollaborator(taskId: string, userId: string) {
    return fetchApi<void>(`/tasks/${encodeURIComponent(taskId)}/collaborators/${encodeURIComponent(userId)}`, { method: "DELETE" });
  },
  setPlannedReviewer(taskId: string, userId: string | null) {
    return fetchApi<unknown>(`/tasks/${encodeURIComponent(taskId)}/planned-reviewer`, {
      method: "PUT",
      body: JSON.stringify({ userId }),
    });
  },
};
