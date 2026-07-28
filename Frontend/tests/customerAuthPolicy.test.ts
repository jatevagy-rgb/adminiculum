import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  evaluateCustomerProvider,
  sanitizeAuthError,
  customerPostLogoutRedirectUri,
  isProductionRuntime,
  WORKFORCE_AUTHORITY_HOST,
  REGISTRATION_PROMPT,
} from '../src/lib/customerAuthPolicy';

// Behavioural tests: import the pure policy and execute it (not source-string
// matching). This is the deploy-relevant decision logic for the customer
// authentication entry surfaces.

describe('evaluateCustomerProvider', () => {
  it('is configured with a client id and a customer authority', () => {
    const r = evaluateCustomerProvider({
      clientId: 'spa-client-id',
      authority: 'https://adminiculumclients.ciamlogin.com/tenant/v2.0',
      isProduction: true,
    });
    assert.equal(r.configured, true);
    assert.equal(r.reason, 'OK');
  });

  it('is NOT configured when the client id is missing', () => {
    const r = evaluateCustomerProvider({ clientId: '', authority: 'https://x.ciamlogin.com', isProduction: false });
    assert.equal(r.configured, false);
    assert.equal(r.reason, 'MISSING_CLIENT_ID');
  });

  it('is NOT configured when the authority is missing', () => {
    const r = evaluateCustomerProvider({ clientId: 'id', authority: '', isProduction: false });
    assert.equal(r.configured, false);
    assert.equal(r.reason, 'MISSING_AUTHORITY');
  });

  it('in PRODUCTION does not fall back to the workforce authority', () => {
    const r = evaluateCustomerProvider({
      clientId: 'id',
      authority: `https://${WORKFORCE_AUTHORITY_HOST}/some-tenant`,
      isProduction: true,
    });
    assert.equal(r.configured, false);
    assert.equal(r.reason, 'WORKFORCE_AUTHORITY_IN_PRODUCTION');
  });

  it('permits the workforce host outside production (CI/dev build)', () => {
    const r = evaluateCustomerProvider({
      clientId: 'id',
      authority: `https://${WORKFORCE_AUTHORITY_HOST}/some-tenant`,
      isProduction: false,
    });
    assert.equal(r.configured, true);
  });
});

describe('isProductionRuntime', () => {
  it('is true only for NODE_ENV=production', () => {
    assert.equal(isProductionRuntime('production'), true);
    assert.equal(isProductionRuntime('test'), false);
    assert.equal(isProductionRuntime(undefined), false);
  });
});

describe('sanitizeAuthError', () => {
  it('never leaks the underlying error, token, or code', () => {
    const msg = sanitizeAuthError(new Error('token=eyJabc.DEF.ghi secret code 123456'));
    assert.doesNotMatch(msg, /eyJabc|token=|123456|secret/i);
    assert.ok(msg.length > 0);
  });
});

describe('customerPostLogoutRedirectUri', () => {
  it('returns the /portal entry on the same origin, without double slashes', () => {
    assert.equal(customerPostLogoutRedirectUri('https://app.example.com'), 'https://app.example.com/portal');
    assert.equal(customerPostLogoutRedirectUri('https://app.example.com/'), 'https://app.example.com/portal');
  });
});

describe('REGISTRATION_PROMPT', () => {
  it('jumps the combined flow straight to account creation', () => {
    assert.equal(REGISTRATION_PROMPT, 'create');
  });
});
