/**
 * Contract Watch CW1 — internal calendar contract selector (frontend contract).
 *
 * Source-level assertions: the selector is read-only, defaults to the unchanged
 * all-contract view, uses the existing contract listing, deep-links contractId,
 * and the API only sends contractId when one is selected.
 */
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';

const root = process.cwd();
const page = () => readFileSync(path.join(root, 'src/app/clients/[clientId]/calendar/page.tsx'), 'utf8');
const api = () => readFileSync(path.join(root, 'src/lib/clientCalendarApi.ts'), 'utf8');

describe('internal calendar — contract selector (read-only)', () => {
  it('adds OBLIGATION_OCCURRENCE as a projected category', () => {
    const src = api();
    assert.ok(src.includes("'OBLIGATION_OCCURRENCE'"));
    assert.ok(src.includes("'OCCURRENCE_DUE'"));
    assert.ok(page().includes('OBLIGATION_OCCURRENCE'));
    assert.ok(page().includes('OCCURRENCE_DUE'));
  });

  it('sends contractId only when a contract is selected (default view unchanged)', () => {
    const src = api();
    assert.ok(src.includes('contractId?: string | null'));
    assert.ok(src.includes('if (contractId) params.set("contractId", contractId)'));
    // The unscoped call must not add the param.
    assert.ok(src.includes('const params = new URLSearchParams({ from: range.from, to: range.to })'));
  });

  it('offers an all-contracts default and one-specific-contract selection', () => {
    const src = page();
    assert.ok(src.includes('Minden szerződés'));
    assert.ok(src.includes('selectedContractId'));
    assert.ok(src.includes('clientContractsApi.listContracts(clientId)'));
    assert.ok(src.includes('contractStatusLabel(contract.status)'));
  });

  it('filters the projection and deep-links the selection without mutating data', () => {
    const src = page();
    assert.ok(src.includes('getClientCalendar(clientId, range, selectedContractId || null)'));
    assert.ok(src.includes('if (selectedContractId) paramsNext.set("contractId", selectedContractId)'));
    assert.ok(src.includes('A választás csak szűri a nézetet, adatot nem módosít.'));
    // Read-only: no contract mutation calls anywhere in the calendar page.
    for (const forbidden of ['createContract', 'transitionContract', 'setCanonicalDocument', 'createObligation']) {
      assert.ok(!src.includes(forbidden), `calendar page must not call ${forbidden}`);
    }
  });
});
