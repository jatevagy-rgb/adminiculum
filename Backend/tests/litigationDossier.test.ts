import express, { Express, NextFunction, Request, Response } from 'express';
import http from 'http';

jest.mock('../src/middleware/auth', () => ({
  authenticate: (req: Request, res: Response, next: NextFunction) => {
    if (req.headers.authorization !== 'Bearer test-token') {
      res.status(401).json({ status: 401, code: 'NOT_AUTHENTICATED', message: 'No token provided' });
      return;
    }
    req.user = { userId: 'user-1', email: 'test@example.com', role: 'LAWYER', authProvider: 'local-jwt' };
    next();
  },
}));

jest.mock('../src/modules/workflow', () => ({
  workflowService: { isValidStatus: jest.fn(() => true), getWorkflowGraph: jest.fn(), getWorkflowHistory: jest.fn() },
}));

class AgendaRequestError extends Error {
  constructor(public statusCode: number, public code: string, message: string) {
    super(message);
  }
}
const getCaseDeadlines = jest.fn();
jest.mock('../src/modules/agenda/service', () => ({
  AgendaRequestError,
  getCaseDeadlines: (...args: unknown[]) => getCaseDeadlines(...args),
  getWorkflowAgenda: jest.fn(),
  makeDefaultAgendaRange: jest.fn(),
}));

jest.mock('../src/prisma/prisma.service', () => ({
  prisma: {
    case: { findUnique: jest.fn() },
    caseCollaborator: { findFirst: jest.fn() },
    document: { findMany: jest.fn() },
    task: { findMany: jest.fn() },
  },
}));

import { prisma } from '../src/prisma/prisma.service';
import casesRoutes from '../src/modules/cases/routes';

type TestResponse = { status: number; body: any };

function createApp(): Express {
  const app = express();
  app.use(express.json());
  app.use('/cases', casesRoutes);
  return app;
}

function requestJson(app: Express, method: string, reqPath: string, authenticated = true): Promise<TestResponse> {
  return new Promise((resolve, reject) => {
    const server = app.listen(0, '127.0.0.1', () => {
      const address = server.address();
      if (!address || typeof address === 'string') {
        server.close();
        reject(new Error('Test server address unavailable'));
        return;
      }
      const request = http.request(
        {
          hostname: '127.0.0.1',
          port: address.port,
          path: reqPath,
          method,
          headers: { 'content-type': 'application/json', ...(authenticated ? { authorization: 'Bearer test-token' } : {}) },
        },
        (response) => {
          const chunks: Buffer[] = [];
          response.on('data', (chunk) => chunks.push(Buffer.from(chunk)));
          response.on('end', () => {
            server.close();
            const text = Buffer.concat(chunks).toString('utf8');
            resolve({ status: response.statusCode || 0, body: text ? JSON.parse(text) : null });
          });
        }
      );
      request.on('error', (error) => {
        server.close();
        reject(error);
      });
      request.end();
    });
  });
}

function accessRecord() {
  return { id: 'case-1', assignedLawyerId: 'user-1', createdById: 'creator-1' };
}

const evidenceDoc = {
  id: 'doc-ev',
  name: 'Bizonyíték A',
  fileName: 'bizonyitek-a.pdf',
  documentType: 'EVIDENCE_FILE',
  category: 'EVIDENCE',
  updatedAt: new Date('2026-07-10T00:00:00.000Z'),
};
const pleadingDoc = {
  id: 'doc-pl',
  name: 'Keresetlevél',
  fileName: 'kereset.pdf',
  documentType: 'PLEADING',
  category: 'COURT_FILING',
  updatedAt: new Date('2026-07-11T00:00:00.000Z'),
};

