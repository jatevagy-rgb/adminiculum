"use client";

import { useCallback, useEffect, useState, type ReactNode } from "react";
import Link from "next/link";
import { clientWorkspaceApi, type CompanyDataRoom } from "@/lib/clientWorkspaceApi";
import { companyFactTypeLabel, factVerificationLabel } from "@/lib/clientCompanyApi";
import { GrowProcessMap } from "@/components/clients/GrowProcessMap";
import { ClientCompanyOperationsLegacy } from "@/components/clients/ClientCompanyOperationsLegacy";
import { DemoContentBanner } from "@/components/client-portal/PortalPresentationPrimitives";

export type WorkspaceSection =
  | "overview"
  | "data"
  | "organization"
  | "processes"
  | "systems"
  | "documents"
  | "compliance"
  | "development"
  | "operational";

export const WORKSPACE_SECTIONS: Array<[WorkspaceSection, string]> = [
  ["overview", "Áttekintés"],
  ["data", "Adatok"],
  ["organization", "Szervezet"],
  ["processes", "Folyamatok"],
  ["systems", "Rendszerek"],
  ["documents", "Dokumentumok"],
  ["compliance", "Megfelelőség"],
  ["development", "Fejlesztés"],
  ["operational", "Operatív áttekintés"],
];

const statusLabels: Record<string, string> = {
  ANSWERED: "Megválaszolva",
  UNKNOWN: "Ismeretlen",
  UNANSWERED: "Nincs még adat",
  ACTIVE: "Aktív",
  INACTIVE: "Inaktív",
  PLANNED: "Tervezett",
  COMPLETED: "Lezárt",
  ASSUMED: "Feltételezett",
};

function humanStatus(value: string | null | undefined): string {
  if (!value) return "Ismeretlen";
  return statusLabels[value] ?? value.replaceAll("_", " ");
}

function dateText(value: string | null | undefined): string {
  if (!value) return "—";
  return new Date(value).toLocaleDateString("hu-HU", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  });
}

function formatFactValue(value: unknown): ReactNode {
  if (value === null || value === undefined || value === "") {
    return <span className="text-stone-500">Nincs még adat</span>;
  }
  if (typeof value === "boolean") {
    return (
      <span className={`inline-flex items-center gap-1.5 font-semibold ${value ? "text-emerald-800" : "text-stone-700"}`}>
        <span className={`h-2 w-2 rounded-full ${value ? "bg-emerald-600" : "bg-stone-400"}`} />
        {value ? "Igen" : "Nem"}
      </span>
    );
  }
  if (typeof value === "number") {
    return <span>{value.toLocaleString("hu-HU")}</span>;
  }
  if (Array.isArray(value)) {
    if (value.length === 0) return <span className="text-stone-500">Nincs megadva</span>;
    return (
      <div className="flex flex-wrap gap-1.5 pt-0.5">
        {value.map((item, idx) => (
          <span
            key={idx}
            className="inline-flex items-center rounded-md border border-stone-200 bg-stone-50 px-2 py-0.5 text-xs font-medium text-stone-800"
          >
            {typeof item === "object" && item !== null ? (
              formatFactValue(item)
            ) : (
              String(item)
            )}
          </span>
        ))}
      </div>
    );
  }
  if (typeof value === "object") {
    const obj = value as Record<string, unknown>;
    if (typeof obj.booleanValue === "boolean") return formatFactValue(obj.booleanValue);
    if (typeof obj.numberValue === "number") return formatFactValue(obj.numberValue);
    if (typeof obj.textValue === "string") return <span>{obj.textValue}</span>;
    if (typeof obj.enumValue === "string") return <span>{obj.enumValue}</span>;
    if (Array.isArray(obj.items)) return formatFactValue(obj.items);
    if (Array.isArray(obj.options)) return formatFactValue(obj.options);

    const entries = Object.entries(obj).filter(([_, v]) => v !== null && v !== undefined && v !== "");
    if (entries.length === 0) return <span className="text-stone-500">Nincs még adat</span>;
    return (
      <div className="flex flex-wrap gap-1.5 pt-0.5">
        {entries.map(([k, v]) => (
          <span key={k} className="inline-flex items-center rounded-md border border-stone-200 bg-stone-50 px-2 py-0.5 text-xs text-stone-800">
            <span className="mr-1 text-stone-500">{k}:</span> {typeof v === "object" ? "Rögzítve" : String(v)}
          </span>
        ))}
      </div>
    );
  }
  return <span>{String(value)}</span>;
}

