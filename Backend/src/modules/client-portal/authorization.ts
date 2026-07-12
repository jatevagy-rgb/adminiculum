/**
 * Client Portal authorization stubs — fail-closed, unused, unreachable.
 *
 * These stubs establish the future principal/grant boundary described in
 * docs/client-portal-authz-stub-design-2.md WITHOUT implementing any live
 * authorization:
 *
 *   - every function fails closed immediately with a content-free error;
 *   - none imports the Prisma client or reaches the database;
 *   - none imports internal case/document/task/communication modules;
 *   - none imports the portal services or mappers;
 *   - none returns an internal DTO, and none touches document content or real data;
 *   - none is imported or invoked by `routes.ts` or `services.ts`.
 *
 * The typed signatures exist so a future, separately-approved package can fill
 * in grant-scoped checks once a portal schema and a resolved principal exist.
 * Error messages are content-free and never echo the input references.
 */

// ---------------------------------------------------------------------------
// Conceptual principal + request input types (portal-local, external-safe refs).
// ---------------------------------------------------------------------------

export interface PortalPrincipal {
  portalUserRef: string;
  externalAuthSubject: string;
  email: string;
  displayName: string;
  status: string;
  linkedClientRef?: string;
  issuedAt?: string;
  authProvider?: string;
  sessionRef?: string;
}

export interface PortalPrincipalContext {
  portalUserRef?: string;
  externalAuthSubject?: string;
  sessionRef?: string;
}

export interface PortalMatterAccessRequest {
  principal: PortalPrincipalContext;
  matterRef: string;
}

export interface PortalDocumentShareRequest {
  principal: PortalPrincipalContext;
  documentRef: string;
  matterRef?: string;
}

export interface PortalTaskAccessRequest {
  principal: PortalPrincipalContext;
  taskRef: string;
}

export interface PortalUploadRequestAccessRequest {
  principal: PortalPrincipalContext;
  uploadRequestRef: string;
}

// Deferred — message visibility is out of scope until a comms model is approved.
export interface PortalMessageAccessRequest {
  principal: PortalPrincipalContext;
  threadRef: string;
}

// ---------------------------------------------------------------------------
// Fail-closed errors. Content-free by construction: only fixed
// code/status/message plus an optional operation/reasonCode — never input data.
// ---------------------------------------------------------------------------

export const CLIENT_PORTAL_PRINCIPAL_NOT_READY =
  'CLIENT_PORTAL_PRINCIPAL_NOT_READY' as const;
export const CLIENT_PORTAL_ACCESS_DENIED = 'CLIENT_PORTAL_ACCESS_DENIED' as const;
export const CLIENT_PORTAL_AUTHORIZATION_NOT_IMPLEMENTED =
  'CLIENT_PORTAL_AUTHORIZATION_NOT_IMPLEMENTED' as const;

export class ClientPortalAuthorizationError extends Error {
  readonly code: string = CLIENT_PORTAL_AUTHORIZATION_NOT_IMPLEMENTED;
  readonly status: number = 501;
  readonly operation?: string;
  readonly reasonCode?: string;

  constructor(message: string, operation?: string, reasonCode?: string) {
    super(message);
    this.name = 'ClientPortalAuthorizationError';
    this.operation = operation;
    this.reasonCode = reasonCode;
  }
}

export class ClientPortalPrincipalNotReadyError extends ClientPortalAuthorizationError {
  override readonly code = CLIENT_PORTAL_PRINCIPAL_NOT_READY;
  override readonly status = 501;

  constructor(operation?: string) {
    super('Client Portal principal is not available.', operation, CLIENT_PORTAL_PRINCIPAL_NOT_READY);
    this.name = 'ClientPortalPrincipalNotReadyError';
  }
}

export class ClientPortalAccessDeniedError extends ClientPortalAuthorizationError {
  override readonly code = CLIENT_PORTAL_ACCESS_DENIED;
  override readonly status = 403;

  constructor(operation?: string) {
    super('Client Portal access is not authorized.', operation, CLIENT_PORTAL_ACCESS_DENIED);
    this.name = 'ClientPortalAccessDeniedError';
  }
}

// ---------------------------------------------------------------------------
// Fail-closed authorization stubs. None queries a DB, calls a service/mapper,
// imports Prisma, or reads document content. Input refs never reach the error.
// ---------------------------------------------------------------------------

/** No portal schema/principal exists yet — resolution always fails closed. */
export function resolvePortalPrincipal(_context: PortalPrincipalContext): PortalPrincipal {
  throw new ClientPortalPrincipalNotReadyError('resolvePortalPrincipal');
}

export function requireActivePortalUser(_context: PortalPrincipalContext): PortalPrincipal {
  throw new ClientPortalPrincipalNotReadyError('requireActivePortalUser');
}

/** Runtime data access is never ready while the portal is disabled/schemaless. */
export function assertPortalFeatureReadyForDataAccess(): void {
  throw new ClientPortalPrincipalNotReadyError('assertPortalFeatureReadyForDataAccess');
}

export function requirePortalMatterAccess(_request: PortalMatterAccessRequest): never {
  throw new ClientPortalAccessDeniedError('requirePortalMatterAccess');
}

export function requirePortalDocumentShare(_request: PortalDocumentShareRequest): never {
  throw new ClientPortalAccessDeniedError('requirePortalDocumentShare');
}

export function requirePortalTaskAccess(_request: PortalTaskAccessRequest): never {
  throw new ClientPortalAccessDeniedError('requirePortalTaskAccess');
}

export function requirePortalUploadRequestAccess(
  _request: PortalUploadRequestAccessRequest
): never {
  throw new ClientPortalAccessDeniedError('requirePortalUploadRequestAccess');
}

// Deferred — still fail-closed.
export function requirePortalMessageAccess(_request: PortalMessageAccessRequest): never {
  throw new ClientPortalAccessDeniedError('requirePortalMessageAccess');
}
