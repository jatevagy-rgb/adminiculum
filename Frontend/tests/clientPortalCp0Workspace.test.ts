import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'fs';
import path from 'path';

const root = path.resolve(__dirname, '..');
const read = (relative: string) => readFileSync(path.join(root, relative), 'utf8');

describe('CP0 anonymous entry and authenticated workspace shell', () => {
  it('renders the two exact Hungarian entry cards without authenticated navigation', () => {
    const landing = read('src/components/client-portal/PortalEntryLanding.tsx');
    assert.match(landing, /Melyik ügyfélfelületre szeretne belépni\?/);
    for (const title of ['Magánügyfél', 'Szervezeti ügyfél']) assert.match(landing, new RegExp(title));
    assert.doesNotMatch(landing, /Ügyátvezető/);
    for (const mode of ['individual', 'organization']) assert.match(landing, new RegExp(`mode: '${mode}'`));
    assert.doesNotMatch(landing, /mode: 'case-relay'/);
    assert.match(landing, /href=\{`\/portal\/login\?mode=\$\{card\.mode\}`\}/);
    for (const label of ['Főoldal', 'Ügyeim', 'Teendőim', 'Dokumentumok', 'Üzenetek']) assert.doesNotMatch(landing, new RegExp(label));
    assert.match(landing, /focus:ring-4/);
    assert.match(landing, /lg:grid-cols-2/);
    assert.doesNotMatch(landing, /lg:grid-cols-3/);
  });

  it('loads server-authoritative context before portal data and rebuilds navigation from capabilities', () => {
    const shell = read('src/components/client-portal/ClientPortalShell.tsx');
    assert.ok(shell.indexOf('getPortalIdentityContext') < shell.indexOf('getPortalHome()'));
    assert.match(shell, /capabilities\.matters/);
    assert.match(shell, /capabilities\.tasks/);
    assert.match(shell, /capabilities\.documents/);
    assert.match(shell, /capabilities\.messages/);
    assert.match(shell, /capabilities\.intakes/);
    assert.match(shell, /setSelectedPortalWorkspace\(null\)/);
    assert.match(shell, /PortalWorkspaceSelector/);
    assert.match(shell, /Nincs aktív ügyfélfelülete/);
    assert.match(shell, /Jóváhagyásra vár/);
    assert.match(shell, /A hozzáférés szünetel/);
    assert.match(shell, /hozzáférése aktív, de ezen a felületen jelenleg nincs elérhető tartalom/);
    assert.match(shell, /status: 'service-error'/);
    assert.match(shell, /state\.status === 'workspace-empty'/);
    assert.match(shell, /Munkatérváltás/);
  });

  it('treats mode as login intent while every API request carries revalidated workspace context', () => {
    const launcher = read('src/components/client-identity/CustomerAuthLauncher.tsx');
    const api = read('src/lib/api.ts');
    const portalApi = read('src/lib/clientPortalApi.ts');
    const shell = read('src/components/client-portal/ClientPortalShell.tsx');
    assert.match(launcher, /client-portal-login-intent/);
    assert.match(launcher, /nem módosítja az iroda által engedélyezett hozzáféréseket/);
    assert.match(api, /x-client-portal-workspace/);
    assert.match(portalApi, /CLIENT_PORTAL_WORKSPACE_STORAGE_KEY/);
    assert.match(portalApi, /getStoredPortalWorkspace/);
    assert.match(portalApi, /const effectiveReference = publicReference \|\| getStoredPortalWorkspace\(\)/);
    assert.match(portalApi, /skipWorkspaceContext: !effectiveReference/);
    assert.match(portalApi, /'x-client-portal-workspace': effectiveReference/);
    assert.match(shell, /useState<string \| null>\(\(\) => getStoredPortalWorkspace\(\)\)/);
    assert.match(shell, /error instanceof ApiError && error\.status === 403 && selectedReference/);
    assert.match(shell, /setSelectedPortalWorkspace\(null\)/);
  });

  it('exposes workforce create, lifecycle, invitation, approval and explicit grant controls', () => {
    const admin = read('src/app/client-portal-admin/page.tsx');
    for (const marker of ['Ügyfélportál aktiválása', 'Aktiválás', 'Felfüggesztés', 'Archiválás', 'Meghívás', 'Jóváhagyás', 'Visszavonás', 'Explicit ügyhozzáférés', 'Technikai adatok / Audit']) assert.match(admin, new RegExp(marker));
    assert.match(admin, /Ügyhozzáférés nem jön létre automatikusan/);
  });
});
