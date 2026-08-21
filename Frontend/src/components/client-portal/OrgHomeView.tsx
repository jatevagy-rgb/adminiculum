"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import { getPortalOrgHome, type PortalOrgHome } from "@/lib/clientPortalApi";
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

function MilestoneChip({ milestone }: { milestone: { title?: string | null; state?: string | null } }) {
  const state = String(milestone.state || "NOT_STARTED");
  const done = state === "COMPLETED";
  return (
    <li className="flex items-start gap-3 text-sm">
      <span className={`mt-1 h-2 w-2 shrink-0 rounded-full ${done ? "bg-emerald-600" : "bg-stone-300"}`} aria-hidden="true" />
      <span className={done ? "text-stone-800" : "text-stone-500"}>{milestone.title || "Közzétett mérföldkő"}</span>
    </li>
  );
}

function Journey({ matter }: { matter: NonNullable<PortalOrgHome["currentMatter"]> }) {
  const done = (matter.milestones || []).filter((m) => String(m.state) === "COMPLETED");
  return (
    <section className={`${card} overflow-hidden`}>
      <p className="text-xs font-semibold uppercase tracking-[0.18em] text-[#9b7b25]">A munkája menete</p>
      <h2 className="mt-1 font-serif text-3xl font-semibold text-stone-950">{matter.title}</h2>
      <p className="mt-1 text-sm text-stone-600">{matter.status}</p>

      <div className="mt-6 grid gap-6 lg:grid-cols-3">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-stone-500">Eddig</p>
          {done.length ? (
            <ul className="mt-3 grid gap-2">
              {done.slice(0, 4).map((m, i) => <MilestoneChip key={`${m.reference || ""}-${i}`} milestone={m} />)}
            </ul>
          ) : (
            <p className="mt-3 text-sm text-stone-600">A közzétett lépések itt jelennek meg.</p>
          )}
          {typeof matter.progressPercentage === "number" ? (
            <p className="mt-3 text-xs text-stone-500">Közzétett haladás: {matter.progressPercentage}%</p>
          ) : null}
        </div>
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-stone-500">Most</p>
          <p className="mt-3 break-words leading-6 text-stone-800">{matter.currentPosition}</p>
          <p className="mt-3 text-sm text-stone-600">{matter.waitingOn}</p>
        </div>
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-stone-500">Következőként</p>
          {matter.nextStep ? (
            <p className="mt-3 break-words leading-6 text-stone-800">{matter.nextStep}</p>
          ) : (
            <p className="mt-3 text-sm text-stone-600">Jelenleg nincs Öntől szükséges teendő.</p>
          )}
          {matter.publicTargetDate ? <p className="mt-3 text-sm text-stone-600">Tervezett időpont: {formatDate(matter.publicTargetDate)}</p> : null}
        </div>
      </div>
      <Link href={`/portal/matters/${encodeURIComponent(matter.publicationId)}`} className="mt-6 inline-flex font-semibold text-[#7a5f18] hover:underline">Ügy megnyitása →</Link>
    </section>
  );
}

export function OrgHomeView({ workspaceId }: { workspaceId: string }) {
  const [home, setHome] = useState<PortalOrgHome | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      setHome(await getPortalOrgHome());
    } catch (e) {
      setError(clientSafeError(e));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { void load(); }, [load]);

  const actionNow = useMemo(() => (home?.actions || []), [home]);

  if (loading) return <section className={card}>Az áttekintés betöltése…</section>;
  if (error) return <section className={card}>{error}</section>;
  if (!home) return <section className={card}>Az áttekintés jelenleg nem érhető el.</section>;

  return (
    <div className="space-y-5" data-testid="org-home-view">
      <section className={card}>
        <p className="text-xs font-semibold uppercase tracking-[0.18em] text-[#9b7b25]">Üdvözöljük</p>
        <h1 className="mt-1 font-serif text-3xl font-semibold text-stone-950">{home.customer.name}</h1>
        <p className="mt-2 text-sm text-stone-600">Itt követheti nyomon, hogy a munkája hol tart, és mi következik.</p>
      </section>

      {home.currentMatter ? <Journey matter={home.currentMatter} /> : <Section title="Aktív ügyek" empty emptyText="Jelenleg nincs közzétett aktív ügye." />}

      <Section kicker="Tőled várjuk" title="Ami most Öntől kell" empty={!actionNow.length} emptyText="Jelenleg nincs Öntől szükséges teendő.">
        {actionNow.slice(0, 4).map((action) => (
          <Link key={action.id} href={`/portal/matters/${encodeURIComponent(action.matterPublicationId || action.id)}`} className="rounded-2xl border border-[#eadfbf] bg-[#fffaf0] p-4 text-sm">
            <b className="block text-stone-950">{action.title}</b>
            <span className="mt-1 block text-stone-700">{action.matterTitle || "Közzétett ügy"}{action.dueAt ? ` · Határidő: ${formatDate(action.dueAt)}` : ""}</span>
            <span className="mt-1 block text-stone-500">{action.typeLabel}</span>
          </Link>
        ))}
      </Section>

      <Section kicker="Ügyek" title="Aktív ügyek" empty={!home.matters.length} emptyText="Jelenleg nincs közzétett ügy.">
        {home.matters.slice(0, 5).map((m) => (
          <Link key={m.publicReference} href={`/portal/matters/${encodeURIComponent(m.matterPublicationId)}`} className="rounded-2xl border border-stone-200 bg-white p-4 text-sm transition hover:border-[#b99b45]">
            <b className="block text-stone-950">{m.publicTitle}</b>
            <span className="mt-1 block text-stone-700">{m.publicStatus}</span>
            <span className="mt-1 block text-stone-500">{m.customerActionRequired ? "Teendője van" : m.waitingOn}</span>
          </Link>
        ))}
      </Section>

      <Section kicker="Dokumentumok" title="Legutóbb megosztott dokumentumok" empty={!home.recentDocuments.length} emptyText="Ehhez a munkához még nem tettünk közzé dokumentumot.">
        {home.recentDocuments.slice(0, 5).map((d) => (
          <Link key={d.id} href={`/portal/documents/${encodeURIComponent(d.id)}`} className="rounded-2xl border border-stone-200 bg-white p-4 text-sm">
            <b className="block text-stone-950">{d.title}</b>
            <span className="mt-1 block text-stone-600">{d.matterTitle || "Közzétett ügy"}{d.publishedAt ? ` · ${formatDate(d.publishedAt)}` : ""}</span>
          </Link>
        ))}
      </Section>

      <Section kicker="Kapcsolat" title="Kérdések és üzenetek" empty={!home.contactSummary.openCount && !home.contactSummary.unreadCount} emptyText="Még nincs folyamatban kérdés vagy üzenetváltás.">
        {home.contactSummary.openCount ? <p className="text-sm text-stone-700">{home.contactSummary.openCount} nyitott beszélgetés{home.contactSummary.unreadCount ? `, ${home.contactSummary.unreadCount} olvasatlan üzenet` : ""}.</p> : null}
        {home.contactSummary.latestPreview ? <p className="mt-2 text-sm text-stone-600">{home.contactSummary.latestPreview}</p> : null}
        <Link href="/portal/uzenetek" className="mt-3 inline-flex font-semibold text-[#7a5f18] hover:underline">Kapcsolat megnyitása →</Link>
      </Section>
    </div>
  );
}