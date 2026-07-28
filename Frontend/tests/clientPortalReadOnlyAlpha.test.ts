import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'fs';
import path from 'path';

const root = path.resolve(__dirname, '..');
const read = (relative: string) => readFileSync(path.join(root, relative), 'utf8');

describe('client portal read-only alpha frontend', () => {
  const shell = () => read('src/components/client-portal/ClientPortalShell.tsx');
  const api = () => read('src/lib/clientPortalApi.ts');

  it('uses a separate client-facing shell and does not import the internal AppShell', () => {
    const source = shell();
    assert.match(source, /client-portal-shell/);
    assert.match(source, /Főoldal/);
    assert.match(source, /Ügyeim/);
    assert.match(source, /Dokumentumok/);
    assert.match(source, /Teendők/);
    assert.doesNotMatch(source, /AppShell|DashboardFocused|cockpit|Kommunikáció|Annotációk|Összehasonlítás|Audit/);
  });

  it('contains no write/action completion controls in the read-only portal', () => {
    const source = shell() + api();
    assert.doesNotMatch(source, /completeClientPortalAction|method:\s*['"]POST['"]|method:\s*['"]PUT['"]|method:\s*['"]PATCH['"]|upload|approval|jóváhagyás gomb/i);
    assert.match(source, /readOnlyNote/);
  });

  it('renders client-readable label fields instead of raw backend enum fields', () => {
    const source = shell() + api();
    assert.match(source, /statusLabel/);
    assert.match(source, /stateLabel/);
    assert.match(source, /typeLabel/);
    assert.match(source, /categoryLabel/);
    assert.match(source, /Figyelmet igényel/);
    assert.match(source, /Legutóbbi frissítések/);
  });

  it('defines all production portal pages requested for alpha', () => {
    for (const relative of [
      'src/app/portal/page.tsx',
      'src/app/portal/matters/[publicationId]/page.tsx',
      'src/app/portal/documents/[publicationId]/page.tsx',
      'src/app/portal/action-requests/[requestId]/page.tsx',
    ]) {
      assert.match(read(relative), /ClientPortalShell/);
    }
  });
});
