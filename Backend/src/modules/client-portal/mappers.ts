/**
 * Client Portal V1 mapper boundary — disabled-safe, pure, allow-list only.
 *
 * These mappers translate LOCAL, explicit, already-sanitized source shapes into
 * Client Portal V1 DTOs. They fix the mapper boundary *shape* only:
 *
 *   - they are NOT wired into any live route — the portal stays disabled/quarantined;
 *   - they take LOCAL explicit source types, never Prisma models or internal DTOs;
 *   - they import nothing from Prisma, services, or the DB, and run no query;
 *   - they never read the documents workspaceText field, raw/extracted text, content
 *     previews, storage/SharePoint/blob paths, internal notes, review comments,
 *     workload records, collaborators, AI/analysis internals, or audit data;
 *   - they return EXPLICIT fields only — no object spread, no `...source`.
 *
 * Resolving real sources (grant-scoped queries, sanitized publication records)
 * is deferred to a future, separately-approved package. Passing a source object
 * that happens to carry extra/forbidden fields is safe: the explicit returns
 * drop everything not on the allow-list (proven by the mapper tests).
 */

import type {
  PortalMeDto,
  PortalMatterListItemDto,
  PortalMatterDetailDto,
  PortalDocumentListItemDto,
  PortalDocumentDetailDto,
  PortalTaskDto,
  PortalUploadRequestDto,
} from './types';

// Local, explicit source shapes. These are intentionally NOT Prisma models and
// NOT internal DTOs — a future package must build them from grant-scoped,
// sanitized publication records, not by spreading a database row.

export interface PortalMeSource {
  portalUserRef: string;
  displayName: string;
  email: string;
  linkedClientDisplayNames: string[];
  availableMatterCount: number;
  canViewDocuments: boolean;
  canUploadFiles: boolean;
  canCompleteRequests: boolean;
}

export function toPortalMeDto(source: PortalMeSource): PortalMeDto {
  return {
    portalUserRef: source.portalUserRef,
    displayName: source.displayName,
    email: source.email,
    linkedClientDisplayNames: source.linkedClientDisplayNames,
    availableMatterCount: source.availableMatterCount,
    canViewDocuments: source.canViewDocuments,
    canUploadFiles: source.canUploadFiles,
    canCompleteRequests: source.canCompleteRequests,
  };
}

export interface PortalMatterListItemSource {
  matterRef: string;
  displayName: string;
  clientFacingStatus: string;
  shortDescription: string;
  needsAttention: boolean;
  nextClientAction: string | null;
  nextClientDeadline: string | null;
  lastClientVisibleUpdateAt: string | null;
  responsibleLawyerDisplayName: string | null;
  sharedDocumentCount: number;
  openUploadRequestCount: number;
}

export function toPortalMatterListItemDto(
  source: PortalMatterListItemSource
): PortalMatterListItemDto {
  return {
    matterRef: source.matterRef,
    displayName: source.displayName,
    clientFacingStatus: source.clientFacingStatus,
    shortDescription: source.shortDescription,
    needsAttention: source.needsAttention,
    nextClientAction: source.nextClientAction,
    nextClientDeadline: source.nextClientDeadline,
    lastClientVisibleUpdateAt: source.lastClientVisibleUpdateAt,
    responsibleLawyerDisplayName: source.responsibleLawyerDisplayName,
    sharedDocumentCount: source.sharedDocumentCount,
    openUploadRequestCount: source.openUploadRequestCount,
  };
}

export interface PortalMatterDetailSource {
  matterRef: string;
  displayName: string;
  clientFacingStatus: string;
  clientFacingSummary: string;
  responsibleLawyerDisplayName: string | null;
  clientVisibleUpdates: string[];
  nextClientAction: string | null;
  nextClientDeadline: string | null;
  sharedDocumentCount: number;
  openUploadRequestCount: number;
}

export function toPortalMatterDetailDto(
  source: PortalMatterDetailSource
): PortalMatterDetailDto {
  return {
    matterRef: source.matterRef,
    displayName: source.displayName,
    clientFacingStatus: source.clientFacingStatus,
    clientFacingSummary: source.clientFacingSummary,
    responsibleLawyerDisplayName: source.responsibleLawyerDisplayName,
    clientVisibleUpdates: source.clientVisibleUpdates,
    nextClientAction: source.nextClientAction,
    nextClientDeadline: source.nextClientDeadline,
    sharedDocumentCount: source.sharedDocumentCount,
    openUploadRequestCount: source.openUploadRequestCount,
  };
}

export interface PortalDocumentListItemSource {
  documentRef: string;
  matterRef: string;
  displayName: string;
  documentType: string;
  sharedAt: string;
  sharedByDisplayName: string | null;
  downloadAvailable: boolean;
  clientActionRequired: boolean;
}

export function toPortalDocumentListItemDto(
  source: PortalDocumentListItemSource
): PortalDocumentListItemDto {
  return {
    documentRef: source.documentRef,
    matterRef: source.matterRef,
    displayName: source.displayName,
    documentType: source.documentType,
    sharedAt: source.sharedAt,
    sharedByDisplayName: source.sharedByDisplayName,
    downloadAvailable: source.downloadAvailable,
    clientActionRequired: source.clientActionRequired,
  };
}

export interface PortalDocumentDetailSource {
  documentRef: string;
  matterRef: string;
  displayName: string;
  documentType: string;
  sharedAt: string;
  sharedByDisplayName: string | null;
  downloadAvailable: boolean;
  clientActionRequired: boolean;
  clientFacingDescription: string | null;
}

export function toPortalDocumentDetailDto(
  source: PortalDocumentDetailSource
): PortalDocumentDetailDto {
  return {
    documentRef: source.documentRef,
    matterRef: source.matterRef,
    displayName: source.displayName,
    documentType: source.documentType,
    sharedAt: source.sharedAt,
    sharedByDisplayName: source.sharedByDisplayName,
    downloadAvailable: source.downloadAvailable,
    clientActionRequired: source.clientActionRequired,
    clientFacingDescription: source.clientFacingDescription,
    accessMode: 'metadata-only',
  };
}

export interface PortalTaskSource {
  taskRef: string;
  matterRef: string;
  title: string;
  clientFacingDescription: string;
  dueDate: string | null;
  status: string;
  actionType: string;
  relatedDocumentRef: string | null;
  completedAt: string | null;
}

export function toPortalTaskDto(source: PortalTaskSource): PortalTaskDto {
  return {
    taskRef: source.taskRef,
    matterRef: source.matterRef,
    title: source.title,
    clientFacingDescription: source.clientFacingDescription,
    dueDate: source.dueDate,
    status: source.status,
    actionType: source.actionType,
    relatedDocumentRef: source.relatedDocumentRef,
    completedAt: source.completedAt,
  };
}

export interface PortalUploadRequestSource {
  uploadRequestRef: string;
  matterRef: string;
  title: string;
  description: string;
  dueDate: string | null;
  allowedFileTypes: string[];
  maxFileSizeBytes: number | null;
  status: string;
  relatedTaskRef: string | null;
}

export function toPortalUploadRequestDto(
  source: PortalUploadRequestSource
): PortalUploadRequestDto {
  return {
    uploadRequestRef: source.uploadRequestRef,
    matterRef: source.matterRef,
    title: source.title,
    description: source.description,
    dueDate: source.dueDate,
    allowedFileTypes: source.allowedFileTypes,
    maxFileSizeBytes: source.maxFileSizeBytes,
    status: source.status,
    relatedTaskRef: source.relatedTaskRef,
  };
}
