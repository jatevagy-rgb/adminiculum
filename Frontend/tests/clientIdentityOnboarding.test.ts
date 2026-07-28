import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import path from 'node:path';

const root = process.cwd();
const shell = readFileSync(path.join(root, 'src/components/client-identity/ClientIdentityFlowShell.tsx'), 'utf8');
const portalShell = readFileSync(path.join(root, 'src/components/client-portal/ClientPortalShell.tsx'), 'utf8');

describe('client identity registration and onboarding frontend', () => {
  it('defines the required customer identity routes', () => {
    for (const route of ['register', 'verify-email', 'login', 'forgot-password', 'reset-password', 'onboarding', 'onboarding/pending']) {
      assert.equal(existsSync(path.join(root, `src/app/portal/${route}/page.tsx`)), true, route);
    }
  });

  it('renders registration, verification, password reset and onboarding copy without workforce terminology', () => {
    for (const phrase of ['Ügyfélfiók létrehozása', 'E-mail cím ellenőrzése', 'Elfelejtett jelszó', 'Új jelszó beállítása', 'Szervezeti hozzáférés kérése', 'Regisztrációját megkaptuk']) {
      assert.match(shell, new RegExp(phrase));
    }
    assert.doesNotMatch(shell, /Microsoft|Entra workforce|B2B guest/i);
    assert.match(shell, /Az Adminiculum nem tárol jelszót vagy ellenőrző kódot/);
  });

  it('keeps legal approval and portal action execution out of the customer UI', () => {
    assert.doesNotMatch(shell, /dokumentum jóváhagyása|szerződés jóváhagyása|approve/i);
    assert.doesNotMatch(portalShell, /Jóváhagyási kérés|Megerősítés kérése/);
    assert.doesNotMatch(portalShell, /completeAction|uploadDocument|approveDocument/);
  });

  it('points portal login to the dedicated customer login route', () => {
    assert.match(portalShell, /href="\/portal\/login"/);
    assert.match(portalShell, /e-mail címmel és jelszóval/);
  });
});
