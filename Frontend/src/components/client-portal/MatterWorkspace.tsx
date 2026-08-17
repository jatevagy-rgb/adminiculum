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

function StatusGlyph({ kind }: { kind: 'current' | 'waiting' | 'next' }) {
  const common = { width: 16, height: 16, viewBox: '0 0 24 24', fill: 'none', stroke: 'currentColor', strokeWidth: 2, strokeLinecap: 'round' as const, strokeLinejoin: 'round' as const, 'aria-hidden': true };
  if (kind === 'current') return <svg {...common}><circle cx="12" cy="12" r="9" /><circle cx="12" cy="12" r="3" fill="currentColor" stroke="none" /></svg>;
  if (kind === 'waiting') return <svg {...common}><circle cx="12" cy="12" r="9" /><polyline points="12 7 12 12 15.5 14" /></svg>;
  return <svg {...common}><line x1="5" y1="12" x2="19" y2="12" /><polyline points="13 6 19 12 13 18" /></svg>;
}

function RowGlyph({ kind }: { kind: 'document' | 'action' | 'message' }) {
  const common = { width: 16, height: 16, viewBox: '0 0 24 24', fill: 'none', stroke: 'currentColor', strokeWidth: 2, strokeLinecap: 'round' as const, strokeLinejoin: 'round' as const, 'aria-hidden': true };
  if (kind === 'document') return <svg {...common}><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" /><polyline points="14 2 14 8 20 8" /></svg>;
  if (kind === 'action') return <svg {...common}><path d="M9 11l3 3L22 4" /><path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11" /></svg>;
  return <svg {...common}><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" /></svg>;
}

function deadlineText(deadline: { label?: string; dueAt?: string }): string {
  return [deadline.label, deadline.dueAt ? formatDate(deadline.dueAt) : null].filter(Boolean).join(' · ');
}

export function Card({ children, className = '' }: { children: React.ReactNode; className?: string }) {
  return <section className={`cp-card min-w-0 p-5 sm:p-6 ${className}`}>{children}</section>;
}

export function ActionCard({ action }: { action: PortalActionRequest }) {
  return (
    <Link
      className="cp-row cp-card-hover block p-4 focus:outline-none focus:ring-4 focus:ring-[#d7c48a]/40"
      href={`/portal/action-requests/${encodeURIComponent(action.id)}`}
    >
      <div className="flex items-start gap-3">
        <span className="mt-0.5 flex h-9 w-9 flex-none items-center justify-center rounded-lg bg-[#fff4da] text-[#8a5a06]"><RowGlyph kind="action" /></span>
        <div className="flex min-w-0 flex-1 flex-wrap items-start justify-between gap-3">
          <div className="min-w-0">
            <p className="cp-kicker">{action.typeLabel}</p>
            <h3 className="cp-title mt-1 text-lg">{action.title}</h3>
            <p className="mt-2 text-sm text-[var(--adm-text-muted)]">Határidő: {formatDate(action.dueAt)}</p>
          </div>
          <span className="cp-pill" data-tone="amber">Teendő</span>
        </div>
      </div>
    </Link>
  );
}

export function UpdateCard({ update }: { update: PortalSafeUpdate }) {
  return (
    <div className="cp-update">
      <span className="cp-update-dot" aria-hidden="true" />
      <p className="cp-kicker">{update.categoryLabel} · {formatDate(update.publishedAt)}</p>
      <h3 className="cp-title mt-1 text-lg">{update.title}</h3>
      <p className="mt-2 break-words text-[var(--adm-text)]">{update.body}</p>
    </div>
  );
}

