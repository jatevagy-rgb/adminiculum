"use client";

import Link from 'next/link';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { InteractionRequiredAuthError, InteractionStatus } from '@azure/msal-browser';
import { useMsal } from '@azure/msal-react';
import { adminiculumApiScope } from '@/lib/authConfig';
import { ApiError, setAuthToken } from '@/lib/api';
import { useCustomerAuth } from '@/lib/customerAuth';
import {
  getPortalActionRequest,
  getPortalDocument,
  getPortalHome,
  getPortalMatter,
  portalDownloadUrl,
  type PortalActionRequest,
  type PortalDocument,
  type PortalHome,
  type PortalMatter,
  type PortalSafeUpdate,
} from '@/lib/clientPortalApi';

type PortalView = 'home' | 'matter' | 'document' | 'action';

type Props = { view: PortalView; resourceId?: string };

type LoadState =
  | { status: 'loading' }
  | { status: 'login' }
  | { status: 'denied'; message: string }
  | { status: 'disabled' }
  | { status: 'ready'; home: PortalHome; matter?: PortalMatter & { documents: PortalDocument[]; actionRequests: PortalActionRequest[]; updates: PortalSafeUpdate[] }; document?: PortalDocument; action?: PortalActionRequest };

function formatDate(value?: string | null) {
  if (!value) return 'Nincs megadva';
  return new Intl.DateTimeFormat('hu-HU', { year: 'numeric', month: 'short', day: 'numeric' }).format(new Date(value));
}

function deadlineText(deadline: { label?: string; dueAt?: string }) {
  return [deadline.label, deadline.dueAt ? formatDate(deadline.dueAt) : null].filter(Boolean).join(' · ');
}


function EmptyState() {
  return <div className="rounded-3xl border border-stone-200 bg-white p-8 text-stone-600 shadow-sm">Jelenleg nincs az Ön számára közzétett aktív ügy.</div>;
}

function Card({ children, className = '' }: { children: React.ReactNode; className?: string }) {
  return <section className={`min-w-0 rounded-3xl border border-stone-200 bg-white p-5 shadow-sm ${className}`}>{children}</section>;
}

