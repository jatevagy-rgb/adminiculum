/**
 * Authentication Middleware
 * JWT verification and role-based access control
 * Supports both custom JWT and Azure AD tokens (hybrid auth for Power Apps)
 */

import { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import jwksClient from 'jwks-rsa';
import { jwtConfig } from '../config/jwt';

// Role types matching Prisma schema
type Role = 'LAWYER' | 'COLLAB_LAWYER' | 'TRAINEE' | 'LEGAL_ASSISTANT' | 'ADMIN';

interface JwtPayload {
  userId: string;
  email: string;
  role: Role;
}

// Azure AD configuration
const AZURE_AD_TENANT_ID = '18b56834-dfea-4931-bdf8-e5ebb0cb4e0f';

const azureClient = jwksClient({
  jwksUri: `https://login.microsoftonline.com/${AZURE_AD_TENANT_ID}/discovery/v2.0/keys`,
  cache: false,  // Disable cache for debugging
  rateLimit: false,
});

function getAzureSigningKey(header: jwt.JwtHeader, callback: jwt.SigningKeyCallback): void {
  console.log('Looking for signing key with kid:', header.kid);
  azureClient.getSigningKey(header.kid, (err, key) => {
    if (err) {
      console.error('JWKS getSigningKey error:', err.message);
      console.error('Error details:', JSON.stringify(err));
      callback(err);
      return;
    }
    const signingKey = key?.getPublicKey();
    console.log('Found signing key:', signingKey ? 'YES' : 'NO');
    callback(null, signingKey);
  });
}

async function verifyAzureAdToken(token: string): Promise<JwtPayload> {
  return new Promise((resolve, reject) => {
    jwt.verify(token, getAzureSigningKey, {
      audience: [
        'api://82b50ec7-3e89-48aa-af74-4831e1c651cd',
        '82b50ec7-3e89-48aa-af74-4831e1c651cd'
      ], // Can be app ID or api://clientid
      issuer: [
        `https://login.microsoftonline.com/${AZURE_AD_TENANT_ID}/v2.0`,
        `https://sts.windows.net/${AZURE_AD_TENANT_ID}/`,
      ],
      algorithms: ['RS256'],
    }, (err, decoded) => {
      if (err) {
        reject(err);
        return;
      }
      // Transform Azure AD claims to our JwtPayload format
      const azureAdPayload = decoded as any;
      resolve({
        userId: azureAdPayload.oid || azureAdPayload.sub,
        email: azureAdPayload.email || azureAdPayload.preferred_username,
        role: (azureAdPayload.role?.[0] as Role) || 'LAWYER', // Default role for Azure AD users
      });
    });
  });
}

interface JwtPayload {
  userId: string;
  email: string;
  role: Role;
}

// Extend Express Request
declare global {
  namespace Express {
    interface Request {
      user?: JwtPayload;
    }
  }
}

/**
 * Verify JWT token and attach user to request
 * Supports both Azure AD tokens (for Power Apps) and custom JWT tokens
 */
export const authenticate = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  const authHeader = req.headers.authorization;

  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    res.status(401).json({ error: 'No token provided' });
    return;
  }

  const token = authHeader.split(' ')[1];

  // Try Azure AD token first (for Power Apps)
  try {
    console.log('Attempting Azure AD token validation...');
    // Decode token first to see what's in it
    const decoded = jwt.decode(token, { complete: true });
    console.log('Token header:', JSON.stringify(decoded?.header));
    console.log('Token payload:', JSON.stringify(decoded?.payload));
    
    const azureUser = await verifyAzureAdToken(token);
    console.log('✅ Azure AD token validated successfully:', azureUser.email);
    req.user = azureUser;
    (req as any).azureAdToken = true;
    next();
    return;
  } catch (azureError: any) {
    console.log('Azure AD token validation failed:', azureError.message);
    console.log('Error details:', JSON.stringify(azureError));
  }

  // Fall back to custom JWT
  console.log('Trying custom JWT validation with secret:', jwtConfig.secret ? 'SET' : 'NOT SET');
  try {
    const decoded = jwt.verify(token, jwtConfig.secret) as JwtPayload;
    console.log('✅ Custom JWT validated successfully:', decoded.email);
    req.user = decoded;
    (req as any).customJwt = true;
    next();
  } catch (error: any) {
    console.error('❌ Custom JWT validation failed:', error.message);
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
  ADMIN: 'ADMIN'
};

/**
 * Role hierarchy for authorization
 */
const ROLE_HIERARCHY: Record<Role, number> = {
  LAWYER: 4,
  COLLAB_LAWYER: 3,
  TRAINEE: 2,
  LEGAL_ASSISTANT: 1,
  ADMIN: 5
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
  ADMIN: 'Adminisztrátor'
};
