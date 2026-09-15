import { readFileSync } from 'fs';
import path from 'path';

const root = path.resolve(__dirname, '..', '..');
const read = (relative: string) => readFileSync(path.join(root, relative), 'utf8');

const service = read('Backend/src/modules/client-publication/publicationService.ts');
const routes = read('Backend/src/modules/client-publication/publication.routes.ts');
const projection = service.slice(
  service.indexOf('export async function getClientPublishedContent'),
  service.indexOf('function buildWarnings'),
);

describe('Portal Center published-content projection', () => {
  it('is exposed on the canonical internal client-publication router', () => {
    expect(routes).toContain("'/clients/:clientId/published-content'");
    expect(routes).toContain('getClientPublishedContent(actor(req), String(req.params.clientId))');
    // reuses the existing internal actor + failure shaping; no parallel admin engine
    expect(routes).toContain('clientPublicationRouter.use(authenticate)');
  });

  it('counts only explicit, current, customer-visible publication rows', () => {
    // Every counted category is filtered to the canonical PUBLISHED status.
    expect(projection).toContain("p.status='PUBLISHED'::\"ClientPublicationStatus\"");
    expect(projection).toContain("a.status='PUBLISHED'::\"ClientActionRequestStatus\"");
    expect(projection).toContain("u.status='PUBLISHED'::\"ClientSafeUpdateStatus\"");
    // drafts, revoked, superseded and unpublished rows are never counted
    expect(projection).not.toMatch(/status='DRAFT'/);
    expect(projection).not.toMatch(/status='REVOKED'/);
    expect(projection).not.toMatch(/status='SUPERSEDED'/);
    expect(projection).not.toMatch(/status='READY_FOR_APPROVAL'/);
  });

  it('scopes every category to the requested client and its authorized cases', () => {
    const clientScopedFilters = projection.match(/p\."clientId"=\$1 AND p\."caseId"=ANY\(\$2::text\[\]\)/g) || [];
    expect(clientScopedFilters.length).toBe(2);
    expect(projection).toContain('WHERE a."clientId"=$1 AND a."caseId"=ANY($2::text[])');
    expect(projection).toContain('WHERE u."clientId"=$1 AND u."caseId"=ANY($2::text[])');
    // internal documents are never joined in; only publication projections are read
    expect(projection).not.toMatch(/JOIN documents\b/);
    expect(projection).not.toMatch(/document_versions/);
  });

  it('is a read-only projection over canonical tables', () => {
    expect(projection).not.toMatch(/INSERT INTO|UPDATE |DELETE FROM|exec\(/);
    for (const table of ['client_matter_publications', 'client_document_publications', 'client_action_requests', 'client_safe_updates']) {
      expect(projection).toContain(table);
    }
    // no duplicate publication/membership model introduced
    expect(projection).not.toMatch(/CREATE TABLE|new (ClientPortalWorkspace|ClientMatterPublication)/);
  });

  it('reuses the canonical internal client authorization and never duplicates the ACL', () => {
    expect(service).toContain("import { assertClientReadAccess, internalCaseScope } from '../client-interaction/base'");
    expect(projection).toContain('assertClientReadAccess(actor, clientId');
    expect(projection).toContain('internalCaseScope(actor');
    // the hand-rolled ACL must be gone
    expect(projection).not.toMatch(/case_collaborators/);
    expect(projection).not.toMatch(/FROM users\b/);
    expect(projection).not.toMatch(/\[['"]ADMIN['"], *['"]PARTNER['"]\]/);
  });

  it('fails closed: client metadata is only produced after canonical client read access', () => {
    const authIndex = projection.indexOf('assertClientReadAccess(actor, clientId');
    const metadataIndex = projection.indexOf('clientName: client.name');
    expect(authIndex).toBeGreaterThan(-1);
    expect(metadataIndex).toBeGreaterThan(-1);
    // no clientName/counts payload may be constructed before the canonical gate
    expect(authIndex).toBeLessThan(metadataIndex);
    // scope resolution is derived from the same canonical helper, not a local list
    expect(projection.indexOf('internalCaseScope(actor')).toBeLessThan(metadataIndex);
  });

  it('preserves the exact-version document publication contract', () => {
    // The projection never touches the publication transition/fingerprint logic.
    expect(service).toContain('SOURCE_FINGERPRINT_CHANGED');
    expect(service).toContain('APPROVED_REVIEW_REQUIRED');
    expect(service).toContain("'documentVersionId'");
  });

  it('resolves the canonical membership inviter in the workspace read model only', () => {
    const workspaceService = read('Backend/src/modules/client-workspace/workspaceService.ts');
    expect(workspaceService).toContain('invitedByName');
    expect(workspaceService).toContain('membership.invitedById');
    // additive read model: no schema/membership lifecycle rewrite
    expect(workspaceService).not.toMatch(/clientPortalWorkspaceMembership\.create\(/);
  });
});
