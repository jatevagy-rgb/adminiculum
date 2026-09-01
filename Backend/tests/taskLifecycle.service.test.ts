import { TaskStatus } from '@prisma/client';
import {
  isCanonicalReviewStatus,
  planCanonicalTaskTransition,
} from '../src/modules/tasks/taskLifecycle.service';

const worker = { assignedToId: 'worker-1', assignedById: 'supervisor-1' };

describe('canonical task lifecycle transition contract', () => {
  it('maps the executable lifecycle to existing Task.status values', () => {
    expect(planCanonicalTaskTransition({ ...worker, status: TaskStatus.TODO }, 'START', 'worker-1').status).toBe('IN_PROGRESS');
    expect(planCanonicalTaskTransition({ ...worker, status: TaskStatus.IN_PROGRESS }, 'SUBMIT_FOR_REVIEW', 'worker-1').status).toBe('IN_REVIEW');
    expect(planCanonicalTaskTransition({ ...worker, status: TaskStatus.IN_REVIEW }, 'RETURN_FOR_CORRECTION', 'supervisor-1', 'LAWYER').status).toBe('IN_PROGRESS');
    expect(planCanonicalTaskTransition({ ...worker, status: TaskStatus.IN_REVIEW }, 'APPROVE', 'supervisor-1', 'LAWYER').status).toBe('DONE');
  });

  it('rejects invalid predecessors and preserves legacy review aliases', () => {
    expect(() => planCanonicalTaskTransition({ ...worker, status: TaskStatus.DONE }, 'START', 'worker-1')).toThrow('state');
    expect(isCanonicalReviewStatus(TaskStatus.SUBMITTED)).toBe(true);
    expect(isCanonicalReviewStatus(TaskStatus.UNDER_REVIEW)).toBe(true);
    expect(isCanonicalReviewStatus(TaskStatus.IN_REVIEW)).toBe(true);
    expect(isCanonicalReviewStatus(TaskStatus.DONE)).toBe(false);
  });
});
