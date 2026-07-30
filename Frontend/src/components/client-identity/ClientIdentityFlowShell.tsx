"use client";

import Link from 'next/link';
import { FormEvent, useCallback, useEffect, useState } from 'react';
import { useCustomerAuth } from '@/lib/customerAuth';
import { backendBaseUrl } from '@/lib/authConfig';

// Authentication (register / login / verify-email / forgot-password /
// reset-password) is handled by the browser-delegated External ID hosted flow
// via CustomerAuthLauncher — this shell no longer renders any password, e-mail
// or verification-code inputs. It covers only the post-authentication
// membership-request surfaces.
type Flow = 'onboarding' | 'pending';

type Props = { flow: Flow };

type MembershipRequest = {
  id: string;
  status: string;
  requestedOrganizationName?: string | null;
  requestedGroupName?: string | null;
  submittedAt?: string | null;
  rejectionReasonSafe?: string | null;
};

const onboardingCopy = {
  title: 'Szervezeti hozzáférés kérése',
  eyebrow: 'Tagsági kérelem',
  body: 'A szervezet vagy csoport megadása önmagában nem ad hozzáférést. Az iroda ellenőrzi és hagyja jóvá a tagságot.',
};

function apiRoot(): string {
  return backendBaseUrl.replace(/\/+$/, '').replace(/\/api\/v1$/i, '');
}

function Field({ label, name, type = 'text', required = false }: { label: string; name: string; type?: string; required?: boolean }) {
  return <label className="grid gap-2 text-sm font-medium text-stone-800"><span>{label}</span><input name={name} type={type} required={required} className="rounded-2xl border border-stone-300 px-4 py-3 text-stone-950 shadow-sm" /></label>;
}

// Client-safe copy for a real, persisted request status.
function statusCopy(status: string): { eyebrow: string; title: string; body: string } {
  switch (status) {
    case 'PENDING_REVIEW':
      return { eyebrow: 'Függőben', title: 'Kérelem ellenőrzés alatt', body: 'A szervezeti hozzáférést az iroda ellenőrzi. Ügyanyag csak külön jóváhagyott tagság és ügyhozzáférési grant után jelenik meg.' };
    case 'APPROVED':
      return { eyebrow: 'Jóváhagyva', title: 'Tagságát jóváhagyták', body: 'Ügyanyag akkor jelenik meg, amikor az iroda külön ügyhozzáférést (grant) ad egy konkrét ügyhöz.' };
    case 'REJECTED':
      return { eyebrow: 'Elutasítva', title: 'Kérelmét elutasították', body: 'Kérjük, vegye fel a kapcsolatot az irodával a további teendőkről.' };
    case 'CANCELLED':
      return { eyebrow: 'Visszavonva', title: 'Kérelmét visszavonták', body: 'Ha szükséges, új tagsági kérelmet nyújthat be.' };
    default:
      return { eyebrow: 'Állapot', title: 'Tagsági kérelem', body: 'A kérelem állapota feldolgozás alatt.' };
  }
}