describe('GET /cases/:caseId/litigation-dossier', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    getCaseDeadlines.mockResolvedValue({
      items: [{ id: 'TASK:task-1', title: 'Beadási határidő', dueAt: '2026-07-20T09:00:00.000Z', urgency: 'THIS_WEEK', sourceType: 'TASK', href: '/tasks?taskId=task-1' }],
    });
  });

  it('requires authentication', async () => {
    const res = await requestJson(createApp(), 'GET', '/cases/case-1/litigation-dossier', false);
    expect(res.status).toBe(401);
  });

  it('returns 404 for an unknown case', async () => {
    (prisma.case.findUnique as jest.Mock).mockResolvedValue(null);
    const res = await requestJson(createApp(), 'GET', '/cases/case-x/litigation-dossier');
    expect(res.status).toBe(404);
  });

  it('assembles evidence, pleadings and procedural dates with truthful availability flags', async () => {
    (prisma.case.findUnique as jest.Mock).mockResolvedValue(accessRecord());
    (prisma.document.findMany as jest.Mock).mockResolvedValue([evidenceDoc, pleadingDoc]);
    (prisma.task.findMany as jest.Mock).mockResolvedValue([{ id: 'task-9', documentId: 'doc-pl' }]);

    const res = await requestJson(createApp(), 'GET', '/cases/case-1/litigation-dossier');
    expect(res.status).toBe(200);

    expect(res.body.availability).toEqual({
      issues: false,
      evidence: true,
      issueEvidenceRelations: false,
      pleadings: true,
      filingStatus: false,
      proceduralDates: true,
      parties: false,
      burdenOfProof: false,
    });

    expect(res.body.issues).toEqual([]);
    expect(res.body.evidence).toHaveLength(1);
    expect(res.body.evidence[0]).toMatchObject({ id: 'doc-ev', relation: 'UNCLASSIFIED', issueIds: [] });
    expect(res.body.pleadings).toHaveLength(1);
    expect(res.body.pleadings[0]).toMatchObject({ id: 'doc-pl', status: null, filedAt: null, relatedTaskIds: ['task-9'] });
    // Filing and supersede are never actionable (no persistence).
    expect(res.body.pleadings[0].capabilities.canMarkFiled).toBe(false);
    expect(res.body.pleadings[0].capabilities.canSupersede).toBe(false);
    expect(res.body.proceduralDates).toHaveLength(1);
    expect(res.body.summary.evidenceItems).toBe(1);
  });

  it('scopes the document query to EVIDENCE and COURT_FILING categories only (no broad include)', async () => {
    (prisma.case.findUnique as jest.Mock).mockResolvedValue(accessRecord());
    (prisma.document.findMany as jest.Mock).mockResolvedValue([]);
    (prisma.task.findMany as jest.Mock).mockResolvedValue([]);

    await requestJson(createApp(), 'GET', '/cases/case-1/litigation-dossier');
    const findManyArg = (prisma.document.findMany as jest.Mock).mock.calls[0][0];
    expect(findManyArg.where.category.in).toEqual(['EVIDENCE', 'COURT_FILING']);
    expect(findManyArg.select).toBeDefined();
    expect(findManyArg.include).toBeUndefined();
    // Never selects raw document text / workspace text.
    expect(Object.keys(findManyArg.select)).not.toContain('workspaceText');
    expect(findManyArg.take).toBeLessThanOrEqual(100);
  });

  it('degrades to empty procedural dates when the agenda scope guard rejects the viewer', async () => {
    (prisma.case.findUnique as jest.Mock).mockResolvedValue(accessRecord());
    (prisma.document.findMany as jest.Mock).mockResolvedValue([]);
    (prisma.task.findMany as jest.Mock).mockResolvedValue([]);
    getCaseDeadlines.mockRejectedValue(new AgendaRequestError(404, 'CASE_NOT_FOUND', 'nope'));

    const res = await requestJson(createApp(), 'GET', '/cases/case-1/litigation-dossier');
    expect(res.status).toBe(200);
    expect(res.body.proceduralDates).toEqual([]);
  });

  it('never leaks raw document/workspace text in the response', async () => {
    (prisma.case.findUnique as jest.Mock).mockResolvedValue(accessRecord());
    (prisma.document.findMany as jest.Mock).mockResolvedValue([evidenceDoc, pleadingDoc]);
    (prisma.task.findMany as jest.Mock).mockResolvedValue([]);

    const res = await requestJson(createApp(), 'GET', '/cases/case-1/litigation-dossier');
    const serialized = JSON.stringify(res.body).toLowerCase();
    expect(serialized).not.toContain('workspacetext');
    expect(serialized).not.toContain('extractedtext');
    expect(serialized).not.toContain('sharepoint');
  });
});
