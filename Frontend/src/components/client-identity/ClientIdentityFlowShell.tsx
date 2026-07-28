"use client";

import Link from 'next/link';
import { useMemo, useState } from 'react';

type Flow = 'register' | 'verify-email' | 'login' | 'forgot-password' | 'reset-password' | 'onboarding' | 'pending';

type Props = { flow: Flow };

const flowCopy: Record<Flow, { title: string; eyebrow: string; body: string }> = {
  register: { title: 'Ügyfélfiók létrehozása', eyebrow: 'Adminiculum ügyfélregisztráció', body: 'A jelszót és az e-mail ellenőrzést a külső ügyfél-azonosító szolgáltató kezeli. Az Adminiculum nem tárol jelszót vagy ellenőrző kódot.' },
  'verify-email': { title: 'E-mail cím ellenőrzése', eyebrow: 'Biztonsági lépés', body: 'Adja meg az e-mailben kapott egyszer használatos kódot a szolgáltató felületén. A kódot nem tároljuk az Adminiculumban.' },
  login: { title: 'Ügyfél belépés', eyebrow: 'E-mail cím és jelszó', body: 'Belépés az Adminiculum ügyfélfiókba. A hitelesítést az ügyfél-azonosító szolgáltató végzi.' },
  'forgot-password': { title: 'Elfelejtett jelszó', eyebrow: 'Nem kiadó válasz', body: 'Ha a fiók létezik, az azonosító szolgáltató egyszer használatos kódot küld a hitelesített e-mail címre.' },
  'reset-password': { title: 'Új jelszó beállítása', eyebrow: 'Kód ellenőrzése után', body: 'Az új jelszót közvetlenül az azonosító szolgáltató kezeli. Nem kerül az Adminiculum adatbázisába.' },
  onboarding: { title: 'Szervezeti hozzáférés kérése', eyebrow: 'Tagsági kérelem', body: 'A szervezet vagy csoport megadása önmagában nem ad hozzáférést. Az iroda ellenőrzi és hagyja jóvá a tagságot.' },
  pending: { title: 'Kérelem ellenőrzés alatt', eyebrow: 'Függőben', body: 'Regisztrációját megkaptuk. A szervezeti hozzáférést az iroda ellenőrzi. Ügyanyag csak külön jóváhagyott tagság és ügyhozzáférési grant után jelenik meg.' },
};

function Field({ label, type = 'text', disabled = false }: { label: string; type?: string; disabled?: boolean }) {
  return <label className="grid gap-2 text-sm font-medium text-stone-800"><span>{label}</span><input disabled={disabled} type={type} className="rounded-2xl border border-stone-300 px-4 py-3 text-stone-950 shadow-sm disabled:bg-stone-100" /></label>;
}

export function ClientIdentityFlowShell({ flow }: Props) {
  const copy = flowCopy[flow];
  const [accountType, setAccountType] = useState<'INDIVIDUAL' | 'ORGANIZATION_MEMBER'>('INDIVIDUAL');
  const actionLabel = useMemo(() => flow === 'login' ? 'Belépés' : flow === 'forgot-password' ? 'Kód kérése' : flow === 'reset-password' ? 'Új jelszó mentése' : flow === 'onboarding' ? 'Kérelem beküldése' : 'Folytatás', [flow]);
  const disabledProviderNote = 'Szolgáltatói konfiguráció szükséges: Entra External ID vagy jóváhagyott ügyfél OIDC szolgáltató.';

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
          <p className="mt-3 rounded-2xl border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900">{disabledProviderNote}</p>
        </section>

        {flow === 'register' && <section className="grid gap-4 rounded-[2rem] border border-stone-200 bg-white p-6 shadow-sm sm:grid-cols-2">
          <Field label="Teljes név" />
          <Field label="E-mail cím" type="email" />
          <Field label="Jelszó" type="password" />
          <Field label="Jelszó megerősítése" type="password" />
          <label className="grid gap-2 text-sm font-medium text-stone-800 sm:col-span-2"><span>Fiók típusa</span><select value={accountType} onChange={(event) => setAccountType(event.target.value as typeof accountType)} className="rounded-2xl border border-stone-300 px-4 py-3"><option value="INDIVIDUAL">Magánszemély</option><option value="ORGANIZATION_MEMBER">Szervezeti/céges kapcsolattartó</option></select></label>
          <label className="flex gap-3 text-sm text-stone-700 sm:col-span-2"><input type="checkbox" /> <span>Elfogadom a szükséges adatkezelési és használati tájékoztatót.</span></label>
        </section>}

        {flow === 'login' && <section className="grid gap-4 rounded-[2rem] border border-stone-200 bg-white p-6 shadow-sm"><Field label="E-mail cím" type="email" /><Field label="Jelszó" type="password" /><Link className="text-sm font-semibold text-[#7a5f18]" href="/portal/forgot-password">Elfelejtett jelszó</Link></section>}
        {flow === 'verify-email' && <section className="grid gap-4 rounded-[2rem] border border-stone-200 bg-white p-6 shadow-sm"><Field label="Ellenőrző kód" /><button className="w-fit rounded-full border border-stone-300 px-4 py-2 text-sm">Kód újraküldése</button></section>}
        {flow === 'forgot-password' && <section className="grid gap-4 rounded-[2rem] border border-stone-200 bg-white p-6 shadow-sm"><Field label="E-mail cím" type="email" /></section>}
        {flow === 'reset-password' && <section className="grid gap-4 rounded-[2rem] border border-stone-200 bg-white p-6 shadow-sm"><Field label="Ellenőrző kód" /><Field label="Új jelszó" type="password" /><Field label="Új jelszó megerősítése" type="password" /></section>}
        {flow === 'onboarding' && <section className="grid gap-4 rounded-[2rem] border border-stone-200 bg-white p-6 shadow-sm sm:grid-cols-2"><Field label="Szervezet neve" /><Field label="Vállalati e-mail" type="email" /><Field label="Kért szervezeti csoport" /><Field label="Meghívókód (opcionális)" /><label className="grid gap-2 text-sm font-medium text-stone-800 sm:col-span-2"><span>Szerepkör / kapcsolattartói leírás</span><textarea className="min-h-28 rounded-2xl border border-stone-300 px-4 py-3" /></label></section>}
        {flow === 'pending' && <section className="rounded-[2rem] border border-stone-200 bg-white p-6 text-stone-700 shadow-sm">Nincs látható ügyanyag, amíg a tagság és az ügyhozzáférés külön jóváhagyást nem kap.</section>}

        {flow !== 'pending' && <button className="w-fit rounded-full bg-[#2f2a1f] px-6 py-3 font-semibold text-white shadow-sm" type="button">{actionLabel}</button>}
      </div>
    </main>
  );
}
