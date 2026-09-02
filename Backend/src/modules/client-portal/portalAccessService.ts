/**
 * Client Portal Access & Authorization Service
 *
 * Deterministic server-derived client scope resolver.
 * Ensures the browser is never the authority for tenant identity and enforces
 * fail-closed authorization boundaries across all client portal resources.
 */

import { Request, Response } from 'express';
import jwt from 'jsonwebtoken';
import { prisma as defaultPrisma } from '../../prisma/prisma.service';
import { authenticate } from '../../middleware/auth';
import {
  acceptedAudiences,
  authenticateClientPortal,
  hasRequiredClientPortalScope,
} from '../../middleware/clientPortalAuth';

type Prisma = typeof defaultPrisma;

export interface PortalAccessContext {
  userId: string;
  userRole: string;
  isInternal: boolean;
  authorizedClientIds: Set<string>;
  canAccessClient: (clientId: string) => boolean;
}

export class PortalAccessError extends Error {
  constructor(
    public status: number,
    public code: string,
    message: string
  ) {
    super(message);
    this.name = 'PortalAccessError';
  }
}

const INTERNAL_STAFF_ROLES = new Set([
  'ADMIN',
  'PARTNER',
  'LAWYER',
  'COLLAB_LAWYER',
  'TRAINEE',
  'LEGAL_ASSISTANT',
]);

/**
 * Inspects unverified token metadata ONLY to route to the correct canonical verifier.
 * Full cryptographic validation is subsequently performed by the selected verifier.
 */
function isLikelyCustomerPortalToken(payload: Record<string, unknown> | null): boolean {
  if (!payload) return false;

  const issuer = String(
    process.env.CLIENT_IDENTITY_ISSUER ||
      process.env.CLIENT_PORTAL_IDENTITY_ISSUER ||
      ''
  ).trim();
  const configuredAudiences = new Set(acceptedAudiences());

  // 1. Audience match with configured customer audience
  if (typeof payload.aud === 'string' && configuredAudiences.has(payload.aud)) {
    return true;
  }
  if (Array.isArray(payload.aud) && payload.aud.some((a) => configuredAudiences.has(String(a)))) {
    return true;
  }
  if (payload.aud === 'adminiculum-client-portal') {
    return true;
  }

  // 2. Issuer match with customer identity provider
  if (issuer && typeof payload.iss === 'string' && payload.iss === issuer) {
    return true;
  }
  if (
    typeof payload.iss === 'string' &&
    (payload.iss.includes('ciamlogin.com') ||
      payload.iss.includes('b2clogin.com') ||
      payload.iss.includes('customer_identity'))
  ) {
    return true;
  }

  // 3. Required client portal delegated scope
  if (hasRequiredClientPortalScope(payload)) {
    return true;
  }

  return false;
}

/**
 * Deterministically routes authentication to either Entra External ID (Client Portal)
 * or Azure AD / Local JWT (Workforce) without premature 401 response collisions.
 */
export async function requireAuthenticatedPortalUser(
  req: Request,
  res: Response
): Promise<boolean> {
  if (req.user || req.clientPortalSession) return true;

  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    res.status(401).json({
      status: 401,
      code: 'CLIENT_PORTAL_AUTH_REQUIRED',
      error: 'No token provided',
      message: 'Client portal authentication is required.',
    });
    return false;
  }

  const token = authHeader.slice('Bearer '.length).trim();
  let decodedPayload: Record<string, unknown> | null = null;
  try {
    const decoded = jwt.decode(token) as Record<string, unknown> | null;
    if (decoded && typeof decoded === 'object') {
      decodedPayload = decoded;
    }
  } catch {
    res.status(401).json({
      status: 401,
      code: 'CLIENT_PORTAL_TOKEN_INVALID',
      error: 'Invalid token',
      message: 'Client portal token is invalid.',
    });
    return false;
  }

  const isCustomerPortalToken = isLikelyCustomerPortalToken(decodedPayload);

  if (isCustomerPortalToken) {
    await new Promise<void>((resolve) => {
      authenticateClientPortal(req, res, () => resolve());
    });
    if (res.headersSent) return false;
    if (!req.clientPortalSession) {
      res.status(401).json({
        status: 401,
        code: 'CLIENT_PORTAL_AUTH_REQUIRED',
        error: 'Authentication required',
        message: 'Client portal authentication is required.',
      });
      return false;
    }
    return true;
  } else {
    await new Promise<void>((resolve) => {
      authenticate(req, res, () => resolve());
    });
    if (res.headersSent) return false;
    if (!req.user) {
      res.status(401).json({
        status: 401,
        code: 'CLIENT_PORTAL_AUTH_REQUIRED',
        error: 'Authentication required',
        message: 'Client portal authentication is required.',
      });
      return false;
    }
    return true;
  }
}

/**
 * Resolves the authenticated user's authorized client scope.
 * Derives client ownership server-side; never trusts user-provided identifiers.
 */
