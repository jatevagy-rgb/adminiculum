/**
 * Client Portal Access & Authorization Service
 *
 * Deterministic server-derived client scope resolver.
 * Ensures the browser is never the authority for tenant identity and enforces
 * fail-closed authorization boundaries across all client portal resources.
 */

import { Request, Response, NextFunction } from 'express';
import { prisma as defaultPrisma } from '../../prisma/prisma.service';
import { authenticate } from '../../middleware/auth';
import { authenticateClientPortal } from '../../middleware/clientPortalAuth';

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
 * Resolves the authenticated user's authorized client scope.
 * Derives client ownership server-side; never trusts user-provided identifiers.
 */
export async function resolvePortalAccess(
  req: Request,
  db: Prisma = defaultPrisma
): Promise<PortalAccessContext> {
  // 1. Check if caller is authenticated as an internal or workforce user (via req.user)
  if (req.user) {
    const userRole = String(req.user.role || '').toUpperCase();
    const userId = req.user.userId;

    // Internal staff users have full visibility for client portal preview & administration
    if (INTERNAL_STAFF_ROLES.has(userRole)) {
      return {
        userId,
        userRole,
        isInternal: true,
        authorizedClientIds: new Set(['*']),
        canAccessClient: (_clientId: string) => true,
      };
    }

    // CLIENT role user
    if (userRole === 'CLIENT') {
      const authorizedClientIds = new Set<string>();

      // a. Active grants for this client user
      const grants = await db.clientPortalGrant.findMany({
        where: {
          clientUserId: userId,
          status: 'ACTIVE',
          OR: [{ validUntil: null }, { validUntil: { gt: new Date() } }],
        },
        select: { clientId: true },
      });
      for (const g of grants) {
        if (g.clientId) authorizedClientIds.add(g.clientId);
      }

      // b. Direct client match (userId === clientId or email match)
      const directClients = await db.client.findMany({
        where: {
          OR: [
            { id: userId },
            ...(req.user.email ? [{ email: { equals: req.user.email, mode: 'insensitive' as const } }] : []),
          ],
        },
        select: { id: true },
      });
      for (const c of directClients) {
        authorizedClientIds.add(c.id);
      }

      // c. Workspace memberships via ClientPortalIdentity matching user's email
      if (req.user.email) {
        const portalIdentity = await db.clientPortalIdentity.findFirst({
          where: { normalizedEmail: req.user.email.toLowerCase() },
          select: { id: true },
        });

        if (portalIdentity) {
          const memberships = await db.clientPortalWorkspaceMembership.findMany({
            where: {
              clientPortalIdentityId: portalIdentity.id,
              status: 'ACTIVE',
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
        }
      }

      return {
        userId,
        userRole: 'CLIENT',
        isInternal: false,
        authorizedClientIds,
        canAccessClient: (clientId: string) => authorizedClientIds.has(clientId),
      };
    }

    // Other non-internal, non-client roles have no portal access
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
    const authorizedClientIds = new Set<string>();

    // a. Active workspace memberships
    const memberships = await db.clientPortalWorkspaceMembership.findMany({
      where: {
        clientPortalIdentityId: identityId,
        status: 'ACTIVE',
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
        OR: [{ validUntil: null }, { validUntil: { gt: new Date() } }],
      },
      select: { clientId: true },
    });
    for (const g of grants) {
      if (g.clientId) authorizedClientIds.add(g.clientId);
    }

    // c. Direct client by verified email
    if (session.normalizedEmail) {
      const directClients = await db.client.findMany({
        where: { email: { equals: session.normalizedEmail, mode: 'insensitive' as const } },
        select: { id: true },
      });
      for (const c of directClients) {
        authorizedClientIds.add(c.id);
      }
    }

    return {
      userId: identityId,
      userRole: 'CLIENT_PORTAL',
      isInternal: false,
      authorizedClientIds,
      canAccessClient: (clientId: string) => authorizedClientIds.has(clientId),
    };
  }

  throw new PortalAccessError(401, 'CLIENT_PORTAL_AUTH_REQUIRED', 'Client portal authentication is required.');
}

/**
 * Ensures the request is authenticated before performing any resource lookup.
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

  await new Promise<void>((resolve) => {
    authenticate(req, res, () => resolve());
  });

  if (res.headersSent) return false;

  if (!req.user) {
    await new Promise<void>((resolve) => {
      authenticateClientPortal(req, res, () => resolve());
    });
    if (res.headersSent) return false;
  }

  if (!req.user && !req.clientPortalSession) {
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