export function DocumentCard({ document }: { document: PortalDocument }) {
  return (
    <Link
      className="cp-row cp-card-hover block p-4 focus:outline-none focus:ring-4 focus:ring-[#d7c48a]/40"
      href={`/portal/documents/${encodeURIComponent(document.id)}`}
    >
      <div className="flex items-start gap-3">
        <span className="mt-0.5 flex h-9 w-9 flex-none items-center justify-center rounded-lg bg-[#e7f3f8] text-[var(--adm-blue-700)]"><RowGlyph kind="document" /></span>
        <div className="flex min-w-0 flex-1 flex-wrap items-start justify-between gap-3">
          <div className="min-w-0">
            <p className="cp-kicker">{document.stateLabel}</p>
            <h3 className="cp-title mt-1 text-lg">{document.title}</h3>
            <p className="mt-2 text-sm text-[var(--adm-text-muted)]">{document.versionLabel} · {formatDate(document.publishedAt)}</p>
          </div>
          <span className="cp-pill" data-tone="blue">Dokumentum</span>
        </div>
      </div>
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

function milestoneTone(state: string): string {
  if (state === 'COMPLETED') return 'green';
  if (state === 'IN_PROGRESS') return 'amber';
  return 'neutral';
}

function MatterProgressSection({ milestones, progressPercentage }: { milestones?: PortalMilestone[]; progressPercentage?: number | null }) {
  const ordered = (milestones ?? []).slice().sort((a, b) => a.displayOrder - b.displayOrder);
  const hasProgress = typeof progressPercentage === 'number' && Number.isFinite(progressPercentage);
  if (!ordered.length && !hasProgress) return null;
  return (
    <Card>
      <div className="flex flex-wrap items-end justify-between gap-3">
        <h2 className="cp-card-heading">Az ügy előrehaladása</h2>
        {hasProgress ? <span className="text-lg font-semibold text-[var(--adm-green-800)]">{progressPercentage}%</span> : null}
      </div>
      {hasProgress ? (
        <div className="mt-4">
          <div className="flex items-baseline justify-between">
            <span className="cp-kicker">Előrehaladás</span>
            <span className="text-lg font-semibold text-[var(--adm-text)]">{progressPercentage}%</span>
          </div>
          <div className="mt-2 h-2.5 w-full overflow-hidden rounded-full bg-[var(--adm-ivory-200)]">
            <div className="h-full rounded-full bg-[var(--adm-green-700)] transition-all" style={{ width: `${Math.max(0, Math.min(100, progressPercentage as number))}%` }} />
          </div>
        </div>
      ) : null}
      {ordered.length ? (
        <ol className="cp-milestones mt-6">
          {ordered.map((milestone) => (
            <li key={milestone.reference} className="cp-milestone" data-state={milestone.state}>
              <span className="cp-milestone-dot" aria-hidden="true" />
              <div className="flex flex-wrap items-start justify-between gap-3">
                <p className="break-words font-semibold text-[var(--adm-text)]">{milestone.title}</p>
                <span className="cp-pill" data-tone={milestoneTone(milestone.state)}>{milestoneStateLabel(milestone.state)}</span>
              </div>
              {milestone.description ? <p className="mt-2 break-words text-sm text-[var(--adm-text-muted)]">{milestone.description}</p> : null}
            </li>
          ))}
        </ol>
      ) : (
        <p className="mt-4 text-sm text-[var(--adm-text-muted)]">Az iroda hamarosan közzéteszi az ügy mérföldköveit.</p>
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
      <section className="cp-hero">
        <div className="cp-hero-inner p-6 sm:p-8">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div className="min-w-0">
              <p className="cp-kicker">Ügy áttekintése</p>
              <h1 className="cp-title mt-3 break-words text-3xl sm:text-4xl">{matter.title}</h1>
              <p className="mt-3 max-w-3xl break-words leading-7 text-[var(--adm-text)]">{matter.currentSummary || matter.statusLabel}</p>
            </div>
            <span className="cp-pill shrink-0" data-tone="blue">{matter.statusLabel}</span>
          </div>
          <div className="mt-5 flex flex-wrap gap-x-6 gap-y-2 text-sm text-[var(--adm-text-muted)]">
            <span><b className="font-semibold text-[var(--adm-text)]">Publikus céldátum:</b> {formatDate(matter.estimatedTiming)}</span>
            <span>Közzétéve: {formatDate(matter.publishedAt)}</span>
            <span>Utolsó ügyféloldali frissítés: {formatDate(matter.lastClientVisibleUpdateAt || matter.latestUpdateAt)}</span>
          </div>
          {matter.publicDeadlines?.length ? (
            <ul className="mt-4 space-y-1 border-t border-[var(--adm-border)] pt-4 text-sm text-[var(--adm-text-muted)]">
              {matter.publicDeadlines.map((deadline, index) => <li key={index}>· {deadlineText(deadline)}</li>)}
            </ul>
          ) : null}
        </div>
      </section>

      <section className="cp-status-track" aria-label="Az ügy állása">
        <div className="cp-status-step" data-step="1" data-tone="current">
          <p className="cp-status-label"><StatusGlyph kind="current" /> Most itt tartunk</p>
          <p className="cp-status-body">{matter.currentSummary || matter.statusLabel}</p>
        </div>
        <div className="cp-status-step" data-step="2" data-tone="waiting">
          <p className="cp-status-label"><StatusGlyph kind="waiting" /> Mire várunk?</p>
          <p className="cp-status-body">{matter.waitingOnLabel || 'Nincs közzétett ügyféloldali teendő'}</p>
          <p className="cp-status-sub">{matter.waitingDescription || 'Az iroda frissíti a portált, ha új lépés következik.'}</p>
        </div>
        <div className="cp-status-step" data-step="3" data-tone="next">
          <p className="cp-status-label"><StatusGlyph kind="next" /> {matter.nextStepTitle || 'Következő lépés'}</p>
          <p className="cp-status-body">{matter.nextStepDescription || matter.nextStepLabel || 'Nincs közzétett következő lépés.'}</p>
          {matter.estimatedTiming ? <p className="cp-status-sub">Várható időzítés: {matter.estimatedTiming}</p> : null}
        </div>
      </section>

      {matter.responsibleLawyerDisplay ? (
        <div className="cp-card-soft px-5 py-4 text-sm text-[var(--adm-text-muted)]">
          Kapcsolattartó: <b className="font-semibold text-[var(--adm-text)]">{matter.responsibleLawyerDisplay}</b>
          {matter.responsibleLawyerContactSafe ? <span> · {matter.responsibleLawyerContactSafe}</span> : null}
        </div>
      ) : null}

      <MatterProgressSection milestones={matter.milestones} progressPercentage={matter.progressPercentage} />
      {showDocuments ? (
        <Card>
          <h2 className="cp-card-heading">Dokumentumok</h2>
          <div className="mt-4 grid gap-3">
            {matter.documents.length ? matter.documents.map((doc) => <DocumentCard key={doc.id} document={doc} />) : <p className="cp-empty">Még nincs Önnel megosztott dokumentum.</p>}
          </div>
        </Card>
      ) : null}
      <Card>
        <h2 className="cp-card-heading">Teendők</h2>
        <div className="mt-4 grid gap-3">
          {matter.actionRequests.length ? matter.actionRequests.map((action) => <ActionCard key={action.id} action={action} />) : <p className="cp-empty">Jelenleg nincs teendője.</p>}
        </div>
      </Card>
      {showMessages && communicationSection ? communicationSection : null}
      <Card>
        <h2 className="cp-card-heading">Frissítések</h2>
        <div className="cp-update-thread mt-4">
          {matter.updates.length ? matter.updates.map((update) => <UpdateCard key={update.id} update={update} />) : <p className="cp-empty">Nincs új frissítés.</p>}
        </div>
      </Card>
    </div>
  );
}
