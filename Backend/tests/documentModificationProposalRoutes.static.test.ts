import fs from 'fs';
import path from 'path';

const repoRoot = path.resolve(__dirname, '..', '..');
const read = (relativePath: string) => fs.readFileSync(path.join(repoRoot, relativePath), 'utf8');

describe('Document Workspace Phase 2 modification-proposal foundation (static contracts)', () => {
  it('mounts the three new version-scoped routers', () => {
    const routes = read('Backend/src/modules/documents/routes.ts');
    expect(routes).toContain("router.use('/:documentId/versions/:versionId/proposals', modificationProposalRoutes)");
    expect(routes).toContain("router.use('/:documentId/versions/:versionId/review-comments', reviewCommentRoutes)");
    expect(routes).toContain("router.use('/:documentId/versions/:versionId/review-rail', reviewRailRoutes)");
    // The legacy annotation mount must be preserved untouched.
    expect(routes).toContain("router.use('/:documentId/versions/:versionId/annotations', annotationRoutes)");
  });

  it('keeps generic annotation authoring manage-only (regression guard)', () => {
    const annotations = read('Backend/src/modules/documents/annotations.routes.ts');
    expect(annotations).toContain("router.post('/', requireManage");
    expect(annotations).toContain("router.patch('/:annotationId', requireManage");
    expect(annotations).toContain("router.post('/:annotationId/resolve', requireManage");
    expect(annotations).toContain("router.post('/:annotationId/comments', requireManage");
    expect(annotations).toContain('userCanReadCase');
    expect(annotations).toContain('userCanManageCase');
  });

  it('exposes the proposal lifecycle routes', () => {
    const proposals = read('Backend/src/modules/documents/modificationProposals.routes.ts');
    expect(proposals).toContain('requireWorkforceUser');
    expect(proposals).toContain('requireVersionReadAccess');
    expect(proposals).toContain("router.post('/',");
    expect(proposals).toContain("router.post('/:proposalId/accept',");
    expect(proposals).toContain("router.post('/:proposalId/reject',");
    expect(proposals).toContain("router.delete('/:proposalId',");
  });

  it('exposes narrow review-comment authoring + replies and the rail', () => {
    const comments = read('Backend/src/modules/documents/reviewComments.routes.ts');
    expect(comments).toContain('requireWorkforceUser');
    expect(comments).toContain('requireVersionReadAccess');
    expect(comments).toContain("router.post('/',");
    expect(comments).toContain("router.post('/:annotationId/replies',");

    const rail = read('Backend/src/modules/documents/reviewRail.routes.ts');
    expect(rail).toContain('requireVersionReadAccess');
    expect(rail).toContain("router.get('/',");
  });

  it('fixes REVIEW_COMMENT / TEXT_RANGE in the reader-comment service', () => {
    const service = read('Backend/src/modules/documents/reviewComments.service.ts');
    expect(service).toContain("annotationType: 'REVIEW_COMMENT'");
    expect(service).toContain("anchorType: 'TEXT_RANGE'");
  });

  it('preserves the HR_CONFIDENTIAL boundary and case read authorization', () => {
    const access = read('Backend/src/modules/documents/versionAccess.ts');
    expect(access).toContain('HR_CONFIDENTIAL');
    expect(access).toContain('hrConfidentialReadAllowed');
    expect(access).toContain('userCanReadCase');
  });

  it('serializes every lifecycle operation on the DocumentVersion row and retries P2034', () => {
    const service = read('Backend/src/modules/documents/modificationProposals.service.ts');
    expect(service).toContain('FROM "document_versions" WHERE "id" = ${versionId} FOR UPDATE');
    expect(service).toContain('Serializable');
    expect(service).toContain('P2034');
    expect(service).toContain('DOCUMENT_READY_FOR_CORRECTION');
    expect(service).toContain("eventType: 'CUSTOM'");
    expect(service).toContain("title: 'Dokumentum kész a javításra'");
    expect(service).toContain('proposalDecisionComplete');
  });

  it('ships an additive migration with guarded enums, tables, FKs and no destructive statements', () => {
    const migration = read(
      'Backend/prisma/migrations/20260925100000_add_modification_proposals/migration.sql'
    );
    expect(migration).toContain('CREATE TABLE IF NOT EXISTS "document_modification_proposals"');
    expect(migration).toContain('CREATE TABLE IF NOT EXISTS "document_modification_proposal_events"');
    expect(migration).toContain('DocumentModificationProposalStatus');
    expect(migration).toContain('DocumentModificationProposalEventType');
    expect(migration).toContain('document_modification_proposals_range_check');
    expect(migration).toContain('FOREIGN KEY ("documentId", "documentVersionId")');
    expect(migration).toContain('REFERENCES "document_versions"("documentId", "id")');
    expect(migration).toContain('information_schema.columns');
    expect(migration).toContain('"correctionNotifiedAt"');
    // The idempotency unique index must be ordinary (PostgreSQL allows many NULLs),
    // not a partial duplicate.
    expect(migration).toContain(
      'CREATE UNIQUE INDEX IF NOT EXISTS "document_modification_proposals_documentVersionId_idempotencyKey_key"'
    );
    expect(migration).not.toMatch(
      /document_modification_proposals_documentVersionId_idempotencyKey_key[\s\S]*WHERE "idempotencyKey" IS NOT NULL/
    );
    expect(migration).not.toContain('DROP TABLE');
    expect(migration).not.toContain('DROP COLUMN');
    expect(migration).not.toMatch(/UPDATE "document/);
    expect(migration).not.toMatch(/UPDATE "document_versions"/);
  });
});
