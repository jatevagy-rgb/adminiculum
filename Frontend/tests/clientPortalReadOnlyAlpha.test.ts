import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'fs';
import path from 'path';

const root = path.resolve(__dirname, '..');
const read = (relative: string) => readFileSync(path.join(root, relative), 'utf8');

describe('client portal read-only alpha frontend', () => {
  const shell = () => read('src/components/client-portal/ClientPortalShell.tsx');
  const api = () => read('src/lib/clientPortalApi.ts');
  const authApi = () => read('src/lib/api.ts');

  it('uses a separate client-facing shell and does not import the internal AppShell', () => {
    const source = shell();
    assert.match(source, /client-portal-shell/);
    assert.match(source, /Főoldal/);
    assert.match(source, /Ügyeim/);
    assert.match(source, /Dokumentumok/);
    assert.match(source, /Teendők/);
    assert.doesNotMatch(source, /AppShell|DashboardFocused|cockpit|Annotációk|Összehasonlítás|Audit/);
    assert.match(source, /Teendőim/);
    assert.match(source, /Üzenetek/);
  });

  it('contains no write/action completion controls in the read-only portal', () => {
    const shellSource = shell();
    const apiSource = api();

    // Shell must not wire any write/action completion logic.
    assert.doesNotMatch(shellSource, /completeClientPortalAction/i);
    assert.doesNotMatch(shellSource, /method:\s*['"]POST['"]|method:\s*['"]PUT['"]|method:\s*['"]PATCH['"]/i);
    assert.doesNotMatch(shellSource, /jóváhagyás gomb/i);

    // API module must not expose approval-specific write endpoints to the portal.
    // PENDING_APPROVAL is a read-only status enum — not an approval action.
    assert.doesNotMatch(apiSource, /completeClientPortalAction/i);
    assert.doesNotMatch(apiSource, /['"]\/.*\/approve['"]/i);
    assert.doesNotMatch(apiSource, /['"]\/.*\/publish['"]/i);

    // Both files must contain the read-only note marker.
    assert.match(shellSource, /readOnlyNote/);
    assert.match(apiSource, /readOnlyNote/);
  });

  it('renders client-readable label fields instead of raw backend enum fields', () => {
    const source = shell() + api();
    assert.match(source, /statusLabel/);
    assert.match(source, /stateLabel/);
    assert.match(source, /typeLabel/);
    assert.match(source, /categoryLabel/);
    assert.match(source, /Jelenleg nincs teendője/);
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

  it('keeps customer and workforce bearer tokens in separate local slots', () => {
    const apiSource = authApi();
    const shellSource = shell();
    assert.match(apiSource, /adminiculum:auth_token:workforce/);
    assert.match(apiSource, /adminiculum:auth_token:customer/);
    assert.match(apiSource, /currentAuthContext/);
    assert.match(shellSource, /setAuthToken\(token\.accessToken, 'customer'\)/);
    assert.match(shellSource, /getAuthToken\('customer'\)/);
    assert.doesNotMatch(shellSource, /localStorage\.getItem\('auth_token'\)/);
  });
});
