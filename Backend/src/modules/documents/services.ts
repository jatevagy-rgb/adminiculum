/**
 * Documents Service V2 - Integrated with Case + Timeline
 * Document management with SharePoint integration + automatic workflow
 */

import { randomUUID } from 'crypto';
import { prisma } from '../../prisma/prisma.service';
import { Prisma } from '@prisma/client';
import { driveService } from '../sharepoint';
import { hrConfidentialReadAllowed } from './authorization';
import { transitionReview, DocumentReviewWorkflowError } from './review/reviewService';
import {
  CreateDocumentInput,
  DocumentResponse,
  DocumentListItem,
  DocumentVersionDto,
  DocumentSearchItem,
  FOLDER_BY_DOCUMENT_TYPE,
  SharePointFolderType
} from './types';

const DEFAULT_FOLDER: SharePointFolderType = 'Drafts';

const SHAREPOINT_FOLDER_BY_PRISMA_FOLDER: Record<string, SharePointFolderType> = {
  DRAFTS: 'Drafts',
  REVIEW: 'Review',
  APPROVED: 'Approved',
  FINAL: 'Final',
  CLIENT_INPUT: 'ClientInput',
  INTERNAL_NOTES: 'Internal',
};

const normalizeSharePointItemId = (itemId: unknown): string | null => {
  if (typeof itemId !== 'string') return null;
  const trimmed = itemId.trim();
  return trimmed.length > 0 ? trimmed : null;
};

const isSpItemIdUniqueConflict = (error: unknown): boolean => {
  if (!(error instanceof Prisma.PrismaClientKnownRequestError) || error.code !== 'P2002') {
    return false;
  }

  const target = (error.meta as { target?: unknown } | undefined)?.target;
  if (Array.isArray(target)) {
    return target.includes('spItemId');
  }
  return typeof target === 'string' && target.includes('spItemId');
};

const isMissingDatabaseObjectError = (error: unknown): boolean => {
  return (
    error instanceof Prisma.PrismaClientKnownRequestError &&
    (error.code === 'P2021' || error.code === 'P2022')
  );
};

const isSerializationConflict = (error: unknown): boolean => {
  const metaCode = error instanceof Prisma.PrismaClientKnownRequestError
    ? String((error.meta as { code?: unknown } | undefined)?.code || '')
    : '';
  return (
    error instanceof Prisma.PrismaClientKnownRequestError &&
    (error.code === 'P2034' || error.code === 'P2028' || error.code === 'P2010' || metaCode === '40001')
  );
};

const splitFileName = (fileName: string): { base: string; extension: string } => {
  const trimmed = fileName.trim() || 'document';
  const dotIndex = trimmed.lastIndexOf('.');
  if (dotIndex <= 0) return { base: trimmed, extension: '' };
  return {
    base: trimmed.slice(0, dotIndex),
    extension: trimmed.slice(dotIndex),
  };
};