export async function resolvePortalAccess(
  req: Request,
  db: Prisma = defaultPrisma
): Promise<PortalAccessContext> {
  const now = new Date();

  // 1. Check if caller is authenticated as an internal or workforce user (via req.user)
  if (req.user) {
    const userRole = String(req.user.role || '').toUpperCase();
    const userId = req.user.userId;

    // Internal staff users have preview and management access across clients
    if (INTERNAL_STAFF_ROLES.has(userRole)) {
      return {
        userId,
        userRole,
        isInternal: true,
        authorizedClientIds: new Set(['*']),
        canAccessClient: (_clientId: string) => true,
      };
    }

    // Workforce user with CLIENT role
    if (userRole === 'CLIENT') {
      const authorizedClientIds = new Set<string>();

      // Active grants for this client user
      const grants = await db.clientPortalGrant.findMany({
        where: {
          clientUserId: userId,
          status: 'ACTIVE',
          validFrom: { lte: now },
          OR: [{ validUntil: null }, { validUntil: { gt: now } }],
        },
        select: { clientId: true },
      });
      for (const g of grants) {
        if (g.clientId) authorizedClientIds.add(g.clientId);
      }

      return {
        userId,
        userRole: 'CLIENT',
        isInternal: false,
        authorizedClientIds,
        canAccessClient: (clientId: string) => authorizedClientIds.has(clientId),
      };
    }

    return {
      userId,
      userRole,
      isInternal: false,
      authorizedClientIds: new Set<string>(),
      canAccessClient: (_clientId: string) => false,
    };
  }

  // 2. Check if caller is authenticated as customer identity (req.clientPortalSession)
  if (req.clientPortalSession) {
    const session = req.clientPortalSession;
    const identityId = session.clientPortalIdentityId;

    // Enforce verified email & active identity status semantics
    if (!session.emailVerified) {
      throw new PortalAccessError(
        403,
        'CLIENT_EMAIL_NOT_VERIFIED',
        'Verified e-mail is required.'
      );
    }
    if (session.status === 'SUSPENDED') {
      throw new PortalAccessError(
        403,
        'CLIENT_IDENTITY_SUSPENDED',
        'Client identity is suspended.'
      );
    }
    if (session.status === 'REVOKED') {
      throw new PortalAccessError(
        403,
        'CLIENT_IDENTITY_REVOKED',
        'Client identity is revoked.'
      );
    }
    if (session.status !== 'ACTIVE') {
      throw new PortalAccessError(
        403,
        `CLIENT_IDENTITY_${session.status}`,
        'Client identity is not active.'
      );
    }

    const authorizedClientIds = new Set<string>();

    // a. Active workspace memberships
    const memberships = await db.clientPortalWorkspaceMembership.findMany({
      where: {
        clientPortalIdentityId: identityId,
        status: 'ACTIVE',
        OR: [{ expiresAt: null }, { expiresAt: { gt: now } }],
      },
      select: { workspaceId: true },
    });

    if (memberships.length > 0) {
      const workspaces = await db.clientPortalWorkspace.findMany({
        where: {
          id: { in: memberships.map((m) => m.workspaceId) },
          status: 'ACTIVE',
        },
        select: { clientId: true },
      });
      for (const w of workspaces) {
        if (w.clientId) authorizedClientIds.add(w.clientId);
      }
    }

    // b. Active grants
    const grants = await db.clientPortalGrant.findMany({
      where: {
        clientPortalIdentityId: identityId,
        status: 'ACTIVE',
        validFrom: { lte: now },
        OR: [{ validUntil: null }, { validUntil: { gt: now } }],
      },
      select: { clientId: true },
    });
    for (const g of grants) {
      if (g.clientId) authorizedClientIds.add(g.clientId);
    }

    return {
      userId: identityId,
      userRole: 'CLIENT_PORTAL',
      isInternal: false,
      authorizedClientIds,
      canAccessClient: (clientId: string) => authorizedClientIds.has(clientId),
    };
  }

  throw new PortalAccessError(
    401,
    'CLIENT_PORTAL_AUTH_REQUIRED',
    'Client portal authentication is required.'
  );
}

/**
 * Express middleware helper to authenticate and verify access to a given client.
 */
export async function authenticateAndAuthorizeClient(
  req: Request,
  res: Response,
  targetClientId: string,
  db: Prisma = defaultPrisma
): Promise<PortalAccessContext | null> {
  if (!(await requireAuthenticatedPortalUser(req, res))) {
    return null;
  }

  try {
    const access = await resolvePortalAccess(req, db);

    if (!targetClientId || !access.canAccessClient(targetClientId)) {
      res.status(403).json({
        status: 403,
        code: 'CLIENT_ACCESS_FORBIDDEN',
        error: 'Access denied to this client',
        message: 'You are not authorized to access records for this client.',
      });
      return null;
    }

    return access;
  } catch (err: any) {
    const status = err?.status || 500;
    const code = err?.code || 'PORTAL_ACCESS_ERROR';
    const message = err?.message || 'Failed to verify client access.';
    res.status(status).json({ status, code, error: message, message });
    return null;
  }
}
