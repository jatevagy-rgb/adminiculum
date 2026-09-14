/**
 * UNIVERSAL MAILBOX — email ownership verification (pure core).
 *
 * Security properties:
 * - cryptographically random numeric code
 * - stored HASHED with a per-challenge salt (never plaintext)
 * - constant-time comparison
 * - single use, short expiry, attempt limit, resend cooldown
 *
 * This module never persists anything and never sends mail; callers wire it to
 * the EmailVerificationChallenge model and the transactional mail transport.
 */

import crypto from 'crypto';

export const VERIFICATION_CODE_DIGITS = 6;
export const VERIFICATION_CODE_TTL_SECONDS = 10 * 60; // 10 minutes
export const VERIFICATION_MAX_ATTEMPTS = 5;
export const VERIFICATION_RESEND_COOLDOWN_SECONDS = 60;

export interface GeneratedVerificationCode {
  code: string;
  codeHash: string;
  codeSalt: string;
}

/** Generates a cryptographically random numeric code and its salted hash. */
export function generateVerificationCode(digits: number = VERIFICATION_CODE_DIGITS): GeneratedVerificationCode {
  const max = 10 ** digits;
  const code = String(crypto.randomInt(0, max)).padStart(digits, '0');
  const codeSalt = crypto.randomBytes(16).toString('hex');
  return { code, codeHash: hashVerificationCode(code, codeSalt), codeSalt };
}

export function hashVerificationCode(code: string, salt: string): string {
  return crypto.pbkdf2Sync(String(code), salt, 100_000, 32, 'sha256').toString('hex');
}

/** Constant-time verification. */
export function verifyVerificationCode(code: string, salt: string, expectedHash: string): boolean {
  const actual = Buffer.from(hashVerificationCode(code, salt), 'hex');
  const expected = Buffer.from(String(expectedHash), 'hex');
  if (actual.length !== expected.length || actual.length === 0) return false;
  return crypto.timingSafeEqual(actual, expected);
}

export function challengeExpiry(now: Date = new Date(), ttlSeconds: number = VERIFICATION_CODE_TTL_SECONDS): Date {
  return new Date(now.getTime() + ttlSeconds * 1000);
}

export function isExpired(expiresAt: Date, now: Date = new Date()): boolean {
  return now.getTime() >= new Date(expiresAt).getTime();
}

export function isConsumed(consumedAt: Date | null | undefined): boolean {
  return consumedAt != null;
}

export function canAttempt(challenge: { attemptCount: number; maxAttempts: number; consumedAt?: Date | null }): boolean {
  if (isConsumed(challenge.consumedAt)) return false;
  return challenge.attemptCount < challenge.maxAttempts;
}

export function canResend(
  lastSentAt: Date,
  now: Date = new Date(),
  cooldownSeconds: number = VERIFICATION_RESEND_COOLDOWN_SECONDS,
): boolean {
  return now.getTime() - new Date(lastSentAt).getTime() >= cooldownSeconds * 1000;
}

export type VerificationOutcome = 'VERIFIED' | 'INVALID_CODE' | 'EXPIRED' | 'CONSUMED' | 'TOO_MANY_ATTEMPTS';

/**
 * Pure evaluation of a verification attempt. The caller applies the result and
 * persists attemptCount/consumedAt. `attemptCount` is the count BEFORE this try.
 */
export function evaluateVerification(input: {
  providedCode: string;
  codeSalt: string;
  codeHash: string;
  expiresAt: Date;
  consumedAt?: Date | null;
  attemptCount: number;
  maxAttempts: number;
  now?: Date;
}): VerificationOutcome {
  const now = input.now ?? new Date();
  if (isConsumed(input.consumedAt)) return 'CONSUMED';
  if (isExpired(input.expiresAt, now)) return 'EXPIRED';
  if (input.attemptCount >= input.maxAttempts) return 'TOO_MANY_ATTEMPTS';
  return verifyVerificationCode(input.providedCode, input.codeSalt, input.codeHash) ? 'VERIFIED' : 'INVALID_CODE';
}
