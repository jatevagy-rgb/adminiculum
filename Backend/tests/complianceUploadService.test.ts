/**
 * Compliance document upload orchestration (no database).
 *
 * Proves the composition contract that the DB-level suite cannot observe:
 * fail-fast requirement validation before ANY external effect, exactly ONE
 * external document upload even when Case resolution retries internally, and
 * truthful publication outcome projection (DRAFT / PUBLISHED / NOT_CREATED).
 */
import { describe, expect, it, jest, beforeEach } from '@jest/globals';

jest.mock('../src/modules/client-interaction/base', () => {
  const actual = jest.requireActual('../src/modules/client-interaction/base') as Record<string, unknown>;
  return {
    __esModule: true,
    ...actual,
    requireInternal: jest.fn(),
    assertClientReadAccess: jest.fn(async () => undefined),
  };
});

jest.mock('../src/modules/documents/services', () => ({
  __esModule: true,
  default: { createDocument: jest.fn() },
}));

jest.mock('../src/modules/upload-security/uploadValidationCore', () => ({
  __esModule: true,
  validateWorkforceUpload: jest.fn(async () => ({ ok: true, detectedMimeType: 'application/pdf', sizeBytes: 12, codeSafe: 'OK' })),
}));

jest.mock('../src/modules/client-publication/publicationService', () => ({
  __esModule: true,
  createDocumentPublication: jest.fn(),
}));

jest.mock('../src/modules/compliance/complianceDocumentService', () => ({
  __esModule: true,
  linkComplianceDocument: jest.fn(),
}));

jest.mock('../src/modules/compliance/complianceCaseResolver', () => ({
  __esModule: true,
  resolveOrCreateComplianceCase: jest.fn(),
  resolveExplicitComplianceCase: jest.fn(),
}));

/* eslint-disable @typescript-eslint/no-explicit-any */
import documentsService from '../src/modules/documents/services';
import { createDocumentPublication } from '../src/modules/client-publication/publicationService';
import { linkComplianceDocument } from '../src/modules/compliance/complianceDocumentService';
import { resolveOrCreateComplianceCase, resolveExplicitComplianceCase } from '../src/modules/compliance/complianceCaseResolver';
import { uploadComplianceDocument } from '../src/modules/compliance/complianceUploadService';

const createDocument: any = documentsService.createDocument;
const linkDocument: any = linkComplianceDocument;
const createPublication: any = createDocumentPublication;
const resolveCase: any = resolveOrCreateComplianceCase;
const resolveExplicit: any = resolveExplicitComplianceCase;

const ACTOR = { userId: 'user-1', role: 'ADMIN' };

function fakeDb(foundRequirement: boolean) {
  return {
    requirement: { findUnique: jest.fn(async () => (foundRequirement ? { id: 'req-1' } : null)) },
    documentVersion: { findFirst: jest.fn(async () => ({ id: 'ver-1' })) },
  };
}

const BASE_INPUT = {
  clientId: 'client-1',
  requirementKey: 'GDPR_GENERAL_SCOPE',
  intent: 'INTERNAL_ANALYSIS',
  fileName: 'master.docx',
  mimeType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  fileContent: Buffer.from('docx'),
};

beforeEach(() => {
  createDocument.mockReset().mockResolvedValue({ id: 'doc-1', caseId: 'case-1', fileName: 'master.docx' });
  linkDocument.mockReset().mockResolvedValue({ id: 'link-1', audience: 'INTERNAL_ANALYSIS' });
  createPublication.mockReset().mockResolvedValue({ id: 'pub-1', status: 'DRAFT' });
  resolveCase.mockReset().mockResolvedValue({ caseId: 'case-1', caseCreated: false, caseReused: true });
});

describe('uploadComplianceDocument — preconditions', () => {
  it('rejects an unknown requirement BEFORE resolving a case or uploading', async () => {
    const db = fakeDb(false);
    await expect(uploadComplianceDocument(ACTOR, BASE_INPUT as never, db as never)).rejects.toMatchObject({
      code: 'COMPLIANCE_UPLOAD_REQUIREMENT_NOT_FOUND',
    });
    expect(resolveCase).not.toHaveBeenCalled();
    expect(createDocument).not.toHaveBeenCalled();
    expect(linkDocument).not.toHaveBeenCalled();
  });

  it('rejects an unknown intent before any side effect', async () => {
    const db = fakeDb(true);
    await expect(uploadComplianceDocument(ACTOR, { ...BASE_INPUT, intent: 'NOPE' } as never, db as never)).rejects.toMatchObject({
      code: 'COMPLIANCE_UPLOAD_INVALID_INTENT',
    });
    expect(createDocument).not.toHaveBeenCalled();
  });
});

