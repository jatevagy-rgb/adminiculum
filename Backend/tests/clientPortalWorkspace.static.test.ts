import { readFileSync } from 'fs';
import path from 'path';

const root = path.resolve(__dirname, '..', '..');
const read = (relative: string) => readFileSync(path.join(root, relative), 'utf8');

describe('client portal workspace projection', () => {
  it('registers server-authoritative context routes and no production bypass routes', () => {
    const routes = read('Backend/src/routes/clientPortal.ts');
    const index = read('Backend/src/index.ts');
    expect(routes).toContain("router.get('/me'");
    expect(routes).toContain("router.get('/workspaces'");
    expect(routes).toContain('resolvePortalWorkspace');
    expect(index).not.toMatch(/routes\/debug|debugWhoami/);
    expect(index).not.toMatch(/app\.(get|post|use)\([^\n]*(dbcheck|test-auth|migrate|registration-bypass)/i);
  });

  it('aggregates only through authenticated customer services', () => {
    const routes = read('Backend/src/routes/clientPortal.ts');
    expect(routes).toContain("router.get('/workspace'");
    expect(routes).toContain('portalRead(req, res)');
    expect(routes).toContain('resolveActiveCustomerGrant');
    expect(routes).toContain('listCustomerRequests');
    expect(routes).toContain('listCustomerSubmissions');
    expect(routes).toContain('listCustomerThreads');
    expect(routes).not.toMatch(/req\.(body|query)\.(clientId|caseId|grantId)/);
  });

  it('keeps the aggregate DTO limited to customer-safe fields', () => {
    const routes = read('Backend/src/routes/clientPortal.ts');
    const workspace = routes.slice(routes.indexOf('async function portalWorkspace'));
    expect(workspace).not.toMatch(/storageProvider|quarantineStorageReference|scanProvider|scanCodeSafe|reviewedById|acceptedDocumentVersionId/);
    expect(workspace).toContain('rawStatus: item.status');
    expect(workspace).toContain('DOCUMENT_REQUEST_TYPES.has(request.type)');
    expect(workspace).toContain("kind: request.type === 'CORRECTION_REQUEST'");
  });
});
