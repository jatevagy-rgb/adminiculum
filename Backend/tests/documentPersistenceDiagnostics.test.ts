import express, { Express, NextFunction, Request, Response } from 'express';
import http from 'http';

const mockUploadDocument = jest.fn();
const mockDeleteDocument = jest.fn();
const mockQueueDocumentVersionScan = jest.fn();

const mockPrisma = {
  case: { findUnique: jest.fn(), update: jest.fn() },
  caseCollaborator: { findFirst: jest.fn() },
  document: { create: jest.fn(), findUnique: jest.fn(), update: jest.fn() },
  documentVersion: { findFirst: jest.fn(), updateMany: jest.fn(), create: jest.fn() },
  timelineEvent: { create: jest.fn() },
  $queryRaw: jest.fn(),
  $transaction: jest.fn(),
};

jest.mock('../src/prisma/prisma.service', () => ({ prisma: mockPrisma }));

jest.mock('../src/modules/sharepoint', () => ({
  driveService: {
    uploadDocument: mockUploadDocument,
    deleteDocument: mockDeleteDocument,
  },
}));

jest.mock('../src/modules/documents/securityScan.service', () => ({
  queueDocumentVersionScan: mockQueueDocumentVersionScan,
  securityScanBlock: () => null,
  retryDocumentVersionScan: jest.fn(),
}));

jest.mock('../src/middleware/auth', () => ({
  authenticate: (req: Request, res: Response, next: NextFunction) => {
    if (req.headers.authorization !== 'Bearer test-token') {
      res.status(401).json({ error: 'No token provided' });
      return;
    }
    req.user = {
      userId: String(req.headers['x-user-id'] || 'user-1'),
      email: 'test@example.com',
      role: String(req.headers['x-role'] || 'LAWYER') as any,
      authProvider: 'local-jwt',
    };
    next();
  },
}));

jest.mock('../src/middleware/workforceAuthorization', () => ({
  requireWorkforceUser: (_req: Request, _res: Response, next: NextFunction) => next(),
}));

jest.mock('../src/modules/documents/authorization', () => ({
  requireDocumentReadAccess: (_req: Request, _res: Response, next: NextFunction) => next(),
  requireDocumentManageAccess: (_req: Request, _res: Response, next: NextFunction) => next(),
  requireHrConfidentialReadAccess: (_req: Request, _res: Response, next: NextFunction) => next(),
  hrConfidentialReadAllowed: jest.fn(() => true),
}));

jest.mock('../src/modules/cases/authorization', () => ({
  getCaseReadScope: jest.fn(),
  userCanManageCase: jest.fn(() => true),
  requireCaseReadAccess: (_req: Request, _res: Response, next: NextFunction) => next(),
}));

jest.mock('../src/modules/documents/documentObjectAuthorization', () => ({
  requireDocumentObjectReadAccess: (_req: Request, _res: Response, next: NextFunction) => next(),
  requireDocumentObjectManageAccess: (_req: Request, _res: Response, next: NextFunction) => next(),
}));

jest.mock('../src/modules/documents/textExtractor', () => ({ extractText: jest.fn() }));
jest.mock('../src/modules/tasks/services', () => ({
  createTaskFromDocumentSource: jest.fn(),
  SourceLinkedTaskError: class SourceLinkedTaskError extends Error {},
}));
jest.mock('../src/modules/documentEditor/service', () => ({
  getDocumentEditorMetadata: jest.fn(),
}));

import documentsService, {
  DocumentPersistenceError,
  DocumentStorageUploadError,
  safePrismaCode,
} from '../src/modules/documents/services';
import documentsRoutes from '../src/modules/documents/routes';
import { DevMockScanner, setScanner } from '../src/modules/upload-security/scannerAdapter';

function createApp(): Express {
  const app = express();
  app.use(express.json({ limit: '1mb' }));
  app.use('/documents', documentsRoutes);
  return app;
}

function requestJson(
  app: Express,
  method: string,
  path: string,
  options: { authenticated?: boolean; headers?: Record<string, string>; body?: unknown } = {}
): Promise<{ status: number; body: any; text: string }> {
  const { authenticated = true, headers = {}, body } = options;
  return new Promise((resolve, reject) => {
    const server = app.listen(0, '127.0.0.1', () => {
      const address = server.address();
      if (!address || typeof address === 'string') {
        server.close();
        reject(new Error('Test server address unavailable'));
        return;
      }
      const req = http.request(
        {
          hostname: '127.0.0.1',
          port: address.port,
          path,
          method,
          headers: {
            ...(authenticated ? { authorization: 'Bearer test-token' } : {}),
            'content-type': 'application/json',
            ...headers,
          },
        },
        (response) => {
          const chunks: Buffer[] = [];
          response.on('data', (chunk) => chunks.push(Buffer.from(chunk)));
          response.on('end', () => {
            server.close();
            const text = Buffer.concat(chunks).toString('utf8');
            resolve({ status: response.statusCode || 0, body: text ? JSON.parse(text) : null, text });
          });
        }
      );
      req.on('error', (error) => {
        server.close();
        reject(error);
      });
      if (body !== undefined) {
        req.write(JSON.stringify(body));
      }
      req.end();
    });
  });
}

