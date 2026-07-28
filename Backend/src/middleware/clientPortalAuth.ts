import { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import jwksClient from 'jwks-rsa';
import { prisma } from '../prisma/prisma.service';

export type AuthIdentityType = 'INTERNAL_WORKFORCE' | 'CLIENT_PORTAL';
export type ClientPortalAccountType = 'INDIVIDUAL' | 'ORGANIZATION_MEMBER';

export interface ClientPortalSession {
  identityType: AuthIdentityType;
  issuer: string;
  audience: string;
  subject: string;
  clientPortalIdentityId: string;
  normalizedEmail: string;
  displayName: string;
  accountType: ClientPortalAccountType;
  status: string;
  emailVerified: boolean;
  sessionContext: 'CUSTOMER_IDENTITY_PROVIDER';
}

declare global {
  namespace Express {
    interface Request {
      clientPortalSession?: ClientPortalSession;
    }
  }
}

const CUSTOMER_IDENTITY_ISSUER = String(process.env.CLIENT_IDENTITY_ISSUER || process.env.CLIENT_PORTAL_IDENTITY_ISSUER || '').trim();
const CUSTOMER_IDENTITY_AUDIENCE = String(process.env.CLIENT_IDENTITY_AUDIENCE || process.env.CLIENT_PORTAL_IDENTITY_AUDIENCE || '').trim();
const CUSTOMER_IDENTITY_JWKS_URI = String(process.env.CLIENT_IDENTITY_JWKS_URI || process.env.CLIENT_PORTAL_IDENTITY_JWKS_URI || '').trim();

let cachedCustomerJwks: ReturnType<typeof jwksClient> | null = null;

function configured(): boolean {
  return Boolean(CUSTOMER_IDENTITY_ISSUER && CUSTOMER_IDENTITY_AUDIENCE && CUSTOMER_IDENTITY_JWKS_URI);
}

function customerJwks() {
  if (!cachedCustomerJwks) {
    cachedCustomerJwks = jwksClient({ jwksUri: CUSTOMER_IDENTITY_JWKS_URI, cache: true, rateLimit: true });
  }
  return cachedCustomerJwks;
}

function signingKey(header: jwt.JwtHeader, callback: jwt.SigningKeyCallback): void {
  if (!header.kid) {
    callback(new Error('Customer identity key id is missing.'));
    return;
  }
  customerJwks().getSigningKey(header.kid, (error, key) => {
    if (error) {
      callback(error);
      return;
    }
    callback(null, key?.getPublicKey());
  });
}

function normalizeEmail(value: unknown): string {
  return typeof value === 'string' ? value.trim().toLowerCase() : '';
}

function claimIsVerified(payload: Record<string, unknown>): boolean {
  return payload.email_verified === true || payload.emailVerified === true || payload.emails_verified === true;
}

function displayName(payload: Record<string, unknown>, email: string): string {
  const name = typeof payload.name === 'string' ? payload.name.trim() : '';
  return name || email;
}

async function resolveIdentity(payload: Record<string, unknown>): Promise<ClientPortalSession | null> {
  const issuer = String(payload.iss || CUSTOMER_IDENTITY_ISSUER);
  const audience = Array.isArray(payload.aud) ? String(payload.aud[0] || '') : String(payload.aud || '');
  const subject = String(payload.sub || '').trim();
  const normalizedEmail = normalizeEmail(payload.email || payload.preferred_username || payload.upn);
  if (!issuer || !subject || !normalizedEmail) return null;

  const existing = await prisma.clientPortalIdentity.findUnique({
    where: { issuer_subject: { issuer, subject } },
  });
  if (!existing) return null;

  const emailVerified = Boolean(existing.emailVerifiedAt) && claimIsVerified(payload);
  await prisma.clientPortalIdentity.update({
    where: { id: existing.id },
    data: { lastLoginAt: new Date(), revision: { increment: 1 } },
  });

  return {
    identityType: 'CLIENT_PORTAL',
    issuer,
    audience,
    subject,
    clientPortalIdentityId: existing.id,
    normalizedEmail: existing.normalizedEmail,
    displayName: existing.displayName,
    accountType: existing.accountType,
    status: existing.status,
    emailVerified,
    sessionContext: 'CUSTOMER_IDENTITY_PROVIDER',
  };
}

export async function authenticateClientPortal(req: Request, res: Response, next: NextFunction): Promise<void> {
  if (!configured()) {
    res.status(503).json({ status: 503, code: 'CLIENT_IDENTITY_PROVIDER_NOT_CONFIGURED', message: 'Client identity provider is not configured.' });
    return;
  }
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    res.status(401).json({ status: 401, code: 'CLIENT_PORTAL_AUTH_REQUIRED', message: 'Client portal authentication is required.' });
    return;
  }
  const token = authHeader.slice('Bearer '.length).trim();
  try {
    const payload = await new Promise<Record<string, unknown>>((resolve, reject) => {
      jwt.verify(token, signingKey, {
        audience: CUSTOMER_IDENTITY_AUDIENCE,
        issuer: CUSTOMER_IDENTITY_ISSUER,
        algorithms: ['RS256'],
      }, (error, decoded) => error ? reject(error) : resolve((decoded as Record<string, unknown>) || {}));
    });
    const session = await resolveIdentity(payload);
    if (!session) {
      res.status(403).json({ status: 403, code: 'CLIENT_IDENTITY_NOT_REGISTERED', message: 'Client identity is not registered for Adminiculum.' });
      return;
    }
    req.clientPortalSession = session;
    next();
  } catch {
    res.status(401).json({ status: 401, code: 'CLIENT_PORTAL_TOKEN_INVALID', message: 'Client portal token is invalid.' });
  }
}

export function requireActiveClientPortalSession(req: Request): ClientPortalSession {
  const session = req.clientPortalSession;
  if (!session) throw Object.assign(new Error('Client portal session is required.'), { status: 401, code: 'CLIENT_PORTAL_AUTH_REQUIRED' });
  if (!session.emailVerified) throw Object.assign(new Error('Verified e-mail is required.'), { status: 403, code: 'CLIENT_EMAIL_NOT_VERIFIED' });
  if (session.status !== 'ACTIVE') throw Object.assign(new Error('Client identity is not active.'), { status: 403, code: `CLIENT_IDENTITY_${session.status}` });
  return session;
}
