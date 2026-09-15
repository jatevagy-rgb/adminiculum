import { Router, type Request, type Response } from 'express';
import crypto from 'crypto';
import { authenticate } from '../../middleware/auth';
import { isWorkforceRole, requireWorkforceUser } from '../../middleware/workforceAuthorization';
import { prisma } from '../../prisma/prisma.service';
import { mailboxIdentityMatches, normalizeMailboxAddress } from './dedupe';
import { challengeExpiry, canResend, evaluateVerification, generateVerificationCode } from './verificationCode';
import { getTransactionalMailTransport, TransactionalMailConfigurationError } from './transactionalMail';
import { createOAuthState, verifyOAuthState } from './oauthState';
import { getMailboxProvider } from './provider';
import { getSecretStore } from './secretStore';
import { MailboxServiceError, ownedMailbox, sendMailboxMessage, syncMailbox } from './service';
import { MAILBOX_PROVIDERS, type MailboxProviderCode } from './types';
import { recordMailboxAudit } from './audit';

const router = Router();
router.get('/oauth/microsoft/callback', (req, res) => oauthCallback(req, res, 'MICROSOFT_GRAPH'));
router.post('/oauth/microsoft/callback', (req, res) => oauthCallback(req, res, 'MICROSOFT_GRAPH'));
router.get('/oauth/google/callback', (req, res) => oauthCallback(req, res, 'GOOGLE_GMAIL'));
router.post('/oauth/google/callback', (req, res) => oauthCallback(req, res, 'GOOGLE_GMAIL'));
router.use(authenticate, requireWorkforceUser);
const provider = (value: unknown): MailboxProviderCode | null => MAILBOX_PROVIDERS.includes(value as MailboxProviderCode) ? value as MailboxProviderCode : null;
const owner = (req: Request) => String(req.user?.userId || '');
function safeError(res: Response, error: unknown) {
  const e = error instanceof MailboxServiceError ? error : null;
  const configuration = error instanceof TransactionalMailConfigurationError;
  const providerIdentity = error instanceof Error && error.message === 'MAILBOX_PROVIDER_IDENTITY_UNAVAILABLE';
  return res.status(e?.status ?? (configuration ? 503 : providerIdentity ? 502 : 500)).json({
    code: e?.code ?? (configuration ? 'MAILBOX_TRANSACTIONAL_MAIL_NOT_CONFIGURED' : providerIdentity ? 'MAILBOX_PROVIDER_IDENTITY_UNAVAILABLE' : 'MAILBOX_OPERATION_FAILED'),
    message: e?.message ?? 'Mailbox operation could not be completed.',
  });
}
function trustedMailboxReturnUrl(result: 'connected' | 'error', errorCode?: string): string | null {
  const configured = String(process.env.MAILBOX_OAUTH_FRONTEND_RETURN_URL || process.env.FRONTEND_URL || process.env.FRONTEND_ORIGIN || '').trim();
  if (!configured) return null;
  try {
    const url = new URL('/communications/mailboxes', configured);
    if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password) return null;
    url.search = '';
    if (result === 'connected') {
      url.searchParams.set('mailbox', 'connected');
    } else {
      url.searchParams.set('mailbox', 'error');
      url.searchParams.set('error', /^MAILBOX_[A-Z0-9_]+$/.test(errorCode || '') ? errorCode! : 'MAILBOX_OAUTH_FAILED');
    }
    return url.toString();
  } catch {
    return null;
  }
}
function redirectBrowser(res: Response, result: 'connected' | 'error', error?: unknown) {
  const code = error instanceof MailboxServiceError ? error.code : undefined;
  const target = trustedMailboxReturnUrl(result, code);
  if (!target) return safeError(res, error ?? new MailboxServiceError(500, 'MAILBOX_OAUTH_FRONTEND_RETURN_NOT_CONFIGURED'));
  return res.redirect(303, target);
}

router.get('/', async (req, res) => res.json({ mailboxes: await prisma.communicationMailboxConnection.findMany({ where: { ownerUserId: owner(req) }, select: { id: true, mailboxAddress: true, provider: true, status: true, verifiedAt: true, readCapability: true, sendCapability: true, lastSyncedAt: true, lastSyncStatus: true, lastSyncError: true, createdAt: true }, orderBy: { createdAt: 'desc' } }) }));
router.get('/:id', async (req, res) => { try { const row = await ownedMailbox(String(req.params.id), owner(req)); res.json({ mailbox: { id: row.id, mailboxAddress: row.mailboxAddress, provider: row.provider, status: row.status, verifiedAt: row.verifiedAt, readCapability: row.readCapability, sendCapability: row.sendCapability, lastSyncedAt: row.lastSyncedAt, lastSyncStatus: row.lastSyncStatus, lastSyncError: row.lastSyncError } }); } catch (e) { safeError(res, e); } });

