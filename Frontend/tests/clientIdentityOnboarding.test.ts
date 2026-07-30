import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import path from 'node:path';

const root = process.cwd();
const shell = readFileSync(path.join(root, 'src/components/client-identity/ClientIdentityFlowShell.tsx'), 'utf8');
const launcher = readFileSync(path.join(root, 'src/components/client-identity/CustomerAuthLauncher.tsx'), 'utf8');
const portalShell = readFileSync(path.join(root, 'src/components/client-portal/ClientPortalShell.tsx'), 'utf8');

describe('client identity registration and onboarding frontend', () => {
  it('defines the required customer identity routes', () => {
    for (const route of ['register', 'verify-email', 'login', 'forgot-password', 'reset-password', 'onboarding', 'onboarding/pending']) {
      assert.equal(existsSync(path.join(root, `src/app/portal/${route}/page.tsx`)), true, route);
    }
  });

  it('renders registration, verification and password-reset copy in the hosted-flow launcher, without workforce terminology', () => {
    for (const phrase of ['Ügyfélfiók létrehozása', 'E-mail cím ellenőrzése', 'Jelszó visszaállítása', 'Új jelszó beállítása', 'Lépjen be az ügyfélportálra']) {
      assert.match(launcher, new RegExp(phrase));
    }
    assert.doesNotMatch(launcher, /Microsoft|Entra|B2B guest/i);
  });

  it('renders membership onboarding copy and truthful pending status in the identity shell', () => {
    for (const phrase of ['Szervezeti hozzáférés kérése', 'Kérelem ellenőrzés alatt']) {
      assert.match(shell, new RegExp(phrase));
    }
    // Pending status is resolved from the backend, not shown unconditionally.
    assert.match(shell, /me\/membership-requests/);
    assert.match(shell, /Nincs beküldött tagsági kérelem/);
    assert.doesNotMatch(shell, /Microsoft|Entra workforce|B2B guest/i);
  });

  it('keeps legal document/contract approval controls out of the customer UI', () => {
    // Note: "APPROVED" here would be the membership status enum, not a legal
    // approval control — match only legal-document approval wording.
    assert.doesNotMatch(shell, /dokumentum jóváhagyása|szerződés jóváhagyása|approve document|approve contract/i);
    assert.doesNotMatch(portalShell, /Jóváhagyási kérés|Megerősítés kérése/);
    assert.doesNotMatch(portalShell, /completeAction|uploadDocument|approveDocument/);
  });

  it('points portal login to the dedicated customer login route', () => {
    assert.match(portalShell, /href="\/portal\/login"/);
    assert.match(portalShell, /e-mail címmel és jelszóval/);
  });
});
