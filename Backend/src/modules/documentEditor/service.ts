import { Request } from 'express';
import { prisma } from '../../prisma/prisma.service';
import { userCanManageCase } from '../cases/authorization';

export type DocumentEditorPersistenceMode = 'DEDICATED_EDITOR' | 'FILE_BACKED_VERSION' | 'EXPORT_ONLY';

export interface DocumentEditorDto {
  document: {
    id: string;
    caseId: string;
    name: string;
    category: string;
    documentType?: string | null;
    currentVersion?: number | null;
    updatedAt?: string | null;
  };
  persistence: {
    mode: DocumentEditorPersistenceMode;
    serverSaved: boolean;
    savedAt?: string | null;
    versionToken?: string | null;
    contentAvailable: boolean;
  };
  content: null;
  review: {
    status?: string | null;
    relatedTaskId?: string | null;
  };
  capabilities: {
    canView: boolean;
    canEdit: boolean;
    canSave: boolean;
    canSaveNewVersion: boolean;
    canListVersions: boolean;
    canOpenVersion: boolean;
    canRestoreVersion: boolean;
    canSubmitForReview: boolean;
    canApprove: boolean;
    canReturnForCorrection: boolean;
    canCompare: boolean;
    canComment: boolean;
    canExportHtml: boolean;
    canExportText: boolean;
    canPrint: boolean;
    canExportDocx: boolean;
  };
  availability: {
    serverPersistence: boolean;
    autosave: boolean;
    contentVersions: boolean;
    restore: boolean;
    comments: boolean;
    anchoredComments: false;
    docxImport: false;
    docxExport: false;
    liveTrackChanges: false;
  };
}

function dateToIso(value: Date | string | null | undefined): string | null {
  if (!value) return null;
  return value instanceof Date ? value.toISOString() : value;
}

export async function getDocumentEditorMetadata(req: Request, documentId: string): Promise<DocumentEditorDto | null> {
  const document = await prisma.document.findUnique({
    where: { id: documentId },
    select: {
      id: true,
      caseId: true,
      name: true,
      fileName: true,
      category: true,
      documentType: true,
      currentVersion: true,
      folder: true,
      updatedAt: true,
    },
  });

  if (!document) return null;

  const manageAccess = await userCanManageCase(req, document.caseId);
  if (manageAccess === null) return null;
  const canEdit = Boolean(manageAccess);

  return {
    document: {
      id: document.id,
      caseId: document.caseId,
      name: document.fileName || document.name,
      category: String(document.category),
      documentType: document.documentType,
      currentVersion: document.currentVersion ?? null,
      updatedAt: dateToIso(document.updatedAt),
    },
    persistence: {
      mode: 'EXPORT_ONLY',
      serverSaved: false,
      savedAt: null,
      versionToken: null,
      contentAvailable: false,
    },
    content: null,
    review: {
      status: document.folder || null,
      relatedTaskId: null,
    },
    capabilities: {
      canView: true,
      canEdit,
      canSave: false,
      canSaveNewVersion: false,
      canListVersions: false,
      canOpenVersion: false,
      canRestoreVersion: false,
      canSubmitForReview: false,
      canApprove: false,
      canReturnForCorrection: false,
      canCompare: true,
      canComment: true,
      canExportHtml: true,
      canExportText: true,
      canPrint: true,
      canExportDocx: false,
    },
    availability: {
      serverPersistence: false,
      autosave: false,
      contentVersions: false,
      restore: false,
      comments: true,
      anchoredComments: false,
      docxImport: false,
      docxExport: false,
      liveTrackChanges: false,
    },
  };
}
