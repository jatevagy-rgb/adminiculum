export const CLIENT_PORTAL_FEATURE = 'CLIENT_PORTAL' as const;
export const CLIENT_PORTAL_NOT_ENABLED_REASON = 'CLIENT_PORTAL_NOT_ENABLED' as const;

export const CLIENT_PORTAL_ENABLE_FLAG = 'ENABLE_CLIENT_PORTAL' as const;
export const CLIENT_PORTAL_OWNERSHIP_MODEL_FLAG = 'ENABLE_CLIENT_PORTAL_OWNERSHIP_MODEL' as const;
export const CLIENT_PORTAL_RUNTIME_READY_FLAG = 'ENABLE_CLIENT_PORTAL_RUNTIME_READY' as const;

export type ClientPortalFeature = typeof CLIENT_PORTAL_FEATURE;
export type ClientPortalUnavailableReason = typeof CLIENT_PORTAL_NOT_ENABLED_REASON;

// ---------------------------------------------------------------------------
// Client Portal V1 DTOs — backend-local, explicit allow-list, TYPE-ONLY.
//
// These shapes are aligned with docs/client-portal-v1-data-contract-design.md.
// They are a type/mapper-boundary foundation only: they are NOT wired into any
// live route while the portal is disabled/quarantined, and they exist so a
// future, separately-approved package has an explicit external-safe contract.
//
// Hard rules for these DTOs (enforced by review + tests):
//   - never reuse internal Case/Document/Task/Communication DTOs or Prisma models;
//   - never carry raw document text, `documents.workspaceText`, extracted/OCR text,
//     content previews, storage/SharePoint/blob paths, internal notes, review
//     comments, workload records, collaborators, AI prompt/analysis internals,
//     audit logs, or admin/ops data;
//   - expose external-safe reference ids only (never internal DB ids without a
//     separate review).
// ---------------------------------------------------------------------------

export interface PortalMeDto {
  /** Reviewed external-safe reference — never the internal `User.id`. */
  portalUserRef: string;
  displayName: string;
  email: string;
  linkedClientDisplayNames: string[];
  availableMatterCount: number;
  canViewDocuments: boolean;
  canUploadFiles: boolean;
  canCompleteRequests: boolean;
}

export interface PortalMatterListItemDto {
  /** External-safe matter reference — never the internal `Case.id`. */
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

export interface PortalMatterDetailDto {
  matterRef: string;
  displayName: string;
  clientFacingStatus: string;
  clientFacingSummary: string;
  responsibleLawyerDisplayName: string | null;
  /** Only deliberately-published, client-visible update lines. */
  clientVisibleUpdates: string[];
  nextClientAction: string | null;
  nextClientDeadline: string | null;
  sharedDocumentCount: number;
  openUploadRequestCount: number;
}

export interface PortalDocumentListItemDto {
  /** External-safe document reference — never the internal `Document.id`. */
  documentRef: string;
  matterRef: string;
  displayName: string;
  documentType: string;
  sharedAt: string;
  sharedByDisplayName: string | null;
  downloadAvailable: boolean;
  clientActionRequired: boolean;
}

export interface PortalDocumentDetailDto {
  documentRef: string;
  matterRef: string;
  displayName: string;
  documentType: string;
  sharedAt: string;
  sharedByDisplayName: string | null;
  downloadAvailable: boolean;
  clientActionRequired: boolean;
  clientFacingDescription: string | null;
  /** V1 shares metadata only; scoped download is a separate future design. */
  accessMode: 'metadata-only';
}

export interface PortalTaskDto {
  /** External-safe task reference — never the internal `Task.id`. */
  taskRef: string;
  matterRef: string;
  title: string;
  clientFacingDescription: string;
  dueDate: string | null;
  status: string;
  actionType: string;
  /** Only set when the related document is itself explicitly shared. */
  relatedDocumentRef: string | null;
  completedAt: string | null;
}

export interface PortalUploadRequestDto {
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

/**
 * Deferred — message visibility is out of V1 scope. Present as an explicit
 * placeholder only; no mapper or route consumes it.
 */
export interface PortalMessageThreadDto {
  readonly status: 'deferred';
}