const VALID_FILE_CONTENT = Buffer.from('%PDF-1.4\n% test document\n%%EOF').toString('base64');

describe('Document Persistence Diagnostic Observability', () => {
  const baseInput = {
    caseId: 'case-1',
    fileName: 'contract.pdf',
    fileContent: Buffer.from('%PDF-1.4\ncontract'),
    mimeType: 'application/pdf',
    documentType: 'OTHER' as const,
    folder: 'Internal' as const,
    createdById: 'user-1',
  };

  beforeEach(() => {
    jest.clearAllMocks();
    setScanner(new DevMockScanner());

    mockPrisma.case.findUnique.mockResolvedValue({
      id: 'case-1',
      caseNumber: 'CASE-1',
      clientId: 'client-1',
      assignedLawyerId: 'user-1',
      createdById: 'user-1',
    });
    mockPrisma.caseCollaborator.findFirst.mockResolvedValue(null);
    mockPrisma.case.update.mockResolvedValue({ id: 'case-1', status: 'DRAFT' });

    mockUploadDocument.mockResolvedValue({
      success: true,
      item: { id: 'sp-item-1', name: 'contract.v1.uuid.pdf' },
      version: '1.0',
      webUrl: 'https://sharepoint.example/items/sp-item-1',
    });
    mockDeleteDocument.mockResolvedValue(true);

    mockPrisma.$transaction.mockImplementation(async (callback: (tx: typeof mockPrisma) => Promise<unknown>) => {
      return callback(mockPrisma);
    });

    mockPrisma.document.create.mockResolvedValue({
      id: 'document-1',
      caseId: 'case-1',
      fileName: 'contract.pdf',
      documentType: 'OTHER',
      spItemId: 'sp-item-1',
      spPath: 'https://sharepoint.example/items/sp-item-1',
      version: '1.0',
      createdAt: new Date(),
      updatedAt: new Date(),
    });
    mockPrisma.timelineEvent.create.mockResolvedValue({ id: 'event-1' });
  });

  afterAll(() => {
    setScanner(null);
  });

  describe('safePrismaCode utility', () => {
    it('extracts canonical P-codes safely', () => {
      expect(safePrismaCode({ code: 'P2002' })).toBe('P2002');
      expect(safePrismaCode({ code: 'P2003', meta: { target: 'uploadedById' } })).toBe('P2003');
      expect(safePrismaCode({ code: 'P2021' })).toBe('P2021');
      expect(safePrismaCode({ code: 'P2022' })).toBe('P2022');
      expect(safePrismaCode({ code: 'P2025' })).toBe('P2025');
      expect(safePrismaCode({ code: 'P2034' })).toBe('P2034');
      expect(safePrismaCode({ code: 'P2028' })).toBe('P2028');
    });

    it('returns null for non-Prisma errors or malformed objects', () => {
      expect(safePrismaCode(new Error('database error'))).toBeNull();
      expect(safePrismaCode({ code: 'INVALID_CODE' })).toBeNull();
      expect(safePrismaCode({ code: 1234 })).toBeNull();
      expect(safePrismaCode({ message: 'P2002 in message' })).toBeNull();
      expect(safePrismaCode(null)).toBeNull();
      expect(safePrismaCode(undefined)).toBeNull();
      expect(safePrismaCode('string error')).toBeNull();
    });
  });

  describe('Service-level transaction step diagnostics', () => {
    it('1. STEP 1 failure: safe stage DOCUMENT_AND_INITIAL_VERSION, code preserved, compensation runs, subsequent writes skipped', async () => {
      const step1Error = Object.assign(new Error('Foreign key constraint failed on uploadedById'), {
        code: 'P2003',
        meta: { field_name: 'uploadedById' },
      });
      mockPrisma.document.create.mockRejectedValueOnce(step1Error);

      await expect(documentsService.createDocument(baseInput)).rejects.toMatchObject({
        name: 'DocumentPersistenceError',
        stage: 'DOCUMENT_AND_INITIAL_VERSION',
        prismaCode: 'P2003',
      });

      expect(mockDeleteDocument).toHaveBeenCalledWith('sp-item-1');
      expect(mockPrisma.timelineEvent.create).not.toHaveBeenCalled();
      expect(mockPrisma.case.update).not.toHaveBeenCalled();
    });

    it('2. STEP 2 failure: safe stage TIMELINE_EVENT, compensation runs, CASE_STATUS_UPDATE skipped', async () => {
      const step2Error = Object.assign(new Error('Foreign key constraint failed on timelineEvent.userId'), {
        code: 'P2003',
        meta: { field_name: 'userId' },
      });
      mockPrisma.timelineEvent.create.mockRejectedValueOnce(step2Error);

      await expect(documentsService.createDocument(baseInput)).rejects.toMatchObject({
        name: 'DocumentPersistenceError',
        stage: 'TIMELINE_EVENT',
        prismaCode: 'P2003',
      });

      expect(mockDeleteDocument).toHaveBeenCalledWith('sp-item-1');
      expect(mockPrisma.case.update).not.toHaveBeenCalled();
    });

    it('3. STEP 3 failure: safe stage CASE_STATUS_UPDATE, compensation runs', async () => {
      const step3Error = Object.assign(new Error('Record to update not found'), {
        code: 'P2025',
      });
      mockPrisma.case.update.mockRejectedValueOnce(step3Error);

      await expect(documentsService.createDocument(baseInput)).rejects.toMatchObject({
        name: 'DocumentPersistenceError',
        stage: 'CASE_STATUS_UPDATE',
        prismaCode: 'P2025',
      });

      expect(mockDeleteDocument).toHaveBeenCalledWith('sp-item-1');
    });

    it('4. Unknown error: prismaCode is null and raw error message is not in prismaCode', async () => {
      mockPrisma.document.create.mockRejectedValueOnce(new Error('connection terminated unexpectedly'));

      await expect(documentsService.createDocument(baseInput)).rejects.toMatchObject({
        name: 'DocumentPersistenceError',
        stage: 'DOCUMENT_AND_INITIAL_VERSION',
        prismaCode: null,
      });

      expect(mockDeleteDocument).toHaveBeenCalledWith('sp-item-1');
    });
  });

  describe('Route-level error responses and regression preservation', () => {
    it('surfaces DOCUMENT_AND_INITIAL_VERSION and P2003 in HTTP 500 without leaking raw message or meta', async () => {
      const prismaError = Object.assign(new Error('Foreign key constraint failed on the field: `document_versions_uploadedById_fkey (index)`'), {
        code: 'P2003',
        meta: { field_name: 'document_versions_uploadedById_fkey (index)', sensitive: 'secret_db_info' },
      });
      mockPrisma.document.create.mockRejectedValueOnce(prismaError);

      const res = await requestJson(createApp(), 'POST', '/documents', {
        body: {
          caseId: 'case-1',
          fileName: 'contract.pdf',
          fileContent: VALID_FILE_CONTENT,
          mimeType: 'application/pdf',
          documentType: 'OTHER',
        },
      });

      expect(res.status).toBe(500);
      expect(res.body).toEqual({
        status: 500,
        code: 'INTERNAL_ERROR',
        message: 'Dokumentum feltöltése sikertelen.',
        reason: 'DOCUMENT_AND_INITIAL_VERSION',
        prismaCode: 'P2003',
      });

      const bodyStr = JSON.stringify(res.body);
      expect(bodyStr).not.toMatch(/Foreign key constraint|fkey|index|sensitive|secret_db_info|stack/i);
    });

    it('surfaces TIMELINE_EVENT and P2003 in HTTP 500', async () => {
      const step2Error = Object.assign(new Error('Foreign key constraint on timeline_events_userId_fkey'), {
        code: 'P2003',
        meta: { field_name: 'timeline_events_userId_fkey' },
      });
      mockPrisma.timelineEvent.create.mockRejectedValueOnce(step2Error);

      const res = await requestJson(createApp(), 'POST', '/documents', {
        body: {
          caseId: 'case-1',
          fileName: 'contract.pdf',
          fileContent: VALID_FILE_CONTENT,
          mimeType: 'application/pdf',
          documentType: 'OTHER',
        },
      });

      expect(res.status).toBe(500);
      expect(res.body).toEqual({
        status: 500,
        code: 'INTERNAL_ERROR',
        message: 'Dokumentum feltöltése sikertelen.',
        reason: 'TIMELINE_EVENT',
        prismaCode: 'P2003',
      });
    });

    it('surfaces CASE_STATUS_UPDATE and P2025 in HTTP 500', async () => {
      const step3Error = Object.assign(new Error('An operation failed because it depends on one or more records that were required but not found.'), {
        code: 'P2025',
      });
      mockPrisma.case.update.mockRejectedValueOnce(step3Error);

      const res = await requestJson(createApp(), 'POST', '/documents', {
        body: {
          caseId: 'case-1',
          fileName: 'contract.pdf',
          fileContent: VALID_FILE_CONTENT,
          mimeType: 'application/pdf',
          documentType: 'OTHER',
        },
      });

      expect(res.status).toBe(500);
      expect(res.body).toEqual({
        status: 500,
        code: 'INTERNAL_ERROR',
        message: 'Dokumentum feltöltése sikertelen.',
        reason: 'CASE_STATUS_UPDATE',
        prismaCode: 'P2025',
      });
    });

    it('surfaces unknown error with prismaCode: null and never leaks raw message', async () => {
      mockPrisma.document.create.mockRejectedValueOnce(new Error('ECONNREFUSED 10.0.0.1:5432'));

      const res = await requestJson(createApp(), 'POST', '/documents', {
        body: {
          caseId: 'case-1',
          fileName: 'contract.pdf',
          fileContent: VALID_FILE_CONTENT,
          mimeType: 'application/pdf',
          documentType: 'OTHER',
        },
      });

      expect(res.status).toBe(500);
      expect(res.body).toEqual({
        status: 500,
        code: 'INTERNAL_ERROR',
        message: 'Dokumentum feltöltése sikertelen.',
        reason: 'DOCUMENT_AND_INITIAL_VERSION',
        prismaCode: null,
      });

      const bodyStr = JSON.stringify(res.body);
      expect(bodyStr).not.toContain('ECONNREFUSED');
      expect(bodyStr).not.toContain('10.0.0.1:5432');
    });

    it('5. STORAGE_502_PRESERVED: DocumentStorageUploadError remains 502 DOCUMENT_STORAGE_UNAVAILABLE', async () => {
      mockUploadDocument.mockResolvedValueOnce({
        success: false,
        error: 'SharePoint Graph unavailable',
      });

      const res = await requestJson(createApp(), 'POST', '/documents', {
        body: {
          caseId: 'case-1',
          fileName: 'contract.pdf',
          fileContent: VALID_FILE_CONTENT,
          mimeType: 'application/pdf',
          documentType: 'OTHER',
        },
      });

      expect(res.status).toBe(502);
      expect(res.body).toEqual({
        status: 502,
        code: 'DOCUMENT_STORAGE_UNAVAILABLE',
        message: 'A tárhelykapcsolat jelenleg nem érhető el.',
      });
    });

    it('6. P2002_409_PRESERVED: P2002 conflict remains 409 DOCUMENT_UPLOAD_CONFLICT', async () => {
      const conflictError = Object.assign(new Error('Unique constraint failed on the fields: (spItemId)'), {
        code: 'P2002',
        meta: { target: ['spItemId'] },
      });
      mockPrisma.document.create.mockRejectedValueOnce(conflictError);

      const res = await requestJson(createApp(), 'POST', '/documents', {
        body: {
          caseId: 'case-1',
          fileName: 'contract.pdf',
          fileContent: VALID_FILE_CONTENT,
          mimeType: 'application/pdf',
          documentType: 'OTHER',
        },
      });

      expect(res.status).toBe(409);
      expect(res.body).toEqual({
        status: 409,
        code: 'DOCUMENT_UPLOAD_CONFLICT',
        message: 'Dokumentum feltöltése sikertelen. Ütköző dokumentumazonosító keletkezett.',
      });
    });

    it('7. HTTP response contains no raw Prisma meta or error message', async () => {
      const errorWithLeakyMeta = Object.assign(new Error('SELECT "id" FROM "documents" WHERE id = 123 failed'), {
        code: 'P2003',
        meta: {
          database_name: 'adminiculum_prod',
          connection: 'postgres://admin:secret@db.internal:5432/db',
          table: 'documents',
        },
      });
      mockPrisma.document.create.mockRejectedValueOnce(errorWithLeakyMeta);

      const res = await requestJson(createApp(), 'POST', '/documents', {
        body: {
          caseId: 'case-1',
          fileName: 'contract.pdf',
          fileContent: VALID_FILE_CONTENT,
          mimeType: 'application/pdf',
          documentType: 'OTHER',
        },
      });

      expect(res.status).toBe(500);
      const text = res.text;
      expect(text).not.toContain('adminiculum_prod');
      expect(text).not.toContain('postgres://');
      expect(text).not.toContain('SELECT "id"');
      expect(text).not.toContain('connection');
      expect(text).not.toContain('secret');
      expect(text).not.toContain('failed');
    });
  });
});
