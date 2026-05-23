import { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import jwksClient from 'jwks-rsa';
import { jwtConfig } from '../config/jwt';

type Role =
  | 'LAWYER'
  | 'COLLAB_LAWYER'
  | 'TRAINEE'
  | 'LEGAL_ASSISTANT'
  | 'ADMIN'
  | 'PARTNER'
  | 'CLIENT'
  | 'EXTERNAL_REVIEWER';

interface AuthenticatedUser {
  userId: string;
  email: string;
  role: Role;
  name?: string;
  azureObjectId?: string;
  authProvider: 'azure-ad' | 'local-jwt';
}

interface LocalJwtPayload {
  userId?: string;
  email?: string;
  role?: string;
  name?: string;
}

const NODE_ENV = process.env.NODE_ENV || 'development';
const IS_PRODUCTION = NODE_ENV === 'production';
const AZURE_AD_TENANT_ID = process.env.AZURE_AD_TENANT_ID || '';
const AZURE_AD_AUDIENCES = String(process.env.AZURE_AD_AUDIENCE || '')
  .split(',')
  .map((value) => value.trim())
  .filter(Boolean);
const AZURE_AD_CONFIGURED =
  AZURE_AD_TENANT_ID.length > 0 && AZURE_AD_AUDIENCES.length > 0;

let startupWarningPrinted = false;
if (IS_PRODUCTION && !AZURE_AD_CONFIGURED && !startupWarningPrinted) {
  console.warn(
    '[Auth] Production mode without complete AZURE_AD_TENANT_ID/AZURE_AD_AUDIENCE configuration.'
  );
  startupWarningPrinted = true;
}

let cachedAzureClient: ReturnType<typeof jwksClient> | null = null;
function getAzureClient() {
  if (!AZURE_AD_TENANT_ID) {
    return null;
  }
  if (!cachedAzureClient) {
    cachedAzureClient = jwksClient({
      jwksUri: `https://login.microsoftonline.com/${AZURE_AD_TENANT_ID}/discovery/v2.0/keys`,
      cache: true,
      rateLimit: true,
    });
  }
  return cachedAzureClient;
}

class AuthConfigError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'AuthConfigError';
  }
}

function normalizeRole(role: unknown): Role {
  const candidate = String(role || '').trim().toUpperCase();
  const allowed: Role[] = [
    'LAWYER',
    'COLLAB_LAWYER',
    'TRAINEE',
    'LEGAL_ASSISTANT',
    'ADMIN',
    'PARTNER',
    'CLIENT',
    'EXTERNAL_REVIEWER',
  ];
  return allowed.includes(candidate as Role) ? (candidate as Role) : 'LAWYER';
}

function getAzureSigningKey(
  header: jwt.JwtHeader,
  callback: jwt.SigningKeyCallback
): void {
  const client = getAzureClient();
  if (!client || !header.kid) {
    callback(new Error('Azure AD signing key configuration is unavailable.'));
    return;
  }

  client.getSigningKey(header.kid, (err, key) => {
    if (err) {
      callback(err);
      return;
    }
    callback(null, key?.getPublicKey());
  });
}

function mapAzureClaimsToUser(payload: Record<string, unknown>): AuthenticatedUser {
  const rawEmail =
    payload.email ||
    payload.preferred_username ||
    payload.upn ||
    payload.unique_name;

  const rawRole = Array.isArray(payload.roles)
    ? payload.roles[0]
    : payload.role;

  return {
    userId: String(payload.oid || payload.sub || ''),
    azureObjectId: typeof payload.oid === 'string' ? payload.oid : undefined,
    email: typeof rawEmail === 'string' ? rawEmail.trim().toLowerCase() : '',
    name: typeof payload.name === 'string' ? payload.name : undefined,
    role: normalizeRole(rawRole),
    authProvider: 'azure-ad',
  };
}

async function verifyAzureAdToken(token: string): Promise<AuthenticatedUser> {
  if (!AZURE_AD_CONFIGURED) {
    throw new AuthConfigError(
      'AZURE_AD_TENANT_ID and AZURE_AD_AUDIENCE must be configured for Azure AD token validation.'
    );
  }

  return new Promise((resolve, reject) => {
    jwt.verify(
      token,
      getAzureSigningKey,
      {
        audience: AZURE_AD_AUDIENCES as [string, ...string[]],
        issuer: [
          `https://login.microsoftonline.com/${AZURE_AD_TENANT_ID}/v2.0`,
          `https://sts.windows.net/${AZURE_AD_TENANT_ID}/`,
        ],
        algorithms: ['RS256'],
      },
      (err, decoded) => {
        if (err) {
          reject(err);
          return;
        }
        resolve(mapAzureClaimsToUser((decoded as Record<string, unknown>) || {}));
      }
    );
  });
}

