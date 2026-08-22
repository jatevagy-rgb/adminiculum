import express, { Express, NextFunction, Request, Response } from 'express';
import http from 'http';

const prismaMock = {
  communication: { findMany: jest.fn(), findUnique: jest.fn(), update: jest.fn(), count: jest.fn() },
  communicationAttachment: { findMany: jest.fn() },
  task: { findMany: jest.fn() },
  client: { findMany: jest.fn(), findUnique: jest.fn() },
  case: { findUnique: jest.fn(), findMany: jest.fn() },
  caseCollaborator: { findFirst: jest.fn() },
  timelineEvent: { create: jest.fn() },
  notification: { findMany: jest.fn(), count: jest.fn(), findFirst: jest.fn(), findUnique: jest.fn(), update: jest.fn(), updateMany: jest.fn() },
};

jest.mock('../src/middleware/auth', () => ({
  authenticate: (req: Request, _res: Response, next: NextFunction) => {
    (req as any).user = { userId: 'user-1', role: 'LAWYER' };
    next();
  },
}));

jest.mock('../src/prisma/prisma.service', () => ({ prisma: prismaMock }));

jest.mock('../src/modules/tasks/services', () => ({
  canUserActOnTask: jest.fn(),
  createTaskFromCommunicationSource: jest.fn(),
  SourceLinkedTaskError: class SourceLinkedTaskError extends Error {},
}));

import communicationsRoutes from '../src/modules/communications/routes';
import notificationsService from '../src/modules/notifications/services';

function requestJson(app: Express, path: string, options?: { method?: string; body?: unknown }): Promise<{ status: number; body: any }> {
  return new Promise((resolve, reject) => {
    const server = app.listen(0, '127.0.0.1', () => {
      const address = server.address();
      if (!address || typeof address === 'string') return reject(new Error('Test server unavailable'));
      const request = http.request({
        hostname: '127.0.0.1',
        port: address.port,
        path,
        method: options?.method || 'GET',
        headers: {
          authorization: 'Bearer test-token',
          ...(options?.body ? { 'content-type': 'application/json' } : {}),
        },
      }, (response) => {
        const chunks: Buffer[] = [];
        response.on('data', (chunk) => chunks.push(Buffer.from(chunk)));
        response.on('end', () => {
          server.close();
          const text = Buffer.concat(chunks).toString('utf8');
          resolve({ status: response.statusCode || 0, body: text ? JSON.parse(text) : null });
        });
      });
      request.on('error', reject);
      if (options?.body) request.write(JSON.stringify(options.body));
      request.end();
    });
  });
}

function communicationRow(id: string, clientId: string | null) {
  return {
    id,
    type: 'EMAIL',
    subject: 'Synthetic subject',
    senderName: 'Synthetic sender',
    senderEmail: 'sender@example.invalid',
    recipientName: null,
    recipientEmail: null,
    content: 'Synthetic content',
    summary: null,
    caseId: clientId ? 'case-1' : null,
    clientId,
    documentId: null,
    createdById: 'user-1',
    createdAt: new Date('2026-07-20T10:00:00.000Z'),
    updatedAt: new Date('2026-07-20T10:00:00.000Z'),
  };
}