function renderFactValue(fact: CompanyDataRoom["facts"][number]): ReactNode {
  if (fact.answerStatus === "UNKNOWN") {
    return <span className="font-medium text-amber-800">Ismeretlen</span>;
  }
  if (fact.answerStatus === "UNANSWERED") {
    return <span className="font-normal text-stone-500">Nincs még adat</span>;
  }
  return formatFactValue(fact.value);
}

function factLabel(fact: CompanyDataRoom["facts"][number]): string {
  const technicalKey = fact.factDefinition?.key || fact.type;
  return fact.factDefinition?.labelHu || companyFactTypeLabel(technicalKey);
}

function FactCard({ fact }: { fact: CompanyDataRoom["facts"][number] }) {
  const technicalKey = fact.factDefinition?.key || fact.type;
  const label = factLabel(fact);

  return (
    <article
      className="rounded-2xl border border-stone-200/90 bg-white p-4 shadow-xs transition-shadow hover:shadow-sm"
      data-testid="fact-card"
    >
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <h3 className="text-sm font-semibold text-stone-900">{label}</h3>
          <p className="mt-0.5 truncate font-mono text-[11px] text-stone-600">{technicalKey}</p>
        </div>
        <span
          className={`shrink-0 rounded-full border px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider ${
            fact.answerStatus === "ANSWERED"
              ? "border-emerald-200 bg-emerald-50 text-emerald-800"
              : fact.answerStatus === "UNKNOWN"
              ? "border-amber-200 bg-amber-50 text-amber-800"
              : "border-stone-200 bg-stone-50 text-stone-600"
          }`}
        >
          {humanStatus(fact.answerStatus)}
        </span>
      </div>

      <div className="mt-3 text-sm font-medium text-stone-950">
        {renderFactValue(fact)}
      </div>

      <div className="mt-3 flex flex-wrap items-center gap-x-3 gap-y-1 border-t border-stone-100 pt-2 text-[11px] text-stone-500">
        {fact.verificationStatus ? (
          <span>
            Ellenőrzés: <strong className="font-medium text-stone-700">{factVerificationLabel(fact.verificationStatus)}</strong>
          </span>
        ) : null}
        {fact.observedAt ? (
          <span>
            Megfigyelve: <strong className="font-medium text-stone-700">{dateText(fact.observedAt)}</strong>
          </span>
        ) : null}
      </div>
    </article>
  );
}

function Panel({
  id,
  title,
  children,
}: {
  id?: WorkspaceSection;
  title: string;
  children: ReactNode;
}) {
  return (
    <section
      id={id}
      data-testid={id ? `data-room-${id}` : undefined}
      data-section-id={id}
      className="scroll-mt-24 rounded-3xl border border-stone-200 bg-white p-5 sm:p-6 shadow-sm"
    >
      <div className="border-b border-stone-100 pb-3">
        <h2 className="text-xs font-semibold uppercase tracking-[0.2em] text-[#014337]">{title}</h2>
      </div>
      <div className="mt-4">{children}</div>
    </section>
  );
}

function CountCard({
  label,
  value,
  detail,
  onClick,
}: {
  label: string;
  value: number | string;
  detail?: string;
  onClick?: () => void;
}) {
  const content = (
    <div
      className={`rounded-2xl border border-stone-200 bg-white p-4 shadow-xs transition-colors ${
        onClick ? "cursor-pointer hover:border-stone-300 hover:bg-stone-50/60" : ""
      }`}
    >
      <p className="text-[11px] font-semibold uppercase tracking-wider text-stone-500">{label}</p>
      <p className="mt-1 font-serif text-2xl font-bold text-stone-950">{value}</p>
      {detail ? <p className="mt-1 text-xs text-stone-500">{detail}</p> : null}
    </div>
  );

  if (onClick) {
    return (
      <button type="button" onClick={onClick} className="text-left focus-visible:outline-2 focus-visible:outline-[#014337]">
        {content}
      </button>
    );
  }
  return content;
}

