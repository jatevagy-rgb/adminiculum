"use client";

import { useCallback, useEffect, useState, type ReactNode } from "react";
import Link from "next/link";
import { clientWorkspaceApi, type CompanyDataRoom } from "@/lib/clientWorkspaceApi";
import { companyFactTypeLabel, factVerificationLabel } from "@/lib/clientCompanyApi";
import { GrowProcessMap } from "@/components/clients/GrowProcessMap";
import { ClientCompanyOperationsLegacy } from "@/components/clients/ClientCompanyOperationsLegacy";
import { DemoContentBanner } from "@/components/client-portal/PortalPresentationPrimitives";

type WorkspaceTab = "overview" | "data" | "organization" | "processes" | "systems" | "documents" | "compliance" | "development";
const tabs: Array<[WorkspaceTab, string]> = [
  ["overview", "Áttekintés"], ["data", "Adatok"], ["organization", "Szervezet"], ["processes", "Folyamatok"],
  ["systems", "Rendszerek"], ["documents", "Dokumentumok"], ["compliance", "Megfelelőség"], ["development", "Fejlesztés"],
];

const statusLabels: Record<string, string> = {
  ANSWERED: "Megválaszolva", UNKNOWN: "Ismeretlen", UNANSWERED: "Nincs még adat",
  ACTIVE: "Aktív", INACTIVE: "Inaktív", PLANNED: "Tervezett", COMPLETED: "Lezárt", ASSUMED: "Feltételezett",
};

function humanStatus(value: string | null | undefined): string { return value ? statusLabels[value] ?? value.replaceAll("_", " ") : "Ismeretlen"; }
function dateText(value: string | null | undefined): string { return value ? new Date(value).toLocaleDateString("hu-HU") : "—"; }
function valueText(value: unknown): string {
  if (value === null || value === undefined || value === "") return "Nincs még adat";
  if (typeof value === "boolean") return value ? "Igen" : "Nem";
  if (typeof value === "object") return JSON.stringify(value);
  return String(value);
}
function factLabel(fact: CompanyDataRoom["facts"][number]): string {
  const key = (fact.factDefinition?.key || fact.type).toUpperCase();
  const label = companyFactTypeLabel(key);
  return label === key ? "Rögzített adat" : label;
}
function Panel({ id, title, children }: { id?: WorkspaceTab; title: string; children: ReactNode }) {
  return <section id={id} data-testid={id ? `data-room-${id}` : undefined} className="scroll-mt-24 rounded-[var(--adm-radius-md)] border border-[var(--adm-border)] bg-white p-5">
    <h2 className="text-[10px] uppercase tracking-[0.2em] text-[var(--adm-green-800)]">{title}</h2>
    <div className="mt-3">{children}</div>
  </section>;
}
function CountCard({ label, value, detail }: { label: string; value: number | string; detail?: string }) {
  return <div className="rounded border border-[var(--adm-border)] bg-[var(--adm-surface)] p-3"><p className="text-xs text-[var(--adm-text-muted)]">{label}</p><p className="mt-1 text-2xl font-semibold text-[var(--adm-text)]">{value}</p>{detail ? <p className="mt-1 text-xs text-[var(--adm-text-muted)]">{detail}</p> : null}</div>;
}

