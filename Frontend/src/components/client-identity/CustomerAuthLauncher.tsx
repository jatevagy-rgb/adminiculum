"use client";

/**
 * Customer authentication entry surface — a branded launcher into the
 * browser-delegated External ID hosted flow. It contains NO password, e-mail
 * or verification-code inputs: sign-up, sign-in, e-mail verification and
 * password reset all happen on the provider's hosted pages. Each primary action
 * calls the canonical customer-auth layer.
 */
import Link from 'next/link';
import { useEffect, useState } from 'react';
import { useCustomerAuth } from '@/lib/customerAuth';
import { sanitizeAuthError } from '@/lib/customerAuthPolicy';

export type AuthVariant = 'login' | 'register' | 'forgot-password' | 'verify-email' | 'reset-password';

type VariantCopy = {
  eyebrow: string;
  title: string;
  body: string;
  action: string;
  /** which canonical action the primary button starts */
  intent: 'login' | 'register' | 'reset';
};

const COPY: Record<AuthVariant, VariantCopy> = {
  login: {
    eyebrow: 'Ügyfélportál',
    title: 'Lépjen be az ügyfélportálra',
    body: 'Az azonosítás biztonságos ügyfélfiókon keresztül történik.',
    action: 'Belépés',
    intent: 'login',
  },
  register: {
    eyebrow: 'Ügyfélregisztráció',
    title: 'Ügyfélfiók létrehozása',
    body: 'A következő lépésben megadhatja e-mail-címét és jelszavát, majd ellenőrizheti e-mail-címét.',
    action: 'Regisztráció',
    intent: 'register',
  },
  'forgot-password': {
    eyebrow: 'Jelszókezelés',
    title: 'Jelszó visszaállítása',
    body: 'Az e-mailben kapott ellenőrző kód után új jelszót állíthat be.',
    action: 'Jelszó visszaállítása',
    intent: 'reset',
  },
  'verify-email': {
    eyebrow: 'Biztonsági lépés',
    title: 'E-mail cím ellenőrzése',
    body: 'Az e-mail-cím ellenőrzése a biztonságos ügyfélfiókban történik. A folytatáshoz lépjen be.',
    action: 'Folytatás',
    intent: 'login',
  },
  'reset-password': {
    eyebrow: 'Jelszókezelés',
    title: 'Új jelszó beállítása',
    body: 'Az új jelszót a biztonságos ügyfélfiókban állíthatja be. A folytatáshoz lépjen be.',
    action: 'Folytatás',
    intent: 'login',
  },
};

export function CustomerAuthLauncher({ variant }: { variant: AuthVariant }) {
  const copy = COPY[variant];
  const { configured, interactionInProgress, isAuthenticated, beginCustomerLogin, beginCustomerRegistration, beginPasswordReset } =
    useCustomerAuth();
  const [error, setError] = useState<string | null>(null);
  const [switchingAccount, setSwitchingAccount] = useState(false);

  useEffect(() => {
    if (variant === 'login' && isAuthenticated && !interactionInProgress) {
      window.location.replace('/portal');
    }
  }, [interactionInProgress, isAuthenticated, variant]);

  const start = async () => {
    setError(null);
    const action =
      copy.intent === 'register'
        ? beginCustomerRegistration
        : copy.intent === 'reset'
          ? beginPasswordReset
          : beginCustomerLogin;
    try {
      await action();
    } catch (err) {
      setError(sanitizeAuthError(err));
    }
  };

  const switchAccount = async () => {
    setError(null);
    setSwitchingAccount(true);
    try {
      await beginCustomerLogin('select-account');
    } catch (err) {
      setSwitchingAccount(false);
      setError(sanitizeAuthError(err));
    }
  };

  const busy = interactionInProgress || switchingAccount;

  return (
    <main className="min-h-screen bg-[#f7f4ee] px-4 py-8 text-stone-950 sm:px-8">
      <div className="mx-auto flex max-w-3xl flex-col gap-6">
        <nav className="flex flex-wrap items-center gap-3 text-sm text-stone-600">
          <Link className="font-semibold text-[#7a5f18]" href="/portal">Ügyfélportál</Link>
          <span aria-hidden="true">/</span>
          <span>{copy.title}</span>
        </nav>

        <section className="rounded-[2rem] border border-stone-200 bg-white p-6 shadow-sm sm:p-10">
          <p className="text-xs font-semibold uppercase tracking-[0.24em] text-[#9b7b25]">{copy.eyebrow}</p>
          <h1 className="mt-3 text-3xl font-semibold tracking-tight sm:text-5xl">{copy.title}</h1>
          <p className="mt-4 text-stone-700">{copy.body}</p>
          <p className="mt-2 text-sm text-stone-500">Az azonosítást biztonságos külső szolgáltató végzi. Az Adminiculum nem tárol jelszót vagy ellenőrző kódot.</p>

          {!configured && (
            <p
              data-testid="customer-auth-unavailable"
              role="status"
              className="mt-6 rounded-2xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900"
            >
              Az ügyfélbelépés jelenleg nem érhető el. Kérjük, próbálja meg később, vagy vegye fel a kapcsolatot az irodával.
            </p>
          )}

          {configured && (
            <div className="mt-6 flex flex-col gap-4">
              <button
                type="button"
                data-testid="customer-auth-primary"
                onClick={start}
                disabled={busy}
                aria-busy={busy}
                className="inline-flex w-fit items-center gap-2 rounded-full bg-[#2f2a1f] px-6 py-3 font-semibold text-white shadow-sm transition disabled:cursor-not-allowed disabled:opacity-60"
              >
                {busy ? 'Átirányítás…' : copy.action}
              </button>

              {variant === 'login' && (
                <button
                  type="button"
                  onClick={switchAccount}
                  disabled={busy}
                  className="inline-flex w-fit items-center rounded-full border border-stone-300 px-6 py-3 font-semibold text-stone-800 transition disabled:cursor-not-allowed disabled:opacity-60"
                >
                  Másik fiókkal jelentkezem be
                </button>
              )}

              {error && (
                <p role="alert" data-testid="customer-auth-error" className="text-sm text-red-700">
                  {error}
                </p>
              )}

              <div className="flex flex-wrap gap-4 text-sm text-stone-600">
                {variant !== 'login' && (
                  <Link className="font-semibold text-[#7a5f18]" href="/portal/login">Vissza a belépéshez</Link>
                )}
                {variant === 'login' && (
                  <>
                    <Link className="font-semibold text-[#7a5f18]" href="/portal/register">Ügyfélfiók létrehozása</Link>
                    <Link className="font-semibold text-[#7a5f18]" href="/portal/forgot-password">Elfelejtette a jelszavát?</Link>
                  </>
                )}
              </div>
            </div>
          )}
        </section>

        <footer className="flex flex-wrap gap-4 px-2 text-xs text-stone-500">
          <Link className="hover:text-stone-800" href="/portal">Ügyfélportál kezdőlap</Link>
        </footer>
      </div>
    </main>
  );
}