router.post('/verification/start', async (req, res) => {
  try {
    const email = normalizeMailboxAddress(req.body?.email); const selected = provider(req.body?.provider);
    if (!/^\S+@\S+\.\S+$/.test(email) || !selected) return res.status(400).json({ code: 'MAILBOX_VERIFICATION_INPUT_INVALID', message: 'A valid email and provider are required.' });
    const latest = await prisma.emailVerificationChallenge.findFirst({ where: { userId: owner(req), emailAddress: email }, orderBy: { createdAt: 'desc' } });
    if (latest && !canResend(latest.lastSentAt)) return res.status(429).json({ code: 'MAILBOX_VERIFICATION_RESEND_COOLDOWN', message: 'Please wait before requesting another code.' });
    const generated = generateVerificationCode(); const expiresAt = challengeExpiry();
    await getTransactionalMailTransport().sendVerificationCode({ email, code: generated.code, expiresAt });
    await prisma.emailVerificationChallenge.create({ data: { userId: owner(req), emailAddress: email, codeHash: generated.codeHash, codeSalt: generated.codeSalt, expiresAt, maxAttempts: 5, resendCount: latest ? latest.resendCount + 1 : 0 } });
    await recordMailboxAudit({ eventType: 'MAILBOX_VERIFICATION_STARTED', actorUserId: owner(req), provider: selected, status: 'EMAIL_UNVERIFIED' });
    res.status(202).json({ status: 'VERIFICATION_SENT', expiresAt });
  } catch (e) { safeError(res, e); }
});
router.post('/verification/confirm', async (req, res) => {
  const email = normalizeMailboxAddress(req.body?.email); const selected = provider(req.body?.provider); const code = String(req.body?.code || '');
  if (!selected || !code) return res.status(400).json({ code: 'MAILBOX_VERIFICATION_INPUT_INVALID' });
  const challenge = await prisma.emailVerificationChallenge.findFirst({ where: { userId: owner(req), emailAddress: email }, orderBy: { createdAt: 'desc' } });
  if (!challenge) return res.status(400).json({ code: 'MAILBOX_VERIFICATION_NOT_FOUND' });
  const result = evaluateVerification({ providedCode: code, codeSalt: challenge.codeSalt, codeHash: challenge.codeHash, expiresAt: challenge.expiresAt, consumedAt: challenge.consumedAt, attemptCount: challenge.attemptCount, maxAttempts: challenge.maxAttempts });
  if (result !== 'VERIFIED') { await prisma.emailVerificationChallenge.update({ where: { id: challenge.id }, data: { attemptCount: { increment: 1 } } }); return res.status(400).json({ code: `MAILBOX_VERIFICATION_${result}` }); }
  await prisma.emailVerificationChallenge.update({ where: { id: challenge.id }, data: { consumedAt: new Date(), attemptCount: { increment: 1 } } });
  const mailbox = await prisma.communicationMailboxConnection.upsert({ where: { ownerUserId_mailboxAddress_provider: { ownerUserId: owner(req), mailboxAddress: email, provider: selected } }, create: { ownerUserId: owner(req), mailboxAddress: email, provider: selected, status: 'AUTHORIZATION_REQUIRED', verifiedAt: new Date() }, update: { status: 'AUTHORIZATION_REQUIRED', verifiedAt: new Date(), readCapability: false, sendCapability: false } });
  await recordMailboxAudit({ eventType: 'MAILBOX_VERIFIED', actorUserId: owner(req), mailboxConnectionId: mailbox.id, provider: selected, status: mailbox.status });
  res.json({ mailbox: { id: mailbox.id, status: mailbox.status } });
});
async function oauthStart(req: Request, res: Response, code: MailboxProviderCode) {
  try {
    let mailbox = await ownedMailbox(String(req.params.id), owner(req));
    if (mailbox.provider !== code) throw new MailboxServiceError(409, 'MAILBOX_AUTHORIZATION_NOT_AVAILABLE');
    if (mailbox.status === 'REVOKED') {
      if (mailbox.secretReference) await getSecretStore().delete(mailbox.secretReference);
      mailbox = await prisma.communicationMailboxConnection.update({
        where: { id: mailbox.id },
        data: { status: 'AUTHORIZATION_REQUIRED', readCapability: false, sendCapability: false, secretReference: null, providerAccountId: null, providerTenantId: null },
      });
    }
    const state = createOAuthState({ userId: owner(req), connectionId: mailbox.id, mailboxAddress: mailbox.mailboxAddress, provider: code });
    const redirectUri = code === 'MICROSOFT_GRAPH' ? String(process.env.MICROSOFT_MAILBOX_REDIRECT_URI || '') : String(process.env.GOOGLE_MAILBOX_REDIRECT_URI || '');
    await recordMailboxAudit({ eventType: 'MAILBOX_AUTHORIZATION_STARTED', actorUserId: owner(req), mailboxConnectionId: mailbox.id, provider: mailbox.provider, status: mailbox.status });
    res.json({ authorizationUrl: getMailboxProvider(code).buildAuthorizationUrl({ state, redirectUri }) });
  } catch (e) { safeError(res, e); }
}
router.post('/:id/authorize/microsoft/start', (req, res) => oauthStart(req, res, 'MICROSOFT_GRAPH'));
router.post('/:id/authorize/google/start', (req, res) => oauthStart(req, res, 'GOOGLE_GMAIL'));
router.post('/:id/generic/configure', async (req, res) => {
  try {
    const mailbox = await ownedMailbox(String(req.params.id), owner(req));
    if (mailbox.provider !== 'IMAP_SMTP') throw new MailboxServiceError(409, 'MAILBOX_PROVIDER_MISMATCH');
    // Generic credential transport is intentionally unavailable until a secure
    // provider implementation can validate IMAP and SMTP independently.
    res.status(503).json({ code: 'MAILBOX_GENERIC_PROVIDER_NOT_CONFIGURED', message: 'Generic IMAP/SMTP is not configured.' });
  } catch (e) { safeError(res, e); }
});
async function oauthCallback(req: Request, res: Response, expected: MailboxProviderCode) {
  try {
    const state = verifyOAuthState(String(req.query.state || req.body?.state || ''));
    if (state.provider !== expected) throw new MailboxServiceError(400, 'MAILBOX_OAUTH_STATE_INVALID');
    const mailbox = await ownedMailbox(state.connectionId, state.userId);
    const actor = await prisma.user.findUnique({ where: { id: state.userId }, select: { role: true, status: true, isActive: true } });
    if (!actor || actor.status !== 'ACTIVE' || actor.isActive === false || !isWorkforceRole(actor.role)) {
      throw new MailboxServiceError(403, 'WORKFORCE_ACCESS_REQUIRED');
    }
    const adapter = getMailboxProvider(expected);
    const redirectUri = expected === 'MICROSOFT_GRAPH' ? String(process.env.MICROSOFT_MAILBOX_REDIRECT_URI || '') : String(process.env.GOOGLE_MAILBOX_REDIRECT_URI || '');
    const authorized = await adapter.exchangeAuthorizationCode({ code: String(req.query.code || req.body?.code || ''), redirectUri });
    const authorizedAddress = normalizeMailboxAddress(authorized.authorizedAddress);
    if (!authorizedAddress) {
      await recordMailboxAudit({ eventType: 'MAILBOX_IDENTITY_UNAVAILABLE', actorUserId: state.userId, mailboxConnectionId: mailbox.id, provider: mailbox.provider, status: 'AUTHORIZATION_REQUIRED', errorCode: 'MAILBOX_PROVIDER_IDENTITY_UNAVAILABLE' });
      throw new MailboxServiceError(502, 'MAILBOX_PROVIDER_IDENTITY_UNAVAILABLE');
    }
    // Providers that expose several authoritative identities (for example Microsoft
    // mail + userPrincipalName + SMTP aliases) are matched against the whole
    // server-side set; single-identity providers keep the original exact match.
    const authoritativeAddresses =
      authorized.authorizedAddresses && authorized.authorizedAddresses.length > 0
        ? authorized.authorizedAddresses
        : [authorized.authorizedAddress];
    const identityMatch = mailboxIdentityMatches(mailbox.mailboxAddress, authoritativeAddresses);
    // Shared/delegated target: the verified target is not an identity of the
    // authorizing account. Prove real delegated READ access to the exact target
    // mailbox through the provider. Never accept same-domain, same-tenant,
    // display-name, frontend or fuzzy claims.
    let sendCapability = true;
    let connectedStatus: 'CONNECTED' | 'CONNECTED_READ_ONLY' = 'CONNECTED';
    if (!identityMatch) {
      const probe = typeof adapter.probeTargetMailboxAccess === 'function'
        ? await adapter.probeTargetMailboxAccess({ secret: authorized.secret, mailboxAddress: mailbox.mailboxAddress })
        : null;
      if (!probe) {
        await recordMailboxAudit({ eventType: 'MAILBOX_IDENTITY_MISMATCH', actorUserId: state.userId, mailboxConnectionId: mailbox.id, provider: mailbox.provider, status: 'AUTHORIZATION_REQUIRED', errorCode: 'MAILBOX_PROVIDER_IDENTITY_MISMATCH' });
        throw new MailboxServiceError(403, 'MAILBOX_PROVIDER_IDENTITY_MISMATCH');
      }
      if (probe.ok === false) {
        if (probe.reason === 'DENIED') {
          await recordMailboxAudit({ eventType: 'MAILBOX_TARGET_ACCESS_DENIED', actorUserId: state.userId, mailboxConnectionId: mailbox.id, provider: mailbox.provider, status: 'AUTHORIZATION_REQUIRED', errorCode: 'MAILBOX_TARGET_MAILBOX_ACCESS_DENIED' });
          throw new MailboxServiceError(403, 'MAILBOX_TARGET_MAILBOX_ACCESS_DENIED');
        }
        if (probe.reason === 'NOT_FOUND') {
          await recordMailboxAudit({ eventType: 'MAILBOX_TARGET_NOT_FOUND', actorUserId: state.userId, mailboxConnectionId: mailbox.id, provider: mailbox.provider, status: 'AUTHORIZATION_REQUIRED', errorCode: 'MAILBOX_TARGET_MAILBOX_NOT_FOUND' });
          throw new MailboxServiceError(404, 'MAILBOX_TARGET_MAILBOX_NOT_FOUND');
        }
        await recordMailboxAudit({ eventType: 'MAILBOX_TARGET_UNAVAILABLE', actorUserId: state.userId, mailboxConnectionId: mailbox.id, provider: mailbox.provider, status: 'AUTHORIZATION_REQUIRED', errorCode: 'MAILBOX_TARGET_MAILBOX_UNAVAILABLE' });
        throw new MailboxServiceError(502, 'MAILBOX_TARGET_MAILBOX_UNAVAILABLE');
      }
      // Delegated READ is proven. Sending from the shared mailbox additionally needs
      // Exchange Send As / Send on Behalf, which is not proven here, so the first
      // slice connects read-only rather than rejecting a readable mailbox.
      sendCapability = false;
      connectedStatus = 'CONNECTED_READ_ONLY';
      await recordMailboxAudit({ eventType: 'MAILBOX_SHARED_TARGET_AUTHORIZED', actorUserId: state.userId, mailboxConnectionId: mailbox.id, provider: mailbox.provider, status: 'CONNECTED_READ_ONLY' });
    }
    const secretReference = `mailbox-${crypto.randomUUID()}`;
    await getSecretStore().put(secretReference, authorized.secret);
    await prisma.communicationMailboxConnection.update({ where: { id: mailbox.id }, data: { secretReference, status: connectedStatus, readCapability: true, sendCapability, providerAccountId: authorized.providerAccountId ?? null, providerTenantId: authorized.providerTenantId ?? null } });
    await recordMailboxAudit({ eventType: 'MAILBOX_CONNECTED', actorUserId: state.userId, mailboxConnectionId: mailbox.id, provider: mailbox.provider, status: connectedStatus });
    if (req.method === 'GET') return redirectBrowser(res, 'connected');
    res.json({ status: connectedStatus });
  } catch (e) {
    if (req.method === 'GET') return redirectBrowser(res, 'error', e);
    safeError(res, e);
  }
}
router.post('/:id/sync', async (req, res) => { try { res.json({ mailbox: await syncMailbox(String(req.params.id), owner(req)) }); } catch (e) { safeError(res, e); } });
router.post('/:id/send', async (req, res) => { try { const communication = await sendMailboxMessage({ id: String(req.params.id), ownerUserId: owner(req), ownerRole: req.user?.role, to: Array.isArray(req.body?.to) ? req.body.to : [], cc: Array.isArray(req.body?.cc) ? req.body.cc : [], bcc: Array.isArray(req.body?.bcc) ? req.body.bcc : [], subject: String(req.body?.subject || ''), bodyText: String(req.body?.bodyText || ''), bodyHtml: req.body?.bodyHtml ?? null, replyToCommunicationId: req.body?.replyToCommunicationId ?? null, contextCommunicationId: req.body?.contextCommunicationId ?? null }); res.status(201).json({ communication }); } catch (e) { safeError(res, e); } });
router.post('/:id/disconnect', async (req, res) => { try { const mailbox = await ownedMailbox(String(req.params.id), owner(req)); if (mailbox.secretReference) await getSecretStore().delete(mailbox.secretReference).catch(() => undefined); await prisma.communicationMailboxConnection.update({ where: { id: mailbox.id }, data: { status: 'REVOKED', readCapability: false, sendCapability: false, secretReference: null, syncCursor: null } }); await recordMailboxAudit({ eventType: 'MAILBOX_DISCONNECTED', actorUserId: owner(req), mailboxConnectionId: mailbox.id, provider: mailbox.provider, status: 'REVOKED' }); await recordMailboxAudit({ eventType: 'MAILBOX_REVOKED', actorUserId: owner(req), mailboxConnectionId: mailbox.id, provider: mailbox.provider, status: 'REVOKED' }); res.status(204).end(); } catch (e) { safeError(res, e); } });
export default router;
