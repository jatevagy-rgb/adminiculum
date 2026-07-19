jest.mock('../src/prisma/prisma.service', () => ({
  prisma: {
    case: {
      findMany: jest.fn(),
      count: jest.fn(),
    },
  },
}));

jest.mock('../src/config/database', () => ({
  __esModule: true,
  default: {
    task: { findMany: jest.fn() },
  },
}));

jest.mock('../src/modules/sharepoint', () => ({ driveService: {} }));
jest.mock('../src/modules/workflow', () => ({ workflowService: { isValidStatus: jest.fn(() => false) } }));
jest.mock('../src/modules/tasks/taskSubmission.service', () => ({ __esModule: true, default: {} }));

import database from '../src/config/database';
import { prisma } from '../src/prisma/prisma.service';
import casesService from '../src/modules/cases/services';
import taskService from '../src/modules/tasks/services';

describe('client color read projections', () => {
  beforeEach(() => jest.clearAllMocks());

  it('projects the related client color on case list items without extra queries', async () => {
    (prisma.case.findMany as jest.Mock).mockResolvedValue([{
      id: 'case-1',
      caseNumber: 'CASE-SYNTHETIC-1',
      title: 'Szintetikus ügy',
      clientName: 'Régi név',
      clientId: 'client-1',
      matterType: 'OTHER',
      status: 'CLIENT_INPUT',
      priority: 'MEDIUM',
      deadline: null,
      clientRole: null,
      createdAt: new Date('2026-07-19T00:00:00Z'),
      updatedAt: new Date('2026-07-19T00:00:00Z'),
      assignedLawyer: null,
      client: { id: 'client-1', name: 'Szintetikus ügyfél', colorKey: 'GREEN' },
    }]);
    (prisma.case.count as jest.Mock).mockResolvedValue(1);

    const result = await casesService.getCases({ page: 1, limit: 20 });
    expect(result.data[0]).toMatchObject({ clientName: 'Szintetikus ügyfél', clientColorKey: 'GREEN' });
    expect((prisma.case.findMany as jest.Mock).mock.calls[0][0].include.client.select.colorKey).toBe(true);
    expect(prisma.case.findMany).toHaveBeenCalledTimes(1);
  });

  it('projects the related client color on task list items and removes the raw relation', async () => {
    (database.task.findMany as jest.Mock).mockResolvedValue([{
      id: 'task-1',
      title: 'Szintetikus feladat',
      status: 'TODO',
      priority: 'MEDIUM',
      case: {
        id: 'case-1',
        caseNumber: 'CASE-SYNTHETIC-1',
        clientName: 'Szintetikus ügyfél',
        matterType: 'OTHER',
        client: { colorKey: 'BLUE' },
      },
      submissions: [],
    }]);

    const result = await taskService.getUserTasks('user-1');
    expect(result[0].case).toMatchObject({ clientColorKey: 'BLUE', clientName: 'Szintetikus ügyfél' });
    expect(result[0].case.client).toBeUndefined();
    expect((database.task.findMany as jest.Mock).mock.calls[0][0].select.case.select.client.select.colorKey).toBe(true);
    expect(database.task.findMany).toHaveBeenCalledTimes(1);
  });
});
