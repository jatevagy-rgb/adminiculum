import {
  ATTACHMENT_METADATA_EXPAND,
  createOutlookGraphMailReader,
  OutlookGraphReaderError,
  parseOutlookSyncLimit,
  readOutlookSyncConfig,
  requestOutlookGraphAccessToken,
} from '../src/modules/communications/outlookGraphLive';
import { mapGraphMessageToOutlookImportMessage } from '../src/modules/communications/outlookGraph.adapter';

describe('outlookGraphLive (live reader unit)', () => {
  const realEnv = { ...process.env };

  afterEach(() => {
    process.env = { ...realEnv };
  });

  describe('parseOutlookSyncLimit', () => {
    it('defaults to 50 when absent/invalid', () => {
      expect(parseOutlookSyncLimit(undefined)).toBe(50);
      expect(parseOutlookSyncLimit('abc')).toBe(50);
      expect(parseOutlookSyncLimit(0)).toBe(50);
      expect(parseOutlookSyncLimit(-5)).toBe(50);
    });
    it('caps at 200', () => {
      expect(parseOutlookSyncLimit(1000)).toBe(200);
    });
    it('accepts in-range values', () => {
      expect(parseOutlookSyncLimit(10)).toBe(10);
    });
  });

  describe('readOutlookSyncConfig', () => {
    it('returns null when mailbox or credentials missing', () => {
      process.env.COMMUNICATIONS_MAILBOX = '';
      delete process.env.SP_CLIENT_ID;
      expect(readOutlookSyncConfig()).toBeNull();
    });
    it('reads dedicated Outlook Graph credentials only', () => {
      process.env.COMMUNICATIONS_MAILBOX = 'legal@example.com';
      process.env.OUTLOOK_GRAPH_CLIENT_ID = 'cid';
      process.env.OUTLOOK_GRAPH_CLIENT_SECRET = 'secret';
      process.env.OUTLOOK_GRAPH_TENANT_ID = 'tid';
      const cfg = readOutlookSyncConfig();
      expect(cfg).toEqual({
        mailboxAddress: 'legal@example.com',
        clientId: 'cid',
        clientSecret: 'secret',
        tenantId: 'tid',
      });
    });
    it('does not fall back to unrelated Azure credential names', () => {
      process.env.COMMUNICATIONS_MAILBOX = 'legal@example.com';
      process.env.AZURE_CLIENT_ID = 'cid';
      process.env.AZURE_CLIENT_SECRET = 'secret';
      process.env.AZURE_TENANT_ID = 'tid';
      expect(readOutlookSyncConfig()).toBeNull();
    });
  });

  describe('requestOutlookGraphAccessToken', () => {
    it('returns the access token and never surfaces it in an error', async () => {
      const fakeFetch = jest.fn(async () => new Response(JSON.stringify({ access_token: 'at-1', expires_in: 3600 }), { status: 200, headers: { 'Content-Type': 'application/json' } })) as unknown as typeof fetch;
      const token = await requestOutlookGraphAccessToken(
        { mailboxAddress: 'x', clientId: 'c', clientSecret: 's', tenantId: 't' },
        fakeFetch,
      );
      expect(token).toBe('at-1');
      const body = (fakeFetch as jest.Mock).mock.calls[0][1].body;
      expect(body).not.toContain('at-1');
    });
    it('classifies HTTP 429 as RATE_LIMITED', async () => {
      const fakeFetch = jest.fn(async () => new Response(JSON.stringify({ error: { code: 'TooManyRequests' } }), { status: 429 })) as unknown as typeof fetch;
      await expect(
        requestOutlookGraphAccessToken({ mailboxAddress: 'x', clientId: 'c', clientSecret: 's', tenantId: 't' }, fakeFetch),
      ).rejects.toMatchObject({ classification: 'RATE_LIMITED' });
    });
    it('classifies HTTP 401 as AUTHORIZATION_FAILED', async () => {
      const fakeFetch = jest.fn(async () => new Response(JSON.stringify({ error: { code: 'InvalidAuthenticationToken' } }), { status: 401 })) as unknown as typeof fetch;
      await expect(
        requestOutlookGraphAccessToken({ mailboxAddress: 'x', clientId: 'c', clientSecret: 's', tenantId: 't' }, fakeFetch),
      ).rejects.toMatchObject({ classification: 'AUTHORIZATION_FAILED' });
    });
  });

  describe('OutlookGraphReaderError classification', () => {
    it('exposes a stable classification without raw payload', () => {
      const err = new OutlookGraphReaderError('GRAPH_UNAVAILABLE', 'safe message');
      expect(err.classification).toBe('GRAPH_UNAVAILABLE');
      expect(err.message).toBe('safe message');
      expect(err.name).toBe('OutlookGraphReaderError');
    });
  });

  describe('Graph message mapping (no token/body leakage in DTO)', () => {
    it('maps a Graph message to a bounded import payload with metadata only', () => {
      const mapped = mapGraphMessageToOutlookImportMessage(
        {
          id: 'graph-id',
          internetMessageId: '<im-id>',
          conversationId: 'conv-9',
          subject: 'Kérdés',
          from: { emailAddress: { address: 'client@example.com', name: 'Client' } },
          toRecipients: [{ emailAddress: { address: 'legal@example.com' } }],
          receivedDateTime: '2026-07-01T08:00:00Z',
          bodyPreview: 'Rövid',
          hasAttachments: true,
          attachments: [{ id: 'att-1', name: 'a.pdf', contentType: 'application/pdf', size: 123 }],
        },
        'legal@example.com',
      );
      expect(mapped.externalMessageId).toBe('<im-id>');
      expect(mapped.providerConversationId).toBe('conv-9');
      expect(mapped.sender).toBe('client@example.com');
      expect(mapped.attachments).toHaveLength(1);
      expect(mapped.attachments[0]).toEqual({ providerAttachmentId: 'att-1', name: 'a.pdf', contentType: 'application/pdf', sizeBytes: 123 });
      // Bounded: never carries a bearer token or raw body.
      expect(JSON.stringify(mapped)).not.toContain('Bearer');
      expect(JSON.stringify(mapped)).not.toContain('access_token');
    });
  });
});