const buildVersionStorageFileName = (originalFileName: string, documentId: string, versionNumber: number): string => {
  const { base, extension } = splitFileName(originalFileName);
  const safeBase = base.replace(/[<>:"|?*\u0000-\u001F\u007F]/g, '_').replace(/\s+/g, ' ').trim() || 'document';
  return `${safeBase}.v${versionNumber}.${documentId.slice(0, 8)}${extension}`;
};

const mapDocumentVersion = (version: any): DocumentVersionDto => ({
  id: version.id,
  documentId: version.documentId,
  versionNumber: version.version,
  uploadedBy: {
    id: version.uploadedBy?.id || version.uploadedById,
    name: version.uploadedBy?.name || 'Ismeretlen felhasználó',
  },
  uploadedAt: version.createdAt,
  originalFileName: version.originalFileName || version.name || 'document',
  mimeType: version.mimeType || null,
  size: version.size ?? null,
  storageReference: version.storageReference || version.spItemId || null,
  previousVersionId: version.previousVersionId || null,
  isCurrent: Boolean(version.isCurrent),
  reviewStatus: version.reviewStatus || 'NOT_IN_REVIEW',
  publicationStatus: version.publicationStatus || 'INTERNAL_ONLY',
  uploadSource: version.uploadSource || 'LAWYER_UPLOAD',
  versionType: version.versionType || 'WORKING_COPY',
  spItemId: version.spItemId || version.storageReference || null,
  spWebUrl: version.spWebUrl || null,
});

const countOptionalDependency = async (query: Promise<number>): Promise<number> => {
  try {
    return await query;
  } catch (error) {
    if (isMissingDatabaseObjectError(error)) {
      return 0;
    }
    throw error;
  }
};

// Map document types to SpFolder enum values
const FOLDER_MAP: Record<string, string> = {
  'Contracts': 'DRAFTS',
  'Correspondence': 'DRAFTS',
  'CourtDocuments': 'DRAFTS',
  'Internal': 'INTERNAL_NOTES',
  'ClientInput': 'CLIENT_INPUT',
  'Drafts': 'DRAFTS',
  'Review': 'REVIEW',
  'Approved': 'APPROVED',
  'Final': 'FINAL',
};

// Map folder to CaseStatus
const STATUS_MAP: Record<string, string> = {
  'DRAFTS': 'DRAFT',
  'REVIEW': 'IN_REVIEW',
  'APPROVED': 'APPROVED',
  'FINAL': 'FINAL',
  'CLIENT_INPUT': 'CLIENT_INPUT',
};

export class DocumentDeleteError extends Error {
  constructor(
    public statusCode: number,
    public code: string,
    message: string,
    public reason?: string
  ) {
    super(message);
    this.name = 'DocumentDeleteError';
  }
}

export class DocumentStorageUploadError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'DocumentStorageUploadError';
  }
}

