import { TaskStatus } from '@prisma/client';

export const CLOSED_TASK_STATUSES: TaskStatus[] = [
  TaskStatus.COMPLETED,
  TaskStatus.CANCELLED,
  TaskStatus.DONE,
];

export const REVIEW_TASK_STATUSES: TaskStatus[] = [
  TaskStatus.SUBMITTED,
  TaskStatus.UNDER_REVIEW,
  TaskStatus.IN_REVIEW,
];

export const OPEN_TASK_STATUSES: TaskStatus[] = Object.values(TaskStatus).filter(
  (status) => !CLOSED_TASK_STATUSES.includes(status)
);

export function isClosedTaskStatus(status?: string | null): boolean {
  return CLOSED_TASK_STATUSES.includes(status as TaskStatus);
}

export function isOpenTaskStatus(status?: string | null): boolean {
  return Object.values(TaskStatus).includes(status as TaskStatus) && !isClosedTaskStatus(status);
}
