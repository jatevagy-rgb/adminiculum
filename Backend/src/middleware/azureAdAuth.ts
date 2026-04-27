/**
 * Azure AD Token Validation Middleware
 * Validates Azure AD access tokens from Power Apps Custom Connector
 * 
 * This middleware allows the backend to accept Azure AD tokens from Power Apps
 */

import { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import jwksClient from 'jwks-rsa';

// Azure AD Configuration — must be provided explicitly per deployment.
// No hardcoded production defaults — each deployment must provide its own values.
// These are non-secrets (tenant/client IDs are public) but must be deployment-specific.
const TENANT_ID = process.env.AZURE_TENANT_ID || '';
const ALLOWED_AUDIENCES = String(
  process.env.AZURE_AD_ALLOWED_AUDIENCES || process.env.AZURE_AD_AUDIENCE || process.env.AZURE_CLIENT_ID || ''
)
  .split(',')
  .map((value) => value.trim())
  .filter(Boolean);

const PRIMARY_AUDIENCE = ALLOWED_AUDIENCES[0] || '';
const PRIMARY_ISSUER = `https://login.microsoftonline.com/${TENANT_ID}/v2.0`;
const LEGACY_V1_ISSUER = `https://sts.windows.net/${TENANT_ID}/`;

// Create JWKS client for fetching Azure AD signing keys
const client = jwksClient({
  jwksUri: `https://login.microsoftonline.com/${TENANT_ID}/v2.0/.well-known/jwks`,
  cache: true,
  rateLimit: true,
});

/**
 * Get the signing key from JWKS endpoint
 */
const getSigningKey = (kid: string): Promise<string> => {
  return new Promise((resolve, reject) => {
    client.getSigningKey(kid, (err, key) => {
      if (err) {
        reject(err);
        return;
      }
      const signingKey = key?.getPublicKey();
      resolve(signingKey);
    });
  });
};

/**
 * Verify Azure AD token
 */
const verifyAzureAdToken = async (token: string): Promise<any> => {
  // First, decode the token to get the kid (key ID)
  const decoded = jwt.decode(token, { complete: true });
  
  if (!decoded || !decoded.header.kid) {
    throw new Error('Invalid token format');
  }

  // Get the signing key
  const signingKey = await getSigningKey(decoded.header.kid);

  // Verify the token (support both v2 and legacy v1 issuer formats)
  let verified: any;
  try {
    verified = jwt.verify(token, signingKey, {
      issuer: PRIMARY_ISSUER,
      audience: PRIMARY_AUDIENCE,
      algorithms: ['RS256'],
    });
  } catch {
    verified = jwt.verify(token, signingKey, {
      issuer: LEGACY_V1_ISSUER,
      audience: PRIMARY_AUDIENCE,
      algorithms: ['RS256'],
    });
  }

  return verified;
};

/**
 * Hybrid authentication middleware
 * Accepts both:
 * 1. Azure AD tokens (from Power Apps)
 * 2. Custom JWT tokens (from /auth/login endpoint)
 */
export const hybridAuth = async (
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> => {
  const authHeader = req.headers.authorization;

  // If no auth header, reject
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    res.status(401).json({ error: 'No token provided' });
    return;
  }

  const token = authHeader.split(' ')[1];

  try {
    // Try Azure AD token first
    const azureAdToken = await verifyAzureAdToken(token);
    
    // If successful, add user info to request
    (req as any).user = {
      email: azureAdToken.email || azureAdToken.preferred_username,
      name: azureAdToken.name,
      roles: azureAdToken.roles || [],
      azureAdToken: true,
    };
    
    console.log('✅ Azure AD token validated successfully');
    next();
  } catch (azureAdError) {
    // Azure AD validation failed, try custom JWT
    console.log('Azure AD token validation failed, trying custom JWT...');
    
    try {
      const { jwtConfig } = await import('../config/jwt');
      const decoded = jwt.verify(token, jwtConfig.secret) as jwt.JwtPayload;
      
      (req as any).user = {
        ...decoded,
        customJwt: true,
      };
      
      console.log('✅ Custom JWT validated successfully');
      next();
    } catch (jwtError) {
      console.error('❌ Both Azure AD and custom JWT validation failed');
      res.status(401).json({ error: 'Invalid token' });
    }
  }
};

export default hybridAuth;
