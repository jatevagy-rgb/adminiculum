import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import path from 'node:path';

const root = process.cwd();
const read = (rel: string) => readFileSync(path.join(root, rel), 'utf8');

describe('Contract library internal UI (structural)', () => {
  const component = () => read('src/components/clients/ClientContractLibrary.tsx');
  const api = () => read('src/lib/clientContractsApi.ts');

  it('renders Szerződéstár within the canonical Client detail', () => {
    const page = read('src/app/clients/[clientId]/page.tsx');
    assert.match(page, /ClientContractLibrary/);
    assert.match(page, /szerzodes-tar/);
    assert.match(component(), /Szerződéstár/);
  });

  it('renders contract list, family, obligations and entitlements sections', () => {
    const src = component();
    for (const label of ['Partner:', 'Módosítások', 'Kötelezettségek', 'Jogosultságok', 'Következő szerződéses dátum', 'Kanonikus dokumentum']) {
      assert.match(src, new RegExp(label));
    }
  });

  it('keeps empty, loading and error states', () => {
    const src = component();
    assert.match(src, /Betöltés…/);
    assert.match(src, /nem tölthetők be/);
    assert.match(src, /Nincs megjeleníthető elem/);
  });

  it('localizes codes instead of exposing raw enums/IDs in the normal UI', () => {
    const src = component();
    assert.match(src, /contractStatusLabel|contractTypeLabel|partyRoleLabel|obligationStatusLabel|entitlementStatusLabel|entitlementTypeLabel/);
    assert.doesNotMatch(src, /SIGNED_NOT_EFFECTIVE\}|CROSS_CLIENT\}|canonicalDocumentVersionId\}/);
  });

  it('calls the internal workforce contract endpoints', () => {
    const src = api() + component();
    for (const token of ['/client-contracts/clients/', '/contracts', '/obligations', '/entitlements', '/family']) {
      assert.match(src, new RegExp(token.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')));
    }
  });

  it('is registered and type-safe (component exists)', () => {
    assert.equal(existsSync(path.join(root, 'src/components/clients/ClientContractLibrary.tsx')), true);
    assert.equal(existsSync(path.join(root, 'src/lib/clientContractsApi.ts')), true);
  });
});
