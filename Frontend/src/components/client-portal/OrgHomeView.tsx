"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import {
  getPortalOrgHome,
  getPortalOrganizationCompany,
  getPortalOrganizationSummary,
  getPortalWorkSummary,
  formatPortalWorkDuration,
  type PortalOrgHome,
  type PortalOrgCompany,
  type PortalLeadershipUnitAggregate,
  type PortalWorkSummary,
} from "@/lib/clientPortalApi";
import { clientSafeError } from "@/lib/clientInteractionApi";
import { selectUpcomingDeadlines } from "@/lib/clientPortalUpcoming";
import { formatDate } from "./MatterWorkspace";

const card = "min-w-0 rounded-3xl border border-stone-200 bg-white p-5 shadow-sm";
const compactState = "min-w-0 rounded-2xl border border-stone-200 bg-white px-4 py-3";

/** The canonical destinations offered as quick actions on the organization home. */
const QUICK_ACTIONS: Array<{ label: string; href: string }> = [
  { label: "Ügyek", href: "/portal/ugyek" },
  { label: "Teendők", href: "/portal/teendoim" },
  { label: "Dokumentumok", href: "/portal/dokumentumok" },
  { label: "Naptár", href: "/portal/naptar" },
];

/**
 * Resolve an organization action to a real customer-safe destination. A compliance
 * action without a matter has no action-request detail page, so it goes to the
 * compliance surface rather than a dead end.
 */
function orgActionHref(action: PortalOrgHome["actions"][number]): string {
  if (action.actionUrl) return action.actionUrl;
  if (action.matterPublicationId) return `/portal/matters/${encodeURIComponent(action.matterPublicationId)}`;
  if (action.area === "COMPLIANCE") return "/portal/megfeleles";
  return `/portal/action-requests/${encodeURIComponent(action.id)}`;
}

function Section({
  kicker,
  title,
  children,
  empty,
  emptyText,
  note,
  actionLink,
  actionLabel,
}: {
  kicker?: string;
  title: string;
  children?: React.ReactNode;
  empty?: boolean;
  emptyText?: string;
  note?: React.ReactNode;
  actionLink?: string;
  actionLabel?: string;
}) {
  if (empty) {
    return (
      <section className={compactState} data-testid="portal-compact-empty">
        <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1">
          <div>
            {kicker ? <span className="text-[11px] font-semibold uppercase tracking-[0.16em] text-stone-500">{kicker} · </span> : null}
            <span className="text-sm font-semibold text-stone-800">{title}</span>
          </div>
          <div className="flex items-center gap-3">
            <span className="text-sm text-stone-500">{emptyText || "Nincs megjeleníthető elem."}</span>
            {actionLink && actionLabel ? (
              <Link href={actionLink} className="text-xs font-semibold text-[#7a5f18] hover:underline">
                {actionLabel} →
              </Link>
            ) : null}
          </div>
        </div>
      </section>
    );
  }
  return (
    <section className={card}>
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          {kicker ? <p className="text-xs font-semibold uppercase tracking-[0.18em] text-stone-500">{kicker}</p> : null}
          <h2 className="mt-1 font-serif text-2xl font-semibold text-stone-950">{title}</h2>
          {note ? (
            <p className="mt-1 text-sm text-stone-600" data-testid="portal-section-scope">{note}</p>
          ) : null}
        </div>
        {actionLink && actionLabel ? (
          <Link href={actionLink} className="text-sm font-semibold text-[#7a5f18] hover:underline">
            {actionLabel} →
          </Link>
        ) : null}
      </div>
      <div className="mt-4 grid gap-3">{children}</div>
    </section>
  );
}