class DocumentsService {
  /**
   * Create document with SharePoint upload + TimelineEvent + Case update
   */
  async createDocument(input: CreateDocumentInput): Promise<DocumentResponse> {
      // 1. Verify case exists
      const caseData = await prisma.case.findUnique({
        where: { id: input.caseId }
      });

      if (!caseData) {
        throw new Error('Case not found');
      }

      // 2. Determine SharePoint folder
      const folderType = input.folder || FOLDER_BY_DOCUMENT_TYPE[input.documentType as keyof typeof FOLDER_BY_DOCUMENT_TYPE] || DEFAULT_FOLDER;
      const prismaFolder = (FOLDER_MAP[folderType] || 'DRAFTS') as any;

      const documentId = randomUUID();

      // 3. Upload immutable v1 to SharePoint — use caseNumber (e.g. "2024-001") not CUID for SharePoint folder path
      const sharePointCaseRef = caseData.caseNumber || input.caseId;
      const storageFileName = buildVersionStorageFileName(input.fileName, documentId, 1);
      const uploadResult = await driveService.uploadDocument({
        caseId: sharePointCaseRef,
        fileName: storageFileName,
        content: input.fileContent,
        mimeType: input.mimeType,
        folder: folderType
      });

      if (!uploadResult.success || !uploadResult.item) {
        throw new DocumentStorageUploadError(uploadResult.error || 'Document storage upload failed');
      }

      // 4. Create CaseDocument record in database
      // Fallback: original uploaded filename → stored filename → document title → generated fallback
      const uploadedFileName = input.fileName || '';
      const storedFileName = uploadResult.item?.name || '';
      const documentTitle = (input as any).title || '';
      const nameField = uploadedFileName || storedFileName || documentTitle || `Uploaded document - ${new Date().toISOString()}`;
      const sharePointItemId = normalizeSharePointItemId(uploadResult.item.id);
      const uploadSource = String(input.documentType || '') === 'CLIENT_INPUT' ? 'CLIENT_UPLOAD' : 'LAWYER_UPLOAD';
      const baseDocumentData = {
        id: documentId,
        name: nameField,
        clientId: caseData.clientId,
        category: (input.documentType as any) || 'OTHER',
        caseId: input.caseId,
        mimeType: input.mimeType,
        spItemId: sharePointItemId,
        spDriveId: '',
        spPath: uploadResult.webUrl || '',
        spWebUrl: uploadResult.webUrl || '',
        fileName: uploadedFileName || storedFileName || null,
        folder: prismaFolder,
        version: uploadResult.version || '1',
        documentType: input.documentType,
        currentVersion: 1,
        currentVersionInt: 1,
        size: input.fileContent.length,
        isLatest: true
      } as any;

      let persistedSpItemId = sharePointItemId;
      let document: any;
      try {
        document = await prisma.document.create({
          data: {
            ...baseDocumentData,
            versions: {
              create: {
                version: 1,
                name: nameField,
                originalFileName: uploadedFileName || storedFileName || null,
                mimeType: input.mimeType,
                size: input.fileContent.length,
                storageReference: sharePointItemId,
                isCurrent: true,
                reviewStatus: 'NOT_IN_REVIEW' as any,
                publicationStatus: 'INTERNAL_ONLY' as any,
                uploadSource: uploadSource as any,
                versionType: 'ORIGINAL' as any,
                spVersionLabel: uploadResult.version || '1',
                spVersionId: uploadResult.version || null,
                spItemId: sharePointItemId,
                spWebUrl: uploadResult.webUrl || null,
                uploadedById: input.createdById,
              },
            },
          },
        });
      } catch (error) {
        if (sharePointItemId && isSpItemIdUniqueConflict(error)) {
          persistedSpItemId = null;
          document = await prisma.document.create({
            data: {
              ...baseDocumentData,
              spItemId: null,
              versions: {
                create: {
                  version: 1,
                  name: nameField,
                  originalFileName: uploadedFileName || storedFileName || null,
                  mimeType: input.mimeType,
                  size: input.fileContent.length,
                  storageReference: null,
                  isCurrent: true,
                  reviewStatus: 'NOT_IN_REVIEW' as any,
                  publicationStatus: 'INTERNAL_ONLY' as any,
                  uploadSource: uploadSource as any,
                  versionType: 'ORIGINAL' as any,
                  spVersionLabel: uploadResult.version || '1',
                  spVersionId: uploadResult.version || null,
                  spItemId: null,
                  spWebUrl: uploadResult.webUrl || null,
                  uploadedById: input.createdById,
                },
              },
            },
          });
        } else {
          if (sharePointItemId) {
            await driveService.deleteDocument(sharePointItemId).catch(() => false);
          }
          throw error;
        }
      }

      // 5. Create TimelineEvent for document creation
      await prisma.timelineEvent.create({
        data: {
          caseId: input.caseId,
          userId: input.createdById,
          eventType: 'DOCUMENT_UPLOADED',
          type: 'DOCUMENT_UPLOADED' as any,
          payload: {
            documentId: document.id,
            fileName: input.fileName,
            documentType: input.documentType,
            spItemId: persistedSpItemId,
            spPath: uploadResult.webUrl,
            folder: folderType,
            version: uploadResult.version
          }
        } as any
      });

      // 6. Update Case status to DRAFT
      await prisma.case.update({
        where: { id: input.caseId },
        data: { status: 'DRAFT' as any }
      });

      return {
        id: document.id,
        caseId: document.caseId,
        fileName: document.fileName,
        documentType: document.documentType || 'OTHER',
        spItemId: document.spItemId,
        spWebUrl: document.spPath,
        version: document.version || '1',
        status: 'DRAFT',
        createdAt: document.createdAt,
        updatedAt: document.updatedAt,
        createdBy: {
          id: input.createdById,
          name: ''
        }
      };
  }

  /**
   * Get all documents for a case
   */
  async getCaseDocuments(caseId: string, userRole?: string): Promise<DocumentListItem[]> {
    const documents = await prisma.document.findMany({
      where: {
        caseId,
        // Phase 3: non-privileged users must not see HR_CONFIDENTIAL documents in lists.
        ...(userRole && !hrConfidentialReadAllowed(userRole) ? { securityClassification: { not: 'HR_CONFIDENTIAL' } } : {}),
      },
      orderBy: { createdAt: 'desc' }
    });

    return documents.map((doc: any) => ({
      id: doc.id,
      fileName: doc.fileName,
      documentType: doc.documentType || 'OTHER',
      version: doc.version || '1',
      status: doc.folder,
      spWebUrl: doc.spPath,
      createdAt: doc.createdAt,
      updatedAt: doc.updatedAt
    }));
  }

