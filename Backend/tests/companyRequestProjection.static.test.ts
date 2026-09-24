/**
 * Static boundary test for the company-level customer request projection.
 *
 * Guarantees the customer route derives clientId from the resolved workspace,
 * reuses the canonical customer-safe mapper, never exposes Compliance internal
 * identifiers, and is mounted before the client-portal catch-all.
 */
import { readFileSync } from 'node:fs';
import path from 'node:path';

const routeSource = readFileSync(path.resolve(__dirname, '../src/modules/compliance/clientSafeComplianceRoutes.ts'), 'utf8');
const projectionSource = readFileSync(path.resolve(__dirname, '../src/modules/compliance/companyRequestProjection.ts'), 'utf8');
const indexSource = readFileSync(path.resolve(__dirname, '../src/index.ts'), 'utf8');
const requestServiceSource = readFileSync(path.resolve(__dirname, '../src/modules/client-interaction/requestService.ts'), 'utf8');

describe('company request projection route boundary', () => {
  it('exposes GET /requests on the client-safe compliance router', () => {
    expect(routeSource).toMatch(/router\.get\('\/requests'/);
  });

  it('authenticates the portal session and derives clientId/workspaceId from the resolved workspace', () => {
    expect(routeSource).toMatch(/requireActiveClientPortalSession\(req\)/);
    expect(routeSource).toMatch(/getCompanyClientRequestProjection\(workspace\.clientId,\s*session\.clientPortalIdentityId,\s*workspace\.id\)/);
    expect(routeSource).not.toMatch(/req\.params\.clientId/);
    expect(routeSource).not.toMatch(/req\.body\.clientId/);
  });

  it('restricts the company projection to organization workspaces', () => {
    expect(routeSource).toMatch(/CLIENT_ORGANIZATION_WORKSPACE_REQUIRED/);
  });

  it('is mounted before the /client-portal catch-all router', () => {
    const complianceMount = indexSource.indexOf("'/api/v1/client-portal/compliance'");
    const portalMount = indexSource.indexOf("'/api/v1/client-portal'");
    expect(complianceMount).toBeGreaterThanOrEqual(0);
    expect(portalMount).toBeGreaterThanOrEqual(0);
    expect(complianceMount).toBeLessThan(portalMount);
  });
});

describe('company request projection customer safety', () => {
  it('reuses the canonical customer-safe request mapper and visibility gate', () => {
    expect(projectionSource).toMatch(/from '\.\.\/client-interaction\/requestService'/);
    expect(projectionSource).toMatch(/toClientSafeRequest\(row\)/);
    expect(projectionSource).toMatch(/customerVisibleRequestStatuses/);
    expect(requestServiceSource).toMatch(/export const customerVisibleRequestStatuses/);
  });

  it('never assigns Compliance internal identifiers into the customer DTO', () => {
    expect(projectionSource).not.toMatch(/requirementVersionId\s*:/);
    expect(projectionSource).not.toMatch(/clientControlId\s*:/);
    expect(projectionSource).not.toMatch(/findingId\s*:/);
    expect(projectionSource).toMatch(/contextLabel:\s*safe\.contextLabel/);
  });

  it('only reads requests for cases with an active grant (fail closed)', () => {
    expect(projectionSource).toMatch(/clientPortalGrant\.findMany/);
    expect(projectionSource).toMatch(/caseId:\s*\{\s*in:\s*grantedCaseIds\s*\}/);
    expect(projectionSource).toMatch(/grantedCaseIds\.length === 0/);
  });

  it('does not reference the forbidden proposal/task creation modules', () => {
    expect(projectionSource).not.toMatch(/complianceProposalService|createProposal|bindProposal|confirmProposal|createTask/);
  });
});