function ActionRow({ action }: { action: PortalOrgHome["actions"][number] }) {
  const isCompliance = action.area === "COMPLIANCE";
  const href = orgActionHref(action);

  return (
    <Link href={href} className="rounded-2xl border border-[#eadfbf] bg-[#fffaf0] p-4 transition hover:border-[#b99b45]">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <span
            className={`rounded-full px-2.5 py-0.5 text-[11px] font-semibold uppercase tracking-wider ${
              isCompliance ? "bg-amber-200 text-amber-900" : "bg-stone-200 text-stone-800"
            }`}
          >
            {isCompliance ? "Megfelelés" : action.typeLabel || "Jogi teendő"}
          </span>
          <span className="text-xs text-stone-500">{action.matterTitle || "Szervezeti teendő"}</span>
        </div>
        {action.dueAt ? <span className="text-xs font-medium text-stone-600">Határidő: {formatDate(action.dueAt)}</span> : null}
      </div>
      <p className="mt-2 font-semibold text-stone-950">{action.title}</p>
      {action.instructions ? <p className="mt-1 text-sm text-stone-700">{action.instructions}</p> : null}
      <div className="mt-3 flex items-center justify-between border-t border-stone-200/60 pt-2 text-xs text-stone-500">
        <span>{action.readOnlyNote}</span>
        <span className="font-semibold text-[#7a5f18]">Megnyitás →</span>
      </div>
    </Link>
  );
}

function CaseRow({ matter }: { matter: PortalOrgHome["matters"][number] }) {
  return (
    <Link
      href={`/portal/matters/${encodeURIComponent(matter.matterPublicationId)}`}
      className="rounded-2xl border border-stone-200 p-4 transition hover:border-[#b99b45]"
    >
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <h3 className="break-words font-semibold text-stone-950">{matter.publicTitle}</h3>
          <p className="mt-1 text-sm text-stone-600">{matter.publicStatus}</p>
        </div>
        {matter.customerActionRequired ? (
          <span className="rounded-full bg-[#fff6dc] px-3 py-1 text-xs font-semibold text-[#735717]">
            Teendő szükséges
          </span>
        ) : null}
      </div>
      <p className="mt-3 text-sm text-stone-600">{matter.nextStep || matter.waitingOn}</p>
      {matter.lastPublishedUpdateAt ? (
        <p className="mt-2 text-xs text-stone-500">Frissítve: {formatDate(matter.lastPublishedUpdateAt)}</p>
      ) : null}
    </Link>
  );
}

function CurrentMatter({ matter }: { matter: NonNullable<PortalOrgHome["currentMatter"]> }) {
  return (
    <section className={card}>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-stone-500">Innen folytassa · kiemelt aktív ügy</p>
          <h2 className="mt-1 break-words font-serif text-2xl font-semibold text-stone-950">{matter.title}</h2>
        </div>
        <span className="rounded-full bg-stone-100 px-3 py-1 text-xs font-semibold text-stone-700">{matter.status}</span>
      </div>
      <div className="mt-5 grid gap-4 md:grid-cols-3">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.16em] text-stone-500">Most</p>
          <p className="mt-2 break-words text-sm leading-6 text-stone-800">{matter.currentPosition}</p>
        </div>
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.16em] text-stone-500">Következő lépés</p>
          <p className="mt-2 break-words text-sm leading-6 text-stone-800">{matter.nextStep || matter.waitingOn}</p>
        </div>
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.16em] text-stone-500">Eddig</p>
          <p className="mt-2 text-sm leading-6 text-stone-800">
            {matter.milestones.filter((m) => m.state === "COMPLETED").length
              ? `${matter.milestones.filter((m) => m.state === "COMPLETED").length} közzétett lépés elkészült`
              : "A közzétett lépések itt jelennek meg."}
          </p>
        </div>
      </div>
      <Link href={`/portal/matters/${encodeURIComponent(matter.publicationId)}`} className="mt-5 inline-flex font-semibold text-[#7a5f18] hover:underline">
        Ügy megnyitása →
      </Link>
    </section>
  );
}

function ActivityRow({ document }: { document: PortalOrgHome["recentDocuments"][number] }) {
  return (
    <Link href={`/portal/documents/${encodeURIComponent(document.id)}`} className="flex min-w-0 items-start gap-3 rounded-2xl bg-stone-50 p-4">
      <span className="mt-1 h-2 w-2 shrink-0 rounded-full bg-emerald-600" aria-hidden="true" />
      <span className="min-w-0">
        <span className="block break-words font-semibold text-stone-950">Új dokumentum érkezett</span>
        <span className="mt-1 block break-words text-sm text-stone-700">{document.title}</span>
        <span className="mt-1 block text-xs text-stone-500">
          {document.matterTitle || "Közzétett ügy"}
          {document.publishedAt ? ` · ${formatDate(document.publishedAt)}` : ""}
        </span>
      </span>
    </Link>
  );
}

