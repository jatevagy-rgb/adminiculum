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
