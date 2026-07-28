/**
 * Verify the customer (Client Portal) external identity provider configuration.
 *
 * Reads only NON-SECRET env inputs, fetches the provider's OpenID Connect
 * discovery document, and confirms the deployed backend token-validation inputs
 * (CLIENT_IDENTITY_ISSUER / _AUDIENCE / _JWKS_URI) are internally consistent with
 * the provider and are isolated from the workforce identity.
 *
 * It never prints secrets (there are none on this path — validation is JWKS-only)
 * and exits non-zero on any mismatch so it can gate a deploy.
 *
 *   npx tsx scripts/verify-client-identity-provider-config.ts
 *
 * Optional override: CLIENT_IDENTITY_DISCOVERY_URL to point at the discovery doc
 * explicitly; otherwise it is derived from CLIENT_IDENTITY_ISSUER + well-known path.
 */

export interface DiscoveryDoc {
  issuer?: string;
  jwks_uri?: string;
  authorization_endpoint?: string;
  token_endpoint?: string;
  end_session_endpoint?: string;
}

export interface ProviderConfigInputs {
  issuer: string;
  audience: string;
  jwksUri: string;
  /** Optional workforce issuer, to prove customer/workforce isolation. */
  workforceIssuer?: string;
}

export interface CheckResult {
  ok: boolean;
  checks: Array<{ name: string; ok: boolean; detail: string }>;
}

const REQUIRED_ENDPOINT_FIELDS: Array<keyof DiscoveryDoc> = [
  'authorization_endpoint',
  'token_endpoint',
  'end_session_endpoint',
];

/** Read the non-secret backend token-validation inputs from the environment. */
export function readProviderConfigInputs(env: NodeJS.ProcessEnv = process.env): ProviderConfigInputs {
  const pick = (...names: string[]): string => {
    for (const n of names) {
      const v = String(env[n] || '').trim();
      if (v) return v;
    }
    return '';
  };
  return {
    issuer: pick('CLIENT_IDENTITY_ISSUER', 'CLIENT_PORTAL_IDENTITY_ISSUER'),
    audience: pick('CLIENT_IDENTITY_AUDIENCE', 'CLIENT_PORTAL_IDENTITY_AUDIENCE'),
    jwksUri: pick('CLIENT_IDENTITY_JWKS_URI', 'CLIENT_PORTAL_IDENTITY_JWKS_URI'),
    workforceIssuer: pick('AUTH_ISSUER', 'ENTRA_ISSUER', 'AZURE_ISSUER', 'WORKFORCE_IDENTITY_ISSUER'),
  };
}

/** Derive the discovery URL from an issuer, unless one is provided explicitly. */
export function resolveDiscoveryUrl(inputs: ProviderConfigInputs, env: NodeJS.ProcessEnv = process.env): string {
  const explicit = String(env.CLIENT_IDENTITY_DISCOVERY_URL || '').trim();
  if (explicit) return explicit;
  if (!inputs.issuer) return '';
  const base = inputs.issuer.replace(/\/+$/, '');
  return `${base}/.well-known/openid-configuration`;
}

/**
 * Pure comparison of configured inputs against a fetched discovery document.
 * No network, no secrets — unit-testable.
 */