declare global {
  namespace Express {
    interface Request {
      user?: AuthenticatedUser;
    }
  }
}

export const authenticate = async (
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> => {
  const authHeader = req.headers.authorization;

  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    res.status(401).json({ error: 'No token provided' });
    return;
  }

  const token = authHeader.slice('Bearer '.length).trim();
  if (!token) {
    res.status(401).json({ error: 'Invalid token' });
    return;
  }

  let azureError: unknown = null;
  try {
    const azureUser = await verifyAzureAdToken(token);
    if (!azureUser.userId) {
      throw new Error('Token does not contain a valid user identifier.');
    }
    req.user = azureUser;
    next();
    return;
  } catch (error) {
    azureError = error;
  }

  try {
    const decoded = jwt.verify(token, jwtConfig.secret) as LocalJwtPayload;
    req.user = {
      userId: String(decoded.userId || ''),
      email: String(decoded.email || '').trim().toLowerCase(),
      name: typeof decoded.name === 'string' ? decoded.name : undefined,
      role: normalizeRole(decoded.role),
      authProvider: 'local-jwt',
    };

    if (!req.user.userId) {
      throw new Error('JWT does not contain userId.');
    }
    next();
  } catch {
    if (IS_PRODUCTION && azureError instanceof AuthConfigError) {
      res.status(500).json({
        error: 'Authentication is not configured correctly. Missing Azure AD configuration.',
      });
      return;
    }
    res.status(401).json({ error: 'Invalid token' });
  }
};

/**
 * Check if user has required role
 */
export const requireRole = (...allowedRoles: Role[]) => {
  return (req: Request, res: Response, next: NextFunction): void => {
    if (!req.user) {
      res.status(401).json({ error: 'Not authenticated' });
      return;
    }

    if (!allowedRoles.includes(req.user.role)) {
      res.status(403).json({ error: 'Insufficient permissions' });
      return;
    }

    next();
  };
};

/**
 * Role constants matching Prisma schema
 */
export const ROLES: Record<string, Role> = {
  LAWYER: 'LAWYER',
  COLLAB_LAWYER: 'COLLAB_LAWYER',
  TRAINEE: 'TRAINEE',
  LEGAL_ASSISTANT: 'LEGAL_ASSISTANT',
  ADMIN: 'ADMIN',
  PARTNER: 'PARTNER',
  CLIENT: 'CLIENT',
  EXTERNAL_REVIEWER: 'EXTERNAL_REVIEWER',
};

/**
 * Role hierarchy for authorization
 */
const ROLE_HIERARCHY: Record<Role, number> = {
  LAWYER: 4,
  COLLAB_LAWYER: 3,
  TRAINEE: 2,
  LEGAL_ASSISTANT: 1,
  ADMIN: 5,
  PARTNER: 5,
  CLIENT: 0,
  EXTERNAL_REVIEWER: 1,
};

/**
 * Check if user can access resource based on role hierarchy
 */
export const canAccess = (userRole: Role, requiredLevel: number): boolean => {
  return ROLE_HIERARCHY[userRole] >= requiredLevel;
};

/**
 * Role-based task assignment rules
 * LAWYER → TRAINEE, LEGAL_ASSISTANT
 * COLLAB_LAWYER → TRAINEE, LEGAL_ASSISTANT
 * TRAINEE → LEGAL_ASSISTANT
 * LEGAL_ASSISTANT → cannot assign
 */
export const canAssignTask = (assignorRole: Role, assigneeRole: Role): boolean => {
  const superiorRoles: Role[] = [ROLES.LAWYER, ROLES.COLLAB_LAWYER, ROLES.TRAINEE];
  const subordinateRoles: Role[] = [ROLES.TRAINEE, ROLES.LEGAL_ASSISTANT];

  if (!superiorRoles.includes(assignorRole)) {
    return false;
  }

  if ([ROLES.LAWYER, ROLES.COLLAB_LAWYER].includes(assignorRole)) {
    return subordinateRoles.includes(assigneeRole);
  }

  if (assignorRole === ROLES.TRAINEE) {
    return assigneeRole === ROLES.LEGAL_ASSISTANT;
  }

  return false;
};

/**
 * Get all role names for display
 */
export const ROLE_NAMES: Record<Role, string> = {
  LAWYER: 'Ügyvéd',
  COLLAB_LAWYER: 'Együttműködő ügyvéd',
  TRAINEE: 'Ügyvédjelölt',
  LEGAL_ASSISTANT: 'Jogi asszisztens',
  ADMIN: 'Adminisztrátor',
  PARTNER: 'Partner',
  CLIENT: 'Ügyfél',
  EXTERNAL_REVIEWER: 'Külső reviewer',
};