export function ClientIdentityFlowShell({ flow }: Props) {
  const { acquireCustomerApiToken, interactionInProgress } = useCustomerAuth();
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Pending flow resolves the REAL persisted request from the backend so it
  // never falsely claims "under review" without a submitted request.
  const [pending, setPending] = useState<{ state: 'loading' | 'none' | 'error' | 'ready'; requests: MembershipRequest[] }>({ state: 'loading', requests: [] });

  const loadRequests = useCallback(async () => {
    setPending({ state: 'loading', requests: [] });
    try {
      const token = await acquireCustomerApiToken();
      if (!token) { setPending({ state: 'error', requests: [] }); return; }
      const res = await fetch(`${apiRoot()}/api/v1/client-identity/me/membership-requests`, { headers: { Authorization: `Bearer ${token}` } });
      if (!res.ok) { setPending({ state: 'error', requests: [] }); return; }
      const data = await res.json();
      const items: MembershipRequest[] = Array.isArray(data?.items) ? data.items : [];
      setPending(items.length ? { state: 'ready', requests: items } : { state: 'none', requests: [] });
    } catch {
      setPending({ state: 'error', requests: [] });
    }
  }, [acquireCustomerApiToken]);

  useEffect(() => {
    if (flow === 'pending') loadRequests();
  }, [flow, loadRequests]);

  async function submitOnboarding(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    setSubmitting(true);
    const form = new FormData(event.currentTarget);
    try {
      const token = await acquireCustomerApiToken();
      if (!token) {
        setError('Az azonosítás nem sikerült. Jelentkezzen be újra, majd próbálja meg ismét.');
        return;
      }
      const response = await fetch(`${apiRoot()}/api/v1/client-identity/me/membership-requests`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          requestedOrganizationName: String(form.get('requestedOrganizationName') || '').trim(),
          corporateEmail: String(form.get('corporateEmail') || '').trim(),
          requestedGroupName: String(form.get('requestedGroupName') || '').trim(),
          invitationId: String(form.get('invitationId') || '').trim(),
          roleDescriptionSafe: String(form.get('roleDescriptionSafe') || '').trim(),
        }),
      });
      if (!response.ok) throw new Error(await response.text());
      window.location.href = '/portal/onboarding/pending';
    } catch (err) {
      const detail = err instanceof Error && err.message ? ` (${err.message.slice(0, 240)})` : '';
      setError(`A tagsági kérelem beküldése nem sikerült. Ellenőrizze az adatokat, majd próbálja újra.${detail}`);
    } finally {
      setSubmitting(false);
    }
  }

  // Header copy: onboarding is static; pending derives from the real status.
  const latest = pending.requests[0];
  const head = flow === 'onboarding'
    ? onboardingCopy
    : pending.state === 'ready' && latest
      ? statusCopy(latest.status)
      : pending.state === 'loading'
        ? { eyebrow: 'Függőben', title: 'Állapot betöltése…', body: 'A tagsági kérelem állapotának lekérése folyamatban.' }
        : pending.state === 'none'
          ? { eyebrow: 'Nincs kérelem', title: 'Nincs beküldött tagsági kérelem', body: 'Jelenleg nincs elbírálásra váró kérelme. Új kérelmet a szervezeti hozzáférés oldalon nyújthat be.' }
          : { eyebrow: 'Hiba', title: 'Az állapot nem érhető el', body: 'A tagsági kérelem állapotát nem sikerült lekérni. Kérjük, próbálja újra.' };

  return (
    <main className="min-h-screen bg-[#f7f4ee] px-4 py-8 text-stone-950 sm:px-8">
      <div className="mx-auto flex max-w-5xl flex-col gap-6">
        <nav className="flex flex-wrap items-center gap-3 text-sm text-stone-600">
          <Link className="font-semibold text-[#7a5f18]" href="/portal">Ügyfélportál</Link>
          <span aria-hidden="true">/</span>
          <span>{head.title}</span>
        </nav>
        <section className="rounded-[2rem] border border-stone-200 bg-white p-6 shadow-sm sm:p-10">
          <p className="text-xs font-semibold uppercase tracking-[0.24em] text-[#9b7b25]">{head.eyebrow}</p>
          <h1 className="mt-3 text-3xl font-semibold tracking-tight sm:text-5xl">{head.title}</h1>
          <p className="mt-4 max-w-3xl text-stone-700">{head.body}</p>
        </section>

        {flow === 'onboarding' && <form onSubmit={submitOnboarding} className="grid gap-4 rounded-[2rem] border border-stone-200 bg-white p-6 shadow-sm sm:grid-cols-2"><Field label="Szervezet neve" name="requestedOrganizationName" required /><Field label="Vállalati e-mail" name="corporateEmail" type="email" /><Field label="Kért szervezeti csoport" name="requestedGroupName" /><Field label="Meghívókód (opcionális)" name="invitationId" /><label className="grid gap-2 text-sm font-medium text-stone-800 sm:col-span-2"><span>Szerepkör / kapcsolattartói leírás</span><textarea name="roleDescriptionSafe" className="min-h-28 rounded-2xl border border-stone-300 px-4 py-3" /></label>{error ? <p role="alert" data-testid="onboarding-error" className="rounded-2xl border border-red-200 bg-red-50 p-4 text-sm text-red-700 sm:col-span-2">{error}</p> : null}<button type="submit" disabled={submitting || interactionInProgress} className="inline-flex w-fit rounded-full bg-stone-950 px-5 py-3 font-semibold text-white disabled:opacity-60 sm:col-span-2">{submitting ? 'Beküldés…' : 'Tagsági kérelem beküldése'}</button></form>}

        {flow === 'pending' && (
          <section data-testid="pending-status" data-state={pending.state} className="grid gap-3 rounded-[2rem] border border-stone-200 bg-white p-6 text-stone-700 shadow-sm">
            {pending.state === 'ready' && latest ? (
              <>
                <p>Nincs látható ügyanyag, amíg a tagság és az ügyhozzáférés külön jóváhagyást nem kap.</p>
                {latest.status === 'REJECTED' && latest.rejectionReasonSafe ? <p className="text-sm text-red-700">Indok: {latest.rejectionReasonSafe}</p> : null}
                {latest.requestedOrganizationName ? <p className="text-sm text-stone-500">Kért szervezet: {latest.requestedOrganizationName}</p> : null}
              </>
            ) : null}
            {pending.state === 'none' ? (
              <Link className="w-fit font-semibold text-[#7a5f18]" href="/portal/onboarding">Szervezeti hozzáférés kérése</Link>
            ) : null}
            {pending.state === 'error' ? (
              <button type="button" onClick={loadRequests} className="w-fit rounded-full border border-stone-300 px-4 py-2 text-sm">Állapot újratöltése</button>
            ) : null}
          </section>
        )}
      </div>
    </main>
  );
}
