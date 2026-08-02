import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { canStartWorkforceSignIn } from '../src/lib/workforceAuthPolicy';

const base = { msalInteractionInProgress: false, loginPending: false, hasAccount: false, isAuthenticated: false };

describe('canStartWorkforceSignIn', () => {
  it('allows sign-in on a fresh bootstrapping load (no account, MSAL ready) — the regression', () => {
    // Previously blocked because authState was "bootstrapping" not "idle".
    assert.equal(canStartWorkforceSignIn({ ...base }), true);
  });

  it('allows the successful login start once', () => {
    assert.equal(canStartWorkforceSignIn({ ...base, hasAccount: false, isAuthenticated: false }), true);
  });

  it('blocks while an MSAL interaction is already in progress (no redirect loop)', () => {
    assert.equal(canStartWorkforceSignIn({ ...base, msalInteractionInProgress: true }), false);
  });

  it('blocks a double click while a login is pending (no double redirect)', () => {
    assert.equal(canStartWorkforceSignIn({ ...base, loginPending: true }), false);
  });

  it('blocks when a workforce account already exists', () => {
    assert.equal(canStartWorkforceSignIn({ ...base, hasAccount: true }), false);
  });

  it('blocks when already authenticated', () => {
    assert.equal(canStartWorkforceSignIn({ ...base, isAuthenticated: true }), false);
  });
});

describe('AuthenticatedApp workforce sign-in wiring (source contract)', () => {
  const root = process.cwd();
  const src = readFileSync(path.join(root, 'src/components/AuthenticatedApp.tsx'), 'utf8');

  it('uses the policy instead of a raw authState === "idle" guard in signIn', () => {
    assert.match(src, /canStartWorkforceSignIn\(/);
    // the fragile guard must be gone from the signIn trigger
    const signInBlock = src.slice(src.indexOf('const signIn'), src.indexOf('const signOut'));
    assert.doesNotMatch(signInBlock, /authState !== "idle"/);
  });

  it('initializes MSAL before loginRedirect (no uninitialized-instance throw)', () => {
    const signInBlock = src.slice(src.indexOf('const signIn'), src.indexOf('const signOut'));
    assert.match(signInBlock, /instance\.initialize\(\)/);
    assert.match(signInBlock, /instance\.initialize\(\)[\s\S]*instance\.loginRedirect/);
  });

  it('does not alter authority/tenant/redirect configuration', () => {
    // The fix must not touch auth config; those come from authConfig.ts unchanged.
    assert.doesNotMatch(src, /authority:\s*["']http/);
    assert.doesNotMatch(src, /redirectUri:\s*["']http/);
  });
});
