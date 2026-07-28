import { readFileSync } from 'fs';
import path from 'path';

describe('client identity and membership foundation static boundary', () => {
  const root = path.resolve(__dirname, '..');
  const schema = readFileSync(path.join(root, 'prisma/schema.prisma'), 'utf8');
  const clientAuth = readFileSync(path.join(root, 'src/middleware/clientPortalAuth.ts'), 'utf8');
  const portalRoutes = readFileSync(path.join(root, 'src/routes/clientPortal.ts'), 'utf8');
  const service = readFileSync(path.join(root, 'src/modules/client-identity/identityService.ts'), 'utf8');
  const frontend = readFileSync(path.resolve(root, '../Frontend/src/components/client-identity/ClientIdentityFlowShell.tsx'), 'utf8');

  it('stores external identity metadata but no credential material', () => {
    expect(schema).toContain('model ClientPortalIdentity');
    expect(schema).toContain('@@unique([issuer, subject])');
    expect(schema).toContain('model ClientOrganizationMembershipRequest');
    expect(schema).toContain('model ClientOrganizationMembership');
    expect(schema).toContain('model ClientPortalInvitation');
    const identityBlock = schema.slice(schema.indexOf('model ClientPortalIdentity'), schema.indexOf('model ClientOrganizationGroup'));
    expect(identityBlock).not.toMatch(/password|hash|reset|token|secret/i);
  });

  it('separates workforce and customer portal auth contexts', () => {
    expect(clientAuth).toContain("identityType: 'CLIENT_PORTAL'");
    expect(clientAuth).toContain('CLIENT_IDENTITY_ISSUER');
    expect(clientAuth).toContain('CLIENT_IDENTITY_AUDIENCE');
    expect(portalRoutes).toContain('authenticateClientPortal');
    expect(portalRoutes).not.toContain("from '../middleware/auth'");
    expect(portalRoutes).toContain('CLIENT_PORTAL_READ_DISABLED');
  });

  it('requires membership approval before explicit matter grants', () => {
    expect(service).toContain('PENDING_REVIEW');
    expect(service).toContain('CROSS_CLIENT_GROUP_REJECTED');
    expect(service).toContain('grantRequired: true');
    expect(service).toContain('Hozzáférés adása ügyhöz');
    expect(service).toContain('createGrantForApprovedMembership');
    expect(service).toContain('ACTIVE_MEMBERSHIP_REQUIRED');
  });

  it('does not present legal approval wording to customers', () => {
    const publicationService = readFileSync(path.join(root, 'src/modules/client-publication/publicationService.ts'), 'utf8');
    expect(publicationService).toContain('Belső használatra fenntartott korábbi típus');
    expect(frontend).toContain('A szervezet vagy csoport megadása önmagában nem ad hozzáférést');
    expect(frontend).toContain('Az Adminiculum nem tárol jelszót vagy ellenőrző kódot');
    expect(frontend).not.toContain('Microsoft');
  });
});
