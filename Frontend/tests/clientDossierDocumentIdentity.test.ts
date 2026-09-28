/**
 * Regression proof for the T06 dossier document identity defect.
 *
 * Live reproduction class:
 *  - /clients/<clientId> "Kapcsolt dokumentumok" rows navigated to
 *    /cases/<caseId>/documents WITHOUT a documentId, so the Document Workspace
 *    fell back to its positional default and different rows opened the same
 *    document.
 *
 * Required contract (canonical route, already used by the case workspace and
 * insight tiles):
 *   /cases/<caseId>/documents?documentId=<documentId>
 *
 * Every dossier document row must carry exactly its own document identity.
 * The fail-closed workspace semantics for an unmatched/deleted/inaccessible
 * documentId are locked separately in caseDocumentIdentityRepair.test.ts and
 * must not change here.
 */
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';

const root = process.cwd();
const dossier = readFileSync(path.join(root, 'src/app/clients/[clientId]/page.tsx'), 'utf8');

function documentsMapBlock(): string {
  const start = dossier.indexOf('{documents.map((doc) => (');
  assert.notEqual(start, -1, 'expected the dossier documents list to render documents.map((doc) => ...)');
  const end = dossier.indexOf('))}', start);
  assert.notEqual(end, -1, 'expected the dossier documents map block to be closed');
  return dossier.slice(start, end);
}

function rowLinks(block: string): string[] {
  return [...block.matchAll(/href=\{`([^`]*)`\}/g)].map((match) => match[1]);
}

describe('client dossier document identity', () => {
  it('every dossier document row deep-links with its own documentId', () => {
    const links = rowLinks(documentsMapBlock());
    assert.ok(links.length > 0, 'expected at least one dossier document row link');
    for (const href of links) {
      assert.match(
        href,
        /^\/cases\/\$\{doc\.caseId\}\/documents\?documentId=\$\{encodeURIComponent\(doc\.id\)\}$/,
        `dossier row must open its own document identity, got: ${href}`,
      );
    }
  });

  it('dossier document rows never open the bare case documents URL (positional default)', () => {
    const block = documentsMapBlock();
    assert.doesNotMatch(
      block,
      /\/documents`/,
      'dossier document rows must not navigate to the bare case documents URL without documentId',
    );
  });

  it('row selection identity and carried documentId are the same document (doc.id)', () => {
    const block = documentsMapBlock();
    assert.match(block, /<Link key=\{doc\.id\}/, 'row key must remain the document identity');
    assert.match(
      block,
      /documentId=\$\{encodeURIComponent\(doc\.id\)\}/,
      'carried documentId must be the row document identity',
    );
  });
});
