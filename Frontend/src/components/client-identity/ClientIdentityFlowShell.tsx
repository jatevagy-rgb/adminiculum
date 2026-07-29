"use client";

import Link from 'next/link';
import { FormEvent, useState } from 'react';
import { useCustomerAuth } from '@/lib/customerAuth';
import { backendBaseUrl } from '@/lib/authConfig';

// Authentication (register / login / verify-email / forgot-password /
// reset-password) is handled by the browser-delegated External ID hosted flow
// via CustomerAuthLauncher — this shell no longer renders any password, e-mail
// or verification-code inputs. It covers only the post-authentication
// membership-request surfaces.
type Flow = 'onboarding' | 'pending';

type Props = { flow: Flow };

const flowCopy: Record<Flow, { title: string; eyebrow: string; body: string }> = {
  onboarding: { title: 'Szervezeti hozzáférés kérése', eyebrow: 'Tagsági kérelem', body: 'A szervezet vagy csoport megadása önmagában nem ad hozzáférést. Az iroda ellenőrzi és hagyja jóvá a tagságot.' },
  pending: { title: 'Kérelem ellenőrzés alatt', eyebrow: 'Függőben', body: 'Regisztrációját megkaptuk. A szervezeti hozzáférést az iroda ellenőrzi. Ügyanyag csak külön jóváhagyott tagság és ügyhozzáférési grant után jelenik meg.' },
};

function Field({ label, name, type = 'text', required = false }: { label: string; name: string; type?: string; required?: boolean }) {
  return <label className="grid gap-2 text-sm font-medium text-stone-800"><span>{label}</span><input name={name} type={type} required={required} className="rounded-2xl border border-stone-300 px-4 py-3 text-stone-950 shadow-sm" /></label>;
}

export function ClientIdentityFlowShell({ flow }: Props) {
  const copy = flowCopy[flow];
  const { acquireCustomerApiToken, interactionInProgress } = useCustomerAuth();
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submitOnboarding(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    setSubmitting(true);
    const form = new FormData(event.currentTarget);
    try {
      const token = await acquireCustomerApiToken();
      if (!token) return;
      const root = backendBaseUrl.replace(/\/+$/, '').replace(/\/api\/v1$/i, '');
      const response = await fetch(`${root}/api/v1/client-identity/me/membership-requests`, {
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
    } catch (error) {
      const detail = error instanceof Error && error.message ? ` (${error.message.slice(0, 240)})` : '';
      setError(`A tagsági kérelem beküldése nem sikerült. Ellenőrizze az adatokat, majd próbálja újra.${detail}`);
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <main className="min-h-screen bg-[#f7f4ee] px-4 py-8 text-stone-950 sm:px-8">
      <div className="mx-auto flex max-w-5xl flex-col gap-6">
        <nav className="flex flex-wrap items-center gap-3 text-sm text-stone-600">
          <Link className="font-semibold text-[#7a5f18]" href="/portal">Ügyfélportál</Link>
          <span aria-hidden="true">/</span>
          <span>{copy.title}</span>
        </nav>
        <section className="rounded-[2rem] border border-stone-200 bg-white p-6 shadow-sm sm:p-10">
          <p className="text-xs font-semibold uppercase tracking-[0.24em] text-[#9b7b25]">{copy.eyebrow}</p>
          <h1 className="mt-3 text-3xl font-semibold tracking-tight sm:text-5xl">{copy.title}</h1>
          <p className="mt-4 max-w-3xl text-stone-700">{copy.body}</p>
        </section>

        {flow === 'onboarding' && <form onSubmit={submitOnboarding} className="grid gap-4 rounded-[2rem] border border-stone-200 bg-white p-6 shadow-sm sm:grid-cols-2"><Field label="Szervezet neve" name="requestedOrganizationName" required /><Field label="Vállalati e-mail" name="corporateEmail" type="email" /><Field label="Kért szervezeti csoport" name="requestedGroupName" /><Field label="Meghívókód (opcionális)" name="invitationId" /><label className="grid gap-2 text-sm font-medium text-stone-800 sm:col-span-2"><span>Szerepkör / kapcsolattartói leírás</span><textarea name="roleDescriptionSafe" className="min-h-28 rounded-2xl border border-stone-300 px-4 py-3" /></label>{error ? <p role="alert" className="rounded-2xl border border-red-200 bg-red-50 p-4 text-sm text-red-700 sm:col-span-2">{error}</p> : null}<button type="submit" disabled={submitting || interactionInProgress} className="inline-flex w-fit rounded-full bg-stone-950 px-5 py-3 font-semibold text-white disabled:opacity-60 sm:col-span-2">{submitting ? 'Beküldés…' : 'Tagsági kérelem beküldése'}</button></form>}
        {flow === 'pending' && <section className="rounded-[2rem] border border-stone-200 bg-white p-6 text-stone-700 shadow-sm">Nincs látható ügyanyag, amíg a tagság és az ügyhozzáférés külön jóváhagyást nem kap.</section>}
      </div>
    </main>
  );
}
