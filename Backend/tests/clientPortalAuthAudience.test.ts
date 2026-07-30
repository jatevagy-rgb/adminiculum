import { acceptedAudiences, hasRequiredClientPortalScope } from '../src/middleware/clientPortalAuth';

/**
 * Regression for the production defect where External ID v2 access tokens carry
 * `aud` = bare client id but the verifier required `api://<clientId>`, rejecting
 * every customer token (401) so no ClientPortalIdentity was ever provisioned.
 */
describe('acceptedAudiences', () => {
  it('accepts both the App ID URI and the bare client-id form', () => {
    const withPrefix = acceptedAudiences('api://03b27fe1-9c8f-46fd-8d5f-3fc5b607f2c9');
    expect(withPrefix).toContain('api://03b27fe1-9c8f-46fd-8d5f-3fc5b607f2c9');
    expect(withPrefix).toContain('03b27fe1-9c8f-46fd-8d5f-3fc5b607f2c9');

    const bare = acceptedAudiences('03b27fe1-9c8f-46fd-8d5f-3fc5b607f2c9');
    expect(bare).toContain('03b27fe1-9c8f-46fd-8d5f-3fc5b607f2c9');
    expect(bare).toContain('api://03b27fe1-9c8f-46fd-8d5f-3fc5b607f2c9');
  });

  it('returns an empty list when no audience is configured', () => {
    expect(acceptedAudiences('')).toEqual([]);
    expect(acceptedAudiences('   ')).toEqual([]);
  });

  it('does not duplicate when only one form is configured', () => {
    expect(acceptedAudiences('api://x').length).toBe(2);
    expect(new Set(acceptedAudiences('api://x')).size).toBe(2);
  });
});

describe('hasRequiredClientPortalScope', () => {
  it('accepts the exact delegated access_as_client scope from scp', () => {
    expect(hasRequiredClientPortalScope({ scp: 'openid profile access_as_client' })).toBe(true);
  });

  it('denies valid issuer/audience tokens when the delegated scope is missing', () => {
    expect(hasRequiredClientPortalScope({ iss: 'issuer', aud: 'audience' })).toBe(false);
  });

  it('denies unrelated delegated scopes', () => {
    expect(hasRequiredClientPortalScope({ scp: 'openid profile User.Read' })).toBe(false);
  });

  it('accepts array-form scopes only when the exact scope is present', () => {
    expect(hasRequiredClientPortalScope({ scopes: ['openid', 'access_as_client'] })).toBe(true);
    expect(hasRequiredClientPortalScope({ scopes: ['openid', 'access_as_user'] })).toBe(false);
  });
});
