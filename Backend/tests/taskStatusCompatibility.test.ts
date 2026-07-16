import { TaskStatus } from '@prisma/client';

import {
  CLOSED_TASK_STATUSES,
  OPEN_TASK_STATUSES,
  REVIEW_TASK_STATUSES,
  isClosedTaskStatus,
  isOpenTaskStatus,
} from '../src/modules/tasks/taskStatus';

describe('TaskStatus production compatibility helpers', () => {
  const validStatuses = Object.values(TaskStatus);

  it('documents the reconstructed deployed TaskStatus enum values', () => {
    expect(validStatuses).toEqual([
      'PENDING',
      'IN_PROGRESS',
      'SUBMITTED',
      'UNDER_REVIEW',
      'COMPLETED',
      'CANCELLED',
      'BLOCKED',
      'TODO',
      'IN_REVIEW',
      'DONE',
    ]);
  });

  it('uses only generated Prisma TaskStatus values in runtime filters', () => {
    for (const status of [...CLOSED_TASK_STATUSES, ...REVIEW_TASK_STATUSES, ...OPEN_TASK_STATUSES]) {
      expect(validStatuses).toContain(status);
    }
    expect(CLOSED_TASK_STATUSES).toEqual([TaskStatus.COMPLETED, TaskStatus.CANCELLED, TaskStatus.DONE]);
    expect(REVIEW_TASK_STATUSES).toEqual([TaskStatus.SUBMITTED, TaskStatus.UNDER_REVIEW, TaskStatus.IN_REVIEW]);
    expect(CLOSED_TASK_STATUSES).not.toEqual(expect.arrayContaining(['APPROVED', 'REJECTED', 'DECLINED', 'ARCHIVED']));
  });

  it('preserves open task semantics without inventing statuses', () => {
    expect(isClosedTaskStatus(TaskStatus.COMPLETED)).toBe(true);
    expect(isClosedTaskStatus(TaskStatus.CANCELLED)).toBe(true);
    expect(isClosedTaskStatus(TaskStatus.DONE)).toBe(true);
    expect(isOpenTaskStatus(TaskStatus.PENDING)).toBe(true);
    expect(isOpenTaskStatus(TaskStatus.IN_PROGRESS)).toBe(true);
    expect(isOpenTaskStatus(TaskStatus.BLOCKED)).toBe(true);
    expect(isOpenTaskStatus('ARCHIVED')).toBe(false);
  });
});
