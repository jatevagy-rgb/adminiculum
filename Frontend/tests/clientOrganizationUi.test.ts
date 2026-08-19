import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import path from 'node:path';

const root = process.cwd();
const read = (rel: string) => readFileSync(path.join(root, rel), 'utf8');

describe('Organization internal UI (structural)', () => {
  const component = () => read('src/components/clients/ClientOrganization.tsx');
  const api = () => read('src/lib/clientOrganizationApi.ts');

  it('renders Szervezet within the canonical Client detail', () => {
    const page = read('src/app/clients/[clientId]/page.tsx');
    assert.match(page, /ClientOrganization/);
    assert.match(page, /szervezet/);
    assert.match(component(), /Szervezet/);
  });

  it('renders org chart, people, person detail, owner relations and gaps', () => {
    const src = component();
    for (const label of ['Szervezeti felépítés', 'Emberek', 'Saját szerződések', 'Saját kötelezettségek', 'Fejlesztési programok', 'Felelősségi hiányosságok', 'Vezető:', 'Helyettes:']) {
      assert.match(src, new RegExp(label));
    }
  });

  it('keeps empty, loading and error states', () => {
    const src = component();
    assert.match(src, /Betöltés…/);
    assert.match(src, /nem tölthetők be/);
    assert.match(src, /Nincs megjeleníthető elem/);
  });

  it('localizes statuses instead of exposing raw enums/IDs', () => {
    const src = component();
    assert.match(src, /personStatusLabel|responsibilityTypeLabel|contractOwnerStatusLabel|obligationOwnerStatusLabel/);
    assert.doesNotMatch(src, /HR_CONFIDENTIAL\}|portalMembershipId\}|employmentStatus\}/);
  });

  it('calls the internal workforce organization endpoints', () => {
    const src = api() + component();
    for (const token of ['/client-organization/clients/', '/groups', '/persons', '/gaps']) {
      assert.match(src, new RegExp(token.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')));
    }
  });

  it('is registered and type-safe (component exists)', () => {
    assert.equal(existsSync(path.join(root, 'src/components/clients/ClientOrganization.tsx')), true);
    assert.equal(existsSync(path.join(root, 'src/lib/clientOrganizationApi.ts')), true);
  });
});
