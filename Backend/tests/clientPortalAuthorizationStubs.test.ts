import fs from 'fs';
import path from 'path';
import {
  ClientPortalAuthorizationError,
  ClientPortalPrincipalNotReadyError,
  ClientPortalAccessDeniedError,
  resolvePortalPrincipal,
  requireActivePortalUser,
  assertPortalFeatureReadyForDataAccess,
  requirePortalMatterAccess,
  requirePortalDocumentShare,
  requirePortalTaskAccess,
  requirePortalUploadRequestAccess,
  requirePortalMessageAccess,
} from '../src/modules/client-portal/authorization';

// Synthetic external-safe refs — must never leak into an error surface.
const principal = { portalUserRef: 'ext-user-1', externalAuthSubject: 'sub-1', sessionRef: 'sess-1' };

// Principal-not-ready stubs (throw ClientPortalPrincipalNotReadyError).
const principalStubs: Array<[string, () => unknown]> = [
  ['resolvePortalPrincipal', () => resolvePortalPrincipal(principal)],
  ['requireActivePortalUser', () => requireActivePortalUser(principal)],
  ['assertPortalFeatureReadyForDataAccess', () => assertPortalFeatureReadyForDataAccess()],
];

// Grant-check stubs (throw ClientPortalAccessDeniedError).
const grantStubs: Array<[string, () => unknown]> = [
  ['requirePortalMatterAccess', () => requirePortalMatterAccess({ principal, matterRef: 'ext-matter-1' })],
  ['requirePortalDocumentShare', () => requirePortalDocumentShare({ principal, documentRef: 'ext-doc-1', matterRef: 'ext-matter-1' })],
  ['requirePortalTaskAccess', () => requirePortalTaskAccess({ principal, taskRef: 'ext-task-1' })],
  ['requirePortalUploadRequestAccess', () => requirePortalUploadRequestAccess({ principal, uploadRequestRef: 'ext-upload-1' })],
  ['requirePortalMessageAccess', () => requirePortalMessageAccess({ principal, threadRef: 'ext-thread-1' })],
];

const allStubs = [...principalStubs, ...grantStubs];

// Every ref value that a careless caller might expect to leak.
const leakVectors = ['ext-user-1', 'sub-1', 'sess-1', 'ext-matter-1', 'ext-doc-1', 'ext-task-1', 'ext-upload-1', 'ext-thread-1'];

function serializeError(error: unknown): string {
  const e = error as ClientPortalAuthorizationError;
  return JSON.stringify({ name: e.name, message: e.message, code: e.code, status: e.status, operation: e.operation, reasonCode: e.reasonCode });
}

describe('client portal authorization stubs — fail-closed, unused', () => {
  it.each(allStubs)('%s fails closed with a content-free error', (name, invoke) => {
    // It must throw a portal authorization error.
    expect(invoke).toThrow(ClientPortalAuthorizationError);
    let thrown: unknown;
    try {
      invoke();
    } catch (error) {
      thrown = error;
    }
    const serialized = serializeError(thrown);
    // No input ref leaks into the error surface.
    for (const vector of leakVectors) {
      expect(serialized).not.toContain(vector);
    }
    expect((thrown as ClientPortalAuthorizationError).operation).toBe(name);
  });

  it('principal stubs throw ClientPortalPrincipalNotReadyError (501, content-free)', () => {
    for (const [, invoke] of principalStubs) {
      try {
        invoke();
        throw new Error('expected to fail closed');
      } catch (error) {
        expect(error).toBeInstanceOf(ClientPortalPrincipalNotReadyError);
        const e = error as ClientPortalPrincipalNotReadyError;
        expect(e.status).toBe(501);
        expect(e.code).toBe('CLIENT_PORTAL_PRINCIPAL_NOT_READY');
        expect(e.message).toBe('Client Portal principal is not available.');
      }
    }
  });

  it('grant-check stubs throw ClientPortalAccessDeniedError (403, content-free)', () => {
    for (const [, invoke] of grantStubs) {
      try {
        invoke();
        throw new Error('expected to fail closed');
      } catch (error) {
        expect(error).toBeInstanceOf(ClientPortalAccessDeniedError);
        const e = error as ClientPortalAccessDeniedError;
        expect(e.status).toBe(403);
        expect(e.code).toBe('CLIENT_PORTAL_ACCESS_DENIED');
        expect(e.message).toBe('Client Portal access is not authorized.');
      }
    }
  });

  it('authorization.ts has no Prisma/DB access and no internal/service/mapper imports', () => {
    const dir = path.join(__dirname, '..', 'src', 'modules', 'client-portal');
    const source = fs.readFileSync(path.join(dir, 'authorization.ts'), 'utf8');
    expect(source).not.toMatch(/PrismaClient/);
    expect(source).not.toMatch(/@prisma\/client/);
    expect(source).not.toMatch(/\bprisma\./);
    expect(source).not.toMatch(/from\s+['"][^'"]*\/modules\/(cases|documents|tasks|communications)/i);
    expect(source).not.toMatch(/from\s+['"]\.\/services['"]/);
    expect(source).not.toMatch(/from\s+['"]\.\/mappers['"]/);
    // Forbidden field name constructed in test code (absent from runtime source).
    expect(source).not.toContain(['workspace', 'Text'].join(''));
  });

  it('routes.ts and services.ts do not import the authorization module', () => {
    const dir = path.join(__dirname, '..', 'src', 'modules', 'client-portal');
    for (const file of ['routes.ts', 'services.ts']) {
      const source = fs.readFileSync(path.join(dir, file), 'utf8');
      expect(source).not.toMatch(/from\s+['"]\.\/authorization['"]/);
      expect(source).not.toMatch(/require\(['"]\.\/authorization['"]\)/);
    }
  });
});
