// Integration test for agenda deadline semantics
// This test suite validates the agenda endpoint semantics for case deadlines,
// intake deadlines, task due dates, scope based access control, and admin/partner global read.

import { PrismaClient } from '@prisma/client';
import type { Express } from 'express';

function createApp(): Express {
  const express = require('express');
  const app = express();
  app.use(express.json());
  // Import the real routes
  const casesRoutes = require('../src/modules/cases/routes').default;
  app.use('/cases', casesRoutes);
  return app;
}

interface TestResponse {
  status: number;
  body: any;
}

function requestJson(app: Express, method: string, path: string): Promise<TestResponse> {
  const http = require('http');
  return new Promise((resolve, reject) => {
    const server = app.listen(0, '127.0.0.1', () => {
      const address = server.address();
      if (!address || typeof address === 'string') { server.close(); reject(new Error('no addr')); return; }
      const req = http.request({ host: '127.0.0.1', port: address.port, path, method }, (res) => {
        let data = '';
        res.on('data', (c) => (data += c));
        res.on('end', () => {
          server.close();
          resolve({ status: res.statusCode || 0, body: data ? JSON.parse(data) : null });
        });
      });
      req.on('error', (e) => { server.close(); reject(e); });
      req.end();
    });
  });
}

import { v4 as uuidv4 } from 'uuid';

const databaseUrl = process.env.AGENDA_DEADLINE_TEST_DATABASE_URL;
const describeWithDatabase = databaseUrl ? describe : describe.skip;

// Helper to extract deadline items from agenda response
function extractDeadlines(body: any) {
  return body.days.flatMap((d: any) => d.items).filter((it: any) => it.id?.startsWith('CASE_DEADLINE') || it.id?.startsWith('CASE_INTAKE_DEADLINE'));
}

// Helper to extract task items
function extractTasks(body: any) {
  return body.days.flatMap((d: any) => d.items).filter((it: any) => it.id?.startsWith('TASK'));
}

