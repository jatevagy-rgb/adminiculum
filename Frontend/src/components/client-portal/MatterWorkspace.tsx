"use client";

import Link from 'next/link';
import type {
  PortalActionRequest,
  PortalDocument,
  PortalMatter,
  PortalMilestone,
  PortalSafeUpdate,
} from '@/lib/clientPortalApi';

export function formatDate(value?: string | null): string {
  if (!value) return 'Nincs megadva';
  return new Intl.DateTimeFormat('hu-HU', { year: 'numeric', month: 'short', day: 'numeric' }).format(new Date(value));
}

function deadlineText(deadline: { label?: string; dueAt?: string }): string {
  return [deadline.label, deadline.dueAt ? formatDate(deadline.dueAt) : null].filter(Boolean).join(' · ');
}

export function Card({ children, className = '' }: { children: React.ReactNode; className?: string }) {
  return <section className={`min-w-0 rounded-3xl border border-stone-200 bg-white p-5 shadow-sm ${className}`}>{children}</section>;
}

export function ActionCard({ action }: { action: PortalActionRequest }) {
  return (
    <Link
      className="block rounded-2xl border border-[#eadfbf] bg-[#fffaf0] p-4 focus:outline-none focus:ring-4 focus:ring-[#d7c48a]/40"
      href={`/portal/action-requests/${encodeURIComponent(action.id)}`}
    >
      <p className="text-sm font-semibold text-[#7a5f18]">{action.typeLabel}</p>
      <h3 className="mt-1 break-words text-lg font-semibold text-stone-950">{action.title}</h3>
      <p className="mt-2 text-sm text-stone-700">Határidő: {formatDate(action.dueAt)}</p>
    </Link>
  );
}

export function UpdateCard({ update }: { update: PortalSafeUpdate }) {
  return (
    <div className="rounded-2xl border border-stone-200 bg-stone-50 p-4">
      <p className="text-xs font-semibold uppercase tracking-[0.18em] text-stone-500">{update.categoryLabel} · {formatDate(update.publishedAt)}</p>
      <h3 className="mt-2 break-words text-lg font-semibold text-stone-950">{update.title}</h3>
      <p className="mt-2 break-words text-stone-700">{update.body}</p>
    </div>
  );
}

