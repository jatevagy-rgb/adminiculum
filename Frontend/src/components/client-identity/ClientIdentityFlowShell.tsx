"use client";

import Link from 'next/link';

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

function Field({ label, type = 'text' }: { label: string; type?: string }) {
  return <label className="grid gap-2 text-sm font-medium text-stone-800"><span>{label}</span><input type={type} className="rounded-2xl border border-stone-300 px-4 py-3 text-stone-950 shadow-sm" /></label>;
}

export function ClientIdentityFlowShell({ flow }: Props) {
  const copy = flowCopy[flow];

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

        {flow === 'onboarding' && <section className="grid gap-4 rounded-[2rem] border border-stone-200 bg-white p-6 shadow-sm sm:grid-cols-2"><Field label="Szervezet neve" /><Field label="Vállalati e-mail" type="email" /><Field label="Kért szervezeti csoport" /><Field label="Meghívókód (opcionális)" /><label className="grid gap-2 text-sm font-medium text-stone-800 sm:col-span-2"><span>Szerepkör / kapcsolattartói leírás</span><textarea className="min-h-28 rounded-2xl border border-stone-300 px-4 py-3" /></label></section>}
        {flow === 'pending' && <section className="rounded-[2rem] border border-stone-200 bg-white p-6 text-stone-700 shadow-sm">Nincs látható ügyanyag, amíg a tagság és az ügyhozzáférés külön jóváhagyást nem kap.</section>}
      </div>
    </main>
  );
}