describeWithDatabase('Agenda deadline recovery PostgreSQL integration test', () => {
  let db: PrismaClient;
  const ids = {
    admin: uuidv4(),
    partner: uuidv4(),
    lawyerA: uuidv4(),
    lawyerB: uuidv4(),
    client: uuidv4(),
    caseA: uuidv4(),
    caseB: uuidv4(),
    intake1: uuidv4(),
    intake2: uuidv4(),
    task1: uuidv4(),
    task2: uuidv4(),
  };

  beforeAll(async () => {
    db = new PrismaClient({ datasources: { db: { url: databaseUrl } } });
    await db.$connect();

    // Users
    await db.user.createMany({
      data: [
        { id: ids.admin, email: 'admin@example.com', name: 'Admin', role: 'ADMIN', status: 'ACTIVE', isActive: true, skills: [] },
        { id: ids.partner, email: 'partner@example.com', name: 'Partner', role: 'PARTNER', status: 'ACTIVE', isActive: true, skills: [] },
        { id: ids.lawyerA, email: 'a@example.com', name: 'Lawyer A', role: 'LAWYER', status: 'ACTIVE', isActive: true, skills: [] },
        { id: ids.lawyerB, email: 'b@example.com', name: 'Lawyer B', role: 'LAWYER', status: 'ACTIVE', isActive: true, skills: [] },
      ],
    });

    // Client
    await db.client.create({ data: { id: ids.client, name: 'Test Client' } });

    const deadlineDate = new Date('2026-07-15T10:00:00.000Z');
    const laterDate = new Date('2026-07-20T12:00:00.000Z');

    // Case A owned by lawyerA, with deadline
    await db.case.create({
      data: {
        id: ids.caseA,
        caseNumber: 'CASE-A',
        title: 'Case A',
        caseType: 'CONTRACT_REVIEW',
        clientId: ids.client,
        createdById: ids.lawyerA,
        assignedLawyerId: ids.lawyerA,
        deadline: deadlineDate,
        status: 'DRAFT',
        priority: 'MEDIUM',
        updatedAt: new Date(),
      },
    });

    // Case B owned by lawyerB, no deadline
    await db.case.create({
      data: {
        id: ids.caseB,
        caseNumber: 'CASE-B',
        title: 'Case B',
        caseType: 'CONTRACT_REVIEW',
        clientId: ids.client,
        createdById: ids.lawyerB,
        assignedLawyerId: ids.lawyerB,
        deadline: null,
        status: 'DRAFT',
        priority: 'MEDIUM',
        updatedAt: new Date(),
      },
    });

    // Intake deadlines for case A (two, share timestamp with case deadline)
    await db.caseIntakeDeadline.createMany({
      data: [
        {
          id: ids.intake1,
          caseId: ids.caseA,
          title: 'Intake 1',
          deadlineType: 'STATUTORY',
          dueAt: deadlineDate,
          responsibleId: ids.lawyerA,
          createdById: ids.lawyerA,
          updatedAt: new Date(),
        },
        {
          id: ids.intake2,
          caseId: ids.caseA,
          title: 'Intake 2',
          deadlineType: 'STATUTORY',
          dueAt: deadlineDate,
          responsibleId: ids.lawyerA,
          createdById: ids.lawyerA,
          updatedAt: new Date(),
        },
      ],
    });

    // Tasks for case A and B
    await db.task.createMany({
      data: [
        {
          id: ids.task1,
          caseId: ids.caseA,
          title: 'Task A1',
          dueDate: laterDate,
          assignedToId: ids.lawyerA,
          status: 'PENDING',
          taskType: 'DEADLINE',
           priority: 'MEDIUM',
          createdAt: new Date(),
          updatedAt: new Date(),
        },
        {
          id: ids.task2,
          caseId: ids.caseB,
          title: 'Task B1',
          dueDate: laterDate,
          assignedToId: ids.lawyerB,
          status: 'PENDING',
          taskType: 'DEADLINE',
           priority: 'MEDIUM',
          createdAt: new Date(),
          updatedAt: new Date(),
        },
      ],
    });
  });

  afterAll(async () => {
    await db?.$disconnect();
  });

  test('CASE scope returns case deadline + intake deadlines (including identical timestamps)', async () => {
    const app = createApp();
    const response = await requestJson(app, 'GET', `/agenda?scope=CASE&caseId=${ids.caseA}&status=OPEN`);
    expect(response.status).toBe(200);
    const deadlineItems = extractDeadlines(response.body);
    expect(deadlineItems).toHaveLength(3);
    const idsSet = new Set(deadlineItems.map((it: any) => it.id));
    expect(idsSet.has(`CASE_DEADLINE:${ids.caseA}`)).toBe(true);
    expect(idsSet.has(`CASE_INTAKE_DEADLINE:${ids.intake1}`)).toBe(true);
    expect(idsSet.has(`CASE_INTAKE_DEADLINE:${ids.intake2}`)).toBe(true);
  });

  test('MY_WORK scope returns only items for which the user is responsible or case manager', async () => {
    const app = createApp();
    const response = await requestJson(app, 'GET', `/agenda?scope=MY_WORK&status=OPEN`);
    expect(response.status).toBe(200);
    const deadlines = extractDeadlines(response.body);
    const deadlineIds = deadlines.map((it: any) => it.id);
    expect(deadlineIds).toContain(`CASE_DEADLINE:${ids.caseA}`);
    expect(deadlineIds).toContain(`CASE_INTAKE_DEADLINE:${ids.intake1}`);
    expect(deadlineIds).toContain(`CASE_INTAKE_DEADLINE:${ids.intake2}`);
    expect(deadlineIds).not.toContain(`CASE_DEADLINE:${ids.caseB}`);
    const tasks = extractTasks(response.body);
    const taskIds = tasks.map((it: any) => it.id);
    expect(taskIds).toContain(`TASK:${ids.task1}`);
    expect(taskIds).not.toContain(`TASK:${ids.task2}`);
  });

  test('ADMIN and PARTNER have global read access', async () => {
    const app = createApp();
    const adminResp = await requestJson(app, 'GET', `/agenda?scope=MY_WORK&status=OPEN&userId=${ids.admin}`);
    expect(adminResp.status).toBe(200);
    const adminDeadlines = extractDeadlines(adminResp.body);
    expect(adminDeadlines.length).toBeGreaterThanOrEqual(3);
    const partnerResp = await requestJson(app, 'GET', `/agenda?scope=MY_WORK&status=OPEN&userId=${ids.partner}`);
    expect(partnerResp.status).toBe(200);
    const partnerDeadlines = extractDeadlines(partnerResp.body);
    expect(partnerDeadlines.length).toBeGreaterThanOrEqual(3);
  });

  test('Agenda request does not mutate any DB fields (updatedAt unchanged)', async () => {
    const before = await db.case.findUnique({ where: { id: ids.caseA } });
    const beforeIntake = await db.caseIntakeDeadline.findUnique({ where: { id: ids.intake1 } });
    const app = createApp();
    await requestJson(app, 'GET', `/agenda?scope=CASE&caseId=${ids.caseA}&status=OPEN`);
    const after = await db.case.findUnique({ where: { id: ids.caseA } });
    const afterIntake = await db.caseIntakeDeadline.findUnique({ where: { id: ids.intake1 } });
    expect(after?.updatedAt?.getTime()).toBe(before?.updatedAt?.getTime());
    expect(afterIntake?.updatedAt?.getTime()).toBe(beforeIntake?.updatedAt?.getTime());
  });
});