export function DocumentCard({ document }: { document: PortalDocument }) {
  return (
    <Link
      className="block rounded-2xl border border-stone-200 bg-white p-4 focus:outline-none focus:ring-4 focus:ring-[#d7c48a]/40"
      href={`/portal/documents/${encodeURIComponent(document.id)}`}
    >
      <p className="text-sm font-semibold text-[#7a5f18]">{document.stateLabel}</p>
      <h3 className="mt-1 break-words text-lg font-semibold text-stone-950">{document.title}</h3>
      <p className="mt-2 text-sm text-stone-600">{document.versionLabel} · {formatDate(document.publishedAt)}</p>
    </Link>
  );
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

function MatterProgressSection({ milestones, progressPercentage }: { milestones?: PortalMilestone[]; progressPercentage?: number | null }) {
  const ordered = (milestones ?? []).slice().sort((a, b) => a.displayOrder - b.displayOrder);
  const hasProgress = typeof progressPercentage === 'number' && Number.isFinite(progressPercentage);
  if (!ordered.length && !hasProgress) return null;
  return (
    <Card>
      <h2 className="text-2xl font-semibold">Az ügy előrehaladása</h2>
      {hasProgress ? (
        <div className="mt-4">
          <div className="flex items-baseline justify-between">
            <span className="text-xs font-semibold uppercase tracking-[0.18em] text-stone-500">Előrehaladás</span>
            <span className="text-lg font-semibold text-stone-900">{progressPercentage}%</span>
          </div>
          <div className="mt-2 h-2.5 w-full overflow-hidden rounded-full bg-stone-100">
            <div className="h-full rounded-full bg-[#7a5f18] transition-all" style={{ width: `${Math.max(0, Math.min(100, progressPercentage as number))}%` }} />
          </div>
        </div>
      ) : null}
      {ordered.length ? (
        <ol className="mt-5 space-y-3">
          {ordered.map((milestone) => (
            <li key={milestone.reference} className="rounded-2xl bg-stone-50 p-4">
              <div className="flex items-start justify-between gap-3">
                <p className="break-words font-semibold text-stone-900">{milestone.title}</p>
                <span
                  className={`shrink-0 rounded-full px-3 py-1 text-xs font-semibold ${
                    milestone.state === 'COMPLETED'
                      ? 'bg-emerald-100 text-emerald-800'
                      : milestone.state === 'IN_PROGRESS'
                        ? 'bg-amber-100 text-amber-800'
                        : 'bg-stone-200 text-stone-600'
                  }`}
                >
                  {milestoneStateLabel(milestone.state)}
                </span>
              </div>
              {milestone.description ? <p className="mt-2 break-words text-sm text-stone-700">{milestone.description}</p> : null}
            </li>
          ))}
        </ol>
      ) : (
        <p className="mt-4 text-sm text-stone-600">Az iroda hamarosan közzéteszi az ügy mérföldköveit.</p>
      )}
    </Card>
  );
}

type MatterWorkspaceMatter = PortalMatter & {
  documents: PortalDocument[];
  actionRequests: PortalActionRequest[];
  updates: PortalSafeUpdate[];
  milestones?: PortalMilestone[];
  progressPercentage?: number | null;
};

export function MatterView({
  matter,
  communicationSection,
  showDocuments = true,
  showMessages = true,
}: {
  matter: MatterWorkspaceMatter;
  communicationSection?: React.ReactNode;
  showDocuments?: boolean;
  showMessages?: boolean;
}) {
  return (
    <div className="space-y-6">
      <Card>
        <p className="text-sm font-semibold text-[#7a5f18]">Közzétett ügy</p>
        <h1 className="mt-2 break-words text-3xl font-semibold text-stone-950">{matter.title}</h1>
        <div className="mt-5 grid gap-3 lg:grid-cols-2">
          <div className="rounded-2xl bg-stone-50 p-4">
            <p className="text-xs font-semibold uppercase tracking-[0.18em] text-stone-500">Most itt tartunk</p>
            <p className="mt-2 break-words text-stone-800">{matter.currentSummary || matter.statusLabel}</p>
          </div>
          <div className="rounded-2xl bg-stone-50 p-4">
            <p className="text-xs font-semibold uppercase tracking-[0.18em] text-stone-500">Mire várunk?</p>
            <p className="mt-2 font-semibold text-stone-900">{matter.waitingOnLabel || 'Nincs közzétett ügyféloldali teendő'}</p>
            <p className="mt-1 break-words text-sm text-stone-700">{matter.waitingDescription || 'Az iroda frissíti a portált, ha új lépés következik.'}</p>
          </div>
          <div className="rounded-2xl bg-stone-50 p-4">
            <p className="text-xs font-semibold uppercase tracking-[0.18em] text-stone-500">{matter.nextStepTitle || 'Következő lépés'}</p>
            <p className="mt-2 break-words text-stone-800">{matter.nextStepDescription || matter.nextStepLabel || 'Nincs közzétett következő lépés.'}</p>
            {matter.estimatedTiming ? <p className="mt-2 text-sm text-stone-600">Várható időzítés: {matter.estimatedTiming}</p> : null}
          </div>
          <div className="rounded-2xl bg-stone-50 p-4">
            <p className="text-xs font-semibold uppercase tracking-[0.18em] text-stone-500">Kapcsolattartó</p>
            <p className="mt-2 text-stone-800">{matter.responsibleLawyerDisplay || 'Közzététel szerint'}</p>
            {matter.responsibleLawyerContactSafe ? <p className="mt-1 text-sm text-stone-600">{matter.responsibleLawyerContactSafe}</p> : null}
          </div>
        </div>
        <div className="mt-4 grid gap-2 text-sm text-stone-600 sm:grid-cols-2">
          <span>Publikus céldátum: {formatDate(matter.estimatedTiming)}</span>
          <span>Közzétéve: {formatDate(matter.publishedAt)}</span>
          <span>Utolsó ügyféloldali frissítés: {formatDate(matter.lastClientVisibleUpdateAt || matter.latestUpdateAt)}</span>
        </div>
        {matter.publicDeadlines?.length ? (
          <ul className="mt-4 list-disc space-y-1 pl-5 text-stone-700">
            {matter.publicDeadlines.map((deadline, index) => <li key={index}>{deadlineText(deadline)}</li>)}
          </ul>
        ) : null}
      </Card>
      <MatterProgressSection milestones={matter.milestones} progressPercentage={matter.progressPercentage} />
      {showDocuments ? (
        <Card>
          <h2 className="text-2xl font-semibold">Dokumentumok</h2>
          <div className="mt-4 grid gap-3">
            {matter.documents.length ? matter.documents.map((doc) => <DocumentCard key={doc.id} document={doc} />) : <p className="text-stone-600">Nincs elérhető közzétett dokumentum.</p>}
          </div>
        </Card>
      ) : null}
      <Card>
        <h2 className="text-2xl font-semibold">Teendők</h2>
        <div className="mt-4 grid gap-3">
          {matter.actionRequests.length ? matter.actionRequests.map((action) => <ActionCard key={action.id} action={action} />) : <p className="text-stone-600">Nincs aktuális közzétett teendő.</p>}
        </div>
      </Card>
      {showMessages && communicationSection ? communicationSection : null}
      <Card>
        <h2 className="text-2xl font-semibold">Frissítések</h2>
        <div className="mt-4 grid gap-3">
          {matter.updates.length ? matter.updates.map((update) => <UpdateCard key={update.id} update={update} />) : <p className="text-stone-600">Nincs közzétett frissítés.</p>}
        </div>
      </Card>
    </div>
  );
}
