import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { buildForwardBody, buildReplyAllRecipients } from '../src/lib/mailboxMessageRecipients';

const detail = (overrides: Record<string, unknown> = {}) => ({
  senderEmail: 'sender@example.com',
  recipientEmail: 'own@example.com',
  recipients: [],
  subject: 'Eredeti tárgy',
  content: 'Biztonságos\nüzenet',
  createdAt: '2026-09-14T10:00:00.000Z',
  sentAt: null,
  ...overrides,
}) as any;

describe('mailbox message recipient contracts', () => {
  it('builds a single reply recipient', () => {
    const result = buildReplyAllRecipients(detail(), { mailboxAddress: 'own@example.com' });
    assert.deepEqual(result.to.map((recipient) => recipient.email), ['sender@example.com']);
    assert.deepEqual(result.cc, []);
  });

  it('preserves multiple TO/CC recipients, excludes self and BCC, and deduplicates case-insensitively', () => {
    const result = buildReplyAllRecipients(detail({
      recipients: [
        { email: 'sender@example.com', kind: 'TO' },
        { email: 'TO-SECOND@example.com', kind: 'TO' },
        { email: 'own@example.com', kind: 'TO' },
        { email: 'Cc-One@example.com', kind: 'CC' },
        { email: 'cc-one@EXAMPLE.com', kind: 'CC' },
        { email: 'hidden@example.com', kind: 'BCC' },
      ],
    }), { mailboxAddress: 'Own@Example.com' });
    assert.deepEqual(result.to.map((recipient) => recipient.email), ['sender@example.com']);
    assert.deepEqual(result.cc.map((recipient) => recipient.email), ['TO-SECOND@example.com', 'Cc-One@example.com']);
    assert.equal(result.cc.some((recipient) => recipient.email.toLowerCase() === 'hidden@example.com'), false);
  });

  it('uses an original recipient as TO for outbound mail when the sender is the connected mailbox', () => {
    const result = buildReplyAllRecipients(detail({
      senderEmail: 'OWN@example.com',
      recipients: [
        { email: 'to@example.com', kind: 'TO' },
        { email: 'cc@example.com', kind: 'CC' },
      ],
    }), { mailboxAddress: 'own@example.com' });
    assert.deepEqual(result.to.map((recipient) => recipient.email), ['to@example.com']);
    assert.deepEqual(result.cc.map((recipient) => recipient.email), ['cc@example.com']);
  });

  it('creates a safe plain-text forward block and never uses sanitized HTML', () => {
    const body = buildForwardBody(detail({ bodyHtmlSanitized: '<b>NE HASZNÁLD</b>' }));
    assert.match(body, /---------- Továbbított üzenet ----------/);
    assert.match(body, /Feladó: sender@example.com/);
    assert.match(body, /Biztonságos\nüzenet/);
    assert.doesNotMatch(body, /NE HASZNÁLD|<b>/);
  });
});
