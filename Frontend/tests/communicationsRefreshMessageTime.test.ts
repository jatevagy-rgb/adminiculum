import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';

/**
 * Communications workspace repair (source contract).
 *
 *  - the list and detail render the canonical server-derived effectiveMessageAt
 *    (direction-aware message time), falling back to createdAt for legacy rows;
 *  - the date filter uses the same effective time;
 *  - "Szinkronizálás most" reuses the existing canonical sync channels (per-user
 *    mailbox connections first, app-only Outlook when configured), then re-fetches
 *    the list; a failed refresh never clears the visible list;
 *  - the connection banner recognizes connected per-user mailboxes and only says
 *    "Az Outlook nincs összekötve." when no channel is available.
 */

const root = process.cwd();
const read = (rel: string) => readFileSync(path.join(root, rel), 'utf8');

const workspace = () => read('src/components/communications/CommunicationWorkspace.tsx');
const api = () => read('src/lib/api.ts');

const syncBody = () => {
  const source = workspace();
  const start = source.indexOf('const syncOutlook = async () => {');
  const end = source.indexOf('const caseById');
  assert.ok(start > -1 && end > start, 'syncOutlook not found');
  return source.slice(start, end);
};

describe('communications effective message time display', () => {
  it('renders the server-derived effective time in list and detail', () => {
    const matches = workspace().match(/formatDate\(item\.effectiveMessageAt \?\? item\.createdAt\)/g) || [];
    assert.equal(matches.length, 2, 'list + detail must render effectiveMessageAt');
    assert.doesNotMatch(workspace(), /formatDate\(item\.createdAt\)/);
  });

  it('uses the canonical effective time for the date filter', () => {
    assert.match(workspace(), /const timestamp = new Date\(item\.effectiveMessageAt \?\? item\.createdAt\)\.getTime\(\);/);
  });

  it('keeps formatDate behavior unchanged', () => {
    assert.match(workspace(), /function formatDate\(value: string\) \{/);
    assert.match(workspace(), /date\.toLocaleString\("hu-HU", \{ month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit" \}\)/);
  });

  it('receives sentAt and effectiveMessageAt through the canonical API type', () => {
    assert.match(api(), /sentAt: string \| null;/);
    assert.match(api(), /effectiveMessageAt: string;/);
  });
});

describe('communications refresh reuse', () => {
  it('syncs connected per-user mailboxes through the existing canonical client', () => {
    assert.match(workspace(), /import \{[\s\S]*?syncMailbox,[\s\S]*?\} from "@\/lib\/api"/);
    assert.match(workspace(), /for \(const mailbox of connectedMailboxes\) \{/);
    assert.match(workspace(), /await syncMailbox\(mailbox\.id\);/);
    assert.match(workspace(), /mailbox\.readCapability && \(mailbox\.status === "CONNECTED" \|\| mailbox\.status === "CONNECTED_READ_ONLY"\)/);
  });

  it('keeps the app-only Outlook sync channel supported', () => {
    assert.match(workspace(), /if \(outlookStatus\?\.available\) \{/);
    assert.match(workspace(), /const result = await runOutlookSync\(\);/);
  });

  it('re-fetches the communications list after a successful sync', () => {
    assert.match(workspace(), /setReloadToken\(\(token\) => token \+ 1\);/);
    assert.match(workspace(), /\}, \[clientFilter, caseFilter, offset, pageSize, reloadToken\]\);/);
  });

  it('does not duplicate Graph synchronization', () => {
    assert.doesNotMatch(workspace(), /graph\.microsoft\.com|graph\.facebook|access_token/i);
  });

  it('keeps a failed refresh from clearing the visible list', () => {
    assert.doesNotMatch(syncBody(), /setCommunications\(/);
    assert.match(syncBody(), /A szinkronizálás nem sikerült\./);
    assert.match(syncBody(), /A szinkronizálás részben sikerült\./);
  });

  it('disables repeat clicks while syncing and preserves the existing label', () => {
    assert.match(workspace(), /disabled=\{!canSync \|\| outlookSyncing\}/);
    assert.match(workspace(), /"Szinkronizálás most"/);
    assert.match(workspace(), /const canSync = connectedMailboxes\.length > 0 \|\| Boolean\(outlookStatus\?\.available\);/);
  });
});

describe('communications connection banner', () => {
  it('shows connected when a per-user mailbox connection is connected', () => {
    assert.match(workspace(), /connectedMailboxes\.length > 0 \? "E-mail-fiók összekötve\." : outlookStatus\?\.available \? "Outlook összekötve\." : "Az Outlook nincs összekötve\."/);
  });

  it('only says disconnected when neither channel is available', () => {
    const source = workspace();
    const banner = source.match(/<span>\{connectedMailboxes[\s\S]*?\}<\/span>/)?.[0] || '';
    assert.match(banner, /"Az Outlook nincs összekötve\."/);
    assert.doesNotMatch(banner, /messages|communications\.length/);
  });
});

describe('communications adjacent behavior preserved', () => {
  it('keeps reply, reply-all and forward on the canonical mailbox sender', () => {
    assert.match(workspace(), /sendMailboxMessage\(\{/);
    assert.match(workspace(), /replyToCommunicationId: composerMode === "forward" \? null : item\.id/);
    assert.match(workspace(), /buildReplyAllRecipients\(detail, mailboxConnection\)/);
  });

  it('keeps the canonical filters and provenance labels', () => {
    for (const token of ['Összes', 'Bejövő', 'Kimenő', 'Belső', 'Feldolgozásra vár', 'Rögzített kommunikáció', 'Csatlakoztatott e-mail-fiók']) {
      assert.ok(workspace().includes(token), `missing: ${token}`);
    }
  });
});
