/**
 * Static guards that per-user mailbox sync reuses the canonical safe
 * conversation linkage (providerConversationId + single-distinct-case rule)
 * for the batch it just persisted — and introduces no other matching strategy.
 */
import { readFileSync } from 'node:fs';
import path from 'node:path';

const src = (rel: string): string => readFileSync(path.join(__dirname, '..', rel), 'utf8');

const mailboxService = () => src('src/modules/mailbox/service.ts');

const syncBody = () => {
  const source = mailboxService();
  const start = source.indexOf('export async function syncMailbox');
  const end = source.indexOf('export async function sendMailboxMessage');
  expect(start).toBeGreaterThan(-1);
  expect(end).toBeGreaterThan(start);
  return source.slice(start, end);
};

describe('per-user mailbox safe conversation linkage', () => {
  it('reuses the existing canonical helper instead of a new algorithm', () => {
    const source = mailboxService();
    expect(source).toContain("import { applySafeConversationLinkage, type ConversationLinkageDb, type ImportedMessageRef } from '../communications/outlookImport.service';");
    expect(syncBody()).toContain('await applySafeConversationLinkage(prisma as unknown as ConversationLinkageDb, linkageRefs);');
  });

  it('collects only the provider conversation refs touched by this batch', () => {
    const body = syncBody();
    expect(body).toContain('const linkageRefs: ImportedMessageRef[] = [];');
    expect(body).toContain('if (row?.providerConversationId) {');
    expect(body).toContain('linkageRefs.push({ communicationId: row.id, providerConversationId: row.providerConversationId });');
    expect(body).toMatch(/if \(linkageRefs\.length > 0\) \{/);
  });

  it('keeps linkage best-effort so a persisted batch is not failed by enrichment', () => {
    const body = syncBody();
    const callIndex = body.indexOf('await applySafeConversationLinkage(');
    const catchIndex = body.indexOf('Intentionally swallowed');
    expect(callIndex).toBeGreaterThan(-1);
    expect(catchIndex).toBeGreaterThan(callIndex);
  });

  it('introduces no sender/subject/domain/AI matching', () => {
    const source = mailboxService();
    expect(source).not.toMatch(/fuzzy|levenshtein|similarity|openai|anthropic/i);
    expect(source).not.toMatch(/subject[^\n]*\.match\(/);
    expect(source).not.toMatch(/senderEmail[^\n]*includes/);
  });

  it('preserves owner-scoped sync', () => {
    expect(syncBody()).toContain('const connection = await ownedMailbox(id, ownerUserId);');
  });
});