describe('uploadComplianceDocument — exactly-once external upload', () => {
  // Composition proof at the orchestration boundary: the resolver is invoked ONCE and,
  // after it returns a stable caseId, the external document upload is invoked EXACTLY
  // ONCE. The resolver's own internal SERIALIZABLE retry loop is proven separately by
  // complianceCaseResolver.test.ts, and real concurrent behaviour by the PostgreSQL suite.
  // This test does NOT exercise resolver retries end-to-end.
  it('invokes the external upload exactly ONCE per stable resolved caseId', async () => {
    const db = fakeDb(true);
    resolveCase.mockResolvedValue({ caseId: 'case-1', caseCreated: false, caseReused: true });

    const result = await uploadComplianceDocument(ACTOR, BASE_INPUT as never, db as never);

    expect(result.caseId).toBe('case-1');
    expect(resolveCase).toHaveBeenCalledTimes(1);
    expect(createDocument).toHaveBeenCalledTimes(1);
    expect(linkDocument).toHaveBeenCalledTimes(1);
    expect(createPublication).not.toHaveBeenCalled();
  });

  it('INTERNAL_ANALYSIS never publishes and reports the matrix as scheduled', async () => {
    const db = fakeDb(true);
    const result = await uploadComplianceDocument(ACTOR, BASE_INPUT as never, db as never);

    expect(result.audience).toBe('INTERNAL_ANALYSIS');
    expect(result.internalAnalysis).toEqual({ matrixScheduled: true });
    expect(result.publication).toBeNull();
    expect(createPublication).not.toHaveBeenCalled();
  });
});

describe('uploadComplianceDocument — exceptional explicit case retry', () => {
  it('E. reuses the explicitly selected case without creating or auto-resolving another', async () => {
    const db = fakeDb(true);
    resolveExplicit.mockReset().mockResolvedValue({ caseId: 'case-selected' });

    const result = await uploadComplianceDocument(
      ACTOR,
      { ...BASE_INPUT, caseId: 'case-selected' } as never,
      db as never,
    );

    expect(resolveExplicit).toHaveBeenCalledTimes(1);
    expect(resolveCase).not.toHaveBeenCalled();
    expect(result.caseId).toBe('case-selected');
    expect(result.caseCreated).toBe(false);
    expect(createDocument).toHaveBeenCalledTimes(1);
    expect(linkDocument).toHaveBeenCalledTimes(1);
  });

  it('F–K. a rejected explicit case performs ZERO external side effects', async () => {
    const db = fakeDb(true);
    resolveExplicit.mockReset().mockRejectedValue(Object.assign(new Error('terminal'), { code: 'COMPLIANCE_UPLOAD_CASE_NOT_REUSABLE' }));

    await expect(
      uploadComplianceDocument(ACTOR, { ...BASE_INPUT, caseId: 'case-closed' } as never, db as never),
    ).rejects.toMatchObject({ code: 'COMPLIANCE_UPLOAD_CASE_NOT_REUSABLE' });

    expect(createDocument).not.toHaveBeenCalled();
    expect(linkDocument).not.toHaveBeenCalled();
    expect(createPublication).not.toHaveBeenCalled();
  });
});

describe('uploadComplianceDocument — truthful publication projection', () => {
  it('CLIENT_POLICY reports the canonical DRAFT state', async () => {
    const db = fakeDb(true);
    linkDocument.mockResolvedValue({ id: 'link-1', audience: 'CLIENT_POLICY' });
    const result = await uploadComplianceDocument(
      ACTOR,
      { ...BASE_INPUT, intent: 'CLIENT_POLICY' } as never,
      db as never,
    );
    expect(result.publication).toEqual({ publicationId: 'pub-1', status: 'DRAFT' });
    expect(createDocument).toHaveBeenCalledTimes(1);
  });

  it('CLIENT_POLICY never misrepresents a missing publication draft as DRAFT', async () => {
    const db = fakeDb(true);
    linkDocument.mockResolvedValue({ id: 'link-1', audience: 'CLIENT_POLICY' });
    createPublication.mockRejectedValueOnce(Object.assign(new Error('no audience'), { code: 'NO_ACTIVE_AUDIENCE_GRANT' }));

    const result = await uploadComplianceDocument(
      ACTOR,
      { ...BASE_INPUT, intent: 'CLIENT_POLICY' } as never,
      db as never,
    );

    expect(result.publication).toEqual({ publicationId: null, status: 'NOT_CREATED', code: 'NO_ACTIVE_AUDIENCE_GRANT' });
    // The document + linkage truthfully persist; the upload is not repeated.
    expect(createDocument).toHaveBeenCalledTimes(1);
    expect(linkDocument).toHaveBeenCalledTimes(1);
  });
});
