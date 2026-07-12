import fs from 'fs';
import path from 'path';
import {
  toPortalMeDto,
  toPortalMatterListItemDto,
  toPortalMatterDetailDto,
  toPortalDocumentListItemDto,
  toPortalDocumentDetailDto,
  toPortalTaskDto,
  toPortalUploadRequestDto,
} from '../src/modules/client-portal/mappers';

// Synthetic placeholder only — never real data. Must never survive a mapper.
const WORKSPACE_TEXT_MARKER = 'SYNTHETIC_WORKSPACE_TEXT_DO_NOT_LOG';

// Forbidden fields that a careless future caller might leave on a source object.
// The explicit allow-list mappers must drop all of these.
const FORBIDDEN_FIELDS = {
  workspaceText: WORKSPACE_TEXT_MARKER,
  rawText: WORKSPACE_TEXT_MARKER,
  extractedText: WORKSPACE_TEXT_MARKER,
  internalNote: 'lawyer strategy note',
  strategy: 'litigation theory',
  workload: 42,
  collaborator: 'internal-user-9',
  collaborators: ['internal-user-9'],
  storagePath: '/var/blob/secret',
  sharePointPath: 'sites/internal/secret',
  blobKey: 'blob-123',
  auditLog: ['event'],
  aiPrompt: 'prompt',
  legalAnalysis: 'analysis',
  internalId: 'internal-db-id',
};

const FORBIDDEN_KEYS = Object.keys(FORBIDDEN_FIELDS);

function assertAllowListOnly(result: Record<string, unknown>, allowedKeys: string[]): void {
  expect(Object.keys(result).sort()).toEqual([...allowedKeys].sort());
  for (const key of FORBIDDEN_KEYS) {
    expect(result).not.toHaveProperty(key);
  }
  const serialized = JSON.stringify(result);
  expect(serialized).not.toContain(WORKSPACE_TEXT_MARKER);
  expect(serialized).not.toContain('litigation theory');
  expect(serialized).not.toContain('lawyer strategy note');
  expect(serialized).not.toContain('/var/blob/secret');
}

