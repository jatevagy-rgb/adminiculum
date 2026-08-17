"use client";

import Link from 'next/link';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { InteractionRequiredAuthError, InteractionStatus } from '@azure/msal-browser';
import { useMsal } from '@azure/msal-react';
import { customerApiScopes, customerTenantId, pickAccountByTenant } from '@/lib/authConfig';
import { ApiError, getAuthToken, setAuthToken } from '@/lib/api';
import { useCustomerAuth } from '@/lib/customerAuth';
import { PortalEntryLanding } from './PortalEntryLanding';
import { PortalOnboarding } from './PortalOnboarding';
import { PortalWorkspaceSelector } from './PortalWorkspaceSelector';
import { OrganizationPortalViews, type OrganizationPortalView } from './OrganizationPortalViews';
import { CustomerInteractionCard } from './CustomerInteractionCard';
import { ActionCard, Card, formatDate, MatterView, UpdateCard } from './MatterWorkspace';
import {
  getPortalActionRequest,
  getPortalDocument,
  getPortalHome,
  getPortalMatter,
  getPortalWorkspace,
  getPortalIdentityContext,
  getStoredPortalWorkspace,
  setSelectedPortalWorkspace,
  portalDownloadUrl,
  type PortalActionRequest,
  type PortalDocument,
  type PortalHome,
  type PortalMatter,
  type PortalSafeUpdate,
  type PortalWorkspace,
  type PortalWorkspaceAction,
  type PortalWorkspaceDocument,
  type PortalWorkspaceMessage,
  type PortalIdentityContext,
} from '@/lib/clientPortalApi';

type PortalView = 'home' | 'matters' | 'tasks' | 'documents' | 'messages' | 'matter' | 'document' | 'action' | 'intakes' | 'new-intake' | 'leadership';

type Props = { view: PortalView; resourceId?: string };

type LoadState =
  | { status: 'loading' }
  | { status: 'login' }
  | { status: 'select'; context: PortalIdentityContext }
  | { status: 'onboarding'; context: PortalIdentityContext }
  | { status: 'no-workspace' | 'pending' | 'suspended'; context: PortalIdentityContext }
  | { status: 'workspace-empty'; context: PortalIdentityContext }
  | { status: 'denied'; message: string }
  | { status: 'service-error' }
  | { status: 'ready'; context: PortalIdentityContext; home: PortalHome; workspace: PortalWorkspace; matter?: PortalMatter & { documents: PortalDocument[]; actionRequests: PortalActionRequest[]; updates: PortalSafeUpdate[] }; document?: PortalDocument; action?: PortalActionRequest };

function EmptyState() {
  return <div className="rounded-2xl border border-dashed border-stone-300 bg-stone-50 p-6 text-stone-600">Jelenleg nincs közzétett aktív ügye.</div>;
}