function WorkSummary({ summary }: { summary: PortalWorkSummary }) {
  return (
    <section className={card}>
      <p className="text-xs font-semibold uppercase tracking-[0.18em] text-stone-500">Rögzített munka</p>
      <h2 className="mt-1 font-serif text-2xl font-semibold text-stone-950">Elvégzett munka</h2>
      {summary.totalMinutes > 0 ? (
        <>
          <p className="mt-4 text-3xl font-semibold text-stone-950">{formatPortalWorkDuration(summary.totalMinutes)}</p>
          <p className="mt-2 text-sm text-stone-600">Az Ön számára elérhető ügyekben rögzített jogi munka.</p>
        </>
      ) : (
        <p className="mt-4 text-sm text-stone-600">Ehhez az időszakhoz még nincs rögzített munka.</p>
      )}
    </section>
  );
}

export function OrgHomeView({ identity }: { identity: { displayName: string; jobTitle?: string | null } }) {
  const [home, setHome] = useState<PortalOrgHome | null>(null);
  const [company, setCompany] = useState<PortalOrgCompany | null>(null);
  const [summaries, setSummaries] = useState<PortalLeadershipUnitAggregate[]>([]);
  const [workSummary, setWorkSummary] = useState<PortalWorkSummary | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [homeResult, companyResult, summaryResult, workSummaryResult] = await Promise.all([
        getPortalOrgHome(),
        getPortalOrganizationCompany().catch(() => null),
        getPortalOrganizationSummary().catch(() => ({ units: [] })),
        getPortalWorkSummary().catch(() => null),
      ]);
      setHome(homeResult);
      setCompany(companyResult);
      setSummaries(summaryResult.units);
      setWorkSummary(workSummaryResult);
    } catch (e) {
      setError(clientSafeError(e));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const actionNow = useMemo(() => (home?.actions || []).slice(0, 4), [home]);
  const activeMatters = useMemo(() => (home?.matters || []).slice(0, 6), [home]);

  // The Home list is a deliberate preview. When the backend publishes more actions
  // than the preview shows, the section states the real scope instead of implying
  // that only the visible rows exist.
  const actionTotal = home?.actions.length ?? 0;
  const actionScopeNote = actionTotal > actionNow.length ? `${actionNow.length} megjelenítve · ${actionTotal} összesen` : undefined;

  // "What is coming up?" — today or later, derived only from real published dates.
  // Overdue values stay on their canonical Teendők / attention surfaces; we never
  // delete, rewrite or invent a date here.
  const deadlineRows = useMemo(() => {
    if (!home) return [] as Array<{ id: string; label: string; context: string; dueAt: string; href: string }>;
    const fromMatters = home.matters
      .filter((matter) => matter.publicTargetDate)
      .map((matter) => ({
        id: `matter-${matter.publicReference}`,
        label: matter.publicTitle,
        context: matter.organizationUnitName || "Közzétett ügy",
        dueAt: matter.publicTargetDate as string,
        href: `/portal/matters/${encodeURIComponent(matter.matterPublicationId)}`,
      }));
    const fromActions = home.actions
      .filter((action) => action.dueAt)
      .map((action) => ({
        id: `action-${action.id}`,
        label: action.title,
        context: action.typeLabel,
        dueAt: action.dueAt as string,
        href: orgActionHref(action),
      }));
    return selectUpcomingDeadlines([...fromMatters, ...fromActions], new Date());
  }, [home]);

  const orientation = useMemo(() => {
    if (!home) return null;
    const updateCandidates = home.recentDocuments
      .map((document) => document.publishedAt)
      .filter((value): value is string => Boolean(value))
      .sort();
    return {
      matterCount: home.matters.length,
      actionCount: home.actions.length,
      lastUpdate: updateCandidates.length ? updateCandidates[updateCandidates.length - 1] : null,
    };
  }, [home]);

  if (loading) return <section className={card}>Az áttekintés betöltése…</section>;
  if (error) return <section className={card}>{error}</section>;
  if (!home) return <section className={card}>Az áttekintés jelenleg nem érhető el.</section>;

  const grow = home.growSummary;
  const compliance = home.complianceSummary;
  const digitalTwin = home.digitalTwinSummary;

  // The company profile is informational. When no published figure or headline
  // exists it must not compete visually with the customer's own tasks; it stays
  // reachable as a compact line with its canonical destination.
  const profileHasContent = Boolean(
    digitalTwin?.employeeCount != null ||
      digitalTwin?.knownSystemsCount != null ||
      digitalTwin?.knownProcessesCount != null ||
      company?.employeeCount != null ||
      (company?.systems?.length ?? 0) > 0 ||
      (company?.processes?.length ?? 0) > 0 ||
      company?.profileHeadline,
  );

  return (
    <div className="space-y-5" data-testid="org-home-view">
      {/* 0. Orientation */}
      <section className={card}>
        <p className="text-xs font-semibold uppercase tracking-[0.18em] text-[#9b7b25]">Szervezeti ügyfélfelület</p>
        <h1 className="mt-1 break-words font-serif text-3xl font-semibold text-stone-950">{home.customer.name}</h1>
        <p className="mt-2 break-words text-sm text-stone-600">
          {identity.displayName}
          {identity.jobTitle ? ` · ${identity.jobTitle}` : ""}
        </p>
        {orientation ? (
          <p className="mt-3 flex flex-wrap items-center gap-x-2 gap-y-1 text-sm text-stone-700" data-testid="portal-orientation">
            <span>{orientation.matterCount} közzétett ügy</span>
            <span aria-hidden="true">·</span>
            <span>{orientation.actionCount} Öntől vár teendő</span>
            {orientation.lastUpdate ? (
              <>
                <span aria-hidden="true">·</span>
                <span>Utolsó frissítés: {formatDate(orientation.lastUpdate)}</span>
              </>
            ) : null}
          </p>
        ) : null}
      </section>

      {/* Quick actions — every canonical destination stays one tap away. */}
      <nav aria-label="Gyors műveletek" className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        {QUICK_ACTIONS.map((action) => (
          <Link
            key={action.href}
            href={action.href}
            className="rounded-2xl border border-stone-200 bg-white px-4 py-3 text-center text-sm font-semibold text-stone-800 transition hover:border-[#b99b45]"
          >
            {action.label}
          </Link>
        ))}
      </nav>

      {/* 1. AMI MOST ÖNTŐL KELL — dominant when actions exist, compact when empty */}
      <Section
        kicker="Teendői"
        title="Ami most Öntől kell"
        empty={!actionNow.length}
        emptyText="Jelenleg nincs Önnek szóló teendő."
        note={actionScopeNote}
        actionLink={actionScopeNote ? "/portal/teendoim" : undefined}
        actionLabel={actionScopeNote ? "Összes teendő" : undefined}
      >
        {actionNow.map((action) => (
          <ActionRow key={action.id} action={action} />
        ))}
      </Section>

      {/* 2. JOGI ÜGYEK */}
      {home.currentMatter ? <CurrentMatter matter={home.currentMatter} /> : null}

      <Section
        kicker="Aktív jogi munka"
        title="Ügyeink"
        empty={!activeMatters.length}
        emptyText="Jelenleg nincs közzétett aktív ügy."
        actionLink="/portal/ugyek"
        actionLabel="Összes ügy"
      >
        {activeMatters.map((matter) => (
          <CaseRow key={matter.publicReference} matter={matter} />
        ))}
      </Section>

      {/* 2b. SZERVEZETI TERÜLETEK — which company/unit context am I in */}
      <Section
        kicker="Szervezeti kontextus"
        title="Szervezeti területek"
        empty={!summaries.length}
        emptyText="Még nincs közzétett szervezeti területi összesítés."
        actionLink="/portal/vallalat"
        actionLabel="Vállalat"
      >
        {summaries.map((unit) => (
          <div key={unit.organizationUnitName || "unit"} className="rounded-2xl border border-stone-200 p-4">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <h3 className="font-semibold text-stone-950">{unit.organizationUnitName || "Szervezeti egység"}</h3>
              <span className="text-xs text-stone-500">{unit.activeCaseCount} aktív ügy</span>
            </div>
            <p className="mt-1 text-sm text-stone-600">
              {unit.waitingOnCustomerCount} Öntől váró teendő · {unit.waitingOnOfficeCount} irodai lépés
            </p>
          </div>
        ))}
      </Section>

      {/* 3. FEJLESZTÉS / GROW WITH US */}
      <Section
        kicker="Vállalatfejlesztés"
        title="Fejlesztés"
        empty={!grow || (grow.activeInitiativesCount === 0 && grow.knownProcessesCount === 0)}
        emptyText="Jelenleg nincs aktív fejlesztési kezdeményezés rögzítve."
        actionLink="/portal/fejlesztes"
        actionLabel="Fejlesztési felület"
      >
        <div className="grid gap-3 sm:grid-cols-2">
          <div className="rounded-2xl bg-stone-50 p-4">
            <p className="text-2xl font-semibold text-stone-950">{grow?.activeInitiativesCount ?? 0}</p>
            <p className="mt-1 text-sm text-stone-600">aktív fejlesztési kezdeményezés</p>
          </div>
          <div className="rounded-2xl bg-stone-50 p-4">
            <p className="text-2xl font-semibold text-stone-950">{grow?.knownProcessesCount ?? 0}</p>
            <p className="mt-1 text-sm text-stone-600">feltárt vállalati folyamat</p>
          </div>
        </div>
        {grow && grow.initiatives && grow.initiatives.length > 0 ? (
          <div className="mt-3 space-y-2">
            <p className="text-xs font-semibold uppercase tracking-[0.16em] text-stone-500">
              Legutóbbi kezdeményezések:
            </p>
            {grow.initiatives.slice(0, 3).map((init) => (
              <div key={init.id} className="flex items-center justify-between rounded-xl border border-stone-200 p-3 text-sm">
                <span className="font-medium text-stone-900">{init.title}</span>
                <span className="rounded-full bg-stone-100 px-2.5 py-0.5 text-xs text-stone-700">{init.statusLabel}</span>
              </div>
            ))}
          </div>
        ) : null}
      </Section>

      {/* 4. MEGFELELÉS */}
      <Section
        kicker="Megfelelés és biztonság"
        title="Megfelelés"
        empty={!compliance || (compliance.attentionCount === 0 && compliance.inProgressCount === 0 && compliance.noActionExpectedCount === 0)}
        emptyText="A megfelelési vizsgálat jelenleg nincs közzétéve."
        actionLink="/portal/megfeleles"
        actionLabel="Megfelelési áttekintés"
      >
        <div className="grid gap-3 sm:grid-cols-3">
          <div className="rounded-2xl bg-amber-50 p-4 border border-amber-100">
            <p className="text-2xl font-semibold text-amber-950">{compliance?.attentionCount ?? 0}</p>
              <p className="mt-1 text-xs text-amber-800">Öntől szükséges</p>
          </div>
          <div className="rounded-2xl bg-sky-50 p-4 border border-sky-100">
            <p className="text-2xl font-semibold text-sky-950">{compliance?.inProgressCount ?? 0}</p>
              <p className="mt-1 text-xs text-sky-800">Irodánál van</p>
          </div>
          <div className="rounded-2xl bg-emerald-50 p-4 border border-emerald-100">
            <p className="text-2xl font-semibold text-emerald-950">{compliance?.noActionExpectedCount ?? 0}</p>
              <p className="mt-1 text-xs text-emerald-800">Jelenleg nincs ügyfélteendő</p>
          </div>
        </div>
        {compliance && compliance.topics && compliance.topics.length > 0 ? (
          <div className="mt-3 space-y-2">
            {compliance.topics.slice(0, 3).map((topic) => (
              <div key={topic.topicId} className="flex items-center justify-between rounded-xl border border-stone-200 p-3 text-sm">
                <span className="font-medium text-stone-900">{topic.topicLabel}</span>
                <span className="text-xs text-stone-600">{topic.nextAction || "Áttekintve"}</span>
              </div>
            ))}
          </div>
        ) : null}
      </Section>

      {/* 5. FRISSÍTÉSEK */}
      <Section
        kicker="Legutóbbi tevékenység"
        title="Közzétett frissítések"
        empty={!home.recentDocuments.length}
        emptyText="Még nincs közzétett frissítés."
        actionLink="/portal/dokumentumok"
        actionLabel="Dokumentumok"
      >
        {home.recentDocuments.slice(0, 4).map((document) => (
          <ActivityRow key={document.id} document={document} />
        ))}
      </Section>

      {/* 5b. KÖZELGŐ HATÁRIDŐK — only real published dates */}
      <Section
        kicker="Naptár"
        title="Közelgő határidők"
        empty={!deadlineRows.length}
        emptyText="Nincs közzétett közelgő határidő."
        actionLink="/portal/naptar"
        actionLabel="Naptár megnyitása"
      >
        {deadlineRows.map((row) => (
          <Link
            key={row.id}
            href={row.href}
            className="flex flex-wrap items-center justify-between gap-2 rounded-2xl border border-stone-200 p-4 transition hover:border-[#b99b45]"
          >
            <span className="min-w-0">
              <span className="block break-words font-semibold text-stone-950">{row.label}</span>
              <span className="mt-1 block text-xs text-stone-500">{row.context}</span>
            </span>
            <span className="text-xs font-medium text-stone-600">{formatDate(row.dueAt)}</span>
          </Link>
        ))}
      </Section>

      {/* 6. ÜZENETEK */}
      <Section
        kicker="Kapcsolat"
        title="Üzenetek"
        empty={!home.contactSummary.openCount && !home.contactSummary.unreadCount}
        emptyText="Még nincs folyamatban kérdés vagy üzenetváltás."
        actionLink="/portal/uzenetek"
        actionLabel="Üzenetek megnyitása"
      >
        {home.contactSummary.openCount ? (
          <p className="text-sm text-stone-700">
            {home.contactSummary.openCount} nyitott beszélgetés
            {home.contactSummary.unreadCount ? `, ${home.contactSummary.unreadCount} olvasatlan üzenet` : ""}.
          </p>
        ) : null}
        {home.contactSummary.latestPreview ? (
          <p className="mt-2 break-words text-sm text-stone-600">{home.contactSummary.latestPreview}</p>
        ) : null}
      </Section>

      {/* Rögzített munka (ha van) */}
      {workSummary && workSummary.totalMinutes > 0 ? <WorkSummary summary={workSummary} /> : null}

      {/* 7. VÁLLALAT / DIGITÁLIS IKER — compact while unpublished, never unreachable */}
      {profileHasContent ? (
        <section className={card} data-testid="org-company-profile">
          <div className="flex flex-wrap items-end justify-between gap-3">
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.18em] text-stone-500">Vállalati digitális iker</p>
              <h2 className="mt-1 font-serif text-2xl font-semibold text-stone-950">Vállalati profil</h2>
            </div>
            <Link href="/portal/vallalat" className="text-sm font-semibold text-[#7a5f18] hover:underline">
              Profil megnyitása →
            </Link>
          </div>
          <div className="mt-4 grid gap-3 sm:grid-cols-3">
            <div className="rounded-2xl bg-stone-50 p-4">
              <p className="text-2xl font-semibold text-stone-950">{digitalTwin?.employeeCount ?? company?.employeeCount ?? "—"}</p>
              <p className="mt-1 text-sm text-stone-600">munkavállalói létszám (fő)</p>
            </div>
            <div className="rounded-2xl bg-stone-50 p-4">
              <p className="text-2xl font-semibold text-stone-950">{digitalTwin?.knownSystemsCount ?? company?.systems?.length ?? "—"}</p>
              <p className="mt-1 text-sm text-stone-600">ismert IT / üzleti rendszer</p>
            </div>
            <div className="rounded-2xl bg-stone-50 p-4">
              <p className="text-2xl font-semibold text-stone-950">{digitalTwin?.knownProcessesCount ?? company?.processes?.length ?? "—"}</p>
              <p className="mt-1 text-sm text-stone-600">feltárt szervezeti folyamat</p>
            </div>
          </div>
          {company?.profileHeadline ? (
            <p className="mt-4 break-words text-sm leading-6 text-stone-700">{company.profileHeadline}</p>
          ) : null}
        </section>
      ) : (
        <section className={compactState} data-testid="portal-compact-empty">
          <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1">
            <div>
              <span className="text-[11px] font-semibold uppercase tracking-[0.16em] text-stone-500">Vállalati digitális iker · </span>
              <span className="text-sm font-semibold text-stone-800">Vállalati profil</span>
            </div>
            <div className="flex items-center gap-3">
              <span className="text-sm text-stone-500">A vállalati profil adatai még nem kerültek közzétételre.</span>
              <Link href="/portal/vallalat" className="text-xs font-semibold text-[#7a5f18] hover:underline">
                Profil megnyitása →
              </Link>
            </div>
          </div>
        </section>
      )}
    </div>
  );
}