import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';

const root = process.cwd();
const read = (relativePath: string) => readFileSync(path.join(root, relativePath), 'utf8');

// UAT defect: a case opened from the workforce case list could land on
// "Az ügy nem található". Root cause: CaseDetail resolved the route identity by
// scanning the first 200 rows of GET /cases (an arbitrary pagination window).
// A case that is visible in a client-scoped or otherwise ordered list but falls
// outside that window never populated caseRecord, so an authorized case was
// reported as missing (CASE_LIST_DISPLAY/LINK id == Case.id).
describe('case detail canonical identity resolution', () => {
  it('resolves the canonical case by id directly instead of depending on a pagination window', () => {
    const caseDetail = read('src/components/CaseDetail.tsx');
    assert.match(caseDetail, /getCaseById/, 'CaseDetail must import and use getCaseById');
    assert.match(
      caseDetail,
      /record = await getCaseById\(resolvedParams\.caseId\)/,
      'CaseDetail must resolve the route identity via the canonical GET /cases/:caseId lookup',
    );
    const directIndex = caseDetail.indexOf('record = await getCaseById(resolvedParams.caseId)');
    const fallbackIndex = caseDetail.indexOf('await findCaseByReference(');
    assert.ok(directIndex >= 0 && fallbackIndex >= 0 && directIndex < fallbackIndex,
      'the canonical id lookup must run before the legacy-reference fallback');
    assert.doesNotMatch(
      caseDetail,
      /getCases\(1,\s*200\)[\s\S]{0,120}caseNumber === resolvedParams\.caseId/,
      'the legacy fallback must not be an arbitrary first-200 pagination window',
    );
  });

  it('keeps the legacy case-number alias as an exact-reference fallback only', () => {
    const caseDetail = read('src/components/CaseDetail.tsx');
    assert.match(
      caseDetail,
      /findCaseByReference\(/,
      'legacy case-number URLs must resolve through the exact-reference scan',
    );
    const resolver = read('src/lib/workspace/identityResolution.ts');
    assert.match(
      resolver,
      /item\.id === wanted \|\| item\.caseNumber === wanted/,
      'the fallback must match the requested reference exactly, never a positional case',
    );
  });

  it('never reports a resolved case as missing (false not-found guard preserved)', () => {
    const caseDetail = read('src/components/CaseDetail.tsx');
    assert.match(
      caseDetail,
      /if \(!caseRecord && timelineEvents\.length === 0 && generatedContracts\.length === 0 && documents\.length === 0\)/,
      'the not-found state must still require that no case identity was resolved',
    );
  });

  it('keeps every workforce case entry surface linked by the canonical Case.id', () => {
    const surfaces: Array<[string, RegExp]> = [
      ['src/components/CasesList.tsx', /router\.push\(`\/cases\/\$\{item\.id\}`\)/],
      ['src/app/clients/[clientId]/cases/page.tsx', /href=\{`\/cases\/\$\{encodeURIComponent\(item\.id\)\}`\}/],
      ['src/app/tasks/page.tsx', /href=\{`\/cases\/\$\{task\.case\.id\}`\}/],
      ['src/components/Dashboard.tsx', /href: `\/cases\/\$\{focusCase\.id\}`/],
    ];
    for (const [file, pattern] of surfaces) {
      assert.match(read(file), pattern, `${file} must link cases by Case.id`);
    }
  });

  it('maps the canonical lookup to GET /cases/:caseId', () => {
    const api = read('src/lib/api.ts');
    assert.match(api, /export async function getCaseById\(caseId: string\): Promise<CaseListItem>/);
    assert.match(api, /fetchApi<CaseListItem>\(`\/cases\/\$\{caseId\}`\)/);
  });

  it('keeps the backend authorization contract distinct: missing => 404, forbidden => 403', () => {
    const authorization = read('../Backend/src/modules/cases/authorization.ts');
    assert.match(authorization, /code: 'CASE_NOT_FOUND'/, 'a genuinely missing case must be a 404');
    assert.match(authorization, /code: 'CASE_ACCESS_FORBIDDEN'/, 'an unauthorized case must not be masked as 404');
    assert.match(authorization, /if \(!access\) \{\s*sendForbidden\(res\)/, 'forbidden access must send 403');
  });
});