  /**
   * Permanently delete a document only after dependency checks pass.
   *
   * The current schema has no soft-delete/archive field. Deletion therefore uses
   * storage-first hard delete for SharePoint-backed files, then removes DB
   * metadata in a transaction. Privacy-sensitive file names/content are not
   * copied into the audit event.
   */
  async deleteDocument(documentId: string, userId?: string): Promise<void> {
    const document = await prisma.document.findUnique({
      where: { id: documentId },
      select: {
        id: true,
        caseId: true,
        documentType: true,
        category: true,
        folder: true,
        spItemId: true,
      },
    });

    if (!document) {
      throw new DocumentDeleteError(404, 'DOCUMENT_NOT_FOUND', 'Document not found');
    }

    const [
      anonymizedCount,
      taskCount,
      legalAnalysisCount,
      pendingSuggestionCount,
    ] = await Promise.all([
      prisma.anonymousDocument.count({ where: { sourceDocId: documentId } }),
      prisma.task.count({ where: { documentId } }),
      prisma.legalAnalysis.count({ where: { documentId, documentSourceType: 'DOCUMENT' as any } }),
      countOptionalDependency(
        prisma.documentReviewSuggestion.count({ where: { documentId, status: 'PENDING' } })
      ),
    ]);

    if (anonymizedCount > 0) {
      throw new DocumentDeleteError(
        409,
        'DOCUMENT_DELETE_CONFLICT',
        'A dokumentum nem törölhető, mert anonimizált változat kapcsolódik hozzá.',
        'ANONYMIZED_DOCUMENT_EXISTS'
      );
    }
    if (taskCount > 0) {
      throw new DocumentDeleteError(
        409,
        'DOCUMENT_DELETE_CONFLICT',
        'A dokumentum nem törölhető, mert feladat hivatkozik rá.',
        'TASK_REFERENCE_EXISTS'
      );
    }
    if (legalAnalysisCount > 0) {
      throw new DocumentDeleteError(
        409,
        'DOCUMENT_DELETE_CONFLICT',
        'A dokumentum nem törölhető, mert jogi elemzés hivatkozik rá.',
        'LEGAL_ANALYSIS_REFERENCE_EXISTS'
      );
    }
    if (pendingSuggestionCount > 0) {
      throw new DocumentDeleteError(
        409,
        'DOCUMENT_DELETE_CONFLICT',
        'A dokumentum nem törölhető, mert nyitott review-javaslat kapcsolódik hozzá.',
        'PENDING_REVIEW_SUGGESTION_EXISTS'
      );
    }

    if (document.spItemId) {
      const removedFromStorage = await driveService.deleteDocument(document.spItemId);
      if (!removedFromStorage) {
        throw new DocumentDeleteError(
          502,
          'DOCUMENT_STORAGE_DELETE_FAILED',
          'A dokumentum SharePoint-törlése nem sikerült. Az adatbázis nem módosult.',
          'STORAGE_DELETE_FAILED'
        );
      }
    }

    await prisma.$transaction(async (tx) => {
      await tx.communication.updateMany({
        where: { documentId },
        data: { documentId: null },
      });
      await tx.communicationAttachment.updateMany({
        where: { documentId },
        data: { documentId: null },
      });

      await tx.timelineEvent.create({
        data: {
          caseId: document.caseId,
          userId,
          documentId,
          eventType: 'CUSTOM',
          type: 'DOCUMENT_DELETED',
          payload: {
            documentId,
            documentType: document.documentType || document.category || null,
            folder: document.folder || null,
            hadSharePointItem: Boolean(document.spItemId),
            action: 'DOCUMENT_DELETED',
          },
          description: 'Document deleted',
        } as any,
        select: { id: true },
      });

      await tx.document.delete({
        where: { id: documentId },
        select: { id: true },
      });
    });
  }

