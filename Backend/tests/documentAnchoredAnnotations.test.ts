import fs from 'fs';
import path from 'path';

const repoRoot = path.resolve(__dirname, '..', '..');
const read = (relativePath: string) => fs.readFileSync(path.join(repoRoot, relativePath), 'utf8');

describe('contract workspace anchored annotations foundation', () => {
  it('models annotations as version-scoped anchored records with comments and events', () => {
    const schema = read('Backend/prisma/schema.prisma');
    const model = schema.slice(schema.indexOf('model DocumentAnnotation'), schema.indexOf('model DocumentReview'));

    expect(model).toContain('documentId');
    expect(model).toContain('documentVersionId');
    expect(model).toContain('annotationType');
    expect(model).toContain('anchorType');
    expect(model).toContain('selectedText');
    expect(model).toContain('textPrefix');
    expect(model).toContain('textSuffix');
    expect(model).toContain('startOffset');
    expect(model).toContain('endOffset');
    expect(model).toContain('rectX');
    expect(model).toContain('rectY');
    expect(model).toContain('pointX');
    expect(model).toContain('assignedToId');
    expect(model).toContain('resolvedAt');
    expect(model).toContain('deletedAt');
    expect(model).toContain('DocumentAnnotationComment');
    expect(model).toContain('DocumentAnnotationEvent');
    expect(model).toContain('@@index([documentId, documentVersionId, status])');
  });

  it('ships an additive migration with normalized anchor constraints and no backfill', () => {
    const migration = read('Backend/prisma/migrations/20260723152000_contract_workspace_annotations/migration.sql');

    expect(migration).toContain('CREATE TABLE IF NOT EXISTS "document_annotations"');
    expect(migration).toContain('CREATE TABLE IF NOT EXISTS "document_annotation_comments"');
    expect(migration).toContain('CREATE TABLE IF NOT EXISTS "document_annotation_events"');
    expect(migration).toContain('document_annotations_text_offsets_check');
    expect(migration).toContain('document_annotations_rect_bounds_check');
    expect(migration).toContain('document_annotations_point_bounds_check');
    expect(migration).toContain('FOREIGN KEY ("documentId", "documentVersionId")');
    expect(migration).toContain('REFERENCES "document_versions"("documentId", "id")');
    expect(migration).not.toContain('UPDATE "documents"');
    expect(migration).not.toContain('UPDATE "document_versions"');
    expect(migration).not.toContain('DROP TABLE');
  });

  it('exposes nested version annotation APIs behind existing document permissions', () => {
    const routes = read('Backend/src/modules/documents/routes.ts');
    const annotationRoutes = read('Backend/src/modules/documents/annotations.routes.ts');

    expect(routes).toContain("router.use('/:documentId/versions/:versionId/annotations', annotationRoutes)");
    expect(annotationRoutes).toContain("router.get('/', requireRead");
    expect(annotationRoutes).toContain("router.post('/', requireManage");
    expect(annotationRoutes).toContain("router.patch('/:annotationId', requireManage");
    expect(annotationRoutes).toContain("router.post('/:annotationId/resolve', requireManage");
    expect(annotationRoutes).toContain("router.post('/:annotationId/reopen', requireManage");
    expect(annotationRoutes).toContain("router.delete('/:annotationId', requireManage");
    expect(annotationRoutes).toContain("router.post('/:annotationId/comments', requireManage");
    expect(annotationRoutes).toContain('userCanReadCase');
    expect(annotationRoutes).toContain('userCanManageCase');
  });

  it('keeps annotation anchors immutable after creation', () => {
    const service = read('Backend/src/modules/documents/annotations.service.ts');
    const updateData = service.slice(service.indexOf('function buildUpdateData'), service.indexOf('export async function listDocumentAnnotations'));

    for (const immutableField of [
      'selectedText',
      'textPrefix',
      'textSuffix',
      'startOffset',
      'endOffset',
      'pageIndex',
      'rect',
      'point',
      'documentVersionId',
    ]) {
      expect(updateData).not.toContain(immutableField);
    }
    expect(service).toContain('idempotencyKey');
    expect(service).toContain('SOFT_DELETED');
    expect(service).toContain('COMMENT_ADDED');
  });

  it('wires the frontend to read-only annotations without AI, diff or publication actions', () => {
    const api = read('Frontend/src/lib/api.ts');
    const page = read('Frontend/src/app/cases/[caseId]/documents/page.tsx');

    expect(api).toContain('DocumentAnnotationItem');
    expect(api).toContain('getDocumentAnnotations');
    expect(api).toContain('createDocumentAnnotation');
    expect(api).toContain('resolveDocumentAnnotation');
    expect(api).toContain('createDocumentAnnotationComment');
    expect(page).toContain('Anchored annotations');
    expect(page).toContain('Read-only review surface');
    expect(page).toContain('Nincs szerkesztés');
    // The unpublished state is now carried by a persistent badge rather than a
    // textarea placeholder, which disappeared as soon as the reviewer typed.
    // See annotationNotPublishedMarker.test.ts for the full contract.
    expect(page).toContain('NotPublishedBadge');
    expect(page).toContain('isClientExplanationDraft');
    expect(page).not.toContain('generateClientExplanation');
    expect(page).not.toContain('publishAnnotation');
    expect(page).not.toContain('diffDocumentVersions');
    expect(page).not.toContain('dangerouslySetInnerHTML');
  });
});
