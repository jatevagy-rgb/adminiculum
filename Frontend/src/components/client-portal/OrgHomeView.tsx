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
import { formatDate } from "./MatterWorkspace";

const card = "min-w-0 rounded-3xl border border-stone-200 bg-white p-5 shadow-sm";

function Section({ kicker, title, children, empty, emptyText }: { kicker?: string; title: string; children?: React.ReactNode; empty?: boolean; emptyText?: string }) {
  return (
    <section className={card}>
      {kicker ? <p className="text-xs font-semibold uppercase tracking-[0.18em] text-stone-500">{kicker}</p> : null}
      <h2 className="mt-1 font-serif text-2xl font-semibold text-stone-950">{title}</h2>
      <div className="mt-4 grid gap-3">
        {empty ? <p className="text-sm text-stone-600">{emptyText || "Nincs megjeleníthető elem."}</p> : children}
      </div>
    </section>
  );
}

function CaseRow({ matter }: { matter: PortalOrgHome["matters"][number] }) {
  return (
    <Link href={`/portal/matters/${encodeURIComponent(matter.matterPublicationId)}`} className="rounded-2xl border border-stone-200 p-4 transition hover:border-[#b99b45]">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <h3 className="break-words font-semibold text-stone-950">{matter.publicTitle}</h3>
          <p className="mt-1 text-sm text-stone-600">{matter.publicStatus}</p>
        </div>
        {matter.customerActionRequired ? <span className="rounded-full bg-[#fff6dc] px-3 py-1 text-xs font-semibold text-[#735717]">Teendő szükséges</span> : null}
      </div>
      <p className="mt-3 text-sm text-stone-600">{matter.nextStep || matter.waitingOn}</p>
      {matter.lastPublishedUpdateAt ? <p className="mt-2 text-xs text-stone-500">Frissítve: {formatDate(matter.lastPublishedUpdateAt)}</p> : null}
    </Link>
  );
}

function ActionRow({ action }: { action: PortalOrgHome["actions"][number] }) {
  const href = action.matterPublicationId
    ? `/portal/matters/${encodeURIComponent(action.matterPublicationId)}`
    : `/portal/action-requests/${encodeURIComponent(action.id)}`;
  return (
    <Link href={href} className="rounded-2xl border border-[#eadfbf] bg-[#fffaf0] p-4 transition hover:border-[#b99b45]">
      <p className="font-semibold text-stone-950">{action.title}</p>
      <p className="mt-1 text-sm text-stone-700">{action.matterTitle || "Közzétett ügy"}</p>
      {action.dueAt ? <p className="mt-2 text-xs text-stone-500">Határidő: {formatDate(action.dueAt)}</p> : null}
    </Link>
  );
}

function ActivityRow({ document }: { document: PortalOrgHome["recentDocuments"][number] }) {
  return (
    <Link href={`/portal/documents/${encodeURIComponent(document.id)}`} className="flex min-w-0 items-start gap-3 rounded-2xl bg-stone-50 p-4">
      <span className="mt-1 h-2 w-2 shrink-0 rounded-full bg-emerald-600" aria-hidden="true" />
      <span className="min-w-0">
        <span className="block break-words font-semibold text-stone-950">Új dokumentum érkezett</span>
        <span className="mt-1 block break-words text-sm text-stone-700">{document.title}</span>
        <span className="mt-1 block text-xs text-stone-500">{document.matterTitle || "Közzétett ügy"}{document.publishedAt ? ` · ${formatDate(document.publishedAt)}` : ""}</span>
      </span>
    </Link>
  );
}

function CurrentMatter({ matter }: { matter: NonNullable<PortalOrgHome["currentMatter"]> }) {
  return (
    <section className={card}>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-stone-500">Kiemelt aktív ügy</p>
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
            {matter.milestones.filter((milestone) => milestone.state === "COMPLETED").length
              ? `${matter.milestones.filter((milestone) => milestone.state === "COMPLETED").length} közzétett lépés elkészült`
              : "A közzétett lépések itt jelennek meg."}
          </p>
        </div>
      </div>
      <Link href={`/portal/matters/${encodeURIComponent(matter.publicationId)}`} className="mt-5 inline-flex font-semibold text-[#7a5f18] hover:underline">Ügy megnyitása →</Link>
    </section>
  );
}