  /**
   * Search documents by metadata (file name, type, case/client linkage)
   */
  async searchDocuments(
    query: string,
    limit: number,
    userRole: string | undefined,
    caseScope: Prisma.CaseWhereInput | null,
  ): Promise<DocumentSearchItem[]> {
    const q = query.trim();
    if (!q) {
      return [];
    }

    const safeLimit = Math.max(1, Math.min(limit, 50));

    const documents = await prisma.document.findMany({
      where: {
        ...(caseScope ? { case: caseScope } : {}),
        // Phase 3: non-privileged users must not discover HR_CONFIDENTIAL
        // documents (title/filename/existence) through search.
        ...(userRole && !hrConfidentialReadAllowed(userRole) ? { securityClassification: { not: 'HR_CONFIDENTIAL' } } : {}),
        OR: [
          { fileName: { contains: q, mode: 'insensitive' } },
          { documentType: { contains: q, mode: 'insensitive' } },
          { case: { caseNumber: { contains: q, mode: 'insensitive' } } },
          { case: { title: { contains: q, mode: 'insensitive' } } },
          { case: { client: { name: { contains: q, mode: 'insensitive' } } } },
        ],
      },
      include: {
        case: {
          select: {
            id: true,
            caseNumber: true,
            title: true,
            clientId: true,
            client: {
              select: {
                id: true,
                name: true,
              },
            },
          },
        },
      },
      orderBy: { updatedAt: 'desc' },
      take: safeLimit,
    });

    return documents.map((doc: any) => ({
      id: doc.id,
      caseId: doc.caseId,
      fileName: doc.fileName || doc.name || 'Névtelen dokumentum',
      documentType: doc.documentType || 'OTHER',
      caseNumber: doc.case?.caseNumber || '—',
      caseTitle: doc.case?.title || 'Ismeretlen ügy',
      clientId: doc.case?.clientId || '',
      clientName: doc.case?.client?.name || 'Ismeretlen ügyfél',
      updatedAt: doc.updatedAt,
      createdAt: doc.createdAt,
    }));
  }

