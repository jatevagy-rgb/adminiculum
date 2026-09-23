/**
 * Regression proof for the live P1 case/document identity defects (F-001/F-002).
 *
 * Live reproduction classes:
 *  - /cases/6005a537fae8883264e0e51a6d69b834/documents?documentId=23385016a391d1ef30b1e882806e69da
 *    reloaded into a DIFFERENT case/document (silent substitution + URL rewrite).
 *  - /cases/f3ca83da98b95d0587da91734dc7d2eb (a case visible in a client list)
 *    reported as "Az ügy nem található".
 *
 * Production holds BOTH UUID-like and compact/legacy-looking Case.id/Document.id
 * values. Format never implies validity. The required contract is:
 *   - a requested identity is resolved by EXACT match only, across pages;
 *   - a failed lookup returns null and NEVER selects another case/document;
 *   - a requested documentId is never replaced by a positional default.
 */
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import {
  findCaseByReference,
  findRequestedDocument,
  isCaseLookupAuthorizationDenial,
  isRequestedDocumentUnresolved,
  readDocumentIdFromSearch,
  resolveRequestedDocumentId,
  shouldDefaultSelectDocument,
  type CaseReferencePage,
} from '../src/lib/workspace/identityResolution';

const root = process.cwd();
const read = (relativePath: string) => readFileSync(path.join(root, relativePath), 'utf8');

// Live production identities (compact/legacy format).
const COMPACT_CASE_ID = '6005a537fae8883264e0e51a6d69b834';
const COMPACT_DOC_ID = '23385016a391d1ef30b1e882806e69da';
const LEGACY_CASE_NUMBER = 'DEMOKFT-F3CA83';

// Canonical UUID identities.
const UUID_CASE_ID = 'e40cc13c-1f01-4918-8096-6c60371e2da4';
const UUID_DOC_ID = 'bb45f52d-1613-4b07-b903-b88705a23544';

// A different case/document that must NEVER be substituted for a requested one.
const OTHER_CASE_ID = 'f3ca83da98b95d0587da91734dc7d2eb';
const OTHER_CASE_NUMBER = 'CASE-2026-035';
const OTHER_DOC_ID = '01joule-platform-msa';

type CaseRow = { id: string; caseNumber: string };
type DocRow = { id: string };

/** Builds a paged case API where `rows` are ordered (most recent first). */
function makeCaseApi(rows: CaseRow[], total = rows.length) {
  const pageSize = 200;
  const calls: number[] = [];
  const fetchPage = async (page: number, limit: number): Promise<CaseReferencePage<CaseRow>> => {
    calls.push(page);
    const size = Math.min(limit, pageSize);
    const start = (page - 1) * size;
    return {
      data: rows.slice(start, start + size),
      pagination: { page, limit: size, total },
    };
  };
  return { fetchPage, calls };
}

function casesInPages(pages: CaseRow[][]): CaseRow[] {
  return pages.flat();
}

