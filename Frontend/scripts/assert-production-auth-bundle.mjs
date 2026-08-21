#!/usr/bin/env node
// Post-build ARTIFACT validation of the public auth build contract.
//
// Proves the generated browser/standalone artifact was built WITH the real
// public auth configuration — i.e. it is not the incident's invalid state
// (empty workforce/customer clientId or authority). It does this deterministically
// by asserting that the expected public client-id and authority values from the
// build environment are actually present in the emitted bundle, rather than
// scanning for fragile MSAL library constants.
//
// It never prints secrets (there are none in a public bundle) and never prints
// the full values — only variable NAMES and pass/fail.

import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const frontendRoot = path.resolve(here, '..');

// Distinctive public values that MUST be baked into the bundle for login to work.
// Each is verified present; their EMPTY state is exactly the production incident.
const REQUIRED_ARTIFACT_VALUES = [
  'NEXT_PUBLIC_WORKFORCE_ENTRA_CLIENT_ID',
  'NEXT_PUBLIC_WORKFORCE_ENTRA_AUTHORITY',
  'NEXT_PUBLIC_ENTRA_CLIENT_ID',
  'NEXT_PUBLIC_ENTRA_AUTHORITY',
  'NEXT_PUBLIC_ADMINICULUM_API_SCOPE',
  'NEXT_PUBLIC_WORKFORCE_ADMINICULUM_API_SCOPE',
  'NEXT_PUBLIC_BACKEND_BASE_URL',
];

const scanRoots = [
  path.join(frontendRoot, '.next', 'static'),
  path.join(frontendRoot, '.next', 'standalone'),
  path.join(frontendRoot, '.next', 'server'),
].filter((p) => existsSync(p));

if (scanRoots.length === 0) {
  console.error('[prod-auth-bundle] No .next output found. Run `npm run build` first.');
  process.exit(1);
}

const ignoredDirs = new Set(['cache', 'node_modules']);

/** Load all JS/text chunk contents once (bounded to build output). */
function collectChunks(root) {
  const out = [];
  const stack = [root];
  while (stack.length) {
    const p = stack.pop();
    const st = statSync(p);
    if (st.isDirectory()) {
      if (ignoredDirs.has(path.basename(p))) continue;
      for (const c of readdirSync(p)) stack.push(path.join(p, c));
    } else if (st.isFile() && /\.(js|mjs|cjs|json|html)$/.test(p)) {
      out.push(readFileSync(p, 'utf8'));
    }
  }
  return out;
}

const haystack = scanRoots.flatMap(collectChunks);

// Gather expected values from the build environment (same env used for the build).
const expected = [];
const emptyEnv = [];
for (const name of REQUIRED_ARTIFACT_VALUES) {
  const v = process.env[name];
  if (v === undefined || v === null || String(v).trim() === '') {
    emptyEnv.push(name);
  } else {
    expected.push({ name, value: String(v).trim() });
  }
}

if (emptyEnv.length > 0) {
  for (const name of emptyEnv) {
    console.error(`[prod-auth-bundle] Build environment missing required value for: ${name}`);
  }
  console.error('[prod-auth-bundle] Cannot validate an artifact built without the required public auth values.');
  process.exit(1);
}

const notBaked = expected.filter(({ value }) => !haystack.some((c) => c.includes(value)));

if (notBaked.length > 0) {
  for (const { name } of notBaked) {
    console.error(`[prod-auth-bundle] Expected public auth value NOT baked into the artifact: ${name}`);
  }
  console.error(
    '[prod-auth-bundle] The generated bundle does not contain the required workforce/customer auth ' +
      'configuration. This is the production incident state (empty clientId/authority). Rebuild with the ' +
      'production NEXT_PUBLIC_* variables injected at build time.',
  );
  process.exit(1);
}

console.log(
  `[prod-auth-bundle] OK: workforce + customer clientId/authority and API scopes are baked into the artifact ` +
    `(${expected.length} public markers verified present, none empty).`,
);
