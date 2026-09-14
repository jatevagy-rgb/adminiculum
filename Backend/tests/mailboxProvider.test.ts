import { GmailMailboxProvider, MicrosoftGraphMailboxProvider } from '../src/modules/mailbox/provider';

function response(body: unknown): Response {
  return { ok: true, json: async () => body } as Response;
}

describe('mailbox provider normalization', () => {
  afterEach(() => jest.restoreAllMocks());

  it('resolves the delegated Microsoft mailbox identity server-side', async () => {
    process.env.MICROSOFT_MAILBOX_CLIENT_ID = 'client';
    process.env.MICROSOFT_MAILBOX_CLIENT_SECRET = 'secret';
    jest.spyOn(global, 'fetch')
      .mockResolvedValueOnce(response({ access_token: 'access', refresh_token: 'refresh', expires_in: 3600 }))
      .mockResolvedValueOnce(response({ id: 'account-1', mail: 'Owner@Example.com', userPrincipalName: 'fallback@example.com' }));

    const result = await new MicrosoftGraphMailboxProvider().exchangeAuthorizationCode({ code: 'code', redirectUri: 'https://app/callback' });

    expect(result.authorizedAddress).toBe('Owner@Example.com');
    expect(result.providerAccountId).toBe('account-1');
    expect(global.fetch).toHaveBeenCalledWith(
      'https://graph.microsoft.com/v1.0/me?$select=id,mail,userPrincipalName',
      expect.objectContaining({ headers: { authorization: 'Bearer access' } }),
    );
  });

  it('resolves the delegated Google mailbox identity server-side', async () => {
    process.env.GOOGLE_MAILBOX_CLIENT_ID = 'client';
    process.env.GOOGLE_MAILBOX_CLIENT_SECRET = 'secret';
    jest.spyOn(global, 'fetch')
      .mockResolvedValueOnce(response({ access_token: 'access', refresh_token: 'refresh', expires_in: 3600 }))
      .mockResolvedValueOnce(response({ emailAddress: 'Owner@Example.com' }));

    const result = await new GmailMailboxProvider().exchangeAuthorizationCode({ code: 'code', redirectUri: 'https://app/callback' });

    expect(result.authorizedAddress).toBe('Owner@Example.com');
    expect(global.fetch).toHaveBeenCalledWith(
      'https://gmail.googleapis.com/gmail/v1/users/me/profile',
      expect.objectContaining({ headers: { authorization: 'Bearer access' } }),
    );
  });

  it('refreshes Microsoft and Google access tokens without replacing refresh authorization', async () => {
    process.env.MICROSOFT_MAILBOX_CLIENT_ID = 'client';
    process.env.MICROSOFT_MAILBOX_CLIENT_SECRET = 'secret';
    process.env.GOOGLE_MAILBOX_CLIENT_ID = 'client';
    process.env.GOOGLE_MAILBOX_CLIENT_SECRET = 'secret';
    jest.spyOn(global, 'fetch')
      .mockResolvedValueOnce(response({ access_token: 'ms-new', expires_in: 3600 }))
      .mockResolvedValueOnce(response({ access_token: 'google-new', expires_in: 3600 }));

    const microsoft = await new MicrosoftGraphMailboxProvider().refreshAuthorization({ kind: 'OAUTH2', accessToken: 'ms-old', refreshToken: 'ms-refresh' });
    const google = await new GmailMailboxProvider().refreshAuthorization({ kind: 'OAUTH2', accessToken: 'google-old', refreshToken: 'google-refresh' });

    expect(microsoft).toMatchObject({ accessToken: 'ms-new', refreshToken: 'ms-refresh' });
    expect(google).toMatchObject({ accessToken: 'google-new', refreshToken: 'google-refresh' });
  });

  it('preserves Graph body, BCC, and threading headers', async () => {
    jest.spyOn(global, 'fetch').mockResolvedValue(response({
      value: [{
        id: 'graph-1',
        internetMessageId: '<graph-1@example.invalid>',
        conversationId: 'conversation-1',
        subject: 'Subject',
        receivedDateTime: '2026-01-01T00:00:00.000Z',
        from: { emailAddress: { address: 'from@example.invalid', name: 'From' } },
        toRecipients: [{ emailAddress: { address: 'to@example.invalid' } }],
        ccRecipients: [],
        bccRecipients: [{ emailAddress: { address: 'bcc@example.invalid' } }],
        body: { contentType: 'html', content: '<p>Full <strong>body</strong></p>' },
        internetMessageHeaders: [
          { name: 'In-Reply-To', value: '<parent@example.invalid>' },
          { name: 'References', value: '<root@example.invalid> <parent@example.invalid>' },
        ],
      }],
    }));

    const result = await new MicrosoftGraphMailboxProvider().listMessagesSinceCursor({
      secret: { kind: 'OAUTH2', accessToken: 'token' },
      cursor: null,
      maxMessages: 10,
    });

    expect(result.messages[0]).toMatchObject({
      bodyText: 'Full body',
      bodyHtml: '<p>Full <strong>body</strong></p>',
      bcc: [{ email: 'bcc@example.invalid', name: null }],
      inReplyTo: '<parent@example.invalid>',
      references: '<root@example.invalid> <parent@example.invalid>',
    });
  });

  it('loads Gmail full MIME content instead of using only the snippet', async () => {
    const encoded = Buffer.from('Full Gmail body').toString('base64url');
    jest.spyOn(global, 'fetch')
      .mockResolvedValueOnce(response({ messages: [{ id: 'gmail-1' }] }))
      .mockResolvedValueOnce(response({
        id: 'gmail-1',
        threadId: 'thread-1',
        snippet: 'Preview only',
        internalDate: '1767225600000',
        payload: {
          mimeType: 'text/plain',
          body: { data: encoded },
          headers: [
            { name: 'Message-ID', value: '<gmail-1@example.invalid>' },
            { name: 'In-Reply-To', value: '<parent@example.invalid>' },
            { name: 'References', value: '<parent@example.invalid>' },
            { name: 'From', value: 'from@example.invalid' },
            { name: 'To', value: 'to@example.invalid' },
            { name: 'Bcc', value: 'bcc@example.invalid' },
            { name: 'Subject', value: 'Subject' },
          ],
        },
      }));

    const result = await new GmailMailboxProvider().listMessagesSinceCursor({
      secret: { kind: 'OAUTH2', accessToken: 'token' },
      cursor: null,
      maxMessages: 10,
    });

    expect(result.messages[0]).toMatchObject({
      bodyText: 'Full Gmail body',
      bcc: [{ email: 'bcc@example.invalid' }],
      inReplyTo: '<parent@example.invalid>',
      references: '<parent@example.invalid>',
    });
  });
});
