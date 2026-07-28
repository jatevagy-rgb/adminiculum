import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'fs';
import path from 'path';

const root = path.resolve(__dirname, '..');
const read = (relative: string) => readFileSync(path.join(root, relative), 'utf8');

const AUTH_ROUTES = ['login', 'register', 'verify-email', 'forgot-password', 'reset-password'] as const;

const launcher = () => read('src/components/client-identity/CustomerAuthLauncher.tsx');
const hook = () => read('src/lib/customerAuth.ts');
const identityShell = () => read('src/components/client-identity/ClientIdentityFlowShell.tsx');

describe('customer auth entry surfaces are truthful hosted-flow launchers', () => {
  it('every auth route renders the CustomerAuthLauncher, not the dead identity shell', () => {
    for (const route of AUTH_ROUTES) {
      const page = read(`src/app/portal/${route}/page.tsx`);
      assert.match(page, /CustomerAuthLauncher/, `${route} should use the launcher`);
      assert.doesNotMatch(page, /ClientIdentityFlowShell/, `${route} must not use the dead identity shell`);
    }
  });

  it('the launcher contains NO password, e-mail or verification-code inputs', () => {
    const src = launcher();
    assert.doesNotMatch(src, /type=["']password["']/, 'no password field');
    assert.doesNotMatch(src, /type=["']email["']/, 'no e-mail field');
    assert.doesNotMatch(src, /<input\b/, 'no raw input at all');
    assert.doesNotMatch(src, /<textarea\b|<select\b/, 'no form controls at all');
  });

  it('the trimmed identity shell no longer renders any password or verification-code field', () => {
    const src = identityShell();
    assert.doesNotMatch(src, /type=["']password["']/);
    assert.doesNotMatch(src, /Ellenőrző kód|Új jelszó/);
  });

  it('the primary action wires to the canonical customer-auth actions', () => {
    const src = launcher();
    assert.match(src, /useCustomerAuth/);
    assert.match(src, /beginCustomerLogin/);
    assert.match(src, /beginCustomerRegistration/);
    assert.match(src, /beginPasswordReset/);
    // The button is not a dead type="button" with no handler.
    assert.match(src, /onClick=\{start\}/);
  });

  it('duplicate clicks cannot start duplicate redirects (guarded by interaction state)', () => {
    const h = hook();
    assert.match(h, /interactionInProgress/);
    // begin* actions bail out while an interaction is in progress
    assert.match(h, /if \(!configured \|\| interactionInProgress\) return;/);
    // and the button is disabled while busy
    assert.match(launcher(), /disabled=\{busy\}/);
    assert.match(launcher(), /aria-busy=\{busy\}/);
  });

  it('renders a controlled provider-not-configured state', () => {
    assert.match(launcher(), /customer-auth-unavailable/);
    assert.match(launcher(), /!configured/);
  });

  it('sanitizes redirect errors instead of surfacing raw provider errors', () => {
    assert.match(launcher(), /sanitizeAuthError/);
    assert.match(launcher(), /customer-auth-error/);
  });

  it('logout uses the canonical customer post-logout URI', () => {
    const h = hook();
    assert.match(h, /logoutRedirect/);
    assert.match(h, /customerPostLogoutRedirectUri/);
  });

  it('shows customer-facing Hungarian language, not provider jargon', () => {
    const src = launcher();
    assert.match(src, /Belépés|Regisztráció|Jelszó visszaállítása/);
    for (const jargon of ['tenant', 'Entra', 'CIAM', 'issuer', 'audience', 'JWKS', 'PKCE', 'application registration', 'user flow']) {
      assert.ok(!src.includes(jargon), `launcher must not display provider jargon: ${jargon}`);
    }
  });

  it('keeps the entry surface responsive with no horizontal overflow trap', () => {
    const src = launcher();
    assert.match(src, /min-h-screen/);
    assert.match(src, /px-4/);
    // uses responsive max width container
    assert.match(src, /max-w-3xl/);
  });
});

describe('canonical layer does not process customer secrets locally', () => {
  it('the hook collects no credential locally — delegated redirect + token only', () => {
    const h = hook();
    // No credential inputs or reads in the auth layer.
    assert.doesNotMatch(h, /<input\b/);
    assert.doesNotMatch(h, /type=["']password["']/);
    assert.doesNotMatch(h, /\.value\b/);
    // It only starts redirects and acquires the API token.
    assert.match(h, /loginRedirect/);
    assert.match(h, /acquireTokenSilent/);
  });

  it('registration uses the create prompt, reset re-enters the hosted flow', () => {
    const h = hook();
    assert.match(h, /registrationRequest/);
    assert.match(h, /passwordResetRequest/);
    assert.match(h, /REGISTRATION_PROMPT/);
  });
});
