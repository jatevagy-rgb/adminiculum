import express, { Express, NextFunction, Request, Response } from 'express';
import http from 'http';

const prismaMock = {
  communication: { findMany: jest.fn(), findUnique: jest.fn(), count: jest.fn() },
  communicationAttachment: { findMany: jest.fn() },
  task: { findMany: jest.fn() },
  client: { findMany: jest.fn(), findUnique: jest.fn() },
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

function requestJson(app: Express, path: string): Promise<{ status: number; body: any }> {
  return new Promise((resolve, reject) => {
    const server = app.listen(0, '127.0.0.1', () => {
      const address = server.address();
      if (!address || typeof address === 'string') return reject(new Error('Test server unavailable'));
      http.get({ hostname: '127.0.0.1', port: address.port, path, headers: { authorization: 'Bearer test-token' } }, (response) => {
        const chunks: Buffer[] = [];
        response.on('data', (chunk) => chunks.push(Buffer.from(chunk)));
        response.on('end', () => {
          server.close();
          const text = Buffer.concat(chunks).toString('utf8');
          resolve({ status: response.statusCode || 0, body: text ? JSON.parse(text) : null });
        });
      }).on('error', reject);
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

    const app = express();
    app.use('/communications', communicationsRoutes);
    const response = await requestJson(app, '/communications/comm-assigned');

    expect(response.status).toBe(200);
    expect(response.body).toEqual(expect.objectContaining({ id: 'comm-assigned', clientColorKey: 'ROSE' }));
    expect(prismaMock.client.findUnique).toHaveBeenCalledTimes(1);
    delete process.env.ENABLE_COMMUNICATIONS_PERSISTENCE;
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
