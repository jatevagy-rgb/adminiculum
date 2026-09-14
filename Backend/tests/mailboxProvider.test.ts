import { GmailMailboxProvider, MicrosoftGraphMailboxProvider } from '../src/modules/mailbox/provider';

function response(body: unknown): Response {
  return { ok: true, json: async () => body } as Response;
}

describe('mailbox provider normalization', () => {
  afterEach(() => jest.restoreAllMocks());

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
