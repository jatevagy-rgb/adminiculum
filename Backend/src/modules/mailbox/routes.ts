import { Router, type Request, type Response } from 'express';
import crypto from 'crypto';
import { authenticate } from '../../middleware/auth';
import { requireWorkforceUser } from '../../middleware/workforceAuthorization';
import { prisma } from '../../prisma/prisma.service';
import { normalizeMailboxAddress } from './dedupe';
import { challengeExpiry, canResend, evaluateVerification, generateVerificationCode } from './verificationCode';
import { getTransactionalMailTransport, TransactionalMailConfigurationError } from './transactionalMail';
import { createOAuthState, verifyOAuthState } from './oauthState';
import { getMailboxProvider } from './provider';
import { getSecretStore } from './secretStore';
import { MailboxServiceError, ownedMailbox, sendMailboxMessage, syncMailbox } from './service';
import { MAILBOX_PROVIDERS, type MailboxProviderCode } from './types';
import { recordMailboxAudit } from './audit';

const router = Router();
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
async function oauthStart(req: Request, res: Response, code: MailboxProviderCode) { try { const mailbox = await ownedMailbox(String(req.params.id), owner(req)); if (mailbox.provider !== code || mailbox.status === 'REVOKED') throw new MailboxServiceError(409, 'MAILBOX_AUTHORIZATION_NOT_AVAILABLE'); const state = createOAuthState({ userId: owner(req), connectionId: mailbox.id, mailboxAddress: mailbox.mailboxAddress, provider: code }); const redirectUri = code === 'MICROSOFT_GRAPH' ? String(process.env.MICROSOFT_MAILBOX_REDIRECT_URI || '') : String(process.env.GOOGLE_MAILBOX_REDIRECT_URI || ''); await recordMailboxAudit({ eventType: 'MAILBOX_AUTHORIZATION_STARTED', actorUserId: owner(req), mailboxConnectionId: mailbox.id, provider: mailbox.provider, status: mailbox.status }); res.json({ authorizationUrl: getMailboxProvider(code).buildAuthorizationUrl({ state, redirectUri }) }); } catch (e) { safeError(res, e); } }
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
    const adapter = getMailboxProvider(expected);
    const redirectUri = expected === 'MICROSOFT_GRAPH' ? String(process.env.MICROSOFT_MAILBOX_REDIRECT_URI || '') : String(process.env.GOOGLE_MAILBOX_REDIRECT_URI || '');
    const authorized = await adapter.exchangeAuthorizationCode({ code: String(req.query.code || req.body?.code || ''), redirectUri });
    const authorizedAddress = normalizeMailboxAddress(authorized.authorizedAddress);
    if (!authorizedAddress) {
      await recordMailboxAudit({ eventType: 'MAILBOX_IDENTITY_UNAVAILABLE', actorUserId: state.userId, mailboxConnectionId: mailbox.id, provider: mailbox.provider, status: 'AUTHORIZATION_REQUIRED', errorCode: 'MAILBOX_PROVIDER_IDENTITY_UNAVAILABLE' });
      throw new MailboxServiceError(502, 'MAILBOX_PROVIDER_IDENTITY_UNAVAILABLE');
    }
    if (authorizedAddress !== normalizeMailboxAddress(mailbox.mailboxAddress)) {
      await recordMailboxAudit({ eventType: 'MAILBOX_IDENTITY_MISMATCH', actorUserId: state.userId, mailboxConnectionId: mailbox.id, provider: mailbox.provider, status: 'AUTHORIZATION_REQUIRED', errorCode: 'MAILBOX_PROVIDER_IDENTITY_MISMATCH' });
      throw new MailboxServiceError(403, 'MAILBOX_PROVIDER_IDENTITY_MISMATCH');
    }
    const secretReference = `mailbox-${crypto.randomUUID()}`;
    await getSecretStore().put(secretReference, authorized.secret);
    await prisma.communicationMailboxConnection.update({ where: { id: mailbox.id }, data: { secretReference, status: 'CONNECTED', readCapability: true, sendCapability: true, providerAccountId: authorized.providerAccountId ?? null, providerTenantId: authorized.providerTenantId ?? null } });
    await recordMailboxAudit({ eventType: 'MAILBOX_CONNECTED', actorUserId: state.userId, mailboxConnectionId: mailbox.id, provider: mailbox.provider, status: 'CONNECTED' });
    res.json({ status: 'CONNECTED' });
  } catch (e) { safeError(res, e); }
}
router.get('/oauth/microsoft/callback', (req, res) => oauthCallback(req, res, 'MICROSOFT_GRAPH')); router.post('/oauth/microsoft/callback', (req, res) => oauthCallback(req, res, 'MICROSOFT_GRAPH')); router.get('/oauth/google/callback', (req, res) => oauthCallback(req, res, 'GOOGLE_GMAIL')); router.post('/oauth/google/callback', (req, res) => oauthCallback(req, res, 'GOOGLE_GMAIL'));
router.post('/:id/sync', async (req, res) => { try { res.json({ mailbox: await syncMailbox(String(req.params.id), owner(req)) }); } catch (e) { safeError(res, e); } });
router.post('/:id/send', async (req, res) => { try { const communication = await sendMailboxMessage({ id: String(req.params.id), ownerUserId: owner(req), to: Array.isArray(req.body?.to) ? req.body.to : [], cc: Array.isArray(req.body?.cc) ? req.body.cc : [], bcc: Array.isArray(req.body?.bcc) ? req.body.bcc : [], subject: String(req.body?.subject || ''), bodyText: String(req.body?.bodyText || ''), bodyHtml: req.body?.bodyHtml ?? null, replyToCommunicationId: req.body?.replyToCommunicationId ?? null }); res.status(201).json({ communication }); } catch (e) { safeError(res, e); } });
router.post('/:id/disconnect', async (req, res) => { try { const mailbox = await ownedMailbox(String(req.params.id), owner(req)); if (mailbox.secretReference) await getSecretStore().delete(mailbox.secretReference).catch(() => undefined); await prisma.communicationMailboxConnection.update({ where: { id: mailbox.id }, data: { status: 'REVOKED', readCapability: false, sendCapability: false, secretReference: null, syncCursor: null } }); await recordMailboxAudit({ eventType: 'MAILBOX_DISCONNECTED', actorUserId: owner(req), mailboxConnectionId: mailbox.id, provider: mailbox.provider, status: 'REVOKED' }); await recordMailboxAudit({ eventType: 'MAILBOX_REVOKED', actorUserId: owner(req), mailboxConnectionId: mailbox.id, provider: mailbox.provider, status: 'REVOKED' }); res.status(204).end(); } catch (e) { safeError(res, e); } });
export default router;
