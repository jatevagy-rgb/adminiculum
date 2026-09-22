import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';

const root = process.cwd();
const read = (relativePath: string) => readFileSync(path.join(root, relativePath), 'utf8');

// UAT defect: four sibling Case routes still resolved case identity by scanning
// the first 200 rows of GET /cases. An authorized case outside that arbitrary
// pagination window produced a false unavailable/not-found state.
//
// Live reproduction identity (seeded demo case):
//   caseNumber: DEMOKFT-F3CA83
//   Case.id:    f3ca83da98b95d0587da91734dc7d2eb
// The route must resolve this Case.id directly, regardless of list position.
const CANONICAL_ROUTES: Array<{ label: string; file: string }> = [
  { label: 'communications', file: 'src/app/cases/[caseId]/communications/CommunicationsPageContent.tsx' },
  { label: 'client-portal', file: 'src/app/cases/[caseId]/client-portal/page.tsx' },
  { label: 'review', file: 'src/app/cases/[caseId]/review/[documentId]/ReviewPageContent.tsx' },
  { label: 'review-edit', file: 'src/app/cases/[caseId]/review/[documentId]/edit/page.tsx' },
];

describe('case sibling canonical identity resolution', () => {
  for (const { label, file } of CANONICAL_ROUTES) {
    it(`${label}: resolves the canonical Case.id directly before any list fallback`, () => {
      const src = read(file);
      assert.match(src, /getCaseById/, `${file} must import and use getCaseById`);
      const directIndex = src.indexOf('getCaseById(resolvedParams.caseId)');
      const listIndex = src.indexOf('getCases(1, 200)');
      assert.ok(directIndex >= 0, `${file} must call getCaseById(resolvedParams.caseId)`);
      assert.ok(
        listIndex < 0 || directIndex < listIndex,
        `${file} must run the canonical id lookup before the first-200 list lookup`,
      );
    });

    it(`${label}: keeps the legacy case-number alias as an explicit fallback only`, () => {
      const src = read(file);
      assert.match(
        src,
        /item\.caseNumber === resolvedParams\.caseId \|\| item\.id === resolvedParams\.caseId/,
        `${file} must preserve the legacy case-number list fallback`,
      );
    });
  }

  it('maps the canonical lookup to GET /cases/:caseId without weakening authorization', () => {
    const api = read('src/lib/api.ts');
    assert.match(api, /export async function getCaseById\(caseId: string\): Promise<CaseListItem>/);
    assert.match(api, /fetchApi<CaseListItem>\(`\/cases\/\$\{caseId\}`\)/);
    const route = read('../Backend/src/modules/cases/routes.ts');
    assert.match(route, /router\.get\('\/:caseId', authenticate, requireCaseReadAccess/);
  });

  it('keeps 404 (missing) distinct from 403 (forbidden) so a forbidden case is not disguised', () => {
    const authorization = read('../Backend/src/modules/cases/authorization.ts');
    assert.match(authorization, /code: 'CASE_NOT_FOUND'/);
    assert.match(authorization, /code: 'CASE_ACCESS_FORBIDDEN'/);
    assert.match(authorization, /if \(!access\) \{\s*sendForbidden\(res\)/);
  });

  it('keeps the sibling routes linked by the canonical Case.id', () => {
    const nav = read('src/components/cases/CaseWorkspaceNav.tsx');
    assert.match(nav, /\/cases\/\$\{caseId\}\/communications/);
    assert.match(nav, /\/cases\/\$\{caseId\}\/client-portal/);
    const review = read('src/app/cases/[caseId]/review/[documentId]/ReviewPageContent.tsx');
    assert.match(review, /\/cases\/\$\{canonicalCaseId\}\/review\/\$\{resolvedParams\.documentId\}\/edit/);
  });

  it('does not turn the route identity into a fuzzy lookup', () => {
    for (const { file } of CANONICAL_ROUTES) {
      const src = read(file);
      assert.doesNotMatch(src, /includes\(resolvedParams\.caseId\)|startsWith\(resolvedParams\.caseId\)/);
    }
  });
});