describe('outlookGraphLive: attachment metadata-only wire boundary', () => {
  const realEnv = { ...process.env };
  afterEach(() => {
    process.env = { ...realEnv };
  });

  function configureEnv(): void {
    process.env.COMMUNICATIONS_MAILBOX = 'legal@example.com';
    process.env.OUTLOOK_GRAPH_CLIENT_ID = 'cid';
    process.env.OUTLOOK_GRAPH_CLIENT_SECRET = 'secret';
    process.env.OUTLOOK_GRAPH_TENANT_ID = 'tid';
  }

  /** Run fetchRecentInbound with injected token + fetch; capture the requested URL. */
  async function captureRequestedUrl(graphValue: unknown[] = []): Promise<{ url: string; parsed: URL }> {
    configureEnv();
    let captured = '';
    const httpFetch = jest.fn(async (input: unknown) => {
      captured = String(input);
      return new Response(JSON.stringify({ value: graphValue }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      });
    }) as unknown as typeof fetch;
    const reader = createOutlookGraphMailReader({
      getAccessToken: async () => 'test-token',
      httpFetch,
    });
    await reader.fetchRecentInbound(10);
    return { url: captured, parsed: new URL(captured) };
  }

  it('1. generated Graph URL requests attachment metadata via a constrained $select', async () => {
    const { parsed } = await captureRequestedUrl();
    // Decoded query semantics (robust to encoding choices).
    expect(parsed.searchParams.get('$expand')).toBe('attachments($select=id,name,contentType,size)');
    expect(parsed.searchParams.get('$expand')).toBe(ATTACHMENT_METADATA_EXPAND);
  });

  it('2. generated query does NOT use an unrestricted $expand=attachments', async () => {
    const { url, parsed } = await captureRequestedUrl();
    // The expand value must not be the bare collection.
    expect(parsed.searchParams.get('$expand')).not.toBe('attachments');
    // And no `$expand=attachments` that is not immediately followed by `(`.
    expect(url).not.toMatch(/\$expand=attachments(?!\()/);
  });

  it('3. generated query never requests contentBytes / binary bodies', async () => {
    const { url } = await captureRequestedUrl();
    expect(url.toLowerCase()).not.toContain('contentbytes');
    expect(url).not.toContain('/$value');
  });

  it('4. a Graph response carrying contentBytes is stripped by the adapter to metadata only', () => {
    const mapped = mapGraphMessageToOutlookImportMessage(
      {
        id: 'graph-id',
        internetMessageId: '<im-2>',
        conversationId: 'c-2',
        from: { emailAddress: { address: 'client@example.com' } },
        hasAttachments: true,
        // Simulate Graph unexpectedly returning binary + unknown fields.
        attachments: [
          {
            id: 'att-9',
            name: 'secret.pdf',
            contentType: 'application/pdf',
            size: 4096,
            contentBytes: 'JVBERi0xLjcKJUERROR_BINARY',
            isInline: false,
          } as any,
        ],
      },
      'legal@example.com',
    );
    expect(mapped.attachments).toHaveLength(1);
    expect(mapped.attachments[0]).toEqual({
      providerAttachmentId: 'att-9',
      name: 'secret.pdf',
      contentType: 'application/pdf',
      sizeBytes: 4096,
    });
    // Absolutely no binary or unknown fields survive serialization.
    const serialized = JSON.stringify(mapped);
    expect(serialized).not.toContain('contentBytes');
    expect(serialized).not.toContain('JVBERi0');
    expect(serialized).not.toContain('isInline');
  });
});
