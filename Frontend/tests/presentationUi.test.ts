import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';

const root = process.cwd();
const read = (rel: string) => readFileSync(path.join(root, rel), 'utf8');

describe('presentation UI safety contracts', () => {
  it('locks proposal actions before the React busy render settles', () => {
    const source = read('src/components/clients/compliance/ComplianceOverview.tsx');
    assert.match(source, /actionLockRef = useRef\(false\)/);
    assert.match(source, /if \(actionLockRef\.current\) return/);
    assert.match(source, /actionLockRef\.current = true/);
    assert.match(source, /actionLockRef\.current = false/);
  });

  it('keeps loading separate from empty and gives controls visible focus', () => {
    const source = read('src/components/clients/compliance/ComplianceOverview.tsx');
    assert.match(source, /Megállapítások betöltése/);
    assert.match(source, /Nincs megjeleníthető belső értékelési megállapítás/);
    assert.match(source, /focus-visible:ring-2/);
  });

  it('provides truthful, reusable portal presentation primitives', () => {
    const source = read('src/components/client-portal/PortalPresentationPrimitives.tsx');
    assert.match(source, /PortalPersonHeader/);
    assert.match(source, /PortalProfileCard/);
    assert.match(source, /ClientSafeResultCard/);
    assert.match(source, /DemoContentBanner/);
    assert.match(source, /A vállalati profil még nem érhető el/);
    assert.match(source, /if \(!enabled\) return null/);
  });

  it('tolerates future person fields without inferring access', () => {
    const types = read('src/lib/clientPortalApi.ts');
    const source = read('src/components/client-portal/PortalPresentationPrimitives.tsx');
    assert.match(types, /jobTitle\?: string \| null/);
    assert.match(types, /organizationUnitName\?: string \| null/);
    assert.match(source, /Pozíció/);
    assert.doesNotMatch(source, /jobTitle.*access|access.*jobTitle/);
  });
});
