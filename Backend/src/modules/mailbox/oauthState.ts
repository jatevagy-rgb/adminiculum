import crypto from 'crypto';

type OAuthStatePayload = { userId: string; connectionId: string; mailboxAddress: string; provider: string; nonce: string; expiresAt: number };

function key(env: NodeJS.ProcessEnv): string {
  const value = String(env.MAILBOX_OAUTH_STATE_SECRET || '');
  if (value.length < 32) throw new Error('MAILBOX_OAUTH_STATE_NOT_CONFIGURED');
  return value;
}
export function createOAuthState(input: Omit<OAuthStatePayload, 'nonce' | 'expiresAt'>, env = process.env): string {
  const payload: OAuthStatePayload = { ...input, nonce: crypto.randomBytes(20).toString('base64url'), expiresAt: Date.now() + 10 * 60_000 };
  const body = Buffer.from(JSON.stringify(payload)).toString('base64url');
  const signature = crypto.createHmac('sha256', key(env)).update(body).digest('base64url');
  return `${body}.${signature}`;
}
export function verifyOAuthState(value: string, env = process.env): OAuthStatePayload {
  const [body, signature] = String(value).split('.');
  const expected = crypto.createHmac('sha256', key(env)).update(body).digest('base64url');
  const supplied = Buffer.from(signature || ''); const expectedBuffer = Buffer.from(expected);
  if (!body || !signature || supplied.length !== expectedBuffer.length || !crypto.timingSafeEqual(supplied, expectedBuffer)) throw new Error('MAILBOX_OAUTH_STATE_INVALID');
  const payload = JSON.parse(Buffer.from(body, 'base64url').toString('utf8')) as OAuthStatePayload;
  if (!payload.userId || !payload.connectionId || payload.expiresAt <= Date.now()) throw new Error('MAILBOX_OAUTH_STATE_EXPIRED');
  return payload;
}
