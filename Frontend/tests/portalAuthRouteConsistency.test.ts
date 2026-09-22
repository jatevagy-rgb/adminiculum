import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import path from 'node:path';

const root = path.resolve(__dirname, '..');
const read = (relative: string) => readFileSync(path.join(root, relative), 'utf8');

/**
 * Customer-portal route/session consistency.
 *
 * Live observation: `/portal` presented a customer-portal (Demo Kft.) context
 * while `/portal/ugyek` requested a Microsoft sign-in. Every customer route
 * renders the SAME canonical shell, so no page-level wrapper differs. The two
 * invariants that must hold — and that these assertions pin — are:
 *
 *  1. an unconfigured customer identity provider fails closed on EVERY customer
 *     route and never starts an interactive Microsoft redirect;
 *  2. the customer account is selected by the customer tenant and the customer
 *     token stays in the customer slot, so the workforce surface can never be
 *     borrowed as a customer identity.
 */
const CUSTOMER_ROUTES = [
  'src/app/portal/page.tsx',
  'src/app/portal/ugyek/page.tsx',
  'src/app/portal/ugyeim/page.tsx',
  'src/app/portal/teendoim/page.tsx',
  'src/app/portal/dokumentumok/page.tsx',
  'src/app/portal/naptar/page.tsx',
  'src/app/portal/fejlesztes/page.tsx',
  'src/app/portal/megfeleles/page.tsx',
  'src/app/portal/uzenetek/page.tsx',
  'src/app/portal/vallalat/page.tsx',
  'src/app/portal/szervezeti-attekintes/page.tsx',
  'src/app/portal/szerzodesek/page.tsx',
];

describe('customer portal route/session consistency', () => {
  const shell = () => read('src/components/client-portal/ClientPortalShell.tsx');

  it('every customer route renders the same canonical client portal shell', () => {
    for (const relative of CUSTOMER_ROUTES) {
      assert.ok(existsSync(path.join(root, relative)), `missing customer route ${relative}`);
      assert.match(read(relative), /ClientPortalShell/, `${relative} must render ClientPortalShell`);
    }
  });

  it('fails closed on every route when the canonical customer provider is not configured', () => {
    const src = shell();
    assert.match(src, /isCustomerProviderConfigured/);
    assert.match(src, /status: 'provider-unavailable'/);
    assert.match(src, /if \(state\.status === 'provider-unavailable'\) return <CustomerProviderUnavailable \/>;/);
  });

  it('resolves the provider state before any account or token work', () => {
    const src = shell();
    const providerGate = src.indexOf("status: 'provider-unavailable' }");
    const accountGate = src.indexOf('if (!account) {');
    const silentToken = src.indexOf('acquireTokenSilent');
    assert.ok(providerGate > -1 && accountGate > -1, 'expected provider and account gates');
    assert.ok(providerGate < accountGate, 'provider gate must precede the account gate');
    assert.ok(providerGate < silentToken, 'provider gate must precede the silent token acquisition');
  });

  it('keeps the canonical account/token resolution and never borrows the workforce surface', () => {
    const src = shell();
    assert.match(src, /pickAccountByTenant\(accounts, customerTenantId\)/);
    assert.doesNotMatch(src, /workforceMsalConfig|AuthenticatedApp/);
    assert.match(src, /setAuthToken\(token\.accessToken, 'customer'\)/);
    assert.match(src, /getAuthToken\('customer'\)/);
  });

  it('keeps the anonymous entry split: public landing on the root, in-shell login on child routes', () => {
    const src = shell();
    assert.match(src, /if \(state\.status === 'login' && view === 'home'\) return <PortalEntryLanding \/>;/);
    assert.match(src, /href="\/portal\/login"/);
  });
});

describe('customer portal secondary auth hook fails closed too', () => {
  it('useCustomerPortalAuth never starts an interaction when the provider is unconfigured', () => {
    const src = read('src/components/client-portal/useCustomerPortalAuth.ts');
    assert.match(src, /isCustomerProviderConfigured/);
    const providerGate = src.indexOf("if (!providerConfigured) { setState('error'); return; }");
    const accountGate = src.indexOf("if (!account) { setState('login'); return; }");
    const silentToken = src.indexOf('acquireTokenSilent');
    assert.ok(providerGate > -1 && accountGate > -1 && silentToken > -1);
    assert.ok(providerGate < accountGate, 'provider gate must precede the account gate');
    assert.ok(providerGate < silentToken, 'provider gate must precede the silent token acquisition');
  });
});

describe('client portal API boundary stays fail-closed', () => {  const backendRoutes = path.resolve(root, '..', 'Backend', 'src', 'routes', 'clientPortal.ts');

  it('every /api/v1/client-portal route authenticates the customer identity', () => {
    if (!existsSync(backendRoutes)) return; // backend not present in this checkout
    const src = readFileSync(backendRoutes, 'utf8');
    const blocks = src.match(/router\.(get|post|put|patch|delete)\([\s\S]*?(?=\nrouter\.|\n\/\/ ---|$)/g) || [];
    assert.ok(blocks.length >= 40, `expected the full portal surface, found ${blocks.length} handlers`);
    for (const block of blocks) {
      assert.match(
        block,
        /portalRead\(|portalIntake\(|authenticateClientPortal/,
        `unguarded client-portal handler:\n${block.slice(0, 160)}`,
      );
    }
  });
});
