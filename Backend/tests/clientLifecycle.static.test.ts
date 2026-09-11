import { readFileSync } from 'node:fs';
import path from 'node:path';

// Route-level contract for client lifecycle: every mutation surface is
// ADMIN/PARTNER-gated, the raw delete path can no longer be reached by an
// ordinary authenticated user, and archived clients are excluded from the
// normal list/lookup predicates while direct reads stay intact.

const root = path.join(__dirname, '..');
const routes = readFileSync(path.join(root, 'src/modules/clients/routes.ts'), 'utf8');
const service = readFileSync(path.join(root, 'src/modules/clients/clientLifecycleService.ts'), 'utf8');

describe('client lifecycle archive/delete (static)', () => {
  it('DELETE /clients/:clientId requires the client identity management gate', () => {
    expect(routes).toMatch(/router\.delete\('\/:clientId', authenticate, requireClientIdentityManageAccess/);
    expect(routes).toMatch(/hardDeleteClient\(actor, clientId\)/);
    expect(routes).not.toMatch(/router\.delete\('\/:clientId', authenticate, async/);
  });

  it('archive + lifecycle-preview routes are ADMIN/PARTNER gated', () => {
    expect(routes).toMatch(/router\.post\('\/:clientId\/archive', authenticate, requireClientIdentityManageAccess/);
    expect(routes).toMatch(/router\.get\('\/:clientId\/lifecycle-preview', authenticate, requireClientIdentityManageAccess/);
  });

  it('active client list and lookup exclude archived clients', () => {
    const listBlock = routes.match(/router\.get\('\/', authenticate[\s\S]*?res\.json\(\{ data: clients \}\)/)![0];
    expect(listBlock).toMatch(/archivedAt: null/);
    const lookupBlock = routes.match(/router\.get\('\/lookup', authenticate[\s\S]*?candidates: candidates\.map/)![0];
    expect(lookupBlock).toMatch(/archivedAt: null/);
    // direct dossier read keeps working (history access preserved)
    expect(routes).toMatch(/router\.get\('\/:clientId', authenticate, requireClientIdentityReadAccess/);
  });

  it('service enforces the gate internally and blocks dependent deletes with 409', () => {
    expect(service).toMatch(/CLIENT_LIFECYCLE_MANAGER_ROLES = new Set\(\['ADMIN', 'PARTNER'\]\)/);
    expect(service).toMatch(/CLIENT_DELETE_BLOCKED/);
    expect(service).toMatch(/summary\.canHardDelete/);
    // no cascade purge: archive writes lifecycle fields + canonical workspace transition only
    expect(service).toMatch(/archivedAt: new Date\(\), archivedById: actor\.userId/);
    expect(service).toMatch(/transitionWorkspace\(actor, workspace\.id, 'archive', workspace\.revision, db\)/);
    expect(service).not.toMatch(/deleteMany/);
    expect(service).not.toMatch(/clientPortalIdentity\.(delete|update)/);
  });
});
