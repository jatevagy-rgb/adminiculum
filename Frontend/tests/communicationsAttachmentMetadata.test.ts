import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { attachmentContentType, attachmentDisplayName, formatAttachmentSize } from '../src/lib/attachmentPresentation';

/**
 * Attachment metadata presentation: names and truthful sizes render; missing
 * data is omitted rather than fabricated; no download action exists because the
 * canonical storage keeps metadata only.
 */

const root = process.cwd();
const read = (rel: string) => readFileSync(path.join(root, rel), 'utf8');
const workspace = () => read('src/components/communications/CommunicationWorkspace.tsx');
const api = () => read('src/lib/api.ts');

describe('attachment metadata formatting', () => {
  it('renders file names with a safe fallback', () => {
    assert.equal(attachmentDisplayName({ fileName: 'szerzodes.pdf' }), 'szerzodes.pdf');
    assert.equal(attachmentDisplayName({ fileName: '  ' }), 'Melléklet');
    assert.equal(attachmentDisplayName({ fileName: null }), 'Melléklet');
    assert.equal(attachmentDisplayName({}), 'Melléklet');
  });

  it('formats sizes truthfully and omits missing or invalid sizes', () => {
    assert.equal(formatAttachmentSize(0), '0 B');
    assert.equal(formatAttachmentSize(999), '999 B');
    assert.equal(formatAttachmentSize(1536), '1.5 KB');
    assert.equal(formatAttachmentSize(20480), '20 KB');
    assert.equal(formatAttachmentSize(1572864), '1.5 MB');
    assert.equal(formatAttachmentSize(20971520), '20 MB');
    assert.equal(formatAttachmentSize(null), null);
    assert.equal(formatAttachmentSize(undefined), null);
    assert.equal(formatAttachmentSize(Number.NaN), null);
    assert.equal(formatAttachmentSize(-5), null);
  });

  it('shows a content type only when it is concrete', () => {
    assert.equal(attachmentContentType({ fileType: 'application/pdf' }), 'application/pdf');
    assert.equal(attachmentContentType({ fileType: 'application/octet-stream' }), null);
    assert.equal(attachmentContentType({ fileType: '' }), null);
    assert.equal(attachmentContentType({ fileType: null }), null);
  });
});

describe('attachment list rendering', () => {
  it('renders a compact Mellékletek list instead of a bare count', () => {
    const src = workspace();
    assert.match(src, />Mellékletek<\//);
    assert.match(src, /detail\.attachments\.map\(\(attachment, index\) =>/);
    assert.match(src, /attachmentDisplayName\(attachment\)/);
    assert.match(src, /formatAttachmentSize\(attachment\.sizeBytes\)/);
    assert.match(src, /attachmentContentType\(attachment\)/);
    assert.doesNotMatch(src, /\{detail\.attachments\.length\} melléklet csatolva/);
  });

  it('renders each attachment distinctly in a list', () => {
    assert.match(workspace(), /<ul className="mt-1 space-y-0\.5">/);
    assert.match(workspace(), /key=\{attachment\.id \|\| `\$\{attachment\.fileName\}-\$\{index\}`\}/);
  });

  it('keeps the no-attachment state clean', () => {
    assert.match(workspace(), /detail\.attachments\?\.length \? <div/);
  });

  it('fabricates no download action or content promise', () => {
    const src = workspace();
    const listBlock = src.match(/Mellékletek[\s\S]*?<\/ul>/)?.[0] ?? '';
    assert.ok(listBlock.length > 0, 'attachment list block not found');
    assert.doesNotMatch(listBlock, /<a |<button|href=/);
    assert.doesNotMatch(src, /download|letölt/i);
    assert.doesNotMatch(read('src/lib/attachmentPresentation.ts'), /download|letölt/i);
  });

  it('declares the canonical size field on the attachment type', () => {
    assert.match(api(), /sizeBytes\?: number \| null;/);
  });
});

describe('#414/#415/#416 contracts preserved', () => {
  it('keeps #414 effective-time/refresh/banner semantics', () => {
    const src = workspace();
    const effective = src.match(/formatDate\(item\.effectiveMessageAt \?\? item\.createdAt\)/g) || [];
    assert.equal(effective.length, 2);
    assert.match(src, /await syncMailbox\(mailbox\.id\);/);
    assert.match(src, /connectedMailboxes\.length > 0 \? "E-mail-fiók összekötve\."/);
  });

  it('keeps #415 triage and canonical direction semantics', () => {
    const src = workspace();
    assert.match(src, /await ignoreCommunication\(item\.id\);/);
    assert.match(src, /await unignoreCommunication\(item\.id\);/);
    assert.match(src, /"Nem igényel intézkedést"/);
    assert.match(src, /signal\.direction === "incoming" \? "Bejövő" : "Kimenő"/);
    assert.match(read('src/lib/communicationIntake.ts'), /canonicalCommunicationDirection/);
  });

  it('keeps #416 mailbox sync untouched on the frontend', () => {
    assert.match(workspace(), /await syncMailbox\(mailbox\.id\);/);
  });
});