export function ClientCompanyWorkspace({
  clientId,
  clientName,
}: {
  clientId: string;
  clientName: string;
}) {
  const [room, setRoom] = useState<CompanyDataRoom | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [activeSection, setActiveSection] = useState<WorkspaceSection>("overview");

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      setRoom(await clientWorkspaceApi.getDataRoom(clientId));
    } catch {
      setError("A vállalati működés adatai jelenleg nem tölthetők be.");
    } finally {
      setLoading(false);
    }
  }, [clientId]);

  useEffect(() => {
    void load();
  }, [load]);

  // Synchronize URL query parameter (?section=) with active section & support browser back/forward
  useEffect(() => {
    if (typeof window === "undefined") return;

    const readSectionFromLocation = () => {
      const params = new URLSearchParams(window.location.search);
      const sectionParam = params.get("section") as WorkspaceSection | null;
      if (
        sectionParam &&
        WORKSPACE_SECTIONS.some(([key]) => key === sectionParam)
      ) {
        setActiveSection(sectionParam);
        return;
      }
      // Backward compatibility with hash links (#compliance, #operational, etc.)
      const hash = window.location.hash.replace("#", "") as WorkspaceSection;
      if (hash && WORKSPACE_SECTIONS.some(([key]) => key === hash)) {
        setActiveSection(hash);
        return;
      }
      setActiveSection("overview");
    };

    readSectionFromLocation();
    window.addEventListener("popstate", readSectionFromLocation);
    window.addEventListener("hashchange", readSectionFromLocation);
    return () => {
      window.removeEventListener("popstate", readSectionFromLocation);
      window.removeEventListener("hashchange", readSectionFromLocation);
    };
  }, []);

  const handleSectionChange = useCallback((sec: WorkspaceSection) => {
    setActiveSection(sec);
    if (typeof window !== "undefined") {
      const url = new URL(window.location.href);
      if (sec === "overview") {
        url.searchParams.delete("section");
      } else {
        url.searchParams.set("section", sec);
      }
      // Remove hash if switching via query
      url.hash = "";
      window.history.pushState({}, "", url.toString());
    }
  }, []);

  const measuredOutcomeCount =
    room?.measurementSummary.byBasis.find((entry) => entry.basis === "MEASURED")?.count ?? 0;

  return (
    <div className="space-y-5" data-testid="client-company-workspace">
      <DemoContentBanner enabled={process.env.NEXT_PUBLIC_ADMINICULUM_DEMO_CONTENT_ENABLED === "true"} />

      {/* Workspace Top Header */}
      <header className="rounded-3xl border border-[#DCCCA6] bg-[#fbf9f4] p-5 sm:p-6 shadow-sm">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.2em] text-[#014337]">
              Company OS · Vállalati működés
            </p>
            <h1 className="mt-1 font-serif text-2xl font-semibold text-stone-950 sm:text-3xl">
              {clientName}
            </h1>
            <p className="mt-1 text-xs text-stone-600 sm:text-sm">
              A vállalat Data Room felülete: a rögzített tények, szervezeti struktúra, folyamatok és fejlesztési irányok egy helyen.
            </p>
          </div>
          <Link
            href={`/clients/${encodeURIComponent(clientId)}`}
            className="inline-flex items-center rounded-xl border border-stone-200 bg-white px-3 py-1.5 text-xs font-semibold text-stone-700 shadow-xs hover:bg-stone-50"
          >
            ← Vissza a dossziéhoz
          </Link>
        </div>
      </header>

      {/* Canonical Navigation Tabs */}
      <nav
        aria-label="Vállalati működés szekciói"
        className="flex flex-wrap gap-1 border-b border-stone-200/80 pb-2"
        role="tablist"
      >
        {WORKSPACE_SECTIONS.map(([key, label]) => {
          const isSelected = activeSection === key;
          return (
            <button
              key={key}
              type="button"
              role="tab"
              aria-selected={isSelected}
              data-testid={`workspace-tab-${key}`}
              onClick={() => handleSectionChange(key)}
              className={`rounded-xl px-3.5 py-2 text-xs font-semibold transition-colors focus-visible:outline-2 focus-visible:outline-[#014337] ${
                isSelected
                  ? "bg-[#014337] text-white shadow-xs"
                  : "bg-white text-stone-600 border border-stone-200 hover:bg-stone-50 hover:text-stone-900"
              }`}
            >
              {label}
            </button>
          );
        })}
      </nav>

      {loading ? (
        <div data-testid="data-room-loading" className="rounded-2xl border border-stone-200 bg-white p-6 text-sm text-stone-600 shadow-xs">
          Adatok betöltése…
        </div>
      ) : null}

      {error ? (
        <div
          data-testid="data-room-error"
          role="alert"
          className="rounded-2xl border border-red-200 bg-red-50 p-4 text-sm font-medium text-red-800 shadow-xs"
        >
          {error}
        </div>
      ) : null}

      {/* Data Room Section Views (Only selected section is rendered as principal content) */}
      {!loading && !error && room ? <>
          {activeSection === "overview" ? (
            <Panel id="overview" title="Áttekintés">
              {/* Primary KPI Row */}
              <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
                <CountCard
                  label="Megválaszolt releváns adatok"
                  value={room.dataQuality.relevantDataCoverage.answeredCount}
                  onClick={() => handleSectionChange("data")}
                />
                <CountCard
                  label="Ismeretlen"
                  value={room.dataQuality.relevantDataCoverage.unknownCount}
                  onClick={() => handleSectionChange("data")}
                />
                <CountCard
                  label="Nincs még adat"
                  value={room.dataQuality.relevantDataCoverage.unansweredCount}
                  onClick={() => handleSectionChange("data")}
                />
                <CountCard
                  label="Aktív folyamatok"
                  value={room.processes.filter((process) => process.status === "ACTIVE").length}
                  onClick={() => handleSectionChange("processes")}
                />
                <CountCard
                  label="Mért kimenetek"
                  value={measuredOutcomeCount}
                  onClick={() => handleSectionChange("development")}
                />
              </div>

              {/* Operating Profile Summary */}
              <div className="mt-5 rounded-2xl border border-stone-200 bg-stone-50/60 p-4">
                <p className="text-xs font-semibold uppercase tracking-wider text-stone-500">Működési kép</p>
                <p className="mt-1 text-sm text-stone-800 leading-relaxed">
                  {room.operatingProfile?.summary || "A Data Room összesített működési képe még nem tartalmaz leírást."}
                </p>
                {!room.dataQuality.relevantDataCoverage.available ? (
                  <p className="mt-2 text-xs text-stone-500">A releváns adatlefedettség még nem számítható.</p>
                ) : null}
              </div>

              {/* Cockpit Domain Spotlights with Direct Drill-Downs */}
              <div className="mt-5 grid gap-4 md:grid-cols-2 lg:grid-cols-3">
                {/* Adatok */}
                <div className="rounded-2xl border border-stone-200 bg-white p-4 shadow-xs">
                  <div className="flex items-center justify-between">
                    <h3 className="text-sm font-semibold text-stone-900">Rögzített adatok</h3>
                    <button
                      type="button"
                      onClick={() => handleSectionChange("data")}
                      className="text-xs font-semibold text-[#014337] hover:underline"
                    >
                      Megnyitás →
                    </button>
                  </div>
                  <p className="mt-2 text-xs text-stone-600">
                    Összes rögzített adatpont: <strong className="text-stone-900">{room.facts.length}</strong> (Ismeretlen:{" "}
                    <strong className="text-stone-900">{room.dataQuality.relevantDataCoverage.unknownCount}</strong>, Nincs még adat:{" "}
                    <strong className="text-stone-900">{room.dataQuality.relevantDataCoverage.unansweredCount}</strong>)
                  </p>
                  <p className="mt-1 text-xs text-stone-500">
                    Kanonikus mezők, hitelesítés és típusos értékek auditálható formában.
                  </p>
                </div>

                {/* Folyamatok */}
                <div className="rounded-2xl border border-stone-200 bg-white p-4 shadow-xs">
                  <div className="flex items-center justify-between">
                    <h3 className="text-sm font-semibold text-stone-900">Üzleti folyamatok</h3>
                    <button
                      type="button"
                      onClick={() => handleSectionChange("processes")}
                      className="text-xs font-semibold text-[#014337] hover:underline"
                    >
                      Megnyitás →
                    </button>
                  </div>
                  <div className="mt-2 space-y-1 text-xs text-stone-600">
                    <p>
                      Összes folyamat: <strong className="text-stone-900">{room.processes.length}</strong>
                    </p>
                    <p>
                      Módszertan: <span className="font-medium text-stone-800">Becsült értékek</span> a lépéseknél,{" "}
                      <span className="font-medium text-stone-800">Mért pillanatkép</span> a lezárt mérési periódusokból.
                    </p>
                    {room.processes.length === 0 ? (
                      <p className="text-stone-500">Nincs rögzített folyamat.</p>
                    ) : null}
                  </div>
                </div>

                {/* Szervezet */}
                <div className="rounded-2xl border border-stone-200 bg-white p-4 shadow-xs">
                  <div className="flex items-center justify-between">
                    <h3 className="text-sm font-semibold text-stone-900">Szervezet és munkatársak</h3>
                    <button
                      type="button"
                      onClick={() => handleSectionChange("organization")}
                      className="text-xs font-semibold text-[#014337] hover:underline"
                    >
                      Megnyitás →
                    </button>
                  </div>
                  <p className="mt-2 text-xs text-stone-600">
                    Egységek: <strong className="text-stone-900">{room.organization.groupCount}</strong> · Személyek:{" "}
                    <strong className="text-stone-900">{room.organization.personCount}</strong>
                  </p>
                  <p className="mt-1 text-xs text-stone-500">
                    Kulcsszemélyek, beosztások és szervezeti hierarchia.
                  </p>
                </div>

                {/* Rendszerek */}
                <div className="rounded-2xl border border-stone-200 bg-white p-4 shadow-xs">
                  <div className="flex items-center justify-between">
                    <h3 className="text-sm font-semibold text-stone-900">IT és digitális rendszerek</h3>
                    <button
                      type="button"
                      onClick={() => handleSectionChange("systems")}
                      className="text-xs font-semibold text-[#014337] hover:underline"
                    >
                      Megnyitás →
                    </button>
                  </div>
                  <p className="mt-2 text-xs text-stone-600">
                    Nyilvántartott rendszerek: <strong className="text-stone-900">{room.systems.length}</strong>
                  </p>
                  <p className="mt-1 text-xs text-stone-500">
                    Alkalmazások, szállítók és folyamatkapcsolatok.
                  </p>
                </div>

                {/* Megfelelőség */}
                <div className="rounded-2xl border border-stone-200 bg-white p-4 shadow-xs">
                  <div className="flex items-center justify-between">
                    <h3 className="text-sm font-semibold text-stone-900">Megfelelőségi státusz</h3>
                    <button
                      type="button"
                      onClick={() => handleSectionChange("compliance")}
                      className="text-xs font-semibold text-[#014337] hover:underline"
                    >
                      Megnyitás →
                    </button>
                  </div>
                  <p className="mt-2 text-xs text-stone-600">
                    Értékelt: <strong className="text-stone-900">{room.complianceSummary.evaluatedCount}</strong> · Nyitott megállapítás:{" "}
                    <strong className="text-stone-900">{room.complianceSummary.openFindings}</strong>
                  </p>
                  <p className="mt-1 text-xs text-stone-500">
                    Alkalmazandó szabályozási követelmények és javaslatok.
                  </p>
                </div>

                {/* Fejlesztés */}
                <div className="rounded-2xl border border-stone-200 bg-white p-4 shadow-xs">
                  <div className="flex items-center justify-between">
                    <h3 className="text-sm font-semibold text-stone-900">Fejlesztési program</h3>
                    <button
                      type="button"
                      onClick={() => handleSectionChange("development")}
                      className="text-xs font-semibold text-[#014337] hover:underline"
                    >
                      Megnyitás →
                    </button>
                  </div>
                  <p className="mt-2 text-xs text-stone-600">
                    Kezdeményezések: <strong className="text-stone-900">{room.developmentSummary.initiativeCount}</strong> (aktív:{" "}
                    <strong className="text-stone-900">{room.developmentSummary.activeInitiativeCount}</strong>)
                  </p>
                  <p className="mt-1 text-xs text-stone-500">
                    Mérföldkövek és elért kimenetek mérési alapon.
                  </p>
                </div>
              </div>
            </Panel>
          ) : null}

          {activeSection === "data" ? (
            <Panel id="data" title="Adatok">
              <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
                {room.facts.map((fact) => (
                  <FactCard key={fact.id ?? `${fact.type}-${fact.factSubjectId}`} fact={fact} />
                ))}
                {!room.facts.length ? (
                  <p className="text-sm text-stone-500">Nincs megjeleníthető adat.</p>
                ) : null}
              </div>
            </Panel>
          ) : null}

          {activeSection === "organization" ? (
            <Panel id="organization" title="Szervezet">
              <div className="grid gap-6 md:grid-cols-2">
                <div>
                  <h3 className="text-sm font-semibold text-stone-900">
                    Szervezeti egységek ({room.organization.groupCount})
                  </h3>
                  <ul className="mt-3 space-y-2">
                    {room.organization.groups.map((group) => (
                      <li key={group.id} className="rounded-2xl border border-stone-200 bg-white p-3.5 shadow-xs">
                        <p className="font-semibold text-stone-900">{group.name}</p>
                        {group.description ? (
                          <p className="mt-1 text-xs text-stone-600">{group.description}</p>
                        ) : null}
                        <p className="mt-2 text-[10px] font-semibold uppercase tracking-wider text-stone-500">
                          {humanStatus(group.status)}
                        </p>
                      </li>
                    ))}
                    {!room.organization.groups.length ? (
                      <p className="text-xs text-stone-500">Nincs rögzített szervezeti egység.</p>
                    ) : null}
                  </ul>
                </div>

                <div>
                  <h3 className="text-sm font-semibold text-stone-900">
                    Személyek ({room.organization.personCount})
                  </h3>
                  <ul className="mt-3 space-y-2">
                    {room.organization.people.map((person) => (
                      <li key={person.id} className="rounded-2xl border border-stone-200 bg-white p-3.5 shadow-xs">
                        <p className="font-semibold text-stone-900">{person.name}</p>
                        {person.jobTitle ? (
                          <p className="mt-0.5 text-xs font-medium text-stone-700">{person.jobTitle}</p>
                        ) : null}
                        <p className="mt-2 text-xs text-stone-500">
                          {person.organizationGroupName || "Nincs szervezeti egység"} · {humanStatus(person.employmentStatus)}
                        </p>
                      </li>
                    ))}
                    {!room.organization.people.length ? (
                      <p className="text-xs text-stone-500">Nincs rögzített munkatárs.</p>
                    ) : null}
                  </ul>
                </div>
              </div>
            </Panel>
          ) : null}

          {activeSection === "processes" ? (
            <Panel id="processes" title="Folyamatok">
              <div className="space-y-4">
                {room.processes.map((process) => (
                  <article
                    key={process.id}
                    className="rounded-2xl border border-stone-200 bg-white p-5 shadow-xs"
                  >
                    <div className="flex flex-wrap items-start justify-between gap-2">
                      <div>
                        <h3 className="font-serif text-lg font-semibold text-stone-950">{process.name}</h3>
                        <p className="mt-0.5 text-xs text-stone-500">
                          Kategória: <strong className="font-medium text-stone-700">{process.category}</strong> · Gyakoriság:{" "}
                          <strong className="font-medium text-stone-700">{process.frequency}</strong> · Állapot:{" "}
                          <span className="font-medium text-stone-700">{humanStatus(process.status)}</span>
                        </p>
                      </div>
                      <span className="rounded-full border border-stone-200 bg-stone-50 px-2.5 py-1 text-[10px] font-semibold uppercase tracking-wider text-stone-600">
                        Becsült értékek
                      </span>
                    </div>

                    {process.description ? (
                      <p className="mt-2 text-xs text-stone-600 leading-relaxed">{process.description}</p>
                    ) : null}

                    <div className="mt-4">
                      <GrowProcessMap steps={process.steps} />
                    </div>

                    {process.latestMeasuredSnapshot ? (
                      <div className="mt-4 rounded-xl border border-emerald-200/80 bg-emerald-50/40 p-3.5">
                        <p className="text-xs font-semibold text-emerald-950">
                          Mért pillanatkép · {dateText(process.latestMeasuredSnapshot.observedAt)}
                        </p>
                        <ul className="mt-2 flex flex-wrap gap-2">
                          {process.latestMeasuredSnapshot.metrics.map((metric) => (
                            <li
                              key={metric.code}
                              className="rounded-lg border border-emerald-200 bg-white px-2.5 py-1 text-xs text-stone-800 shadow-2xs"
                            >
                              <strong className="text-stone-900">{metric.code}:</strong> {formatFactValue(metric.value)}{" "}
                              {metric.unit}
                            </li>
                          ))}
                        </ul>
                      </div>
                    ) : (
                      <p className="mt-3 text-xs text-stone-500">Ehhez a folyamathoz nincs mért pillanatkép.</p>
                    )}
                  </article>
                ))}
                {!room.processes.length ? (
                  <p className="text-sm text-stone-500">Nincs rögzített folyamat.</p>
                ) : null}
              </div>
            </Panel>
          ) : null}

          {activeSection === "systems" ? (
            <Panel id="systems" title="Rendszerek">
              <div className="grid gap-4 md:grid-cols-2">
                {room.systems.map((system) => (
                  <article
                    key={system.id}
                    className="rounded-2xl border border-stone-200 bg-white p-4 shadow-xs"
                  >
                    <div className="flex items-start justify-between gap-2">
                      <h3 className="font-semibold text-stone-900">{system.name}</h3>
                      <span className="rounded-full border border-stone-200 bg-stone-50 px-2 py-0.5 text-[10px] font-semibold text-stone-600 uppercase">
                        {humanStatus(system.status)}
                      </span>
                    </div>
                    <p className="mt-1 text-xs text-stone-500">Kategória: {system.category}</p>
                    {system.vendor || system.purpose ? (
                      <p className="mt-2 text-xs text-stone-700">
                        {[system.vendor, system.purpose].filter(Boolean).join(" · ")}
                      </p>
                    ) : null}
                    <p className="mt-3 text-xs text-stone-500 border-t border-stone-100 pt-2">
                      Kapcsolódó folyamatlépések: <strong className="text-stone-800">{system.relatedProcessStepCount}</strong>
                    </p>
                  </article>
                ))}
                {!room.systems.length ? (
                  <p className="text-sm text-stone-500">Nincs rögzített rendszer.</p>
                ) : null}
              </div>
            </Panel>
          ) : null}

          {activeSection === "documents" ? (
            <Panel id="documents" title="Dokumentumok">
              <div className="grid gap-4 sm:grid-cols-3">
                <CountCard label="Jogosult dokumentumok" value={room.documents.documentCount} />
                <CountCard label="Aktuális verziók" value={room.documents.currentVersionCount} />
                <CountCard label="Bizonyítékhoz kapcsolt rekordok" value={room.documents.evidenceLinkedRecordCount} />
              </div>
              <div className="mt-4">
                <Link
                  href="/documents/compare"
                  className="inline-flex items-center rounded-xl border border-stone-200 bg-white px-3 py-1.5 text-xs font-semibold text-[#014337] shadow-xs hover:bg-stone-50"
                >
                  Dokumentumtár megnyitása →
                </Link>
              </div>
            </Panel>
          ) : null}

          {activeSection === "compliance" ? (
            <Panel id="compliance" title="Megfelelőség">
              <p className="text-sm text-stone-600">Ez a jelenlegi, jogosultság-alapú megfelelőségi összesítés.</p>
              <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
                <CountCard label="Értékelt" value={room.complianceSummary.evaluatedCount} />
                <CountCard label="Alkalmazandó" value={room.complianceSummary.applies} />
                <CountCard label="Tényhiányos" value={room.complianceSummary.insufficientFacts} />
                <CountCard label="Nyitott megállapítás" value={room.complianceSummary.openFindings} />
              </div>
              <div className="mt-4 flex flex-wrap items-center justify-between gap-3 border-t border-stone-100 pt-3 text-xs text-stone-500">
                <p>Értékelés ideje: {dateText(room.complianceSummary.evaluatedAt)}</p>
                <Link
                  href={`/clients/${encodeURIComponent(clientId)}/compliance`}
                  className="font-semibold text-[#014337] hover:underline"
                >
                  Részletes megfelelőség →
                </Link>
              </div>
            </Panel>
          ) : null}

          {activeSection === "development" ? (
            <Panel id="development" title="Fejlesztés">
              <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
                <CountCard label="Kezdeményezések" value={room.developmentSummary.initiativeCount} />
                <CountCard label="Aktív kezdeményezések" value={room.developmentSummary.activeInitiativeCount} />
                <CountCard label="Mérföldkövek" value={room.developmentSummary.milestoneCount} />
                <CountCard label="Nem szintetikus kimenetek" value={room.measurementSummary.nonSyntheticOutcomeCount} />
              </div>

              <div className="mt-5 space-y-3">
                <h3 className="text-sm font-semibold text-stone-900">Kezdeményezések részletei</h3>
                {room.developmentSummary.initiatives.map((initiative) => (
                  <article key={initiative.id} className="rounded-2xl border border-stone-200 bg-white p-4 shadow-xs">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <h4 className="font-semibold text-stone-950">{initiative.title}</h4>
                      <span className="rounded-full border border-stone-200 bg-stone-50 px-2 py-0.5 text-[10px] font-semibold text-stone-600">
                        {humanStatus(initiative.status)}
                      </span>
                    </div>
                    {initiative.currentState || initiative.targetState ? (
                      <p className="mt-2 text-xs text-stone-600">
                        {initiative.currentState || "Nincs még adat"} → {initiative.targetState || "Nincs még adat"}
                      </p>
                    ) : null}
                  </article>
                ))}
                {!room.developmentSummary.initiatives.length ? (
                  <p className="text-xs text-stone-500">Nincs rögzített fejlesztési kezdeményezés.</p>
                ) : null}

                {room.measurementSummary.outcomes
                  .filter((outcome) => outcome.basis === "ASSUMED")
                  .map((outcome) => (
                    <p key={outcome.id} className="text-xs text-stone-500">
                      Feltételezett kimenet:{" "}
                      {outcome.businessProcess?.name ||
                        outcome.developmentInitiative?.title ||
                        outcome.opportunity?.title ||
                        "Nincs megnevezve"}
                    </p>
                  ))}
              </div>
            </Panel>
          ) : null}</> : null}

      {/* Operatív áttekintés (Independent legacy section rendered when selected OR when Data Room fails) */}
      {activeSection === "operational" || Boolean(error) ? (
        <section
          id="operational"
          data-testid="legacy-operational-overview"
          data-section-id="operational"
          className="scroll-mt-24 rounded-3xl border border-stone-200 bg-white p-5 sm:p-6 shadow-sm"
        >
          <div className="border-b border-stone-100 pb-3">
            <h2 className="text-xs font-semibold uppercase tracking-[0.2em] text-[#014337]">
              Operatív áttekintés
            </h2>
            <p className="mt-1 text-xs text-stone-600">
              A korábbi operatív munkanézet továbbra is elérhető a részletes ügy-, határidő-, felelősségi és megfelelőségi kontextussal.
            </p>
          </div>
          <div className="mt-4">
            <ClientCompanyOperationsLegacy clientId={clientId} clientName={clientName} />
          </div>
        </section>
      ) : null}
    </div>
  );
}
