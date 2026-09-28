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
    expect(workspace).toContain('toCustomerRequestEntryRow');
    expect(workspace).toContain('CORRECTION_REQUEST');
  });

  it('projects every canonical actionable request type into the Teendők entry rows', () => {
    const routes = read('Backend/src/routes/clientPortal.ts');
    const entry = routes.slice(routes.indexOf('CUSTOMER_REQUEST_ROW_KINDS'), routes.indexOf('function customerRequestStatus'));
    for (const type of ['DOCUMENT_UPLOAD', 'MISSING_DOCUMENT_REQUEST', 'CORRECTION_REQUEST', 'INFORMATION_REQUEST', 'DATA_FORM', 'QUESTION_RESPONSE']) {
      expect(entry).toContain(`${type}:`);
    }
    // Terminal requests are never entry points, and the raw internal status is
    // used only for that decision — it is never copied into the customer row.
    expect(entry).toContain('COMPLETED_REQUEST_STATUSES.has(String(request.rawStatus))');
    expect(entry).not.toContain('rawStatus:');
    for (const internal of ['caseId', 'documentSpec', 'fields', 'assignedInternalUserId', 'createdById', 'audienceSnapshot', 'reviewerNotes']) {
      expect(entry).not.toContain(`${internal}:`);
    }
  });
});
