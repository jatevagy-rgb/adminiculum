/**
 * Client Portal V1 service stubs — disabled-only, fail-closed.
 *
 * These stubs establish the future service boundary described in
 * docs/client-portal-backend-service-stubs-design.md WITHOUT implementing any
 * live behavior:
 *
 *   - every function fails closed immediately with a content-free 501 error;
 *   - none imports the Prisma client, and none reaches the database;
 *   - none imports internal case/document/task services or their DTOs;
 *   - none returns an internal DTO — return types are the portal-local DTOs;
 *   - none is imported or invoked by `routes.ts` (routes stay 401/501).
 *
 * The typed signatures exist so a future, separately-approved package can fill
 * in grant-scoped, mapper-backed implementations behind the runtime-ready gate.
 */

import type {
  PortalMeDto,
  PortalMatterListItemDto,
  PortalMatterDetailDto,
  PortalDocumentListItemDto,
  PortalDocumentDetailDto,
  PortalTaskDto,
  PortalUploadRequestDto,
  PortalMessageThreadDto,
} from './types';

// ---------------------------------------------------------------------------
// Fail-closed error. Content-free by construction: it carries only the fixed
// code/status/message and an optional operation name — never user data.
// ---------------------------------------------------------------------------

export const CLIENT_PORTAL_SERVICE_NOT_IMPLEMENTED =
  'CLIENT_PORTAL_SERVICE_NOT_IMPLEMENTED' as const;

export class ClientPortalServiceDisabledError extends Error {
  readonly code = CLIENT_PORTAL_SERVICE_NOT_IMPLEMENTED;
  readonly status = 501;
  readonly operation?: string;

  constructor(operation?: string) {
    super('Client Portal service is not implemented.');
    this.name = 'ClientPortalServiceDisabledError';
    this.operation = operation;
  }
}

/** Every service stub calls this immediately — the boundary fails closed. */
export function throwClientPortalServiceDisabled(operation: string): never {
  throw new ClientPortalServiceDisabledError(operation);
}

// ---------------------------------------------------------------------------
// Local, explicit, safe service input types. These are portal-local — never
// internal models. References are conceptual external-safe handles only.
// ---------------------------------------------------------------------------

export interface PortalServiceContext {
  portalUserRef: string;
  actorRef?: string;
}

export interface PortalMatterRequest extends PortalServiceContext {
  matterRef: string;
}

export interface PortalDocumentRequest extends PortalServiceContext {
  documentRef: string;
}

export interface PortalTaskRequest extends PortalServiceContext {
  taskRef: string;
}

export interface PortalUploadRequestRequest extends PortalServiceContext {
  uploadRequestRef: string;
}

// ---------------------------------------------------------------------------
// Service stubs. All fail closed. None touches Prisma, mappers, internal
// services, real data, or document content.
// ---------------------------------------------------------------------------

export async function getPortalMe(_context: PortalServiceContext): Promise<PortalMeDto> {
  return throwClientPortalServiceDisabled('getPortalMe');
}

export async function listPortalMatters(
  _context: PortalServiceContext
): Promise<PortalMatterListItemDto[]> {
  return throwClientPortalServiceDisabled('listPortalMatters');
}

export async function getPortalMatterDetail(
  _request: PortalMatterRequest
): Promise<PortalMatterDetailDto> {
  return throwClientPortalServiceDisabled('getPortalMatterDetail');
}

export async function listPortalMatterDocuments(
  _request: PortalMatterRequest
): Promise<PortalDocumentListItemDto[]> {
  return throwClientPortalServiceDisabled('listPortalMatterDocuments');
}

export async function getPortalDocumentDetail(
  _request: PortalDocumentRequest
): Promise<PortalDocumentDetailDto> {
  return throwClientPortalServiceDisabled('getPortalDocumentDetail');
}

export async function listPortalTasks(
  _context: PortalServiceContext
): Promise<PortalTaskDto[]> {
  return throwClientPortalServiceDisabled('listPortalTasks');
}

export async function completePortalTask(
  _request: PortalTaskRequest
): Promise<PortalTaskDto> {
  return throwClientPortalServiceDisabled('completePortalTask');
}

export async function listPortalUploadRequests(
  _context: PortalServiceContext
): Promise<PortalUploadRequestDto[]> {
  return throwClientPortalServiceDisabled('listPortalUploadRequests');
}

// Deferred stubs — present as fail-closed placeholders only. No upload,
// download, or message behavior is implemented.

export async function createPortalUploadedFile(
  _request: PortalUploadRequestRequest
): Promise<never> {
  return throwClientPortalServiceDisabled('createPortalUploadedFile');
}

export async function listPortalMessageThreads(
  _context: PortalServiceContext
): Promise<PortalMessageThreadDto[]> {
  return throwClientPortalServiceDisabled('listPortalMessageThreads');
}

export async function replyToPortalMessageThread(
  _context: PortalServiceContext
): Promise<PortalMessageThreadDto> {
  return throwClientPortalServiceDisabled('replyToPortalMessageThread');
}
