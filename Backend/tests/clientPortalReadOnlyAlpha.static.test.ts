import { readFileSync } from 'fs';
import path from 'path';

const root = path.resolve(__dirname, '..', '..');
const read = (relative: string) => readFileSync(path.join(root, relative), 'utf8');

function recursiveKeys(value: unknown, keys: string[] = []): string[] {
  if (!value || typeof value !== 'object') return keys;
  if (Array.isArray(value)) {
    value.forEach((item) => recursiveKeys(item, keys));
    return keys;
  }
  for (const [key, nested] of Object.entries(value as Record<string, unknown>)) {
    keys.push(key);
    recursiveKeys(nested, keys);
  }
  return keys;
}

describe('client portal read-only alpha security boundary', () => {
  it('exposes only explicit read-only portal routes and leaves action completion gated', () => {
    const routes = read('Backend/src/routes/clientPortal.ts');
    for (const route of [
      '/home',
      '/matters',
      '/matters/:publicationId',
      '/matters/:publicationId/documents',
      '/documents/:publicationId',
      '/documents/:publicationId/download',
      '/action-requests',
      '/action-requests/:requestId',
      '/updates',
      '/updates/:updateId',
    ]) {
      expect(routes).toContain(route);
    }
    expect(routes).toContain('CLIENT_PORTAL_ACTIONS_DISABLED');
    expect(routes).not.toMatch(/router\.(post|put|patch|delete)\('\/(matters|documents|updates)'/);
  });

  it('resolves portal access server-side from client user and active grants only', () => {
    const service = read('Backend/src/modules/client-publication/publicationService.ts');
    expect(service).toContain("'CLIENT_PORTAL'");
    expect(service).toContain('client_portal_identities');
    expect(service).toContain('client_organization_memberships');
    expect(service).toContain('CLIENT_MEMBERSHIP_REQUIRED');
    expect(service).toContain('WHERE "clientPortalIdentityId"=$1');
    expect(service).toContain('WHERE "clientUserId"=$1');
    expect(service).toContain("grant.status === 'ACTIVE'");
    expect(service).toContain('CLIENT_PORTAL_GRANT_SUSPENDED');
    expect(service).toContain('CLIENT_PORTAL_GRANT_REVOKED');
    expect(service).toContain('CLIENT_PORTAL_GRANT_EXPIRED');
    expect(service).not.toMatch(/req\.query\.clientId|req\.body\.clientId|x-user-id/i);
  });

  it('enforces audience snapshots and grant permissions for every portal projection', () => {
    const service = read('Backend/src/modules/client-publication/publicationService.ts');
    for (const permission of ['MATTER_READ', 'DOCUMENT_READ', 'DOCUMENT_DOWNLOAD', 'ACTION_REQUEST_READ', 'UPDATE_READ']) {
      expect(service).toContain(permission);
    }
    expect(service).toContain('audienceAllows');
    expect(service).toContain('firstAuthorizedGrant');
    const portalProjection = service.slice(service.indexOf('function toPortalMatter'));
    expect(portalProjection).not.toMatch(/workInstruction|ReviewDecision|comparisonExcerpt|annotationContent/);
  });

  it('recursive portal DTO examples do not contain forbidden keys', () => {
    const example = {
      id: 'pub-1',
      title: 'Client-safe title',
      statusLabel: 'Folyamatban',
      documents: [{ id: 'doc-pub-1', title: 'Document', versionLabel: 'Közzétett változat 1' }],
      updates: [{ id: 'update-1', title: 'Frissítés', body: 'Client-safe body' }],
    };
    const forbidden = /workInstruction|storage|spItem|review|annotation|comparison|audit|token|credential|internal/i;
    expect(recursiveKeys(example).join(' ')).not.toMatch(forbidden);
    expect(JSON.stringify(example)).not.toMatch(forbidden);
  });
});


