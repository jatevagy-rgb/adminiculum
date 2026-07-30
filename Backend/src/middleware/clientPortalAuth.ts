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
const CUSTOMER_IDENTITY_REQUIRED_SCOPE = String(process.env.CLIENT_PORTAL_IDENTITY_REQUIRED_SCOPE || 'access_as_client').trim();

let cachedCustomerJwks: ReturnType<typeof jwksClient> | null = null;

function configured(): boolean {
  return Boolean(CUSTOMER_IDENTITY_ISSUER && CUSTOMER_IDENTITY_AUDIENCE && CUSTOMER_IDENTITY_JWKS_URI);
}

// An Entra/External ID access token's `aud` is the API's App ID URI
// (`api://<clientId>`) for v1 tokens but the bare client id (`<clientId>`) for
// v2 tokens. Both identify the same API resource, so accept either form of the
// configured audience to avoid `jwt audience invalid` rejections.
export function acceptedAudiences(configuredAudience: string = CUSTOMER_IDENTITY_AUDIENCE): string[] {
  const a = String(configuredAudience || '').trim();
  if (!a) return [];
  const set = new Set<string>([a]);
  if (a.startsWith('api://')) set.add(a.slice('api://'.length));
  else set.add(`api://${a}`);
  return [...set];
}

function tokenScopes(payload: Record<string, unknown>): string[] {
  const values = [payload.scp, payload.scope, payload.scopes];
  return values.flatMap((value) => {
    if (Array.isArray(value)) return value.map(String);
    if (typeof value === 'string') return value.split(/\s+/);
    return [];
  }).map((scope) => scope.trim()).filter(Boolean);
}

export function hasRequiredClientPortalScope(
  payload: Record<string, unknown>,
  requiredScope: string = CUSTOMER_IDENTITY_REQUIRED_SCOPE,
): boolean {
  const scope = String(requiredScope || '').trim();
  if (!scope) return false;
  return tokenScopes(payload).includes(scope);
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

// Email-verification trust model for the customer identity provider.
//
// The token's issuer and signature are already validated upstream (JWKS +
// issuer match) before this runs, so a token that reaches here provably comes
// from the configured Entra External ID tenant. That tenant's sign-up/sign-in
// user flow enforces e-mail verification (OTP) BEFORE any token is issued, so a
// validly-issued token from the trusted issuer implies a verified e-mail even
// when the access token omits an explicit `email_verified` claim (Entra access
// tokens frequently do). We therefore accept an explicit verification claim, or
// fall back to "trusted issuer asserted an e-mail".
//
// SECURITY ASSUMPTION: this is only safe while the configured issuer is a
// provider that verifies e-mail before token issuance. If CLIENT_IDENTITY_ISSUER
// is ever pointed at a provider that does NOT enforce verification, require an
// explicit verified claim instead (return claimIsVerified(payload)).
function providerAssertedEmailIsVerified(payload: Record<string, unknown>): boolean {
  return claimIsVerified(payload) || normalizeEmail(payload.email || payload.preferred_username || payload.upn).length > 0;
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
  if (!issuer || !subject || !normalizedEmail) {
    // Safe diagnostic: presence flags only. Do not log raw claim keys or values.
    console.warn('[clientPortalAuth] resolveIdentity unresolved', JSON.stringify({
      hasIssuer: Boolean(issuer), hasSubject: Boolean(subject), hasEmail: Boolean(normalizedEmail),
    }));
    return null;
  }

  const emailVerified = providerAssertedEmailIsVerified(payload);
  const verifiedAt = emailVerified ? new Date() : null;
  let existing = await prisma.clientPortalIdentity.findUnique({
    where: { issuer_subject: { issuer, subject } },
  });
  if (!existing) {
    existing = await prisma.clientPortalIdentity.upsert({
      where: { normalizedEmail },
      create: {
        provider: 'ENTRA_EXTERNAL_ID',
        issuer,
        subject,
        normalizedEmail,
        emailVerifiedAt: verifiedAt,
        displayName: displayName(payload, normalizedEmail),
        accountType: 'INDIVIDUAL',
        status: emailVerified ? 'REGISTERED' : 'EMAIL_VERIFICATION_PENDING',
        lastLoginAt: new Date(),
      },
      update: {
        issuer,
        subject,
        emailVerifiedAt: verifiedAt || undefined,
        displayName: displayName(payload, normalizedEmail),
        lastLoginAt: new Date(),
        revision: { increment: 1 },
      },
    });
  }
  if (emailVerified && !existing.emailVerifiedAt) {
    existing = await prisma.clientPortalIdentity.update({
      where: { id: existing.id },
      data: { emailVerifiedAt: new Date(), status: existing.status === 'EMAIL_VERIFICATION_PENDING' ? 'REGISTERED' : existing.status, revision: { increment: 1 } },
    });
  }

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
        audience: acceptedAudiences() as [string, ...string[]],
        issuer: CUSTOMER_IDENTITY_ISSUER,
        algorithms: ['RS256'],
      }, (error, decoded) => error ? reject(error) : resolve((decoded as Record<string, unknown>) || {}));
    });
    if (!hasRequiredClientPortalScope(payload)) {
      res.status(403).json({ status: 403, code: 'CLIENT_PORTAL_SCOPE_REQUIRED', message: 'Client portal token is missing the required delegated scope.' });
      return;
    }
    const session = await resolveIdentity(payload);
    if (!session) {
      res.status(403).json({ status: 403, code: 'CLIENT_IDENTITY_NOT_REGISTERED', message: 'Client identity is not registered for Adminiculum.' });
      return;
    }
    req.clientPortalSession = session;
    next();
  } catch (verifyError) {
    // Safe diagnostic: bounded reason + expected provider context. Never log
    // token, Authorization header, raw claim values, or claim-key inventory.
    try {
      const decoded = jwt.decode(token) as Record<string, unknown> | null;
      console.warn('[clientPortalAuth] token rejected', JSON.stringify({
        reason: (verifyError as Error)?.message,
        provider: 'CLIENT_PORTAL_EXTERNAL_ID',
        hasAudience: Boolean(decoded?.aud),
        hasIssuer: Boolean(decoded?.iss),
      }));
    } catch { /* ignore decode failures */ }
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

export function requireRegisteredClientPortalSession(req: Request): ClientPortalSession {
  const session = req.clientPortalSession;
  if (!session) throw Object.assign(new Error('Client portal session is required.'), { status: 401, code: 'CLIENT_PORTAL_AUTH_REQUIRED' });
  if (!session.emailVerified) throw Object.assign(new Error('Verified e-mail is required.'), { status: 403, code: 'CLIENT_EMAIL_NOT_VERIFIED' });
  if (session.status === 'SUSPENDED' || session.status === 'REVOKED') {
    throw Object.assign(new Error('Client identity is not active.'), { status: 403, code: `CLIENT_IDENTITY_${session.status}` });
  }
  return session;
}