describe('operational client color projections', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    prismaMock.communicationAttachment.findMany.mockResolvedValue([]);
    prismaMock.task.findMany.mockResolvedValue([]);
    prismaMock.communication.count.mockResolvedValue(2);
    prismaMock.case.findMany.mockResolvedValue([]);
    prismaMock.case.findUnique.mockResolvedValue({ id: 'case-1', assignedLawyerId: 'user-1', createdById: 'user-1' });
    prismaMock.caseCollaborator.findFirst.mockResolvedValue(null);
  });

  it('projects assigned communication color in one batched client query and leaves unassigned neutral', async () => {
    prismaMock.communication.findMany.mockResolvedValue([
      communicationRow('comm-assigned', 'client-1'),
      communicationRow('comm-neutral', null),
    ]);
    prismaMock.client.findMany.mockResolvedValue([{ id: 'client-1', colorKey: 'TEAL' }]);

    const app = express();
    app.use('/communications', communicationsRoutes);
    const response = await requestJson(app, '/communications?limit=8');

    expect(response.status).toBe(200);
    expect(response.body.communications).toEqual([
      expect.objectContaining({ id: 'comm-assigned', clientColorKey: 'TEAL' }),
      expect.objectContaining({ id: 'comm-neutral', clientColorKey: null }),
    ]);
    expect(prismaMock.client.findMany).toHaveBeenCalledTimes(1);
    expect(prismaMock.client.findMany).toHaveBeenCalledWith({
      where: { id: { in: ['client-1'] } },
      select: { id: true, colorKey: true },
    });
  });

  it('projects the current client color on communication detail', async () => {
    process.env.ENABLE_COMMUNICATIONS_PERSISTENCE = 'true';
    prismaMock.communication.findUnique.mockResolvedValue({ ...communicationRow('comm-assigned', 'client-1'), attachments: [], relatedTasks: [] });
    prismaMock.client.findUnique.mockResolvedValue({ colorKey: 'ROSE' });
    prismaMock.case.findUnique.mockResolvedValue({ id: 'case-1', assignedLawyerId: 'user-1', createdById: 'user-1' });

    const app = express();
    app.use('/communications', communicationsRoutes);
    const response = await requestJson(app, '/communications/comm-assigned');

    expect(response.status).toBe(200);
    expect(response.body).toEqual(expect.objectContaining({ id: 'comm-assigned', clientColorKey: 'ROSE' }));
    expect(prismaMock.client.findUnique).toHaveBeenCalledTimes(1);
    delete process.env.ENABLE_COMMUNICATIONS_PERSISTENCE;
  });

  it('refreshes the communication color after case reassignment updates the persisted client relation', async () => {
    process.env.ENABLE_COMMUNICATIONS_PERSISTENCE = 'true';
    let row = communicationRow('comm-reassigned', 'client-beta');
    prismaMock.communication.findUnique.mockResolvedValue(row);
    prismaMock.case.findUnique
      .mockResolvedValueOnce({ id: 'case-1', assignedLawyerId: 'user-1', createdById: 'user-1' })
      .mockResolvedValueOnce({ id: 'case-beta', caseNumber: 'CASE-BETA', clientId: 'client-beta' });
    prismaMock.communication.update.mockImplementation(async ({ data }: { data: { caseId: string; clientId: string } }) => {
      row = { ...row, caseId: data.caseId, clientId: data.clientId };
      return row;
    });
    prismaMock.timelineEvent.create.mockResolvedValue({ id: 'event-1' });
    prismaMock.communication.findMany.mockImplementation(async () => [row]);
    prismaMock.communication.count.mockResolvedValue(1);
    prismaMock.client.findMany.mockImplementation(async ({ where }: { where: { id: { in: string[] } } }) =>
      where.id.in.map((id) => ({ id, colorKey: id === 'client-beta' ? 'BLUE' : 'RED' })),
    );

    const app = express();
    app.use(express.json());
    app.use('/communications', communicationsRoutes);

    try {
      const linkResponse = await requestJson(app, '/communications/comm-reassigned/link-case', {
        method: 'POST',
        body: { caseId: 'case-beta' },
      });
      const refreshedResponse = await requestJson(app, '/communications?limit=8');

      expect(linkResponse.status).toBe(200);
      expect(prismaMock.communication.update).toHaveBeenCalledWith({
        where: { id: 'comm-reassigned' },
        data: { caseId: 'case-beta', clientId: 'client-beta' },
      });
      expect(refreshedResponse.body.communications[0]).toEqual(expect.objectContaining({
        id: 'comm-reassigned',
        caseId: 'case-beta',
        clientId: 'client-beta',
        clientColorKey: 'BLUE',
      }));
      expect(prismaMock.client.findMany).toHaveBeenCalledTimes(1);
    } finally {
      delete process.env.ENABLE_COMMUNICATIONS_PERSISTENCE;
    }
  });

  it('keeps notifications neutral because the persisted model has no domain relation', async () => {
    prismaMock.notification.findMany.mockResolvedValue([{
      id: 'notification-1',
      type: 'TASK_ASSIGNED',
      title: 'Synthetic notification',
      message: 'Synthetic message',
      link: '/tasks?taskId=synthetic',
      isRead: false,
      createdAt: new Date('2026-07-20T10:00:00.000Z'),
    }]);
    prismaMock.notification.count.mockResolvedValue(1);

    const result = await notificationsService.listNotifications({ userId: 'user-1' });

    expect(result.items[0]).toEqual(expect.objectContaining({ clientColorKey: null }));
    expect(prismaMock.client.findMany).not.toHaveBeenCalled();
    expect(prismaMock.client.findUnique).not.toHaveBeenCalled();
  });
});
