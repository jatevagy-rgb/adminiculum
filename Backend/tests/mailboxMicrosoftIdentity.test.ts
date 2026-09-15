import {
  GmailMailboxProvider,
  MicrosoftGraphMailboxProvider,
  microsoftIdentityAddressSet,
  parseMicrosoftSmtpProxyAddresses,
} from '../src/modules/mailbox/provider';
import { mailboxIdentityMatches, normalizeMailboxAddress } from '../src/modules/mailbox/dedupe';

function response(body: unknown): Response {
  return { ok: true, json: async () => body } as Response;
}

const VERIFIED = 'hubay.mate@balintfy.hu';

describe('Microsoft authoritative mailbox identity set', () => {
  it('A. accepts the exact profile.mail match', () => {
    const set = microsoftIdentityAddressSet({ mail: VERIFIED });
    expect(mailboxIdentityMatches(VERIFIED, set)).toBe(true);
  });

  it('B. accepts the exact userPrincipalName match', () => {
    const set = microsoftIdentityAddressSet({ mail: null, userPrincipalName: VERIFIED });
    expect(mailboxIdentityMatches(VERIFIED, set)).toBe(true);
  });

  it('C. accepts a primary SMTP proxy (SMTP:)', () => {
    const set = microsoftIdentityAddressSet({
      mail: 'primary@tenant.hu',
      proxyAddresses: [`SMTP:${VERIFIED}`],
    });
    expect(mailboxIdentityMatches(VERIFIED, set)).toBe(true);
  });

  it('D. accepts a secondary SMTP alias (smtp:)', () => {
    const set = microsoftIdentityAddressSet({
      mail: 'primary@tenant.hu',
      proxyAddresses: [`smtp:${VERIFIED}`],
    });
    expect(mailboxIdentityMatches(VERIFIED, set)).toBe(true);
  });

  it('E. rejects a genuinely different Microsoft account', () => {
    const set = microsoftIdentityAddressSet({
      mail: 'someone.else@balintfy.hu',
      proxyAddresses: ['smtp:other@balintfy.hu'],
    });
    expect(mailboxIdentityMatches(VERIFIED, set)).toBe(false);
  });

  it('F. rejects same-domain but different address', () => {
    const set = microsoftIdentityAddressSet({
      mail: 'colleague@balintfy.hu',
      proxyAddresses: ['smtp:another@balintfy.hu'],
    });
    expect(mailboxIdentityMatches(VERIFIED, set)).toBe(false);
  });

  it('G. ignores non-SMTP proxy types (X500/SIP/SPO)', () => {
    expect(parseMicrosoftSmtpProxyAddresses([`X500:${VERIFIED}`, `SIP:${VERIFIED}`, `SPO:${VERIFIED}`])).toEqual([]);
    const set = microsoftIdentityAddressSet({ proxyAddresses: [`X500:${VERIFIED}`, `SIP:${VERIFIED}`] });
    expect(set).toEqual([]);
    expect(mailboxIdentityMatches(VERIFIED, set)).toBe(false);
  });

  it('H. ignores malformed proxy entries', () => {
    expect(
      parseMicrosoftSmtpProxyAddresses(['smtp:not-an-email', 'SMTP:', 'smtp:', 42, null, 'garbage']),
    ).toEqual([]);
    const set = microsoftIdentityAddressSet({
      mail: 'primary@tenant.hu',
      proxyAddresses: ['smtp:not-an-email'],
    });
    expect(set).toEqual(['primary@tenant.hu']);
    expect(mailboxIdentityMatches('not-an-email', set)).toBe(false);
    expect(mailboxIdentityMatches('primary@tenant.hu', set)).toBe(true);
  });

  it('I. canonical case-insensitive normalization matches exactly', () => {
    const set = microsoftIdentityAddressSet({ mail: 'Hubay.Mate@Balintfy.HU' });
    expect(mailboxIdentityMatches(VERIFIED, set)).toBe(true);
    expect(mailboxIdentityMatches('  HUBAY.MATE@balintfy.hu  ', set)).toBe(true);
    expect(normalizeMailboxAddress('Hubay.Mate@Balintfy.HU')).toBe(VERIFIED);
  });
});

describe('Microsoft Graph delegated identity request', () => {
  afterEach(() => jest.restoreAllMocks());

  it('requests proxyAddresses and exposes the authoritative set', async () => {
    process.env.MICROSOFT_MAILBOX_CLIENT_ID = 'client';
    process.env.MICROSOFT_MAILBOX_CLIENT_SECRET = 'secret';
    jest
      .spyOn(global, 'fetch')
      .mockResolvedValueOnce(response({ access_token: 'access', refresh_token: 'refresh', expires_in: 3600 }))
      .mockResolvedValueOnce(
        response({
          id: 'account-1',
          mail: 'primary@tenant.hu',
          userPrincipalName: 'upn@tenant.hu',
          proxyAddresses: [`SMTP:${VERIFIED}`],
        }),
      );

    const result = await new MicrosoftGraphMailboxProvider().exchangeAuthorizationCode({
      code: 'code',
      redirectUri: 'https://app/callback',
    });

    expect(global.fetch).toHaveBeenCalledWith(
      'https://graph.microsoft.com/v1.0/me?$select=id,mail,userPrincipalName,proxyAddresses',
      expect.objectContaining({ headers: { authorization: 'Bearer access' } }),
    );
    expect(result.authorizedAddresses).toEqual(
      expect.arrayContaining(['primary@tenant.hu', 'upn@tenant.hu', VERIFIED]),
    );
    expect(result.providerAccountId).toBe('account-1');
    expect(mailboxIdentityMatches(VERIFIED, result.authorizedAddresses ?? [])).toBe(true);
  });
});

describe('Google identity path unchanged', () => {
  afterEach(() => jest.restoreAllMocks());

  it('J. exposes a single authoritative address and keeps exact matching', async () => {
    process.env.GOOGLE_MAILBOX_CLIENT_ID = 'client';
    process.env.GOOGLE_MAILBOX_CLIENT_SECRET = 'secret';
    jest
      .spyOn(global, 'fetch')
      .mockResolvedValueOnce(response({ access_token: 'access', refresh_token: 'refresh', expires_in: 3600 }))
      .mockResolvedValueOnce(response({ emailAddress: 'Owner@Example.com' }));

    const result = await new GmailMailboxProvider().exchangeAuthorizationCode({
      code: 'code',
      redirectUri: 'https://app/callback',
    });

    expect(result.authorizedAddress).toBe('Owner@Example.com');
    expect(result.authorizedAddresses).toBeUndefined();
    const fallback = [result.authorizedAddress];
    expect(mailboxIdentityMatches('owner@example.com', fallback)).toBe(true);
    expect(mailboxIdentityMatches('other@example.com', fallback)).toBe(false);
  });
});
