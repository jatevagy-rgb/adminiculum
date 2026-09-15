import { MicrosoftGraphMailboxProvider } from '../src/modules/mailbox/provider';

const AUTHORIZING = 'hubay.gyula@balintfy.onmicrosoft.com';
const SHARED_TARGET = 'adminiculum@balintfy.onmicrosoft.com';
const ENCODED_TARGET = encodeURIComponent(SHARED_TARGET);

function ok(body: unknown): Response {
  return { ok: true, status: 200, json: async () => body } as Response;
}

function fail(status: number): Response {
  return { ok: false, status, json: async () => ({ error: { code: 'ErrorAccessDenied' } }) } as Response;
}

function identityProfile(mail: string): Record<string, unknown> {
  return { id: 'account-1', mail, userPrincipalName: AUTHORIZING, proxyAddresses: [] };
}

function graphMessage(id: string): Record<string, unknown> {
  return {
    id,
    internetMessageId: `<${id}@example.invalid>`,
    conversationId: 'conv-1',
    subject: 'Subject',
    receivedDateTime: '2026-01-01T00:00:00.000Z',
    sentDateTime: '2026-01-01T00:00:00.000Z',
    from: { emailAddress: { address: 'sender@example.invalid', name: 'Sender' } },
    toRecipients: [{ emailAddress: { address: SHARED_TARGET } }],
    ccRecipients: [],
    bccRecipients: [],
    body: { contentType: 'text', content: 'Body' },
    hasAttachments: false,
    internetMessageHeaders: [],
  };
}

describe('Microsoft shared/delegated mailbox access', () => {
  afterEach(() => jest.restoreAllMocks());

  it('proves delegated read access to the exact target mailbox (200)', async () => {
    jest.spyOn(global, 'fetch').mockResolvedValueOnce(ok({ id: 'inbox' }));
    const result = await new MicrosoftGraphMailboxProvider().probeTargetMailboxAccess({
      secret: { kind: 'OAUTH2', accessToken: 'token' },
      mailboxAddress: SHARED_TARGET,
    });
    expect(result).toEqual({ ok: true });
    expect(global.fetch).toHaveBeenCalledWith(
      `https://graph.microsoft.com/v1.0/users/${ENCODED_TARGET}/mailFolders/inbox?$select=id&$top=1`,
      expect.objectContaining({ headers: { authorization: 'Bearer token' } }),
    );
  });

  it('reports DENIED on 403 (no delegated access)', async () => {
    jest.spyOn(global, 'fetch').mockResolvedValueOnce(fail(403));
    const result = await new MicrosoftGraphMailboxProvider().probeTargetMailboxAccess({
      secret: { kind: 'OAUTH2', accessToken: 'token' },
      mailboxAddress: SHARED_TARGET,
    });
    expect(result).toEqual({ ok: false, reason: 'DENIED' });
  });

  it('reports NOT_FOUND on 404 (unresolved target mailbox)', async () => {
    jest.spyOn(global, 'fetch').mockResolvedValueOnce(fail(404));
    const result = await new MicrosoftGraphMailboxProvider().probeTargetMailboxAccess({
      secret: { kind: 'OAUTH2', accessToken: 'token' },
      mailboxAddress: SHARED_TARGET,
    });
    expect(result).toEqual({ ok: false, reason: 'NOT_FOUND' });
  });

  it('reports UNAVAILABLE on an unexpected provider failure', async () => {
    jest.spyOn(global, 'fetch').mockResolvedValueOnce(fail(500));
    const result = await new MicrosoftGraphMailboxProvider().probeTargetMailboxAccess({
      secret: { kind: 'OAUTH2', accessToken: 'token' },
      mailboxAddress: SHARED_TARGET,
    });
    expect(result).toEqual({ ok: false, reason: 'UNAVAILABLE' });
  });

  it('syncs the TARGET mailbox resource, not /me, for a shared target', async () => {
    jest
      .spyOn(global, 'fetch')
      .mockResolvedValueOnce(ok(identityProfile(AUTHORIZING))) // mailboxBase /me check: target is NOT an identity
      .mockResolvedValueOnce(ok({ value: [graphMessage('m1')] })) // target inbox
      .mockResolvedValueOnce(ok({ value: [] })); // target sent items

    const result = await new MicrosoftGraphMailboxProvider().listMessagesSinceCursor({
      secret: { kind: 'OAUTH2', accessToken: 'token' },
      mailboxAddress: SHARED_TARGET,
      cursor: null,
      maxMessages: 10,
    });

    const urls = (global.fetch as jest.Mock).mock.calls.map((call) => String(call[0]));
    expect(urls[1]).toContain(`/users/${ENCODED_TARGET}/mailFolders/inbox/messages`);
    expect(urls[2]).toContain(`/users/${ENCODED_TARGET}/mailFolders/sentitems/messages`);
    expect(urls.some((url) => url.includes('/me/mailFolders/inbox'))).toBe(false);
    expect(result.messages).toHaveLength(1);
  });

  it('keeps own-mailbox sync on /me (identity match)', async () => {
    jest
      .spyOn(global, 'fetch')
      .mockResolvedValueOnce(ok(identityProfile(SHARED_TARGET))) // target IS an identity now → own mailbox
      .mockResolvedValueOnce(ok({ value: [graphMessage('m1')] }))
      .mockResolvedValueOnce(ok({ value: [] }));

    await new MicrosoftGraphMailboxProvider().listMessagesSinceCursor({
      secret: { kind: 'OAUTH2', accessToken: 'token' },
      mailboxAddress: SHARED_TARGET,
      cursor: null,
      maxMessages: 10,
    });

    const urls = (global.fetch as jest.Mock).mock.calls.map((call) => String(call[0]));
    expect(urls[1]).toContain('https://graph.microsoft.com/v1.0/me/mailFolders/inbox/messages');
    expect(urls.some((url) => url.includes('/users/'))).toBe(false);
  });

  it('tolerates an unreadable Sent Items folder while still syncing Inbox', async () => {
    jest
      .spyOn(global, 'fetch')
      .mockResolvedValueOnce(ok(identityProfile(AUTHORIZING)))
      .mockResolvedValueOnce(ok({ value: [graphMessage('m1')] }))
      .mockResolvedValueOnce(fail(403));

    const result = await new MicrosoftGraphMailboxProvider().listMessagesSinceCursor({
      secret: { kind: 'OAUTH2', accessToken: 'token' },
      mailboxAddress: SHARED_TARGET,
      cursor: null,
      maxMessages: 10,
    });

    expect(result.messages).toHaveLength(1);
  });

  it('own-mailbox sync without a mailboxAddress still uses /me', async () => {
    jest
      .spyOn(global, 'fetch')
      .mockResolvedValueOnce(ok({ value: [graphMessage('m1')] }))
      .mockResolvedValueOnce(ok({ value: [] }));

    await new MicrosoftGraphMailboxProvider().listMessagesSinceCursor({
      secret: { kind: 'OAUTH2', accessToken: 'token' },
      cursor: null,
      maxMessages: 10,
    });

    const urls = (global.fetch as jest.Mock).mock.calls.map((call) => String(call[0]));
    expect(urls[0]).toContain('https://graph.microsoft.com/v1.0/me/mailFolders/inbox/messages');
  });
});
