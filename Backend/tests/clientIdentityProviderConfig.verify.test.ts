/**
 * Unit tests for the customer identity provider verification helpers
 * (scripts/verify-client-identity-provider-config.ts). Pure logic only — no
 * network, no secrets. Confirms the deploy-gating comparison behaves correctly:
 * issuer/jwks must match the discovery document, required endpoints must be
 * present, and the customer issuer must be isolated from the workforce issuer.
 */
import {
  readProviderConfigInputs,
  resolveDiscoveryUrl,
  evaluateProviderConfig,
  type DiscoveryDoc,
  type ProviderConfigInputs,
} from '../../scripts/verify-client-identity-provider-config';

const goodInputs: ProviderConfigInputs = {
  issuer: 'https://adminiculumclients.ciamlogin.com/tenant-id/v2.0',
  audience: 'api://backend-client-id',
  jwksUri: 'https://adminiculumclients.ciamlogin.com/tenant-id/discovery/v2.0/keys',
  workforceIssuer: 'https://login.microsoftonline.com/workforce-tenant/v2.0',
};

const goodDiscovery: DiscoveryDoc = {
  issuer: 'https://adminiculumclients.ciamlogin.com/tenant-id/v2.0',
  jwks_uri: 'https://adminiculumclients.ciamlogin.com/tenant-id/discovery/v2.0/keys',
  authorization_endpoint: 'https://adminiculumclients.ciamlogin.com/tenant-id/oauth2/v2.0/authorize',
  token_endpoint: 'https://adminiculumclients.ciamlogin.com/tenant-id/oauth2/v2.0/token',
  end_session_endpoint: 'https://adminiculumclients.ciamlogin.com/tenant-id/oauth2/v2.0/logout',
};

describe('readProviderConfigInputs', () => {
  it('reads primary env names and trims values', () => {
    const inputs = readProviderConfigInputs({
      CLIENT_IDENTITY_ISSUER: '  https://iss/v2.0  ',
      CLIENT_IDENTITY_AUDIENCE: 'api://aud',
      CLIENT_IDENTITY_JWKS_URI: 'https://iss/keys',
    } as NodeJS.ProcessEnv);
    expect(inputs.issuer).toBe('https://iss/v2.0');
    expect(inputs.audience).toBe('api://aud');
    expect(inputs.jwksUri).toBe('https://iss/keys');
  });

  it('falls back to the CLIENT_PORTAL_IDENTITY_* aliases', () => {
    const inputs = readProviderConfigInputs({
      CLIENT_PORTAL_IDENTITY_ISSUER: 'https://alias/v2.0',
      CLIENT_PORTAL_IDENTITY_AUDIENCE: 'api://alias',
      CLIENT_PORTAL_IDENTITY_JWKS_URI: 'https://alias/keys',
    } as NodeJS.ProcessEnv);
    expect(inputs.issuer).toBe('https://alias/v2.0');
    expect(inputs.audience).toBe('api://alias');
    expect(inputs.jwksUri).toBe('https://alias/keys');
  });
});

describe('resolveDiscoveryUrl', () => {
  it('derives the well-known path from the issuer', () => {
    expect(resolveDiscoveryUrl({ ...goodInputs, issuer: 'https://iss/v2.0/' })).toBe(
      'https://iss/v2.0/.well-known/openid-configuration',
    );
  });
  it('prefers an explicit CLIENT_IDENTITY_DISCOVERY_URL', () => {
    expect(
      resolveDiscoveryUrl(goodInputs, { CLIENT_IDENTITY_DISCOVERY_URL: 'https://explicit/disco' } as NodeJS.ProcessEnv),
    ).toBe('https://explicit/disco');
  });
  it('returns empty when there is no issuer and no explicit URL', () => {
    expect(resolveDiscoveryUrl({ ...goodInputs, issuer: '' }, {} as NodeJS.ProcessEnv)).toBe('');
  });
});

describe('evaluateProviderConfig', () => {
  it('passes for a consistent, isolated configuration', () => {
    const result = evaluateProviderConfig(goodInputs, goodDiscovery);
    expect(result.ok).toBe(true);
  });

  it('ignores a trailing slash difference on issuer/jwks', () => {
    const result = evaluateProviderConfig(
      { ...goodInputs, issuer: goodInputs.issuer + '/', jwksUri: goodInputs.jwksUri + '/' },
      goodDiscovery,
    );
    expect(result.ok).toBe(true);
  });

  it('fails when the configured issuer does not match discovery', () => {
    const result = evaluateProviderConfig({ ...goodInputs, issuer: 'https://wrong/v2.0' }, goodDiscovery);
    expect(result.ok).toBe(false);
    expect(result.checks.find((c) => c.name === 'issuer-matches-discovery')?.ok).toBe(false);
  });

  it('fails when the jwks uri does not match discovery', () => {
    const result = evaluateProviderConfig({ ...goodInputs, jwksUri: 'https://wrong/keys' }, goodDiscovery);
    expect(result.ok).toBe(false);
    expect(result.checks.find((c) => c.name === 'jwks-uri-matches-discovery')?.ok).toBe(false);
  });

  it('fails when a required endpoint is missing from discovery', () => {
    const { end_session_endpoint, ...partial } = goodDiscovery;
    const result = evaluateProviderConfig(goodInputs, partial);
    expect(result.ok).toBe(false);
    expect(result.checks.find((c) => c.name === 'discovery-has-end_session_endpoint')?.ok).toBe(false);
  });

  it('fails isolation when customer issuer equals workforce issuer', () => {
    const result = evaluateProviderConfig(
      { ...goodInputs, workforceIssuer: goodInputs.issuer },
      goodDiscovery,
    );
    expect(result.ok).toBe(false);
    expect(result.checks.find((c) => c.name === 'customer-workforce-issuer-isolation')?.ok).toBe(false);
  });

  it('treats isolation as pass when no workforce issuer is configured', () => {
    const { workforceIssuer, ...noWorkforce } = goodInputs;
    const result = evaluateProviderConfig(noWorkforce as ProviderConfigInputs, goodDiscovery);
    expect(result.checks.find((c) => c.name === 'customer-workforce-issuer-isolation')?.ok).toBe(true);
  });

  it('fails when a required input is empty', () => {
    const result = evaluateProviderConfig({ ...goodInputs, audience: '' }, goodDiscovery);
    expect(result.ok).toBe(false);
    expect(result.checks.find((c) => c.name === 'audience-present')?.ok).toBe(false);
  });
});