function MatterCard({ matter }: { matter: PortalMatter }) {
  return (
    <Link className="block min-w-0 rounded-3xl border border-stone-200 bg-white p-5 shadow-sm transition hover:border-[#b99b45] focus:outline-none focus:ring-4 focus:ring-[#d7c48a]/40" href={`/portal/matters/${encodeURIComponent(matter.id)}`}>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-xs font-semibold uppercase tracking-[0.22em] text-[#9b7b25]">Aktív ügy</p>
          <h3 className="mt-2 break-words text-xl font-semibold text-stone-950">{matter.title}</h3>
        </div>
        <span className="rounded-full bg-[#f3ead2] px-3 py-1 text-sm text-[#6f5514]">{matter.attentionCount ? 'Teendője van' : matter.statusLabel}</span>
      </div>
      <p className="mt-4 break-words text-stone-700">{matter.nextStepLabel || 'A következő közzétett lépés itt fog megjelenni.'}</p>
      <div className="mt-4 grid gap-2 text-sm text-stone-600 sm:grid-cols-2">
        <span>Felelős: {matter.responsibleLawyerDisplay || 'Közzététel szerint'}</span>
        <span>Dokumentumok: {matter.documentCount || 0}</span>
      </div>
    </Link>
  );
}

function ActionCard({ action }: { action: PortalActionRequest }) {
  return (
    <Link className="block rounded-2xl border border-[#eadfbf] bg-[#fffaf0] p-4 focus:outline-none focus:ring-4 focus:ring-[#d7c48a]/40" href={`/portal/action-requests/${encodeURIComponent(action.id)}`}>
      <p className="text-sm font-semibold text-[#7a5f18]">{action.typeLabel}</p>
      <h3 className="mt-1 break-words text-lg font-semibold text-stone-950">{action.title}</h3>
      <p className="mt-2 text-sm text-stone-700">Határidő: {formatDate(action.dueAt)}</p>
    </Link>
  );
}

function UpdateCard({ update }: { update: PortalSafeUpdate }) {
  return (
    <div className="rounded-2xl border border-stone-200 bg-stone-50 p-4">
      <p className="text-xs font-semibold uppercase tracking-[0.18em] text-stone-500">{update.categoryLabel} · {formatDate(update.publishedAt)}</p>
      <h3 className="mt-2 break-words text-lg font-semibold text-stone-950">{update.title}</h3>
      <p className="mt-2 break-words text-stone-700">{update.body}</p>
    </div>
  );
}

function DocumentCard({ document }: { document: PortalDocument }) {
  return (
    <Link className="block rounded-2xl border border-stone-200 bg-white p-4 focus:outline-none focus:ring-4 focus:ring-[#d7c48a]/40" href={`/portal/documents/${encodeURIComponent(document.id)}`}>
      <p className="text-sm font-semibold text-[#7a5f18]">{document.stateLabel}</p>
      <h3 className="mt-1 break-words text-lg font-semibold text-stone-950">{document.title}</h3>
      <p className="mt-2 text-sm text-stone-600">{document.versionLabel} · {formatDate(document.publishedAt)}</p>
    </Link>
  );
}

function HomeView({ home }: { home: PortalHome }) {
  return (
    <div className="space-y-6">
      <Card className="bg-gradient-to-br from-white to-[#f7f1e2]">
        <p className="text-sm font-semibold uppercase tracking-[0.24em] text-[#9b7b25]">Adminiculum ügyfélportál</p>
        <h1 className="mt-3 break-words text-3xl font-semibold text-stone-950 sm:text-4xl">Üdvözöljük</h1>
        <p className="mt-3 max-w-2xl text-stone-700">Csak az ügyvédi iroda által kifejezetten közzétett, ügyfélbiztos információk jelennek meg.</p>
      </Card>
      <Card>
        <h2 className="text-2xl font-semibold text-stone-950">Figyelmet igényel</h2>
        <div className="mt-4 grid gap-3">{home.attention.length ? home.attention.map((action) => <ActionCard key={action.id} action={action} />) : <p className="text-stone-600">Nincs aktuális közzétett teendő.</p>}</div>
      </Card>
      <section className="grid gap-4 lg:grid-cols-2">{home.matters.length ? home.matters.map((matter) => <MatterCard key={matter.id} matter={matter} />) : <EmptyState />}</section>
      <Card>
        <h2 className="text-2xl font-semibold text-stone-950">Legutóbbi frissítések</h2>
        <div className="mt-4 grid gap-3">{home.updates.length ? home.updates.map((update) => <UpdateCard key={update.id} update={update} />) : <p className="text-stone-600">Nincs közzétett frissítés.</p>}</div>
      </Card>
    </div>
  );
}

function MatterView({ matter }: { matter: PortalMatter & { documents: PortalDocument[]; actionRequests: PortalActionRequest[]; updates: PortalSafeUpdate[] } }) {
  return (
    <div className="space-y-6">
      <Card>
        <p className="text-sm font-semibold text-[#7a5f18]">Közzétett ügy</p>
        <h1 className="mt-2 break-words text-3xl font-semibold text-stone-950">{matter.title}</h1>
        <p className="mt-3 break-words text-stone-700">{matter.nextStepLabel || 'Nincs közzétett következő lépés.'}</p>
        <div className="mt-4 grid gap-2 text-sm text-stone-600 sm:grid-cols-2">
          <span>Felelős: {matter.responsibleLawyerDisplay || 'Közzététel szerint'}</span>
          <span>Közzétéve: {formatDate(matter.publishedAt)}</span>
        </div>
        {matter.publicDeadlines?.length ? <ul className="mt-4 list-disc space-y-1 pl-5 text-stone-700">{matter.publicDeadlines.map((deadline, index) => <li key={index}>{deadlineText(deadline)}</li>)}</ul> : null}
      </Card>
      <Card><h2 className="text-2xl font-semibold">Dokumentumok</h2><div className="mt-4 grid gap-3">{matter.documents.map((doc) => <DocumentCard key={doc.id} document={doc} />)}</div></Card>
      <Card><h2 className="text-2xl font-semibold">Teendők</h2><div className="mt-4 grid gap-3">{matter.actionRequests.map((action) => <ActionCard key={action.id} action={action} />)}</div></Card>
      <Card><h2 className="text-2xl font-semibold">Frissítések</h2><div className="mt-4 grid gap-3">{matter.updates.map((update) => <UpdateCard key={update.id} update={update} />)}</div></Card>
    </div>
  );
}

function DocumentView({ document }: { document: PortalDocument }) {
  const token = typeof window !== 'undefined' ? window.localStorage.getItem('auth_token') : null;
  const onDownload = useCallback(async () => {
    const response = await fetch(portalDownloadUrl(document.id), { headers: token ? { Authorization: `Bearer ${token}` } : undefined });
    if (!response.ok) throw new Error('A dokumentum jelenleg nem tölthető le.');
    const blob = await response.blob();
    const url = URL.createObjectURL(blob);
    const link = window.document.createElement('a');
    link.href = url;
    link.download = `${document.title}.txt`;
    link.click();
    URL.revokeObjectURL(url);
  }, [document.id, document.title, token]);

  return <Card><p className="text-sm font-semibold text-[#7a5f18]">{document.stateLabel}</p><h1 className="mt-2 break-words text-3xl font-semibold text-stone-950">{document.title}</h1><p className="mt-3 break-words text-stone-700">{document.explanation || 'Nincs külön ügyfélmagyarázat.'}</p><dl className="mt-5 grid gap-3 text-sm text-stone-700 sm:grid-cols-2"><div><dt className="font-semibold">Változat</dt><dd>{document.versionLabel}</dd></div><div><dt className="font-semibold">Közzétéve</dt><dd>{formatDate(document.publishedAt)}</dd></div><div><dt className="font-semibold">Ügy</dt><dd>{document.matterTitle || 'Közzétett ügy'}</dd></div></dl>{document.downloadAvailable ? <button className="mt-6 rounded-full bg-stone-950 px-5 py-3 text-white focus:outline-none focus:ring-4 focus:ring-[#d7c48a]/40" onClick={onDownload}>Dokumentum letöltése</button> : <p className="mt-6 rounded-2xl bg-stone-100 p-4 text-stone-700">A dokumentum már nem elérhető letöltésre.</p>}</Card>;
}

function ActionView({ action }: { action: PortalActionRequest }) {
  return <Card><p className="text-sm font-semibold text-[#7a5f18]">{action.typeLabel}</p><h1 className="mt-2 break-words text-3xl font-semibold text-stone-950">{action.title}</h1><p className="mt-3 break-words text-stone-700">{action.instructions || 'Nincs további közzétett instrukció.'}</p><p className="mt-4 text-stone-700">Határidő: {formatDate(action.dueAt)}</p><p className="mt-6 rounded-2xl bg-stone-100 p-4 text-stone-700">{action.readOnlyNote}</p></Card>;
}

export function ClientPortalShell({ view, resourceId }: Props) {
  const { instance, accounts, inProgress } = useMsal();
  const account = accounts[0] || null;
  const [state, setState] = useState<LoadState>({ status: 'loading' });
  // Canonical customer-auth layer: single MSAL instance, one logout config.
  const { logoutCustomer } = useCustomerAuth();

  useEffect(() => {
    let cancelled = false;
    async function load() {
      if (inProgress !== InteractionStatus.None) return;
      if (!account) {
        setState({ status: 'login' });
        return;
      }
      try {
        const token = await instance.acquireTokenSilent({ account, scopes: [adminiculumApiScope] });
        setAuthToken(token.accessToken);
        const home = await getPortalHome();
        let detail = {};
        if (view === 'matter' && resourceId) detail = { matter: await getPortalMatter(resourceId) };
        if (view === 'document' && resourceId) detail = { document: await getPortalDocument(resourceId) };
        if (view === 'action' && resourceId) detail = { action: await getPortalActionRequest(resourceId) };
        if (!cancelled) setState({ status: 'ready', home, ...detail });
      } catch (error) {
        if (error instanceof InteractionRequiredAuthError) {
          await instance.acquireTokenRedirect({ account, scopes: [adminiculumApiScope] });
          return;
        }
        if (!cancelled) {
          if (error instanceof ApiError && error.status === 503) setState({ status: 'disabled' });
          else if (error instanceof ApiError && [401, 403, 404].includes(error.status)) setState({ status: 'denied', message: 'A portálhozzáférés jelenleg nem aktív. Kérjük, vegye fel a kapcsolatot az irodával.' });
          else setState({ status: 'denied', message: 'A portál jelenleg nem érhető el. Kérjük, próbálja újra később.' });
        }
      }
    }
    load();
    return () => { cancelled = true; };
  }, [account, inProgress, instance, resourceId, view]);

  const nav = useMemo(() => [
    ['Főoldal', '/portal'],
    ['Ügyeim', '/portal#ugyeim'],
    ['Dokumentumok', '/portal#dokumentumok'],
    ['Teendők', '/portal#teendok'],
  ], []);

  return (
    <main className="min-h-screen overflow-x-hidden bg-[#faf8f3] text-stone-900" data-testid="client-portal-shell">
      <header className="sticky top-0 z-20 border-b border-stone-200 bg-white/90 backdrop-blur">
        <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-3 px-4 py-4 sm:px-6">
          <Link href="/portal" className="font-serif text-2xl font-semibold tracking-tight text-stone-950 focus:outline-none focus:ring-4 focus:ring-[#d7c48a]/40">Adminiculum</Link>
          <nav className="flex flex-wrap gap-2 text-sm" aria-label="Ügyfélportál navigáció">{nav.map(([label, href]) => <Link className="rounded-full px-3 py-2 text-stone-700 hover:bg-stone-100 focus:outline-none focus:ring-4 focus:ring-[#d7c48a]/40" key={label} href={href}>{label}</Link>)}</nav>
          {state.status === 'ready' ? <button className="rounded-full border border-stone-300 px-3 py-2 text-sm" onClick={logoutCustomer}>Kijelentkezés</button> : null}
        </div>
      </header>
      <div className="mx-auto max-w-6xl px-4 py-8 sm:px-6">
        {state.status === 'loading' ? <Card>Betöltés...</Card> : null}
        {state.status === 'login' ? <Card><h1 className="text-3xl font-semibold">Ügyfélportál belépés</h1><p className="mt-3 text-stone-700">Jelentkezzen be e-mail címmel és jelszóval a közzétett ügyfélanyagok megtekintéséhez.</p><Link href="/portal/login" className="mt-6 inline-flex rounded-full bg-stone-950 px-5 py-3 text-white">Bejelentkezés</Link></Card> : null}
        {state.status === 'disabled' ? <Card>A client portal olvasási hozzáférése ebben a környezetben még nincs bekapcsolva.</Card> : null}
        {state.status === 'denied' ? <Card>{state.message}</Card> : null}
        {state.status === 'ready' && view === 'home' ? <HomeView home={state.home} /> : null}
        {state.status === 'ready' && view === 'matter' && state.matter ? <MatterView matter={state.matter} /> : null}
        {state.status === 'ready' && view === 'document' && state.document ? <DocumentView document={state.document} /> : null}
        {state.status === 'ready' && view === 'action' && state.action ? <ActionView action={state.action} /> : null}

      </div>
    </main>
  );
}

