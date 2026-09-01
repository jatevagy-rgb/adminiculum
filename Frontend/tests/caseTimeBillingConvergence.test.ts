import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';

const root = process.cwd();
const read = (rel: string) => readFileSync(path.join(root, rel), 'utf8');

describe('Case-first time + billing preparation convergence (structural)', () => {
  const api = () => read('src/lib/caseTimeBillingApi.ts');
  const component = () => read('src/components/cases/CaseTimeBillingSummary.tsx');

  it('records time case-first and never sends a Matter identifier', () => {
    const src = api();
    assert.match(src, /recordCaseTime/);
    assert.match(src, /caseId: input\.caseId/);
    assert.doesNotMatch(src, /matterId/); // Matter scope is derived server-side
  });

  it('billing preparation client never carries an invented monetary fee', () => {
    const src = api();
    assert.match(src, /RATE_NOT_CONFIGURED/);
    assert.match(src, /feeEstimate: null/);
  });

  it('Case Workspace time block is case-first and free of Matter / rate / db-id leakage', () => {
    const src = component();
    assert.match(src, /Idő rögzítése/);
    assert.match(src, /Riport készítése/);
    assert.match(src, /Ellenőrzést igényel/); // ambiguous time surfaced simply
    assert.doesNotMatch(src, /matterId/); // no Matter identifier field surfaced
    assert.doesNotMatch(src, /feeEstimate|rateStatus|díjszab/i); // no rate/fee shown to any client
  });
});