export function ClientCompanyWorkspace({ clientId, clientName }: { clientId: string; clientName: string }) {
  const [room, setRoom] = useState<CompanyDataRoom | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const load = useCallback(async () => {
    setLoading(true); setError(null);
    try { setRoom(await clientWorkspaceApi.getDataRoom(clientId)); }
    catch { setError("A vállalati működés adatai jelenleg nem tölthetők be."); }
    finally { setLoading(false); }
  }, [clientId]);
  useEffect(() => { void load(); }, [load]);
  const measuredOutcomeCount = room?.measurementSummary.byBasis.find((entry) => entry.basis === "MEASURED")?.count ?? 0;

  return <div className="space-y-5" data-testid="client-company-workspace">
    <DemoContentBanner enabled={process.env.NEXT_PUBLIC_ADMINICULUM_DEMO_CONTENT_ENABLED === "true"} />
    <header className="rounded-[var(--adm-radius-md)] border border-[#DCCCA6] bg-[var(--adm-sand-100)] p-5">
      <p className="text-[10px] uppercase tracking-[0.2em] text-[var(--adm-green-800)]">Vállalati működés</p>
      <h1 className="mt-1 font-serif text-2xl text-[var(--adm-text)]">{clientName}</h1>
      <p className="mt-1 text-xs text-[var(--adm-text-muted)]">A vállalat Data Room olvasási nézete: a rögzített tények, a működés és a következő fejlesztési kontextus egy helyen.</p>
      <Link href={`/clients/${encodeURIComponent(clientId)}`} className="mt-3 inline-block text-xs text-[var(--adm-ochre-500)] hover:underline">← Vissza az ügyfél dossziéhoz</Link>
    </header>
    <nav aria-label="Vállalati működés szekciói" className="flex flex-wrap gap-1 border-b border-[var(--adm-border)] pb-1">
      {tabs.map(([key, label]) => <a key={key} href={`#${key}`} className="rounded px-3 py-2 text-xs font-semibold text-[var(--adm-text-muted)] hover:bg-[var(--adm-surface)]">{label}</a>)}
    </nav>
    {loading ? <p data-testid="data-room-loading" className="text-sm text-[var(--adm-text-muted)]">Betöltés…</p> : null}
    {error ? <p data-testid="data-room-error" role="alert" className="rounded border border-red-200 bg-red-50 p-3 text-sm text-red-800">{error}</p> : null}
    {!loading && !error && room ? <>
      <Panel id="overview" title="Áttekintés">
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
          <CountCard label="Megválaszolt releváns adatok" value={room.dataQuality.relevantDataCoverage.answeredCount} />
          <CountCard label="Ismeretlen" value={room.dataQuality.relevantDataCoverage.unknownCount} />
          <CountCard label="Nincs még adat" value={room.dataQuality.relevantDataCoverage.unansweredCount} />
          <CountCard label="Aktív folyamatok" value={room.processes.filter((process) => process.status === "ACTIVE").length} />
          <CountCard label="Mért kimenetek" value={measuredOutcomeCount} />
        </div>
        <p className="mt-4 text-sm text-[var(--adm-text-muted)]">{room.operatingProfile?.summary || "A Data Room összesített működési képe még nem tartalmaz leírást."}</p>
        {!room.dataQuality.relevantDataCoverage.available ? <p className="mt-2 text-xs text-[var(--adm-text-muted)]">A releváns adatlefedettség még nem számítható.</p> : null}
      </Panel>
      <Panel id="data" title="Adatok">
        <div className="grid gap-3 md:grid-cols-2 lg:grid-cols-3">
          {room.facts.map((fact) => <article key={fact.id ?? `${fact.type}-${fact.factSubjectId}`} className="rounded border border-[var(--adm-border)] p-3"><p className="text-xs font-semibold text-[var(--adm-text)]">{factLabel(fact)}</p><p className="mt-1 text-sm text-[var(--adm-text)]">{fact.answerStatus === "UNKNOWN" ? "Ismeretlen" : fact.answerStatus === "UNANSWERED" ? "Nincs még adat" : valueText(fact.value)}</p><p className="mt-2 text-[10px] uppercase tracking-[0.12em] text-[var(--adm-text-muted)]">{humanStatus(fact.answerStatus)}</p>{fact.verificationStatus ? <p className="mt-1 text-xs text-[var(--adm-text-muted)]">Ellenőrzés: {factVerificationLabel(fact.verificationStatus)}</p> : null}{fact.observedAt ? <p className="mt-1 text-xs text-[var(--adm-text-muted)]">Megfigyelve: {dateText(fact.observedAt)}</p> : null}</article>)}
          {!room.facts.length ? <p className="text-sm text-[var(--adm-text-muted)]">Nincs megjeleníthető adat.</p> : null}
        </div>
      </Panel>
      <Panel id="organization" title="Szervezet">
        <div className="grid gap-4 md:grid-cols-2"><div><p className="text-sm font-semibold">Szervezeti egységek ({room.organization.groupCount})</p><ul className="mt-2 space-y-2">{room.organization.groups.map((group) => <li key={group.id} className="rounded border border-[var(--adm-border)] p-3"><p className="font-semibold">{group.name}</p>{group.description ? <p className="text-xs text-[var(--adm-text-muted)]">{group.description}</p> : null}<p className="mt-1 text-xs text-[var(--adm-text-muted)]">{humanStatus(group.status)}</p></li>)}</ul></div><div><p className="text-sm font-semibold">Személyek ({room.organization.personCount})</p><ul className="mt-2 space-y-2">{room.organization.people.map((person) => <li key={person.id} className="rounded border border-[var(--adm-border)] p-3"><p className="font-semibold">{person.name}</p>{person.jobTitle ? <p className="text-xs text-[var(--adm-text-muted)]">{person.jobTitle}</p> : null}<p className="mt-1 text-xs text-[var(--adm-text-muted)]">{person.organizationGroupName || "Nincs szervezeti egység"} · {humanStatus(person.employmentStatus)}</p></li>)}</ul></div></div>
      </Panel>
      <Panel id="processes" title="Folyamatok">
        <div className="space-y-4">{room.processes.map((process) => <article key={process.id} className="rounded border border-[var(--adm-border)] p-4"><div className="flex flex-wrap justify-between gap-2"><div><h3 className="font-semibold">{process.name}</h3><p className="text-xs text-[var(--adm-text-muted)]">{process.category} · {process.frequency} · {humanStatus(process.status)}</p></div><span className="text-xs text-[var(--adm-text-muted)]">Becsült értékek</span></div>{process.description ? <p className="mt-2 text-sm text-[var(--adm-text-muted)]">{process.description}</p> : null}<div className="mt-3"><GrowProcessMap steps={process.steps} /></div>{process.latestMeasuredSnapshot ? <div className="mt-4 rounded bg-[var(--adm-surface)] p-3"><p className="text-xs font-semibold">Mért pillanatkép · {dateText(process.latestMeasuredSnapshot.observedAt)}</p><ul className="mt-2 flex flex-wrap gap-2">{process.latestMeasuredSnapshot.metrics.map((metric) => <li key={metric.code} className="rounded border border-[var(--adm-border)] bg-white px-2 py-1 text-xs">{metric.code}: {valueText(metric.value)} {metric.unit}</li>)}</ul></div> : <p className="mt-3 text-xs text-[var(--adm-text-muted)]">Ehhez a folyamathoz nincs mért pillanatkép.</p>}</article>)}{!room.processes.length ? <p className="text-sm text-[var(--adm-text-muted)]">Nincs rögzített folyamat.</p> : null}</div>
      </Panel>
      <Panel id="systems" title="Rendszerek"><div className="grid gap-3 md:grid-cols-2">{room.systems.map((system) => <article key={system.id} className="rounded border border-[var(--adm-border)] p-3"><h3 className="font-semibold">{system.name}</h3><p className="text-xs text-[var(--adm-text-muted)]">{system.category} · {humanStatus(system.status)}</p>{system.vendor || system.purpose ? <p className="mt-2 text-sm text-[var(--adm-text-muted)]">{[system.vendor, system.purpose].filter(Boolean).join(" · ")}</p> : null}<p className="mt-2 text-xs text-[var(--adm-text-muted)]">Kapcsolódó folyamatlépések: {system.relatedProcessStepCount}</p></article>)}{!room.systems.length ? <p className="text-sm text-[var(--adm-text-muted)]">Nincs rögzített rendszer.</p> : null}</div></Panel>
      <Panel id="documents" title="Dokumentumok"><div className="grid gap-3 sm:grid-cols-3"><CountCard label="Jogosult dokumentumok" value={room.documents.documentCount} /><CountCard label="Aktuális verziók" value={room.documents.currentVersionCount} /><CountCard label="Bizonyítékhoz kapcsolt rekordok" value={room.documents.evidenceLinkedRecordCount} /></div><Link href="/documents/compare" className="mt-4 inline-block text-xs text-[var(--adm-ochre-500)] hover:underline">Dokumentumtár megnyitása →</Link></Panel>
      <Panel id="compliance" title="Megfelelőség"><p className="text-sm text-[var(--adm-text-muted)]">Ez a jelenlegi, jogosultság-alapú megfelelőségi összesítés.</p><div className="mt-3 grid gap-3 sm:grid-cols-2 lg:grid-cols-4"><CountCard label="Értékelt" value={room.complianceSummary.evaluatedCount} /><CountCard label="Alkalmazandó" value={room.complianceSummary.applies} /><CountCard label="Tényhiányos" value={room.complianceSummary.insufficientFacts} /><CountCard label="Nyitott megállapítás" value={room.complianceSummary.openFindings} /></div><p className="mt-3 text-xs text-[var(--adm-text-muted)]">Értékelés ideje: {dateText(room.complianceSummary.evaluatedAt)}</p><Link href={`/clients/${encodeURIComponent(clientId)}/compliance`} className="mt-3 inline-block text-xs text-[var(--adm-ochre-500)] hover:underline">Részletes megfelelőség →</Link></Panel>
      <Panel id="development" title="Fejlesztés"><div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4"><CountCard label="Kezdeményezések" value={room.developmentSummary.initiativeCount} /><CountCard label="Aktív kezdeményezések" value={room.developmentSummary.activeInitiativeCount} /><CountCard label="Mérföldkövek" value={room.developmentSummary.milestoneCount} /><CountCard label="Nem szintetikus kimenetek" value={room.measurementSummary.nonSyntheticOutcomeCount} /></div><div className="mt-4 space-y-2">{room.developmentSummary.initiatives.map((initiative) => <article key={initiative.id} className="rounded border border-[var(--adm-border)] p-3"><div className="flex flex-wrap justify-between gap-2"><h3 className="font-semibold">{initiative.title}</h3><span className="text-xs text-[var(--adm-text-muted)]">{humanStatus(initiative.status)}</span></div>{initiative.currentState || initiative.targetState ? <p className="mt-1 text-sm text-[var(--adm-text-muted)]">{initiative.currentState || "Nincs még adat"} → {initiative.targetState || "Nincs még adat"}</p> : null}</article>)}{room.measurementSummary.outcomes.filter((outcome) => outcome.basis === "ASSUMED").map((outcome) => <p key={outcome.id} className="text-xs text-[var(--adm-text-muted)]">Feltételezett kimenet: {outcome.businessProcess?.name || outcome.developmentInitiative?.title || outcome.opportunity?.title || "Nincs megnevezve"}</p>)}</div></Panel>
    </> : null}
    <section id="operational" data-testid="legacy-operational-overview" className="scroll-mt-24 rounded-[var(--adm-radius-md)] border border-[var(--adm-border)] bg-[var(--adm-surface)] p-5">
      <h2 className="text-[10px] uppercase tracking-[0.2em] text-[var(--adm-green-800)]">Operatív áttekintés</h2>
      <p className="mt-2 text-sm text-[var(--adm-text-muted)]">A korábbi operatív munkanézet továbbra is elérhető a részletes ügy-, határidő-, felelősségi és megfelelőségi kontextussal.</p>
      <div className="mt-4"><ClientCompanyOperationsLegacy clientId={clientId} clientName={clientName} /></div>
    </section>
  </div>;
}
