/**
 * Static guards for the code-only cross-channel dedupe repair: both channels
 * anchor on the RFC Internet Message-ID, only channel-agnostic rows are adopted,
 * and nothing adds schema uniqueness, similarity matching, or destructive cleanup.
 */
import { readFileSync } from 'node:fs';
import path from 'node:path';

const src = (rel: string): string => readFileSync(path.join(__dirname, '..', rel), 'utf8');

describe('cross-channel dedupe source contracts', () => {
  it('mailbox persist prechecks the RFC identity across both columns and adopts only channel-agnostic rows', () => {
    const persist = src('src/modules/mailbox/service.ts').match(/async function persistMessage[\s\S]*?\r?\n\}/)![0];
    expect(persist).toContain('if (message.internetMessageId) {');
    expect(persist).toContain('OR: [{ internetMessageId: message.internetMessageId }, { externalMessageId: message.internetMessageId }]');
    expect(persist).toContain('canonical.mailboxConnectionId === null');
    const adoptBranch = persist.slice(persist.indexOf('canonical.mailboxConnectionId === null'), persist.indexOf('canonical.mailboxConnectionId === null') + 160);
    expect(adoptBranch).not.toMatch(/update\(|delete/);
  });

  it('app-only import checks and persists the RFC identity', () => {
    const service = src('src/modules/communications/outlookImport.service.ts');
    expect(service).toContain('internetMessageId: { in: candidateRfcIds }');
    expect(service).toContain('internetMessageId: n.internetMessageId,');
    expect(service).toMatch(/existingByRfcId\.has\(n\.internetMessageId\)/);
    expect(service).toMatch(/batchRfcIds\.has\(n\.internetMessageId\)/);
  });

  it('the adapter never substitutes a Graph provider id for the RFC identity', () => {
    const adapter = src('src/modules/communications/outlookGraph.adapter.ts');
    expect(adapter).toContain('internetMessageId: stringOrNull(graphMessage.internetMessageId),');
    expect(adapter).toContain('externalMessageId: stringOrNull(graphMessage.internetMessageId) || stringOrNull(graphMessage.id),');
  });

  it('no schema uniqueness or migration was added for the RFC identity', () => {
    const schema = src('prisma/schema.prisma');
    const internetLine = schema.split(/\r?\n/).find((line) => /^\s*internetMessageId\b/.test(line))!;
    expect(internetLine).not.toContain('@unique');
  });

  it('introduces no similarity matching and no destructive cleanup', () => {
    for (const source of [src('src/modules/mailbox/service.ts'), src('src/modules/communications/outlookImport.service.ts')]) {
      expect(source).not.toMatch(/similarity|levenshtein|fuzzy/i);
      expect(source).not.toMatch(/deleteMany/);
    }
  });
});