describe('F-002 case reference resolution', () => {
  it('resolves a compact/legacy Case.id from the list to the exact case', async () => {
    const { fetchPage } = makeCaseApi([
      { id: OTHER_CASE_ID, caseNumber: OTHER_CASE_NUMBER },
      { id: COMPACT_CASE_ID, caseNumber: LEGACY_CASE_NUMBER },
    ]);
    const resolved = await findCaseByReference(COMPACT_CASE_ID, fetchPage);
    assert.equal(resolved?.id, COMPACT_CASE_ID);
  });

  it('resolves a UUID Case.id to the exact case', async () => {
    const { fetchPage } = makeCaseApi([
      { id: UUID_CASE_ID, caseNumber: 'CASE-2026-099' },
      { id: COMPACT_CASE_ID, caseNumber: LEGACY_CASE_NUMBER },
    ]);
    const resolved = await findCaseByReference(UUID_CASE_ID, fetchPage);
    assert.equal(resolved?.id, UUID_CASE_ID);
  });

  it('still resolves a legacy caseNumber alias', async () => {
    const { fetchPage } = makeCaseApi([
      { id: OTHER_CASE_ID, caseNumber: OTHER_CASE_NUMBER },
      { id: COMPACT_CASE_ID, caseNumber: LEGACY_CASE_NUMBER },
    ]);
    const resolved = await findCaseByReference(LEGACY_CASE_NUMBER, fetchPage);
    assert.equal(resolved?.id, COMPACT_CASE_ID);
  });

  it('does NOT depend on an arbitrary first-page window', async () => {
    // 500 cases, the requested compact id is on page 3, outside any first-200 scan.
    const filler: CaseRow[] = Array.from({ length: 400 }, (_, i) => ({
      id: `filler-${i}`,
      caseNumber: `CASE-FILLER-${i}`,
    }));
    const pages = [
      filler.slice(0, 200),
      filler.slice(200, 400),
      [{ id: COMPACT_CASE_ID, caseNumber: LEGACY_CASE_NUMBER }],
    ];
    const { fetchPage, calls } = makeCaseApi(casesInPages(pages), 401);
    const resolved = await findCaseByReference(COMPACT_CASE_ID, fetchPage);
    assert.equal(resolved?.id, COMPACT_CASE_ID);
    assert.ok(calls.length >= 3, 'the scan must continue past the first page');
  });

  it('missing requested case returns null and NEVER selects another case', async () => {
    const { fetchPage } = makeCaseApi([
      { id: OTHER_CASE_ID, caseNumber: OTHER_CASE_NUMBER },
      { id: UUID_CASE_ID, caseNumber: 'CASE-2026-099' },
    ]);
    // The requested reference is absent; a positional/first-case fallback would
    // return the first listed case here. The contract requires null.
    const resolved = await findCaseByReference('missing-case-reference', fetchPage);
    assert.equal(resolved, null);

    // Mutation proof: the old positional default WOULD substitute another case.
    const positionalDefault = (rows: CaseRow[]) => rows[0] ?? null;
    assert.equal(
      positionalDefault([{ id: OTHER_CASE_ID, caseNumber: OTHER_CASE_NUMBER }])?.id,
      OTHER_CASE_ID,
    );
    assert.equal(resolved, null);
  });

  it('stops scanning once the total page count is exhausted', async () => {
    const rows: CaseRow[] = Array.from({ length: 250 }, (_, i) => ({
      id: `row-${i}`,
      caseNumber: `CASE-${i}`,
    }));
    const { fetchPage, calls } = makeCaseApi(rows, 250);
    const resolved = await findCaseByReference('not-present', fetchPage);
    assert.equal(resolved, null);
    // 250 rows / 200 per page => pages 1 and 2 only.
    assert.deepEqual(calls, [1, 2]);
  });
});

describe('F-001 document identity resolution', () => {
  it('reads a requested documentId from a raw search string (compact and UUID)', () => {
    assert.equal(readDocumentIdFromSearch(`?documentId=${COMPACT_DOC_ID}`), COMPACT_DOC_ID);
    assert.equal(readDocumentIdFromSearch(`foo=1&documentId=${UUID_DOC_ID}&bar=2`), UUID_DOC_ID);
    assert.equal(readDocumentIdFromSearch('?other=1'), null);
    assert.equal(readDocumentIdFromSearch(''), null);
    assert.equal(readDocumentIdFromSearch(null), null);
  });

  it('preserves the requested documentId even when the router has not hydrated search params', () => {
    // First client render: searchParams empty, but the live URL still carries it.
    assert.equal(
      resolveRequestedDocumentId(null, `?documentId=${COMPACT_DOC_ID}`),
      COMPACT_DOC_ID,
    );
    // Hydrated render wins when available.
    assert.equal(
      resolveRequestedDocumentId(UUID_DOC_ID, `?documentId=${COMPACT_DOC_ID}`),
      UUID_DOC_ID,
    );
  });

  it('resolves the requested document by exact id, compact and UUID alike', () => {
    const uploaded: DocRow[] = [{ id: COMPACT_DOC_ID }, { id: OTHER_DOC_ID }];
    const contracts: DocRow[] = [{ id: UUID_DOC_ID }];
    assert.equal(findRequestedDocument(COMPACT_DOC_ID, [uploaded, contracts])?.id, COMPACT_DOC_ID);
    assert.equal(findRequestedDocument(UUID_DOC_ID, [uploaded, contracts])?.id, UUID_DOC_ID);
  });

  it('missing requested document returns null and NEVER selects another document', () => {
    const uploaded: DocRow[] = [{ id: OTHER_DOC_ID }];
    const contracts: DocRow[] = [{ id: 'contract-1' }];

    const resolved = findRequestedDocument('missing-document-id', [uploaded, contracts]);
    assert.equal(resolved, null, 'a missing requested document must not resolve to another document');

    // Mutation proof: the old positional default WOULD have substituted a
    // different document for the same input. The exact-match resolver must not.
    const oldPositionalDefault = (groups: DocRow[][]) => groups.flat()[0] ?? null;
    assert.equal(oldPositionalDefault([uploaded, contracts])?.id, OTHER_DOC_ID);
    assert.equal(resolved, null);
  });

  it('only defaults to the first document when the URL requests none', () => {
    assert.equal(shouldDefaultSelectDocument(null), true);
    assert.equal(shouldDefaultSelectDocument(undefined), true);
    assert.equal(shouldDefaultSelectDocument(''), true);
    assert.equal(shouldDefaultSelectDocument(COMPACT_DOC_ID), false);
    assert.equal(shouldDefaultSelectDocument(UUID_DOC_ID), false);
  });

  it('reports "unresolved" only after loading completes without a match', () => {
    assert.equal(isRequestedDocumentUnresolved(COMPACT_DOC_ID, false, null), false);
    assert.equal(isRequestedDocumentUnresolved(COMPACT_DOC_ID, true, null), true);
    assert.equal(isRequestedDocumentUnresolved(COMPACT_DOC_ID, true, { id: COMPACT_DOC_ID }), false);
    assert.equal(isRequestedDocumentUnresolved(null, true, null), false);
  });
});

