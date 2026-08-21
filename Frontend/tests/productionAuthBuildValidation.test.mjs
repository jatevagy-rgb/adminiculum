// Fail-closed production auth build-config validation tests
// (AUTH REMEDIATION WAVE 1).
//
// Proves the workflow can NEVER generate a production artifact with empty
// authentication configuration: the prebuild validator must fail (non-zero,
// with a precise message naming the missing variable) whenever a required
// public build variable is missing, and must pass when the full set is present.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  REQUIRED_PUBLIC_BUILD_VARS,
  WORKFORCE_REQUIRED,
  CUSTOMER_REQUIRED,
  missingRequired,
} from '../scripts/production-auth-build-contract.mjs';

const here = path.dirname(fileURLToPath(import.meta.url));
const VALIDATOR = path.resolve(here, '..', 'scripts', 'validate-production-auth-build.mjs');

/** A complete, syntactically-plausible PUBLIC env (no secrets). */
function completeEnv() {
  return {
    NEXT_PUBLIC_WORKFORCE_ENTRA_CLIENT_ID: '00000000-0000-0000-0000-00000000w0rk',
    NEXT_PUBLIC_WORKFORCE_ENTRA_TENANT_ID: '00000000-0000-0000-0000-0000000tenan',
    NEXT_PUBLIC_WORKFORCE_ENTRA_AUTHORITY: 'https://login.microsoftonline.com/tenant',
    NEXT_PUBLIC_WORKFORCE_ENTRA_REDIRECT_URI: 'https://frontend.example.net',
    NEXT_PUBLIC_WORKFORCE_ADMINICULUM_API_SCOPE: 'api://api-app/access_as_user',
    NEXT_PUBLIC_ENTRA_CLIENT_ID: '00000000-0000-0000-0000-00000cust0mer',
    NEXT_PUBLIC_ENTRA_TENANT_ID: '00000000-0000-0000-0000-000ciamtenant',
    NEXT_PUBLIC_ENTRA_AUTHORITY: 'https://example.ciamlogin.com/ciam-tenant',
    NEXT_PUBLIC_ENTRA_REDIRECT_URI: 'https://frontend.example.net/portal',
    NEXT_PUBLIC_ADMINICULUM_API_SCOPE: 'api://client-app/access_as_client',
    NEXT_PUBLIC_BACKEND_BASE_URL: 'https://backend.example.net',
  };
}

/** Run the validator with a curated env (nothing inherited from the OS). */
function runValidator(env) {
  return spawnSync(process.execPath, [VALIDATOR], { env, encoding: 'utf8' });
}

test('passes when every required public build variable is present', () => {
  const r = runValidator({ ...completeEnv() });
  assert.equal(r.status, 0, r.stderr);
  assert.match(r.stdout, /all \d+ required public auth build variables are present/);
});

test('workforce: missing clientId fails the build fail-closed with a named message', () => {
  const env = completeEnv();
  delete env.NEXT_PUBLIC_WORKFORCE_ENTRA_CLIENT_ID;
  const r = runValidator(env);
  assert.equal(r.status, 1);
  assert.match(
    r.stderr,
    /Missing required production frontend build configuration: NEXT_PUBLIC_WORKFORCE_ENTRA_CLIENT_ID/,
  );
});

test('workforce: empty-string authority is treated as missing', () => {
  const env = completeEnv();
  env.NEXT_PUBLIC_WORKFORCE_ENTRA_AUTHORITY = '   ';
  const r = runValidator(env);
  assert.equal(r.status, 1);
  assert.match(
    r.stderr,
    /Missing required production frontend build configuration: NEXT_PUBLIC_WORKFORCE_ENTRA_AUTHORITY/,
  );
});

test('customer: missing provider config fails the build fail-closed with a named message', () => {
  const env = completeEnv();
  delete env.NEXT_PUBLIC_ENTRA_CLIENT_ID;
  const r = runValidator(env);
  assert.equal(r.status, 1);
  assert.match(
    r.stderr,
    /Missing required production frontend build configuration: NEXT_PUBLIC_ENTRA_CLIENT_ID/,
  );
});

test('never prints any configuration values, only variable names', () => {
  const env = completeEnv();
  const secretish = env.NEXT_PUBLIC_WORKFORCE_ENTRA_CLIENT_ID;
  delete env.NEXT_PUBLIC_BACKEND_BASE_URL;
  const r = runValidator(env);
  assert.equal(r.status, 1);
  // The failing variable name appears; no other variable's VALUE is leaked.
  assert.match(r.stderr, /NEXT_PUBLIC_BACKEND_BASE_URL/);
  assert.ok(!r.stdout.includes(secretish) && !r.stderr.includes(secretish));
});

test('contract: workforce and customer families are both covered by the required set', () => {
  for (const name of [...WORKFORCE_REQUIRED, ...CUSTOMER_REQUIRED]) {
    assert.ok(REQUIRED_PUBLIC_BUILD_VARS.includes(name), `${name} must be required`);
  }
  // An entirely empty env reports every required var as missing.
  assert.deepEqual(missingRequired({}).sort(), [...REQUIRED_PUBLIC_BUILD_VARS].sort());
});