function CompanyStatus({ company, summaries }: { company: PortalOrgCompany | null; summaries: PortalLeadershipUnitAggregate[] }) {
  const activeCaseCount = summaries.reduce((total, summary) => total + summary.activeCaseCount, 0);
  const areas = company?.visibleMattersByArea || [];
  return (
    <section className={card}>
      <p className="text-xs font-semibold uppercase tracking-[0.18em] text-stone-500">Vállalat és megfelelőség</p>
      <h2 className="mt-1 font-serif text-2xl font-semibold text-stone-950">Szervezeti áttekintés</h2>
      <div className="mt-4 grid gap-3 sm:grid-cols-2">
        <div className="rounded-2xl bg-stone-50 p-4">
          <p className="text-2xl font-semibold text-stone-950">{activeCaseCount || "—"}</p>
          <p className="mt-1 text-sm text-stone-600">aktív jogi ügy</p>
        </div>
        <div className="rounded-2xl bg-stone-50 p-4">
          <p className="text-2xl font-semibold text-stone-950">{company?.groups.length || "—"}</p>
          <p className="mt-1 text-sm text-stone-600">látható szervezeti egység</p>
        </div>
      </div>
      {company?.profileHeadline ? <p className="mt-4 break-words text-sm leading-6 text-stone-700">{company.profileHeadline}</p> : null}
      {areas.length ? (
        <div className="mt-4">
          <p className="text-sm font-semibold text-stone-800">Megfelelőségi áttekintés</p>
          <div className="mt-2 flex flex-wrap gap-2">{areas.slice(0, 4).map((area) => <span key={area.areaName} className="rounded-full bg-[#f3ead2] px-3 py-1 text-xs text-[#6f5514]">{area.areaName}</span>)}</div>
        </div>
      ) : null}
      <Link href="/portal/vallalat" className="mt-5 inline-flex font-semibold text-[#7a5f18] hover:underline">Vállalati profil megnyitása →</Link>
    </section>
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

  useEffect(() => { void load(); }, [load]);

  const actionNow = useMemo(() => (home?.actions || []).slice(0, 4), [home]);
  const activeMatters = useMemo(() => (home?.matters || []).slice(0, 6), [home]);
  if (loading) return <section className={card}>Az áttekintés betöltése…</section>;
  if (error) return <section className={card}>{error}</section>;
  if (!home) return <section className={card}>Az áttekintés jelenleg nem érhető el.</section>;

  return (
    <div className="space-y-5" data-testid="org-home-view">
      <section className={card}>
        <p className="text-xs font-semibold uppercase tracking-[0.18em] text-[#9b7b25]">Szervezeti ügyfélfelület</p>
        <h1 className="mt-1 break-words font-serif text-3xl font-semibold text-stone-950">{home.customer.name}</h1>
        <p className="mt-2 break-words text-sm text-stone-600">{identity.displayName}{identity.jobTitle ? ` · ${identity.jobTitle}` : ""}</p>
        <p className="mt-3 text-sm text-stone-600">A közzétett ügyek, teendők és dokumentumok áttekintése egy helyen.</p>
      </section>

      <Section kicker="Teendői" title="Ami most Öntől kell" empty={!actionNow.length} emptyText="Jelenleg nincs Önnek szóló teendő.">
        {actionNow.map((action) => <ActionRow key={action.id} action={action} />)}
      </Section>

      {home.currentMatter ? <CurrentMatter matter={home.currentMatter} /> : null}

      <Section kicker="Aktív jogi munka" title="Ügyeink" empty={!activeMatters.length} emptyText="Jelenleg nincs közzétett aktív ügy.">
        {activeMatters.map((matter) => <CaseRow key={matter.publicReference} matter={matter} />)}
      </Section>

      <Section kicker="Legutóbbi tevékenység" title="Közzétett frissítések" empty={!home.recentDocuments.length} emptyText="Még nincs közzétett frissítés.">
        {home.recentDocuments.slice(0, 4).map((document) => <ActivityRow key={document.id} document={document} />)}
      </Section>

      <div className="grid gap-5 lg:grid-cols-2">
        <CompanyStatus company={company} summaries={summaries} />
        <Section kicker="Kapcsolat" title="Üzenetek" empty={!home.contactSummary.openCount && !home.contactSummary.unreadCount} emptyText="Még nincs folyamatban kérdés vagy üzenetváltás.">
          {home.contactSummary.openCount ? <p className="text-sm text-stone-700">{home.contactSummary.openCount} nyitott beszélgetés{home.contactSummary.unreadCount ? `, ${home.contactSummary.unreadCount} olvasatlan üzenet` : ""}.</p> : null}
          {home.contactSummary.latestPreview ? <p className="mt-2 break-words text-sm text-stone-600">{home.contactSummary.latestPreview}</p> : null}
          <Link href="/portal/uzenetek" className="mt-3 inline-flex font-semibold text-[#7a5f18] hover:underline">Üzenetek megnyitása →</Link>
        </Section>
      </div>
      {workSummary ? <WorkSummary summary={workSummary} /> : null}
    </div>
  );
}