describe('403 is a terminal authorization denial (defense in depth)', () => {
  it('classifies an explicit HTTP 403 as terminal', () => {
    assert.equal(isCaseLookupAuthorizationDenial({ status: 403 }), true);
    assert.equal(
      isCaseLookupAuthorizationDenial(Object.assign(new Error('forbidden'), { status: 403 })),
      true,
    );
  });

  it('does NOT treat 404 / transport / 5xx as authorization denial, preserving legacy alias fallback', () => {
    assert.equal(isCaseLookupAuthorizationDenial({ status: 404 }), false);
    assert.equal(isCaseLookupAuthorizationDenial({ status: 400 }), false);
    assert.equal(isCaseLookupAuthorizationDenial({ status: 500 }), false);
    assert.equal(isCaseLookupAuthorizationDenial({ status: 0 }), false);
    assert.equal(isCaseLookupAuthorizationDenial(new Error('network')), false);
    assert.equal(isCaseLookupAuthorizationDenial(null), false);
    assert.equal(isCaseLookupAuthorizationDenial(undefined), false);
  });

  it('both case surfaces gate the alias scan behind the terminal-403 check', () => {
    const documentsPageSource = read('src/app/cases/[caseId]/documents/page.tsx');
    const caseDetailSource = read('src/components/CaseDetail.tsx');
    for (const source of [documentsPageSource, caseDetailSource]) {
      const gateIndex = source.indexOf('isCaseLookupAuthorizationDenial(error)');
      const fallbackIndex = source.indexOf('findCaseByReference(');
      const gateValueIndex = source.indexOf('? null', gateIndex);
      assert.ok(gateIndex >= 0, 'the terminal-403 gate must be present');
      assert.ok(fallbackIndex > gateIndex, 'the alias scan must sit after the 403 check');
      assert.ok(
        gateValueIndex > gateIndex && gateValueIndex < fallbackIndex,
        'a 403 must resolve to null before the alias scan is considered',
      );
    }
  });
});

describe('interaction with authorization-scoped GET /cases', () => {
  // Mirrors the #357 backend scope: unauthorized rows never leave the database and
  // pagination.total counts only authorized rows.
  const AUTHORIZED_ROWS: CaseRow[] = [
    { id: COMPACT_CASE_ID, caseNumber: LEGACY_CASE_NUMBER },
    { id: OTHER_CASE_ID, caseNumber: OTHER_CASE_NUMBER },
  ];
  const UNAUTHORIZED_ROW: CaseRow = { id: UUID_CASE_ID, caseNumber: 'CASE-SECRET-1' };

  function makeScopedApi() {
    return async (page: number, limit: number): Promise<CaseReferencePage<CaseRow>> => {
      const start = (page - 1) * limit;
      return {
        data: AUTHORIZED_ROWS.slice(start, start + limit),
        pagination: { page, limit, total: AUTHORIZED_ROWS.length },
      };
    };
  }

  it('resolves an authorized legacy caseNumber alias', async () => {
    const resolved = await findCaseByReference(LEGACY_CASE_NUMBER, makeScopedApi());
    assert.equal(resolved?.id, COMPACT_CASE_ID);
  });

  it('cannot resolve an unauthorized UUID or caseNumber through the scoped list', async () => {
    assert.equal(await findCaseByReference(UNAUTHORIZED_ROW.id, makeScopedApi()), null);
    assert.equal(await findCaseByReference(UNAUTHORIZED_ROW.caseNumber, makeScopedApi()), null);
  });

  it('the paginated fallback cannot enumerate unauthorized cases', async () => {
    const seen: string[] = [];
    const fetchPage = makeScopedApi();
    for (let page = 1; page <= 5; page += 1) {
      const response = await fetchPage(page, 1);
      seen.push(...response.data.map((row) => row.id));
    }
    assert.ok(!seen.includes(UNAUTHORIZED_ROW.id), 'unauthorized case must never appear in a page');
    assert.equal(await findCaseByReference(UNAUTHORIZED_ROW.id, makeScopedApi()), null);
  });
});