function MatterCard({ matter }: { matter: PortalMatter }) {
  return (
    <Link className="group block min-w-0 overflow-hidden rounded-2xl border border-stone-200 bg-white p-5 shadow-sm transition hover:-translate-y-0.5 hover:border-[#b99b45] focus:outline-none focus:ring-4 focus:ring-[#d7c48a]/40" href={`/portal/matters/${encodeURIComponent(matter.id)}`}>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-[#9b7b25]">Aktív ügy</p>
          <h3 className="mt-2 break-words text-xl font-semibold text-stone-950 group-hover:text-[#7a5f18]">{matter.title}</h3>
        </div>
        <span className="shrink-0 rounded-full bg-[#f3ead2] px-3 py-1 text-sm font-semibold text-[#6f5514]">{matter.attentionCount ? 'Teendője van' : matter.statusLabel}</span>
      </div>
      <div className="mt-5 grid gap-4 sm:grid-cols-2">
        <div className="min-w-0"><p className="text-xs font-semibold uppercase tracking-[0.14em] text-stone-500">Most itt tartunk</p><p className="mt-1 break-words text-sm leading-6 text-stone-700">{matter.currentSummary || matter.statusLabel}</p></div>
        <div className="min-w-0"><p className="text-xs font-semibold uppercase tracking-[0.14em] text-stone-500">Következő lépés</p><p className="mt-1 break-words text-sm leading-6 text-stone-700">{matter.nextStepLabel || 'A következő közzétett lépés itt fog megjelenni.'}</p></div>
      </div>
      <div className="mt-5 flex flex-wrap gap-x-5 gap-y-2 border-t border-stone-100 pt-4 text-sm text-stone-600">
        <span>Felelős: {matter.responsibleLawyerDisplay || 'Közzététel szerint'}</span><span>Dokumentumok: {matter.documentCount || 0}</span><span className="font-semibold text-[#7a5f18]">Ügy megnyitása →</span>
      </div>
    </Link>
  );
}

function WorkspaceActionCard({ action }: { action: PortalWorkspaceAction }) {
  return <Link className="block rounded-2xl border border-[#eadfbf] bg-[#fffaf0] p-4 focus:outline-none focus:ring-4 focus:ring-[#d7c48a]/40" href={action.actionUrl}><p className="text-xs font-semibold uppercase tracking-[0.16em] text-[#7a5f18]">{action.matterTitle}</p><h3 className="mt-1 break-words text-lg font-semibold text-stone-950">{action.title}</h3><p className="mt-2 text-sm text-stone-700">{action.status}{action.dueAt ? ` · Határidő: ${formatDate(action.dueAt)}` : ''}</p></Link>;
}

function WorkspaceDocumentCard({ document }: { document: PortalWorkspaceDocument }) {
  const kind = document.kind === 'SHARED_DOCUMENT' ? 'Megosztott dokumentum' : document.kind.includes('CORRECTION') ? 'Javítás' : document.kind === 'SUBMISSION' ? 'Beküldés' : 'Dokumentumkérés';
  return <Link className="block rounded-2xl border border-stone-200 bg-white p-4 focus:outline-none focus:ring-4 focus:ring-[#d7c48a]/40" href={document.actionUrl}><p className="text-xs font-semibold uppercase tracking-[0.16em] text-stone-500">{kind} · {document.matterTitle || 'Közzétett ügy'}</p><h3 className="mt-1 break-words text-lg font-semibold text-stone-950">{document.title}</h3><p className="mt-2 text-sm text-stone-700">{document.status || 'Elérhető'}{document.publishedAt ? ` · ${formatDate(document.publishedAt)}` : ''}</p></Link>;
}

function WorkspaceMessageCard({ message }: { message: PortalWorkspaceMessage }) {
  return <Link className="block rounded-2xl border border-stone-200 bg-stone-50 p-4 focus:outline-none focus:ring-4 focus:ring-[#d7c48a]/40" href={message.actionUrl}><p className="text-xs font-semibold uppercase tracking-[0.16em] text-stone-500">{message.matterTitle}</p><h3 className="mt-1 break-words text-lg font-semibold text-stone-950">{message.subject}</h3><p className="mt-2 text-sm text-stone-700">{message.status}{message.updatedAt ? ` · ${formatDate(message.updatedAt)}` : ''}</p></Link>;
}

function HomeView({ home, workspace }: { home: PortalHome; workspace: PortalWorkspace }) {
  const modeMessage = home.relationshipMode === 'EMAIL_CENTRIC'
    ? 'Az e-mail továbbra is az elsődleges kapcsolattartási csatorna. Itt az ügy állapota, a megosztott dokumentumok és a strukturált kérések érhetők el.'
    : home.relationshipMode === 'CONNECTED_SYSTEM'
      ? 'Az ügyfélportál a közzétett ügyállapotot, dokumentumokat és kéréseket mutatja. Külső rendszerrel nem indít automatikus szinkronizációt.'
      : 'Az ügyfélportál az elsődleges közös munkatér az iroda által kifejezetten közzétett ügyinformációkhoz és teendőkhöz.';
  return (
    <div className="space-y-8">
      <section className="rounded-2xl border border-stone-200 bg-[#f7f1e2] p-6 sm:p-8">
        <p className="text-sm font-semibold uppercase tracking-[0.24em] text-[#9b7b25]">Adminiculum ügyfélportál</p>
        <h1 className="mt-3 break-words text-3xl font-semibold text-stone-950 sm:text-4xl">Üdvözöljük</h1>
        <p className="mt-3 max-w-2xl break-words leading-7 text-stone-700">{modeMessage}</p>
      </section>
      <section aria-labelledby="current-matter-heading">
        <div className="flex flex-wrap items-end justify-between gap-3"><div><p className="text-xs font-semibold uppercase tracking-[0.18em] text-[#b95e4b]">Áttekintés</p><h2 id="current-matter-heading" className="mt-1 text-2xl font-semibold text-stone-950">Aktív ügyei</h2></div><Link className="text-sm font-semibold text-[#7a5f18] hover:underline" href="/portal/ugyeim">Minden ügy megtekintése →</Link></div>
        <div className="mt-4 grid gap-4">{home.matters.length ? home.matters.slice(0, 1).map((matter) => <MatterCard key={matter.id} matter={matter} />) : <EmptyState />}</div>
      </section>
      <section aria-labelledby="tasks-heading">
        <div className="flex flex-wrap items-end justify-between gap-3"><div><p className="text-xs font-semibold uppercase tracking-[0.18em] text-[#b95e4b]">Következő lépések</p><h2 id="tasks-heading" className="mt-1 text-2xl font-semibold text-stone-950">Teendőim</h2></div><Link className="text-sm font-semibold text-[#7a5f18] hover:underline" href="/portal/teendoim">Teendőim megnyitása →</Link></div>
        <div className="mt-4 grid gap-3">{home.attention.length ? home.attention.slice(0, 3).map((action) => <ActionCard key={action.id} action={action} />) : <p className="rounded-2xl border border-dashed border-stone-300 bg-stone-50 p-5 text-stone-600">Jelenleg nincs teendője.</p>}</div>
      </section>
      <section aria-labelledby="updates-heading" className="grid gap-4 lg:grid-cols-[1.35fr_.65fr]">
        <div className="min-w-0"><div className="flex flex-wrap items-end justify-between gap-3"><h2 id="updates-heading" className="text-2xl font-semibold text-stone-950">Legutóbbi frissítések</h2><span className="text-xs text-stone-500">Ügyfélnek szóló hírek</span></div><div className="mt-4 grid gap-3">{home.updates.length ? home.updates.slice(0, 3).map((update) => <UpdateCard key={update.id} update={update} />) : <p className="rounded-2xl border border-dashed border-stone-300 bg-stone-50 p-5 text-stone-600">Nincs új frissítés.</p>}</div></div>
        <div className="min-w-0 rounded-2xl border border-stone-200 bg-white p-5"><h2 className="text-xl font-semibold text-stone-950">Dokumentumok</h2><p className="mt-2 text-sm leading-6 text-stone-600">Az iroda által Önnel megosztott anyagok egy helyen.</p><p className="mt-5 text-sm text-stone-700">{workspace.documents.length ? `${workspace.documents.length} elérhető elem` : 'Nincs megosztott dokumentum.'}</p><Link className="mt-5 inline-flex font-semibold text-[#7a5f18] hover:underline" href="/portal/dokumentumok">Dokumentumok megnyitása →</Link></div>
      </section>
      <section className="grid gap-4 sm:grid-cols-2">
        <div className="min-w-0 rounded-2xl border border-stone-200 bg-white p-5"><h2 className="text-xl font-semibold text-stone-950">Üzenetek</h2><p className="mt-2 text-sm leading-6 text-stone-600">Kérdései és az iroda válaszai itt jelennek meg.</p><p className="mt-4 text-sm text-stone-700">{workspace.messages.length ? `${workspace.messages.length} aktív beszélgetés` : 'Jelenleg nincs elérhető üzenetváltás.'}</p><Link className="mt-4 inline-flex font-semibold text-[#7a5f18] hover:underline" href="/portal/uzenetek">Üzenetek megnyitása →</Link></div>
        <div className="min-w-0 rounded-2xl border border-stone-200 bg-white p-5"><h2 className="text-xl font-semibold text-stone-950">Közelgő határidők</h2><div className="mt-3 grid gap-2">{workspace.upcomingDeadlines.length ? workspace.upcomingDeadlines.slice(0, 2).map((action) => <WorkspaceActionCard key={action.id} action={action} />) : <p className="text-sm text-stone-600">Nincs közzétett közelgő határidő.</p>}</div></div>
      </section>
    </div>
  );
}

function ListView({ view, home, workspace }: { view: 'matters' | 'tasks' | 'documents' | 'messages'; home: PortalHome; workspace: PortalWorkspace }) {
  if (view === 'matters') return <div className="space-y-5"><div><p className="text-sm font-semibold uppercase tracking-[.18em] text-[#b95e4b]">Ügyeim</p><h1 className="mt-2 text-3xl font-semibold text-stone-950">Aktív ügyeim</h1></div><div className="grid gap-4 lg:grid-cols-2">{home.matters.length ? home.matters.map((matter) => <MatterCard key={matter.id} matter={matter} />) : <EmptyState />}</div></div>;
  if (view === 'tasks') return <div className="space-y-5"><div><p className="text-sm font-semibold uppercase tracking-[.18em] text-[#b95e4b]">Teendőim</p><h1 className="mt-2 text-3xl font-semibold text-stone-950">Amit most érdemes elintézni</h1></div>{[['now', 'Most intézendő'], ['upcoming', 'Közelgő'], ['completed', 'Befejezett']].map(([bucket, title]) => { const items = workspace.actions.filter((action) => action.bucket === bucket); return <Card key={bucket}><h2 className="text-xl font-semibold text-stone-950">{title}</h2><div className="mt-4 grid gap-3">{items.length ? items.map((action) => <WorkspaceActionCard key={action.id} action={action} />) : <p className="text-stone-600">Nincs elem ebben a csoportban.</p>}</div></Card>; })}</div>;
  if (view === 'documents') return <div className="space-y-5"><div><p className="text-sm font-semibold uppercase tracking-[.18em] text-[#b95e4b]">Dokumentumok</p><h1 className="mt-2 text-3xl font-semibold text-stone-950">Megosztott dokumentumok és kérések</h1></div><Card><div className="grid gap-3">{workspace.documents.length ? workspace.documents.map((document) => <WorkspaceDocumentCard key={`${document.kind}-${document.id}`} document={document} />) : <p className="text-stone-600">Nincs megosztott dokumentum vagy közzétett kérés.</p>}</div></Card></div>;
  return <div className="space-y-5"><div><p className="text-sm font-semibold uppercase tracking-[.18em] text-[#b95e4b]">Üzenetek</p><h1 className="mt-2 text-3xl font-semibold text-stone-950">Kérdések és válaszok</h1></div><Card><p className="text-stone-700">Itt csak az Ön kérdései és az iroda kifejezetten elküldött válaszai jelennek meg.</p><div className="mt-4 grid gap-3">{workspace.messages.length ? workspace.messages.map((message) => <WorkspaceMessageCard key={message.id} message={message} />) : <p className="text-stone-600">Nincs kérdés vagy megválaszolt üzenet.</p>}</div></Card></div>;
}

function milestoneStateLabel(state: string): string {
  switch (state) {
    case 'COMPLETED':
      return 'Kész';
    case 'IN_PROGRESS':
      return 'Folyamatban';
    case 'NOT_STARTED':
      return 'Előttünk áll';
    default:
      return 'Folyamatban';
  }
}

function DocumentView({ document }: { document: PortalDocument }) {
  const token = getAuthToken('customer');
  const onDownload = useCallback(async () => {
    const workspace = typeof window !== 'undefined' ? localStorage.getItem('adminiculum:client-portal-workspace') : null;
    const response = await fetch(portalDownloadUrl(document.id), { headers: {
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...(workspace ? { 'x-client-portal-workspace': workspace } : {}),
    } });
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
  const account = pickAccountByTenant(accounts, customerTenantId);
  const [state, setState] = useState<LoadState>({ status: 'loading' });
  const [selectedReference, setSelectedReference] = useState<string | null>(() => getStoredPortalWorkspace());
  const [reloadNonce, setReloadNonce] = useState(0);
  // Canonical customer-auth layer: single MSAL instance, one logout config.
  const { logoutCustomer } = useCustomerAuth();

  useEffect(() => {
    let cancelled = false;
    async function load() {
      if (!account) {
        setState({ status: 'login' });
        return;
      }
      if (inProgress !== InteractionStatus.None) return;
      try {
        const token = await instance.acquireTokenSilent({ account, scopes: customerApiScopes });
        setAuthToken(token.accessToken, 'customer');
        const context = await getPortalIdentityContext(selectedReference || undefined);
        // Onboarding states: never dead-end. Route to the onboarding surface
        // (form / pending / rejected / invitation) instead of a terminal card.
        if (['NO_ACCESS', 'ONBOARDING_REQUIRED', 'REQUEST_PENDING', 'REQUEST_REJECTED', 'INVITATION_PENDING', 'PENDING_APPROVAL'].includes(context.state)) {
          setSelectedPortalWorkspace(null);
          if (!cancelled) setState({ status: 'onboarding', context });
          return;
        }
        if (context.state === 'ACCESS_SUSPENDED') {
          setSelectedPortalWorkspace(null);
          if (!cancelled) setState({ status: 'suspended', context });
          return;
        }
        if (context.state === 'SELECTION_REQUIRED' || !context.selectedWorkspace) {
          setSelectedPortalWorkspace(null);
          if (!cancelled) setState({ status: 'select', context });
          return;
        }
        setSelectedPortalWorkspace(context.selectedWorkspace.publicReference);
        const capabilities = context.selectedWorkspace.capabilities;
        const isCollaborationWorkspace = context.selectedWorkspace.mode === 'ORGANIZATION' || context.selectedWorkspace.mode === 'CASE_RELAY';
        // Organization and case-relay customers surface their content via explicit
        // Case grants and the collaboration home (fetched by OrganizationPortalViews), not via the
        // workspace-level capability flags — so they must never dead-end on the
        // empty-capabilities guard, which is only meaningful for individual surfaces.
        if (!isCollaborationWorkspace && ![capabilities.matters, capabilities.tasks, capabilities.documents, capabilities.messages].some(Boolean)) {
          if (!cancelled) setState({ status: 'workspace-empty', context });
          return;
        }
        const [home, workspace] = await Promise.all([getPortalHome(), getPortalWorkspace()]);
        let detail = {};
        if (view === 'matter' && resourceId && !isCollaborationWorkspace) detail = { matter: await getPortalMatter(resourceId) };
        if (view === 'document' && resourceId) detail = { document: await getPortalDocument(resourceId) };
        if (view === 'action' && resourceId) detail = { action: await getPortalActionRequest(resourceId) };
        if (!cancelled) setState({ status: 'ready', context, home, workspace, ...detail });
      } catch (error) {
        if (error instanceof InteractionRequiredAuthError) {
          await instance.acquireTokenRedirect({ account, scopes: customerApiScopes });
          return;
        }
        if (!cancelled) {
          if (error instanceof ApiError && error.status === 403 && selectedReference) {
            setSelectedPortalWorkspace(null);
            setSelectedReference(null);
            setState({ status: 'loading' });
            setReloadNonce((value) => value + 1);
          } else if (error instanceof ApiError && error.status === 503) setState({ status: 'service-error' });
          else if (error instanceof ApiError && [401, 403, 404].includes(error.status)) setState({ status: 'denied', message: 'A portálhozzáférés jelenleg nem aktív. Kérjük, vegye fel a kapcsolatot az irodával.' });
          else setState({ status: 'denied', message: 'A portál jelenleg nem érhető el. Kérjük, próbálja újra később.' });
        }
      }
    }
    load();
    return () => { cancelled = true; };
  }, [account, inProgress, instance, resourceId, selectedReference, view, reloadNonce]);

  const nav = useMemo(() => {
    if (state.status !== 'ready' || !state.context.selectedWorkspace) return [];
    const capabilities = state.context.selectedWorkspace.capabilities;
    const workspace = state.context.selectedWorkspace;
    const communicationEnabled = workspace.communicationMode !== 'EXTERNAL_ONLY';
    return [
      capabilities.home ? ['Főoldal', '/portal'] : null,
      capabilities.matters ? ['Ügyeim', '/portal/ugyeim'] : null,
      workspace.mode === 'ORGANIZATION' && capabilities.intakes ? ['Új megkeresés', '/portal/megkeresesek/uj'] : null,
      workspace.mode === 'ORGANIZATION' && capabilities.intakes ? ['Megkereséseim', '/portal/megkeresesek'] : null,
      capabilities.tasks && workspace.mode !== 'ORGANIZATION' ? ['Teendőim', '/portal/teendoim'] : null,
      capabilities.documents ? ['Dokumentumok', '/portal/dokumentumok'] : null,
      capabilities.messages && communicationEnabled ? [workspace.mode === 'INDIVIDUAL' ? 'Üzenetek' : 'Kommunikáció', '/portal/uzenetek'] : null,
      workspace.mode === 'ORGANIZATION' && capabilities.leadership ? ['Vezetői áttekintés', '/portal/szervezeti-attekintes'] : null,
      workspace.mode === 'CASE_RELAY' ? ['Együttműködési áttekintés', '/portal/szervezeti-attekintes'] : null,
    ].filter(Boolean) as string[][];
  }, [state]);

  if (state.status === 'login' && view === 'home') return <PortalEntryLanding />;

  return (
    <main className="min-h-screen overflow-x-hidden bg-white text-stone-900" data-testid="client-portal-shell">
      <header className="sticky top-0 z-20 border-b border-stone-200 bg-white/90 backdrop-blur">
        <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-3 px-4 py-4 sm:px-6">
          <Link href="/portal" className="font-serif text-2xl font-semibold tracking-tight text-stone-950 focus:outline-none focus:ring-4 focus:ring-[#d7c48a]/40">Adminiculum</Link>
          {state.status === 'ready' ? <nav className="flex flex-wrap gap-2 text-sm" aria-label="Ügyfélportál navigáció">{nav.map(([label, href]) => <Link className="rounded-full px-3 py-2 text-stone-700 hover:bg-stone-100 focus:outline-none focus:ring-4 focus:ring-[#d7c48a]/40" key={label} href={href}>{label}</Link>)}</nav> : null}
          {['ready', 'select', 'onboarding', 'no-workspace', 'pending', 'suspended', 'workspace-empty', 'service-error'].includes(state.status) ? <div className="flex gap-2">{(state.status === 'ready' || state.status === 'workspace-empty') && state.context.workspaces.length > 1 ? <button className="rounded-full border border-stone-300 px-3 py-2 text-sm" onClick={() => { setSelectedPortalWorkspace(null); setSelectedReference(null); setState({ status: 'select', context: { ...state.context, state: 'SELECTION_REQUIRED', selectedWorkspace: null } }); }}>Munkatérváltás</button> : null}<button className="rounded-full border border-stone-300 px-3 py-2 text-sm" onClick={logoutCustomer}>Kijelentkezés</button></div> : null}
        </div>
      </header>
      <div className="mx-auto max-w-6xl px-4 py-8 sm:px-6">
        {state.status === 'loading' ? <Card>Betöltés...</Card> : null}
        {state.status === 'login' ? <Card><h1 className="text-3xl font-semibold">Ügyfélportál belépés</h1><p className="mt-3 text-stone-700">A biztonságos Microsoft ügyfélfiókos azonosításhoz folytassa a belépést.</p><Link href="/portal/login" className="mt-6 inline-flex rounded-full bg-stone-950 px-5 py-3 text-white">Belépés Microsoft-fiókkal</Link></Card> : null}
        {state.status === 'select' ? <PortalWorkspaceSelector workspaces={state.context.workspaces} onSelect={(reference) => { setState({ status: 'loading' }); setSelectedReference(reference); }} /> : null}
        {state.status === 'onboarding' ? <PortalOnboarding context={state.context} onReload={() => { setState({ status: 'loading' }); setReloadNonce((value) => value + 1); }} onEnterWorkspace={(reference) => { setState({ status: 'loading' }); setSelectedPortalWorkspace(reference); setSelectedReference(reference); setReloadNonce((value) => value + 1); }} /> : null}
        {state.status === 'no-workspace' ? <Card><h1 className="text-3xl font-semibold">Nincs aktív ügyfélfelülete</h1><p className="mt-3 text-stone-700">Ehhez a felhasználói fiókhoz jelenleg nem tartozik aktív, az ügyvédi iroda által jóváhagyott ügyfélfelület.</p></Card> : null}
        {state.status === 'pending' ? <Card><h1 className="text-3xl font-semibold">Jóváhagyásra vár</h1><p className="mt-3 text-stone-700">Az ügyfélfelülethez benyújtott kérelme az ügyvédi iroda jóváhagyására vár.</p></Card> : null}
        {state.status === 'suspended' ? <Card><h1 className="text-3xl font-semibold">A hozzáférés szünetel</h1><p className="mt-3 text-stone-700">Az ügyfélfelülethez való hozzáférés jelenleg szünetel. Kérjük, vegye fel a kapcsolatot az irodával.</p></Card> : null}
        {state.status === 'workspace-empty' ? <Card><h1 className="text-3xl font-semibold">{state.context.selectedWorkspace?.name}</h1><p className="mt-3 text-stone-700">Az ügyfélfelülethez való hozzáférése aktív, de ezen a felületen jelenleg nincs elérhető tartalom.</p></Card> : null}
        {state.status === 'service-error' ? <Card><h1 className="text-3xl font-semibold">A portál jelenleg nem érhető el</h1><p className="mt-3 text-stone-700">Kérjük, próbálja újra később.</p></Card> : null}
        {state.status === 'denied' ? <Card>{state.message}</Card> : null}
        {state.status === 'ready' && (state.context.selectedWorkspace?.mode === 'ORGANIZATION' || state.context.selectedWorkspace?.mode === 'CASE_RELAY') ? (
          <OrganizationPortalViews
            view={view as OrganizationPortalView}
            resourceId={resourceId}
            context={state.context}
            workspace={state.workspace}
          />
        ) : null}
        {state.status === 'ready' && state.context.selectedWorkspace?.mode !== 'ORGANIZATION' && state.context.selectedWorkspace?.mode !== 'CASE_RELAY' && view === 'home' ? <HomeView home={state.home} workspace={state.workspace} /> : null}
        {state.status === 'ready' && state.context.selectedWorkspace?.mode !== 'ORGANIZATION' && state.context.selectedWorkspace?.mode !== 'CASE_RELAY' && (view === 'matters' || view === 'tasks' || view === 'documents' || view === 'messages') ? <ListView view={view} home={state.home} workspace={state.workspace} /> : null}
        {state.status === 'ready' && state.context.selectedWorkspace?.mode !== 'ORGANIZATION' && state.context.selectedWorkspace?.mode !== 'CASE_RELAY' && view === 'matter' && state.matter ? (
          <MatterView
            matter={state.matter}
            communicationSection={<CustomerInteractionCard caseId={state.matter.caseId} />}
          />
        ) : null}
        {state.status === 'ready' && view === 'document' && state.document ? <DocumentView document={state.document} /> : null}
        {state.status === 'ready' && view === 'action' && state.action ? <ActionView action={state.action} /> : null}

      </div>
    </main>
  );
}

