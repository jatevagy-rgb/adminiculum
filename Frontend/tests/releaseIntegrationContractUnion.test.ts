import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';

/**
 * Release-train integration guard.
 *
 * `Frontend/src/lib/clientPortalApi.ts` is the single file touched by more than
 * one integrated candidate: #319 (Company Profile progressive disclosure) and
 * #333 (customer calendar Grow/compliance aggregation). The merge is a semantic
 * union, so BOTH contracts must remain present. Dropping either one silently
 * removes a shipped capability, which is exactly what this test prevents.
 */

const root = process.cwd();
const clientPortalApi = () => readFileSync(path.join(root, 'src/lib/clientPortalApi.ts'), 'utf8');

describe('release integration union — clientPortalApi.ts (#319 x #333)', () => {
  it('keeps the #319 Company Profile evidence-state contract', () => {
    const src = clientPortalApi();

    assert.match(
      src,
      /export type PortalCompanyProfileEvidenceState = "PENDING" \| "ANSWERED" \| "STALE";/,
      'evidence-state union from #319 must survive the union',
    );
    assert.match(src, /export type PortalCompanyProfileEvidenceItem = \{/, 'evidence item DTO from #319 must survive');
    assert.match(
      src,
      /evidenceState: PortalCompanyProfileEvidenceState;/,
      'evidenceState must stay a first-class field of the evidence item DTO',
    );
  });

  it('keeps the #333 customer calendar category contract', () => {
    const src = clientPortalApi();

    const categoryBlock = src.slice(src.indexOf('export type PortalCalendarCategory ='));
    assert.ok(categoryBlock.length > 0, 'PortalCalendarCategory must still exist');

    assert.match(categoryBlock, /\| 'GROW_TARGET'/, 'GROW_TARGET calendar category from #333 must survive');
    assert.match(
      categoryBlock,
      /\| 'COMPLIANCE_REVIEW'/,
      'COMPLIANCE_REVIEW calendar category from #333 must survive',
    );
  });

  it('keeps both contracts in the same module revision (no fork of the DTO surface)', () => {
    const src = clientPortalApi();

    assert.ok(
      src.indexOf('PortalCompanyProfileEvidenceState') >= 0 && src.indexOf('PortalCalendarCategory') >= 0,
      'both integrated contracts must coexist in one clientPortalApi module',
    );
    assert.doesNotMatch(src, /<<<<<<<|>>>>>>>|^=======$/m, 'no merge conflict markers may remain');
  });
});