describe('client portal V1 DTO mappers — explicit allow-list boundary', () => {
  it('toPortalMeDto returns only allow-list fields and drops forbidden ones', () => {
    const source = {
      portalUserRef: 'ext-user-1',
      displayName: 'Minta ügyfél',
      email: 'client@example.com',
      linkedClientDisplayNames: ['Szintetikus ügyfél'],
      availableMatterCount: 3,
      canViewDocuments: true,
      canUploadFiles: true,
      canCompleteRequests: false,
      ...FORBIDDEN_FIELDS,
    };
    const result = toPortalMeDto(source as any);
    assertAllowListOnly(result as any, [
      'portalUserRef',
      'displayName',
      'email',
      'linkedClientDisplayNames',
      'availableMatterCount',
      'canViewDocuments',
      'canUploadFiles',
      'canCompleteRequests',
    ]);
  });

  it('toPortalMatterListItemDto returns only allow-list fields and drops forbidden ones', () => {
    const source = {
      matterRef: 'ext-matter-1',
      displayName: 'Minta ügy',
      clientFacingStatus: 'Ügyfélre vár',
      shortDescription: 'Rövid ügyfélnek szánt leírás.',
      needsAttention: true,
      nextClientAction: 'Dokumentum feltöltése',
      nextClientDeadline: '2026-07-18',
      lastClientVisibleUpdateAt: '2026-07-10',
      responsibleLawyerDisplayName: 'Dr. Minta',
      sharedDocumentCount: 2,
      openUploadRequestCount: 1,
      ...FORBIDDEN_FIELDS,
    };
    const result = toPortalMatterListItemDto(source as any);
    assertAllowListOnly(result as any, [
      'matterRef',
      'displayName',
      'clientFacingStatus',
      'shortDescription',
      'needsAttention',
      'nextClientAction',
      'nextClientDeadline',
      'lastClientVisibleUpdateAt',
      'responsibleLawyerDisplayName',
      'sharedDocumentCount',
      'openUploadRequestCount',
    ]);
  });

  it('toPortalMatterDetailDto returns only allow-list fields and drops forbidden ones', () => {
    const source = {
      matterRef: 'ext-matter-1',
      displayName: 'Minta ügy',
      clientFacingStatus: 'Ügyfélre vár',
      clientFacingSummary: 'Ügyfélnek szánt összefoglaló.',
      responsibleLawyerDisplayName: 'Dr. Minta',
      clientVisibleUpdates: ['Publikált frissítés.'],
      nextClientAction: 'Dokumentum feltöltése',
      nextClientDeadline: '2026-07-18',
      sharedDocumentCount: 2,
      openUploadRequestCount: 1,
      ...FORBIDDEN_FIELDS,
    };
    const result = toPortalMatterDetailDto(source as any);
    assertAllowListOnly(result as any, [
      'matterRef',
      'displayName',
      'clientFacingStatus',
      'clientFacingSummary',
      'responsibleLawyerDisplayName',
      'clientVisibleUpdates',
      'nextClientAction',
      'nextClientDeadline',
      'sharedDocumentCount',
      'openUploadRequestCount',
    ]);
  });

  it('toPortalDocumentListItemDto returns only allow-list fields and drops forbidden ones', () => {
    const source = {
      documentRef: 'ext-doc-1',
      matterRef: 'ext-matter-1',
      displayName: 'Tájékoztató.pdf',
      documentType: 'Megosztott dokumentum',
      sharedAt: '2026-07-10',
      sharedByDisplayName: 'Dr. Minta',
      downloadAvailable: false,
      clientActionRequired: false,
      ...FORBIDDEN_FIELDS,
    };
    const result = toPortalDocumentListItemDto(source as any);
    assertAllowListOnly(result as any, [
      'documentRef',
      'matterRef',
      'displayName',
      'documentType',
      'sharedAt',
      'sharedByDisplayName',
      'downloadAvailable',
      'clientActionRequired',
    ]);
  });

  it('toPortalDocumentDetailDto returns only allow-list fields (metadata-only) and drops forbidden ones', () => {
    const source = {
      documentRef: 'ext-doc-1',
      matterRef: 'ext-matter-1',
      displayName: 'Tájékoztató.pdf',
      documentType: 'Megosztott dokumentum',
      sharedAt: '2026-07-10',
      sharedByDisplayName: 'Dr. Minta',
      downloadAvailable: false,
      clientActionRequired: false,
      clientFacingDescription: 'Ügyfélnek szánt leírás.',
      ...FORBIDDEN_FIELDS,
    };
    const result = toPortalDocumentDetailDto(source as any);
    expect(result.accessMode).toBe('metadata-only');
    assertAllowListOnly(result as any, [
      'documentRef',
      'matterRef',
      'displayName',
      'documentType',
      'sharedAt',
      'sharedByDisplayName',
      'downloadAvailable',
      'clientActionRequired',
      'clientFacingDescription',
      'accessMode',
    ]);
  });

  it('toPortalTaskDto returns only allow-list fields and drops forbidden ones', () => {
    const source = {
      taskRef: 'ext-task-1',
      matterRef: 'ext-matter-1',
      title: 'Hiánypótlás',
      clientFacingDescription: 'Kérjük töltse fel a hiányzó mellékletet.',
      dueDate: '2026-07-18',
      status: 'OPEN',
      actionType: 'UPLOAD',
      relatedDocumentRef: null,
      completedAt: null,
      ...FORBIDDEN_FIELDS,
    };
    const result = toPortalTaskDto(source as any);
    assertAllowListOnly(result as any, [
      'taskRef',
      'matterRef',
      'title',
      'clientFacingDescription',
      'dueDate',
      'status',
      'actionType',
      'relatedDocumentRef',
      'completedAt',
    ]);
  });

  it('toPortalUploadRequestDto returns only allow-list fields and drops forbidden ones', () => {
    const source = {
      uploadRequestRef: 'ext-upload-1',
      matterRef: 'ext-matter-1',
      title: 'Személyi másolat',
      description: 'Kérjük töltse fel a személyi igazolvány másolatát.',
      dueDate: '2026-07-18',
      allowedFileTypes: ['pdf', 'jpg'],
      maxFileSizeBytes: 10485760,
      status: 'OPEN',
      relatedTaskRef: 'ext-task-1',
      ...FORBIDDEN_FIELDS,
    };
    const result = toPortalUploadRequestDto(source as any);
    assertAllowListOnly(result as any, [
      'uploadRequestRef',
      'matterRef',
      'title',
      'description',
      'dueDate',
      'allowedFileTypes',
      'maxFileSizeBytes',
      'status',
      'relatedTaskRef',
    ]);
  });

  it('the client-portal module source contains no Prisma/DB/workspaceText access', () => {
    const dir = path.join(__dirname, '..', 'src', 'modules', 'client-portal');
    for (const file of ['mappers.ts', 'types.ts']) {
      const source = fs.readFileSync(path.join(dir, file), 'utf8');
      // No Prisma client, no DB access, no raw-text field references (comments in
      // types.ts/mappers.ts name the forbidden fields only as prose, not code, so
      // we assert on the concrete leak vectors below).
      expect(source).not.toMatch(/PrismaClient/);
      expect(source).not.toMatch(/@prisma\/client/);
      expect(source).not.toMatch(/\bprisma\./);
      expect(source).not.toMatch(/from\s+['"][^'"]*prisma[^'"]*['"]/i);
      expect(source).not.toMatch(/from\s+['"][^'"]*services['"]/i);
    }
    // The mappers must not read a `.workspaceText` property off any object.
    const mappers = fs.readFileSync(path.join(dir, 'mappers.ts'), 'utf8');
    expect(mappers).not.toMatch(/\.workspaceText/);
    // No object spread into returned DTOs (allow-list discipline).
    expect(mappers).not.toMatch(/return\s*\{[\s\S]*\.\.\./);
  });
});
