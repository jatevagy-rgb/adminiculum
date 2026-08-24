import fs from 'fs';
import path from 'path';

const repoRoot = path.resolve(__dirname, '..', '..');
const read = (relativePath: string) => fs.readFileSync(path.join(repoRoot, relativePath), 'utf8');

describe('contract workspace document version foundation', () => {
  it('models immutable document versions as dedicated rows, not overloaded documents', () => {
    const schema = read('Backend/prisma/schema.prisma');
    const model = schema.slice(schema.indexOf('model DocumentVersion'), schema.indexOf('enum DocumentReviewWorkspaceSource'));

    expect(model).toContain('model DocumentVersion');
    expect(model).toContain('originalFileName');
    expect(model).toContain('mimeType');
    expect(model).toContain('size');
    expect(model).toContain('storageReference');
    expect(model).toContain('previousVersionId');
    expect(model).toContain('isCurrent');
    expect(model).toContain('reviewStatus');
    expect(model).toContain('publicationStatus');
    expect(model).toContain('uploadSource');
    expect(model).toContain('versionType');
    expect(model).toContain('@@unique([documentId, version])');
    expect(schema).toContain('enum DocumentVersionReviewStatus');
    expect(schema).toContain('enum DocumentVersionPublicationStatus');
    expect(schema).toContain('enum DocumentVersionUploadSource');
    expect(schema).toContain('CLIENT_UPLOAD');
    expect(schema).toContain('LAWYER_UPLOAD');
    expect(schema).toContain('EMAIL_IMPORT');
    expect(schema).toContain('CLIENT_PORTAL');
    expect(schema).toContain('enum DocumentVersionType');
    expect(schema).toContain('model DocumentReview');
    expect(schema).toContain('model ReviewSnapshot');
  });

  it('ships an additive migration with safe backfill and lineage indexes', () => {
    const migration = read('Backend/prisma/migrations/20260723143000_contract_workspace_version_foundation/migration.sql');

    expect(migration).toContain('CREATE TABLE IF NOT EXISTS "document_versions"');
    expect(migration).toContain('ALTER TABLE "document_versions" ADD COLUMN IF NOT EXISTS "previousVersionId"');
    expect(migration).toContain('ADD COLUMN IF NOT EXISTS "reviewStatus"');
    expect(migration).toContain('ADD COLUMN IF NOT EXISTS "publicationStatus"');
    expect(migration).toContain('ADD COLUMN IF NOT EXISTS "versionType"');
    expect(migration).toContain('CREATE TABLE IF NOT EXISTS "document_reviews"');
    expect(migration).toContain('CREATE TABLE IF NOT EXISTS "review_snapshots"');
    expect(migration).toContain('ALTER TABLE "document_versions" ALTER COLUMN "name" DROP NOT NULL');
    expect(migration).toContain('CREATE INDEX IF NOT EXISTS "document_versions_documentId_currentVersion_idx"');
    expect(migration).toContain('WHERE NOT EXISTS');
    expect(migration).not.toContain('DROP TABLE "documents"');
    expect(migration).not.toContain('ALTER TABLE "documents" DROP COLUMN');
  });

  it('enforces one current version and same-document previous-version lineage at the database boundary', () => {
    const migration = read('Backend/prisma/migrations/20260723143000_contract_workspace_version_foundation/migration.sql');

    expect(migration).toContain('document_versions_one_current_per_document_key');
    expect(migration).toContain('WHERE "currentVersion" = true');
    expect(migration).toContain('document_versions_same_document_previous_fkey');
    expect(migration).toContain('FOREIGN KEY ("documentId", "previousVersionId")');
    expect(migration).toContain('document_versions_not_self_previous_check');
    expect(migration).toContain('CHECK ("previousVersionId" IS NULL OR "previousVersionId" <> "id")');
  });

  it('protects immutable version identity fields from later updates', () => {
    const migration = read('Backend/prisma/migrations/20260723143000_contract_workspace_version_foundation/migration.sql');

    expect(migration).toContain('prevent_document_version_identity_update');
    expect(migration).toContain('DocumentVersion immutable identity fields cannot be updated');
    for (const field of ['"documentId"', '"version"', '"previousVersionId"', '"originalFileName"', '"storageReference"', '"spItemId"', '"uploadedById"', '"createdAt"']) {
      expect(migration).toContain(field);
    }
  });

  it('keeps preliminary review tables only with concrete minimum relationships and indexes', () => {
    const schema = read('Backend/prisma/schema.prisma');
    const migration = read('Backend/prisma/migrations/20260723143000_contract_workspace_version_foundation/migration.sql');

    expect(schema).toContain('model DocumentReview');
    expect(schema).toContain('documentVersionId String');
    expect(schema).toContain('assignedReviewerId String?');
    expect(schema).toMatch(/completedAt\s+DateTime\?/);
    expect(schema).toContain('@@unique([id, documentVersionId])');
    expect(schema).toContain('model ReviewSnapshot');
    expect(schema).toMatch(/payload\s+Json/);
    expect(migration).toContain('document_reviews_same_document_version_fkey');
    expect(migration).toContain('review_snapshots_same_review_version_fkey');
  });

  it('exposes version history, immutable upload, download and current-selection routes', () => {
    const routes = read('Backend/src/modules/documents/routes.ts');

    expect(routes).toContain("router.get('/:id/versions'");
    expect(routes).toContain("router.post('/:id/versions'");
    expect(routes).toContain("router.get('/:id/versions/:versionId'");
    expect(routes).toContain("router.get('/:id/versions/:versionId/download'");
    expect(routes).toContain("router.post('/:id/versions/:versionId/promote-current'");
    expect(routes).toContain('requireDocumentReadAccess');
    expect(routes).toContain('requireDocumentManageAccess');
  });

  it('stores new content with unique version filenames instead of SharePoint overwrite upload', () => {
    const service = read('Backend/src/modules/documents/services.ts');
    const uploadNewVersion = service.slice(service.indexOf('async uploadNewVersion'), service.indexOf('async listDocumentVersions'));

    expect(uploadNewVersion).toContain('buildVersionStorageFileName');
    expect(uploadNewVersion).toContain('putDocumentBytes');
    expect(uploadNewVersion).not.toContain('driveService.uploadNewVersion');
    expect(uploadNewVersion).toContain('previousVersionId');
  });

  it('serializes version-number assignment and current switching during upload', () => {
    const service = read('Backend/src/modules/documents/services.ts');
    const uploadNewVersion = service.slice(service.indexOf('async uploadNewVersion'), service.indexOf('async listDocumentVersions'));

    expect(uploadNewVersion).toContain('FOR UPDATE');
    expect(uploadNewVersion).toContain('TransactionIsolationLevel.Serializable');
    expect(uploadNewVersion).toContain('isSerializationConflict');
    expect(uploadNewVersion).toContain('orderBy: { version:');
    expect(uploadNewVersion).toContain('data: { isCurrent: false }');
    expect(uploadNewVersion).toContain('isCurrent: true');
    expect(uploadNewVersion).toContain('compensateFailedUpload(');
    expect(uploadNewVersion).toContain("eventType: 'DOCUMENT_VERSION_CREATED'");
    expect(uploadNewVersion).toContain(".catch(() => undefined)");
  });

  it('serializes current-version promotion on the logical document row', () => {
    const service = read('Backend/src/modules/documents/services.ts');
    const promoteCurrentVersion = service.slice(service.indexOf('async promoteCurrentVersion'), service.indexOf('async downloadDocumentVersion'));

    expect(promoteCurrentVersion).toContain('FOR UPDATE');
    expect(promoteCurrentVersion).toContain('TransactionIsolationLevel.Serializable');
    expect(promoteCurrentVersion).toContain('where: { id: versionId, documentId }');
  });

  it('validates upload source and version type enums at the route boundary', () => {
    const routes = read('Backend/src/modules/documents/routes.ts');

    expect(routes).toContain('ALLOWED_VERSION_UPLOAD_SOURCES');
    expect(routes).toContain('CLIENT_UPLOAD');
    expect(routes).toContain('LAWYER_UPLOAD');
    expect(routes).toContain('EMAIL_IMPORT');
    expect(routes).toContain('CLIENT_PORTAL');
    expect(routes).toContain('ALLOWED_VERSION_TYPES');
    expect(routes).toContain('REVIEW_DRAFT');
    expect(routes).toContain('SIGNED');
    expect(routes).toContain('INVALID_UPLOAD_SOURCE');
    expect(routes).toContain('INVALID_VERSION_TYPE');
  });

  it('downloads exact historical versions through version storage references', () => {
    const service = read('Backend/src/modules/documents/services.ts');
    const routes = read('Backend/src/modules/documents/routes.ts');
    const downloadVersion = service.slice(service.indexOf('async downloadDocumentVersion'), service.indexOf('/**\r\n   * Move document to review folder'));

    expect(downloadVersion).toContain('where: { id: versionId, documentId }');
    expect(downloadVersion).toContain('version.spItemId || version.storageReference');
    expect(downloadVersion).toContain('getDocumentStorage().get(storageId)');
    expect(routes).toContain("router.get('/:id/versions/:versionId/download'");
    expect(routes).toContain('result.version.originalFileName');
  });

  it('wires the frontend document ledger to the version foundation without editor UI', () => {
    const api = read('Frontend/src/lib/api.ts');
    const page = read('Frontend/src/app/cases/[caseId]/documents/page.tsx');

    expect(api).toContain('DocumentVersionItem');
    expect(api).toContain('reviewStatus');
    expect(api).toContain('publicationStatus');
    expect(api).toContain('versionType');
    expect(api).toContain('getDocumentVersions');
    expect(api).toContain('uploadImmutableDocumentVersion');
    expect(api).toContain('downloadDocumentVersion');
    expect(api).toContain('promoteDocumentVersion');
    expect(page).toContain('Contract Workspace');
    expect(page).toContain('Változtathatatlan verziótörténet');
    expect(page).toContain('Új verzió feltöltése');
    expect(page).toContain('Legyen aktuális');
    expect(page).not.toContain('Track changes');
  });
});