describe('workspace wiring is fail-closed', () => {
  const documentsPage = read('src/app/cases/[caseId]/documents/page.tsx');
  const caseDetail = read('src/components/CaseDetail.tsx');
  const comparePage = read('src/app/documents/compare/page.tsx');

  it('the document workspace never default-selects when a documentId is requested', () => {
    assert.match(documentsPage, /shouldDefaultSelectDocument\(deepLinkedId\)/);
    assert.match(documentsPage, /findRequestedDocument\(deepLinkedId, \[uploadedDocsData\]\)/);
    assert.match(documentsPage, /findRequestedDocument\(deepLinkedId, \[contractsData\]\)/);
    // The positional default is only reachable through the "requests none" gate.
    const defaultGateIndex = documentsPage.indexOf('else if (shouldDefaultSelectDocument(deepLinkedId))');
    const firstDefaultIndex = documentsPage.indexOf("syncDocumentIdToUrl(uploaded[0].id, \"replace\")");
    assert.ok(defaultGateIndex >= 0 && firstDefaultIndex > defaultGateIndex,
      'the first-document default must sit behind the shouldDefaultSelectDocument gate');
  });

  it('a requested-but-unresolved document fails closed (no selection, URL untouched)', () => {
    assert.match(documentsPage, /requestedDocumentUnresolved/);
    assert.match(documentsPage, /data-testid="requested-document-unresolved"/);
    assert.match(documentsPage, /setSelectedLedgerItem\(null\);\s*\n\s*setSelectedContract\(null\);\s*\n\s*setRequestedDocumentUnresolved\(true\);/);
  });

  it('the document workspace resolves the requested case reference across pages, not a window', () => {
    assert.match(documentsPage, /findCaseByReference\(/);
    assert.doesNotMatch(
      documentsPage,
      /const response = await getCases\(1, 200\)/,
      'the document workspace must not depend on a first-page window',
    );
    assert.match(documentsPage, /caseResolution === "not-found"/);
  });

  it('CaseDetail resolves the canonical id first and fails closed on unknown references', () => {
    assert.match(caseDetail, /record = await getCaseById\(resolvedParams\.caseId\)/);
    assert.match(caseDetail, /await findCaseByReference\(/);
    assert.doesNotMatch(
      caseDetail,
      /caseList\.data\.find\([\s\S]{0,80}caseNumber === resolvedParams\.caseId/,
      'the fallback must not be a single-window array scan',
    );
  });

  it('browser back/forward semantics are preserved for document identity', () => {
    // Default canonicalization rewrites history; an explicit user selection pushes.
    assert.match(documentsPage, /syncDocumentIdToUrl\([^,]+, "replace"\)/);
    assert.match(documentsPage, /history: "push" \| "replace" = "push"/);
    assert.match(documentsPage, /syncDocumentIdToUrl\(item\.item\.id, history\)/);
  });

  it('sibling case navigation and direct case URLs still resolve by canonical case identity', () => {
    // The CaseDetail not-found guard still requires that no case identity resolved.
    assert.match(
      caseDetail,
      /if \(!caseRecord && timelineEvents\.length === 0 && generatedContracts\.length === 0 && documents\.length === 0\)/,
    );
    // The compare surface keeps its canonical caseId route (no case-scoped alias).
    assert.match(comparePage, /\/cases\/\$\{encodeURIComponent\(selectedDocument\.caseId\)\}\/documents/);
  });
});