export function evaluateProviderConfig(inputs: ProviderConfigInputs, discovery: DiscoveryDoc): CheckResult {
  const checks: CheckResult['checks'] = [];
  const norm = (s: string | undefined) => String(s || '').trim().replace(/\/+$/, '');

  checks.push({
    name: 'issuer-present',
    ok: Boolean(inputs.issuer),
    detail: inputs.issuer ? 'configured' : 'CLIENT_IDENTITY_ISSUER is empty',
  });
  checks.push({
    name: 'audience-present',
    ok: Boolean(inputs.audience),
    detail: inputs.audience ? 'configured' : 'CLIENT_IDENTITY_AUDIENCE is empty',
  });
  checks.push({
    name: 'jwks-uri-present',
    ok: Boolean(inputs.jwksUri),
    detail: inputs.jwksUri ? 'configured' : 'CLIENT_IDENTITY_JWKS_URI is empty',
  });

  checks.push({
    name: 'issuer-matches-discovery',
    ok: Boolean(discovery.issuer) && norm(inputs.issuer) === norm(discovery.issuer),
    detail: `configured=${norm(inputs.issuer) || '(empty)'} discovery=${norm(discovery.issuer) || '(empty)'}`,
  });

  checks.push({
    name: 'jwks-uri-matches-discovery',
    ok: Boolean(discovery.jwks_uri) && norm(inputs.jwksUri) === norm(discovery.jwks_uri),
    detail: `configured=${norm(inputs.jwksUri) || '(empty)'} discovery=${norm(discovery.jwks_uri) || '(empty)'}`,
  });

  for (const field of REQUIRED_ENDPOINT_FIELDS) {
    checks.push({
      name: `discovery-has-${field}`,
      ok: Boolean(discovery[field]),
      detail: discovery[field] ? 'present' : 'missing from discovery document',
    });
  }

  // Customer / workforce isolation: the customer issuer must not equal the
  // workforce issuer. (If no workforce issuer is configured, treat as pass.)
  const isolationOk = !inputs.workforceIssuer || norm(inputs.issuer) !== norm(inputs.workforceIssuer);
  checks.push({
    name: 'customer-workforce-issuer-isolation',
    ok: isolationOk,
    detail: inputs.workforceIssuer
      ? isolationOk
        ? 'customer issuer differs from workforce issuer'
        : 'customer issuer EQUALS workforce issuer — tokens would cross validation boundaries'
      : 'no workforce issuer configured to compare (skipped)',
  });

  return { ok: checks.every((c) => c.ok), checks };
}

async function fetchDiscovery(url: string): Promise<DiscoveryDoc> {
  const res = await fetch(url, { headers: { accept: 'application/json' } });
  if (!res.ok) throw new Error(`discovery fetch failed: ${res.status} ${res.statusText}`);
  return (await res.json()) as DiscoveryDoc;
}

async function main(): Promise<void> {
  const inputs = readProviderConfigInputs();
  const discoveryUrl = resolveDiscoveryUrl(inputs);

  if (!inputs.issuer || !inputs.audience || !inputs.jwksUri) {
    console.error('FAIL: customer identity provider is not configured.');
    console.error('  Set CLIENT_IDENTITY_ISSUER, CLIENT_IDENTITY_AUDIENCE, CLIENT_IDENTITY_JWKS_URI.');
    console.error('  (values come from the OIDC discovery document — see docs/runbooks/client-external-identity-provider-setup.md)');
    process.exit(2);
  }
  if (!discoveryUrl) {
    console.error('FAIL: cannot resolve discovery URL (no issuer, no CLIENT_IDENTITY_DISCOVERY_URL).');
    process.exit(2);
  }

  console.log(`Fetching discovery document: ${discoveryUrl}`);
  let discovery: DiscoveryDoc;
  try {
    discovery = await fetchDiscovery(discoveryUrl);
  } catch (err) {
    console.error(`FAIL: ${(err as Error).message}`);
    process.exit(1);
    return;
  }

  const result = evaluateProviderConfig(inputs, discovery);
  for (const c of result.checks) {
    console.log(`${c.ok ? 'PASS' : 'FAIL'}  ${c.name}: ${c.detail}`);
  }
  // Note: audience cannot be verified against discovery (it is a token claim, not
  // a discovery field). Confirm CLIENT_IDENTITY_AUDIENCE against a real token's
  // `aud` during acceptance. This script confirms it is set and non-empty.
  console.log(`INFO  audience configured (verify against a real token's aud claim during acceptance).`);

  if (!result.ok) {
    console.error('\nRESULT: FAIL — provider configuration is inconsistent. See failures above.');
    process.exit(1);
  }
  console.log('\nRESULT: PASS — provider configuration is consistent with the discovery document.');
}

// Only run when executed directly, not when imported by tests.
if (require.main === module) {
  void main();
}
