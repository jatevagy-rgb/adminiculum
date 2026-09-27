import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { canonicalCommunicationDirection, toCommunicationSignal } from '../src/lib/communicationIntake';

/**
 * F-01 (pending dead-end + outbound false pending) and F-02 (canonical direction).
 *
 * The workspace must reuse the existing canonical ignore/unignore API for triage,
 * the pending projection must not treat unlinked outbound mail as assignment-needed,
 * and direction semantics must prefer the canonical persisted DTO direction with the
 * legacy sender-domain heuristic only as fallback.
 */

const root = process.cwd();
const read = (rel: string) => readFileSync(path.join(root, rel), 'utf8');
const workspace = () => read('src/components/communications/CommunicationWorkspace.tsx');
const api = () => read('src/lib/api.ts');

const baseRecord = {
  id: 'comm-1',
  type: 'EMAIL',
  subject: 'Tárgy',
  senderName: 'Feladó',
  senderEmail: 'kliens@external.example',
  recipientEmail: 'iroda@balintfy.hu',
  caseId: null,
  clientId: null,
  createdAt: '2026-09-24T18:11:00.000Z',
};

describe('canonical communication direction (F-02)', () => {
  it('uses the canonical DTO direction over the sender-domain heuristic', () => {
    const outbound = toCommunicationSignal({ ...baseRecord, direction: 'OUTBOUND' });
    assert.equal(outbound.direction, 'outgoing');
    const inboundFromInternal = toCommunicationSignal({
      ...baseRecord,
      senderEmail: 'kollega@balintfy.hu',
      recipientEmail: 'kliens@external.example',
      direction: 'INBOUND',
    });
    assert.equal(inboundFromInternal.direction, 'incoming');
  });

  it('falls back to the legacy sender-domain heuristic when direction is absent', () => {
    assert.equal(toCommunicationSignal({ ...baseRecord, direction: null }).direction, 'incoming');
    assert.equal(toCommunicationSignal({ ...baseRecord, direction: undefined }).direction, 'incoming');
    assert.equal(toCommunicationSignal({ ...baseRecord, senderEmail: 'kollega@balintfy.hu', direction: undefined }).direction, 'outgoing');
  });

  it('exposes one shared canonical-direction helper', () => {
    assert.equal(canonicalCommunicationDirection({ direction: 'INBOUND' }), 'incoming');
    assert.equal(canonicalCommunicationDirection({ direction: 'OUTBOUND' }), 'outgoing');
    assert.equal(canonicalCommunicationDirection({ direction: null }), null);
    assert.equal(canonicalCommunicationDirection({ direction: undefined }), null);
  });

  it('drives Bejövő/Kimenő views, filter and chips from the shared signal', () => {
    const src = workspace();
    assert.match(src, /if \(activeView === "incoming" && signal\.direction !== "incoming"\) return false;/);
    assert.match(src, /if \(activeView === "outgoing" && signal\.direction !== "outgoing"\) return false;/);
    assert.match(src, /if \(directionFilter !== "all" && signal\.direction !== directionFilter\) return false;/);
    const chips = src.match(/signal\.direction === "incoming" \? "Bejövő" : "Kimenő"/g) || [];
    assert.equal(chips.length, 2, 'list + detail chips must use the shared direction');
  });
});

describe('pending dead-end repair (F-01)', () => {
  it('wires the existing canonical ignore/unignore clients into the detail panel', () => {
    assert.match(workspace(), /ignoreCommunication,\r?\n  unignoreCommunication,/);
    assert.match(workspace(), /await ignoreCommunication\(item\.id\);/);
    assert.match(workspace(), /await unignoreCommunication\(item\.id\);/);
  });

  it('shows the compact triage action only for pending/ignored states', () => {
    const src = workspace();
    assert.match(src, /item\.triage === "NEEDS_ASSIGNMENT" \|\| item\.triage === "IGNORED"/);
    assert.match(src, /"Nem igényel intézkedést"/);
    assert.match(src, /"Újra feldolgozandó"/);
  });

  it('patches ignored state locally and always re-fetches the canonical list', () => {
    const src = workspace();
    assert.match(src, /onTriageChanged\(item\.id, "IGNORED"\);/);
    assert.match(src, /const handleTriageChanged = \(id: string, triage\?: CommunicationItem\["triage"\]\) => \{/);
    assert.match(src, /if \(triage\) updateCommunication\(id, \{ triage \}\);/);
    assert.match(src, /setReloadToken\(\(token\) => token \+ 1\);/);
  });

  it('keeps the pending quick view keyed to NEEDS_ASSIGNMENT', () => {
    assert.match(workspace(), /if \(activeView === "pending" && item\.triage !== "NEEDS_ASSIGNMENT"\) return false;/);
  });

  it('recognizes the NO_ACTION triage state from the canonical DTO', () => {
    assert.match(api(), /triage: 'LINKED' \| 'NEEDS_ASSIGNMENT' \| 'IGNORED' \| 'DUPLICATE_OR_ERROR' \| 'NO_ACTION';/);
  });
});

describe('#414 contracts preserved', () => {
  it('keeps effective-time display, refresh and banner behavior unchanged', () => {
    const src = workspace();
    const effective = src.match(/formatDate\(item\.effectiveMessageAt \?\? item\.createdAt\)/g) || [];
    assert.equal(effective.length, 2);
    assert.match(src, /\}, \[clientFilter, caseFilter, offset, pageSize, reloadToken\]\);/);
    assert.match(src, /await syncMailbox\(mailbox\.id\);/);
    assert.match(src, /connectedMailboxes\.length > 0 \? "E-mail-fiók összekötve\."/);
  });

  it('keeps reply/reply-all/forward on the canonical mailbox sender', () => {
    assert.match(workspace(), /sendMailboxMessage\(\{/);
    assert.match(workspace(), /buildReplyAllRecipients\(detail, mailboxConnection\)/);
  });
});