  /**
   * Upload new version of document
   */
  async uploadNewVersion(
    documentId: string,
    fileContent: Buffer,
    userId: string,
    comment?: string,
    options?: { originalFileName?: string; mimeType?: string; reviewStatus?: string; publicationStatus?: string; uploadSource?: string; versionType?: string }
  ): Promise<DocumentResponse | null> {
    try {
      let updatedDoc: any;
      let createdVersionNumber = 1;
      let timelineCaseId = '';
      let timelineFileName: string | null = null;
      let timelinePreviousVersion: string | null = null;

      for (let attempt = 1; attempt <= 3; attempt += 1) {
        const document = await prisma.document.findUnique({
          where: { id: documentId },
          include: {
            case: { select: { caseNumber: true } },
            versions: { orderBy: { version: 'desc' }, take: 1 },
          },
        });

        if (!document) {
          throw new Error('Document not found');
        }
        timelineCaseId = document.caseId;
        timelineFileName = document.fileName || document.name || null;
        timelinePreviousVersion = document.version || null;

        const originalFileName = options?.originalFileName || document.fileName || document.name || 'document';
        const folderType = SHAREPOINT_FOLDER_BY_PRISMA_FOLDER[String(document.folder || '')] || DEFAULT_FOLDER;
        const storageFileName = buildVersionStorageFileName(originalFileName, randomUUID(), Date.now());

        const uploadResult = await driveService.uploadDocument({
          caseId: document.case?.caseNumber || document.caseId,
          fileName: storageFileName,
          content: fileContent,
          mimeType: options?.mimeType || document.mimeType || 'application/octet-stream',
          folder: folderType,
        });

        if (!uploadResult.success) {
          throw new DocumentStorageUploadError(uploadResult.error || 'Version upload failed');
        }

        const sharePointItemId = normalizeSharePointItemId(uploadResult.item?.id);
        try {
          updatedDoc = await prisma.$transaction(async (tx) => {
            await tx.$queryRaw`SELECT "id" FROM "documents" WHERE "id" = ${documentId} FOR UPDATE`;
            const latestVersion = await tx.documentVersion.findFirst({
              where: { documentId },
              orderBy: { version: 'desc' },
              select: { id: true, version: true },
            });
            const versionNumber = (latestVersion?.version || document.currentVersionInt || document.currentVersion || 1) + 1;
            createdVersionNumber = versionNumber;

            await tx.documentVersion.updateMany({
              where: { documentId },
              data: { isCurrent: false },
            });

            await tx.documentVersion.create({
              data: {
                version: versionNumber,
                name: originalFileName,
                originalFileName,
                mimeType: options?.mimeType || document.mimeType || 'application/octet-stream',
                size: fileContent.length,
                storageReference: sharePointItemId,
                isCurrent: true,
                reviewStatus: (options?.reviewStatus || 'NOT_IN_REVIEW') as any,
                publicationStatus: (options?.publicationStatus || 'INTERNAL_ONLY') as any,
                uploadSource: (options?.uploadSource || 'LAWYER_UPLOAD') as any,
                versionType: (options?.versionType || 'WORKING_COPY') as any,
                spVersionLabel: uploadResult.version || String(versionNumber),
                spVersionId: uploadResult.version || null,
                spItemId: sharePointItemId,
                spWebUrl: uploadResult.webUrl || null,
                uploadedById: userId,
                documentId,
                previousVersionId: latestVersion?.id || null,
              },
            });

            return tx.document.update({
              where: { id: documentId },
              data: {
                version: String(versionNumber),
                currentVersion: versionNumber,
                currentVersionInt: versionNumber,
                spItemId: sharePointItemId,
                spPath: uploadResult.webUrl || document.spPath,
                spWebUrl: uploadResult.webUrl || document.spWebUrl,
                fileName: originalFileName,
                mimeType: options?.mimeType || document.mimeType || 'application/octet-stream',
                size: fileContent.length,
                updatedAt: new Date(),
              },
            });
          }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
          break;
        } catch (error) {
          if (sharePointItemId) {
            await driveService.deleteDocument(sharePointItemId).catch(() => false);
          }
          if (attempt < 3 && isSerializationConflict(error)) {
            continue;
          }
          throw error;
        }
      }

      // Create TimelineEvent for version
      await prisma.timelineEvent.create({
        data: {
          caseId: timelineCaseId,
          userId: userId,
          eventType: 'DOCUMENT_VERSION_CREATED',
          type: 'DOCUMENT_VERSION_CREATED' as any,
          payload: {
            documentId,
            fileName: timelineFileName,
            previousVersion: timelinePreviousVersion,
            newVersion: createdVersionNumber,
            comment
          }
        } as any
      }).catch(() => undefined);

      return {
        id: updatedDoc.id,
        caseId: updatedDoc.caseId,
        fileName: updatedDoc.fileName,
        documentType: updatedDoc.documentType || 'OTHER',
        spItemId: updatedDoc.spItemId,
        spWebUrl: updatedDoc.spPath,
        version: updatedDoc.version || '1',
        status: 'DRAFT',
        createdAt: updatedDoc.createdAt,
        updatedAt: updatedDoc.updatedAt,
        createdBy: {
          id: userId,
          name: ''
        }
      };
    } catch (error) {
      console.error(
        'Error uploading new version:',
        error instanceof Error ? error.message : error
      );
      if (error instanceof DocumentStorageUploadError) {
        throw error;
      }
      return null;
    }
  }

  async listDocumentVersions(documentId: string): Promise<DocumentVersionDto[]> {
    const versions = await prisma.documentVersion.findMany({
      where: { documentId },
      include: { uploadedBy: { select: { id: true, name: true } } },
      orderBy: { version: 'desc' },
    });
    return versions.map(mapDocumentVersion);
  }

  async getDocumentVersion(documentId: string, versionId: string): Promise<DocumentVersionDto | null> {
    const version = await prisma.documentVersion.findFirst({
      where: { id: versionId, documentId },
      include: { uploadedBy: { select: { id: true, name: true } } },
    });
    return version ? mapDocumentVersion(version) : null;
  }

  async promoteCurrentVersion(documentId: string, versionId: string, userId: string): Promise<DocumentVersionDto | null> {
    const version = await prisma.documentVersion.findFirst({
      where: { id: versionId, documentId },
      include: {
        uploadedBy: { select: { id: true, name: true } },
        document: { select: { caseId: true, spPath: true, spWebUrl: true, spItemId: true, mimeType: true, size: true } },
      },
    });

    if (!version) return null;

    const updated = await prisma.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT "id" FROM "documents" WHERE "id" = ${documentId} FOR UPDATE`;
      await tx.documentVersion.updateMany({
        where: { documentId },
        data: { isCurrent: false },
      });
      const selected = await tx.documentVersion.update({
        where: { id: versionId },
        data: { isCurrent: true },
        include: { uploadedBy: { select: { id: true, name: true } } },
      });
      await tx.document.update({
        where: { id: documentId },
        data: {
          version: String(selected.version),
          currentVersion: selected.version,
          currentVersionInt: selected.version,
          spItemId: selected.spItemId || selected.storageReference || version.document.spItemId,
          spPath: selected.spWebUrl || version.document.spPath,
          spWebUrl: selected.spWebUrl || version.document.spWebUrl,
          fileName: selected.originalFileName || selected.name,
          mimeType: selected.mimeType || version.document.mimeType,
          size: selected.size ?? version.document.size,
          updatedAt: new Date(),
        },
      });
      return selected;
    }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });

    await prisma.timelineEvent.create({
      data: {
        caseId: version.document.caseId,
        userId,
        eventType: 'DOCUMENT_VERSION_CURRENT_CHANGED',
        type: 'DOCUMENT_VERSION_CURRENT_CHANGED' as any,
        payload: {
          documentId,
          documentVersionId: versionId,
          versionNumber: updated.version,
        },
      } as any,
    }).catch(() => undefined);

    return mapDocumentVersion(updated);
  }

  async downloadDocumentVersion(documentId: string, versionId: string): Promise<{
    version: DocumentVersionDto;
    content: Buffer;
  } | { error: string; code: string; status: number } | null> {
    const version = await prisma.documentVersion.findFirst({
      where: { id: versionId, documentId },
      include: { uploadedBy: { select: { id: true, name: true } } },
    });

    if (!version) return null;
    const storageId = version.spItemId || version.storageReference;
    if (!storageId) {
      return { status: 400, code: 'NO_VERSION_STORAGE_REFERENCE', error: 'Document version has no storage reference.' };
    }

    const downloadResult = await driveService.downloadDocumentResult(storageId);
    if (downloadResult.success === false) {
      return {
        status: downloadResult.status || (downloadResult.code === 'SHAREPOINT_FILE_NOT_FOUND' ? 404 : 502),
        code: downloadResult.code,
        error: downloadResult.error,
      };
    }

    return {
      version: mapDocumentVersion(version),
      content: downloadResult.content,
    };
  }

  /**
   * Move document to review folder - updates Case status to IN_REVIEW
   */
  async submitForReview(documentId: string, userId: string): Promise<boolean> {
    try {
      const document = await prisma.document.findUnique({
        where: { id: documentId }
      });

      if (!document) {
        throw new Error('Document not found');
      }
      if (!document.spItemId) {
        throw new Error('SharePoint item ID is missing for this document');
      }

      // Update document folder to REVIEW
      await prisma.document.update({
        where: { id: documentId },
        data: { folder: 'REVIEW' as any }
      });

      // Check out document in SharePoint
      await driveService.checkoutDocument(document.spItemId, userId);

      // Create TimelineEvent
      await prisma.timelineEvent.create({
        data: {
          caseId: document.caseId,
          userId: userId,
          eventType: 'SENT_TO_REVIEW',
          type: 'SENT_TO_REVIEW' as any,
          payload: {
            documentId,
            fileName: document.fileName,
            folder: 'Review'
          }
        } as any
      });

      // Update Case status to IN_REVIEW
      await prisma.case.update({
        where: { id: document.caseId },
        data: { status: 'IN_REVIEW' as any }
      });

      return true;
    } catch (error) {
      console.error('Error submitting for review:', error);
      return false;
    }
  }

  /**
   * Approve document - moves to APPROVED folder, updates Case status to APPROVED
   */
  async approveDocument(
    documentId: string,
    userId: string,
    comment?: string,
    role?: string,
    db: Prisma.TransactionClient | typeof prisma = prisma
  ): Promise<boolean> {
    try {
      const document = await db.document.findUnique({
        where: { id: documentId }
      });

      if (!document) {
        throw new Error('Document not found');
      }
      if (!document.spItemId) {
        throw new Error('SharePoint item ID is missing for this document');
      }

      // Delegate the review-state decision to the canonical DocumentReview state
      // machine FIRST. The legacy route remains a compatibility entry point but
      // must never bypass evaluateTransition. If the canonical transition fails
      // (invalid source state, unresolved blocking points, version mismatch,
      // unauthorized actor, revision mismatch) the approval does NOT proceed and
      // no legacy side effect is executed.
      const activeReview = await db.documentReview.findFirst({
        where: {
          documentId,
          status: { in: ['DRAFT', 'ASSIGNED', 'IN_REVIEW', 'CHANGES_REQUESTED', 'RESUBMITTED', 'READY_FOR_REVIEW'] as any },
        },
        include: { currentRound: true },
      });
      if (activeReview) {
        const versionId = activeReview.currentRound?.reviewVersionId || activeReview.documentVersionId;
        await transitionReview(
          activeReview.id,
          'APPROVE',
          { userId, role },
          { versionId, expectedRevision: activeReview.revision, safeRationale: comment },
          db as any,
        );
      }

      // Only after the canonical transition succeeds do the legacy side effects run.
      // Update document folder to APPROVED
      await db.document.update({
        where: { id: documentId },
        data: { folder: 'APPROVED' as any }
      });

      // Check in document in SharePoint
      await driveService.checkinDocument(document.spItemId, userId, comment || 'Document approved');

      // Create TimelineEvent
      await db.timelineEvent.create({
        data: {
          caseId: document.caseId,
          userId: userId,
          eventType: 'CONTRACT_APPROVED',
          type: 'CONTRACT_APPROVED' as any,
          payload: {
            documentId,
            fileName: document.fileName,
            comment
          }
        } as any
      });

      // Update Case status to APPROVED
      await db.case.update({
        where: { id: document.caseId },
        data: { status: 'APPROVED' as any }
      });

      return true;
    } catch (error) {
      // Canonical transition failures must propagate so invalid approvals are
      // surfaced (with the transition engine's status/code), not swallowed.
      if (error instanceof DocumentReviewWorkflowError) throw error;
      console.error('Error approving document:', error);
      return false;
    }
  }

  /**
   * Reject document - moves back to DRAFTS folder, updates Case status
   */
  async rejectDocument(
    documentId: string,
    userId: string,
    reason: string,
    role?: string,
    db: Prisma.TransactionClient | typeof prisma = prisma
  ): Promise<boolean> {
    try {
      const document = await db.document.findUnique({
        where: { id: documentId }
      });

      if (!document) {
        throw new Error('Document not found');
      }

      // Delegate the review-state decision to the canonical DocumentReview state
      // machine FIRST. The legacy route remains a compatibility entry point but
      // must never bypass evaluateTransition. If the canonical transition fails
      // (invalid source state, no open points/rationale, unauthorized actor,
      // revision mismatch) the rejection does NOT proceed and no legacy side
      // effect is executed.
      const activeReview = await db.documentReview.findFirst({
        where: {
          documentId,
          status: { in: ['DRAFT', 'ASSIGNED', 'IN_REVIEW', 'CHANGES_REQUESTED', 'RESUBMITTED', 'READY_FOR_REVIEW'] as any },
        },
        include: { currentRound: true },
      });
      if (activeReview) {
        await transitionReview(
          activeReview.id,
          'REQUEST_CHANGES',
          { userId, role },
          { expectedRevision: activeReview.revision, safeRationale: reason },
          db as any,
        );
      }

      // Only after the canonical transition succeeds do the legacy side effects run.
      // Update document folder back to DRAFTS
      await db.document.update({
        where: { id: documentId },
        data: { folder: 'DRAFTS' as any }
      });

      // Create TimelineEvent
      await db.timelineEvent.create({
        data: {
          caseId: document.caseId,
          userId: userId,
          eventType: 'CONTRACT_REJECTED',
          type: 'CONTRACT_REJECTED' as any,
          payload: {
            documentId,
            fileName: document.fileName,
            reason
          }
        } as any
      });

      // Update Case status to DRAFT (back to drafting)
      await db.case.update({
        where: { id: document.caseId },
        data: { status: 'DRAFT' as any }
      });

      return true;
    } catch (error) {
      // Canonical transition failures must propagate so invalid rejections are
      // surfaced (with the transition engine's status/code), not swallowed.
      if (error instanceof DocumentReviewWorkflowError) throw error;
      console.error('Error rejecting document:', error);
      return false;
    }
  }

  /**
   * Get document by ID
   */
  async getDocumentById(documentId: string): Promise<any | null> {
    const document = await prisma.document.findUnique({
      where: { id: documentId },
      select: {
        id: true,
        caseId: true,
        fileName: true,
        documentType: true,
        spItemId: true,
        spPath: true,
        version: true,
        folder: true,
        isLatest: true,
        createdAt: true,
        updatedAt: true,
      },
    });

    if (!document) return null;

    return {
      id: document.id,
      caseId: document.caseId,
      fileName: document.fileName,
      documentType: document.documentType,
      spItemId: document.spItemId,
      spWebUrl: document.spPath,
      version: document.version,
      folder: document.folder,
      isLatest: document.isLatest,
      createdAt: document.createdAt,
      updatedAt: document.updatedAt
    };
  }
}

export default new DocumentsService();
