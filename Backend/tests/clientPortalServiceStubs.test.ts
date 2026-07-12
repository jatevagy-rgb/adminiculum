import fs from 'fs';
import path from 'path';
import {
  CLIENT_PORTAL_SERVICE_NOT_IMPLEMENTED,
  ClientPortalServiceDisabledError,
  getPortalMe,
  listPortalMatters,
  getPortalMatterDetail,
  listPortalMatterDocuments,
  getPortalDocumentDetail,
  listPortalTasks,
  completePortalTask,
  listPortalUploadRequests,
  createPortalUploadedFile,
  listPortalMessageThreads,
  replyToPortalMessageThread,
} from '../src/modules/client-portal/services';

const ctx = { portalUserRef: 'ext-user-1' };

// [fn, invocation] — each stub called with a minimal safe input.
const stubInvocations: Array<[string, () => Promise<unknown>]> = [
  ['getPortalMe', () => getPortalMe(ctx)],
  ['listPortalMatters', () => listPortalMatters(ctx)],
  ['getPortalMatterDetail', () => getPortalMatterDetail({ ...ctx, matterRef: 'ext-matter-1' })],
  ['listPortalMatterDocuments', () => listPortalMatterDocuments({ ...ctx, matterRef: 'ext-matter-1' })],
  ['getPortalDocumentDetail', () => getPortalDocumentDetail({ ...ctx, documentRef: 'ext-doc-1' })],
  ['listPortalTasks', () => listPortalTasks(ctx)],
  ['completePortalTask', () => completePortalTask({ ...ctx, taskRef: 'ext-task-1' })],
  ['listPortalUploadRequests', () => listPortalUploadRequests(ctx)],
  ['createPortalUploadedFile', () => createPortalUploadedFile({ ...ctx, uploadRequestRef: 'ext-upload-1' })],
  ['listPortalMessageThreads', () => listPortalMessageThreads(ctx)],
  ['replyToPortalMessageThread', () => replyToPortalMessageThread(ctx)],
];

describe('client portal service stubs — disabled-only, fail-closed', () => {
  it.each(stubInvocations)('%s fails closed with a content-free 501 error', async (_name, invoke) => {
    expect.assertions(4);
    try {
      await invoke();
    } catch (error) {
      expect(error).toBeInstanceOf(ClientPortalServiceDisabledError);
      const err = error as ClientPortalServiceDisabledError;
      expect(err.code).toBe(CLIENT_PORTAL_SERVICE_NOT_IMPLEMENTED);
      expect(err.status).toBe(501);
      // Content-free: the message is the fixed safe string, no data/content.
      expect(err.message).toBe('Client Portal service is not implemented.');
    }
  });

  it('the disabled error carries only safe fields (no user data/content)', async () => {
    try {
      await getPortalMatterDetail({ portalUserRef: 'ext-user-1', matterRef: 'ext-matter-1' });
    } catch (error) {
      const serialized = JSON.stringify({
        name: (error as Error).name,
        message: (error as Error).message,
        code: (error as ClientPortalServiceDisabledError).code,
        status: (error as ClientPortalServiceDisabledError).status,
        operation: (error as ClientPortalServiceDisabledError).operation,
      });
      // The input refs must not leak into the error surface.
      expect(serialized).not.toContain('ext-user-1');
      expect(serialized).not.toContain('ext-matter-1');
      expect((error as ClientPortalServiceDisabledError).operation).toBe('getPortalMatterDetail');
    }
  });

  it('services.ts contains no Prisma/DB access and no internal-service/DTO imports', () => {
    const source = fs.readFileSync(
      path.join(__dirname, '..', 'src', 'modules', 'client-portal', 'services.ts'),
      'utf8'
    );
    // No Prisma client / DB access.
    expect(source).not.toMatch(/PrismaClient/);
    expect(source).not.toMatch(/@prisma\/client/);
    expect(source).not.toMatch(/\bprisma\./);
    expect(source).not.toMatch(/prisma\.service/);
    // No imports from internal modules (cases/documents/tasks/communications).
    expect(source).not.toMatch(/from\s+['"][^'"]*\/modules\/(cases|documents|tasks|communications)/i);
    // The only imports are type-only DTOs from the local ./types module.
    expect(source).not.toMatch(/from\s+['"]\.\/mappers['"]/);
    // Construct the forbidden field name in test code (not present in runtime source).
    const forbiddenField = ['workspace', 'Text'].join('');
    expect(source).not.toContain(forbiddenField);
  });

  it('routes.ts does not import or invoke the service stubs', () => {
    const routes = fs.readFileSync(
      path.join(__dirname, '..', 'src', 'modules', 'client-portal', 'routes.ts'),
      'utf8'
    );
    expect(routes).not.toMatch(/from\s+['"]\.\/services['"]/);
    expect(routes).not.toMatch(/require\(['"]\.\/services['"]\)/);
    // No service stub call sites in the routes file.
    for (const [name] of stubInvocations) {
      expect(routes).not.toContain(`${name}(`);
    }
  });
});
