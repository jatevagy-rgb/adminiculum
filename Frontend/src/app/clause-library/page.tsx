"use client";

import { useEffect, useMemo, useState } from "react";
import { AuthenticatedApp } from "@/components/AuthenticatedApp";
import { AdminBadge, AdminButton, AdminStatusPill } from "@/components/adminiculum/ui";
import {
  ApiError,
  getClauseLibraryClauses,
  type ClauseCategory,
  type ClauseContractType,
  type ClauseKind,
  type ClauseLibraryItem,
} from "@/lib/api";

const CLAUSE_KIND_LABELS: Record<ClauseKind, string> = {
  REQUIRED: "Kötelező",
  RECOMMENDED: "Ajanlott",
  OPTIONAL: "Opcionális",
  SPECIAL: "Speciális",
};

const CATEGORY_LABELS: Record<ClauseCategory, string> = {
  PARTY: "Felek",
  PROPERTY: "Ingatlan",
  OWNERSHIP_PROOF: "Tulajdonjog igazolás",
  TITLE: "Jogcím",
  WARRANTIES: "Szavatosság",
  PRICE: "Vételár",
  FINANCING: "Finanszírozás",
  POSSESSION: "Birtokbaadás",
  CLOSING: "Zárás",
  SPECIAL: "Egyéb",
};

const CONTRACT_TYPE_LABELS: Record<ClauseContractType, string> = {
  ADASVETEL: "Adásvétel",
  BERLET: "Bérlet",
  MEGBIZAS: "Megbízás",
  MUNKASZERZODES: "Munkaszerződés",
  VALLALKOZAS: "Vállalkozás",
  EGYEB: "Egyéb",
};

function makeApiErrorMessage(error: unknown): string {
  if (error instanceof ApiError) {
    if (error.status === 0) {
      return "A művelet nem érhető el. Ellenőrizd a kapcsolatot vagy próbáld újra.";
    }
    return "A záradéktár jelenleg nem érhető el.";
  }
  if (error instanceof Error) {
    if (/networkerror|failed to fetch|load failed/i.test(error.message)) {
      return "A művelet nem érhető el. Ellenőrizd a kapcsolatot vagy próbáld újra.";
    }
    return "A záradéktár jelenleg nem érhető el.";
  }
  return "A záradéktár jelenleg nem érhető el.";
}

function previewText(clause: ClauseLibraryItem): string {
  const source = clause.summary?.trim() || clause.body.trim();
  return source.length > 220 ? `${source.slice(0, 217)}...` : source;
}

function formatDate(value?: string): string {
  if (!value) return "Nincs adat";
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return "Nincs adat";
  return parsed.toLocaleDateString("hu-HU");
}

function getStatusLabel(clause: ClauseLibraryItem): string {
  return clause.isActive ? "Jóváhagyott" : "Archivált";
}

export default function ClauseLibraryPage() {
  return (
    <AuthenticatedApp section="clause-library">
      <ClauseLibraryPageContent />
    </AuthenticatedApp>
  );
}

function ClauseLibraryPageContent() {
  const [clauses, setClauses] = useState<ClauseLibraryItem[]>([]);
  const [selectedClauseId, setSelectedClauseId] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [featureDisabledMessage, setFeatureDisabledMessage] = useState<string | null>(null);

  const [search, setSearch] = useState("");
  const [categoryFilter, setCategoryFilter] = useState<"ALL" | ClauseCategory>("ALL");
  const [contractTypeFilter, setContractTypeFilter] = useState<"ALL" | ClauseContractType>("ALL");
  const [includeInactive, setIncludeInactive] = useState(false);

  useEffect(() => {
    const loadClauses = async () => {
      setIsLoading(true);
      setError(null);
      setFeatureDisabledMessage(null);

      try {
        const list = await getClauseLibraryClauses({
          contractType: contractTypeFilter === "ALL" ? undefined : contractTypeFilter,
          category: categoryFilter === "ALL" ? undefined : categoryFilter,
          includeInactive,
          search: search.trim() || undefined,
        });

        setClauses(list);
        setSelectedClauseId((current) => current && list.some((item) => item.id === current) ? current : list[0]?.id || null);
      } catch (loadError) {
        if (loadError instanceof ApiError && loadError.status === 501) {
          setFeatureDisabledMessage("A záradékkönyvtár jelenleg nincs bekapcsolva.");
          setClauses([]);
          setSelectedClauseId(null);
        } else {
          console.error("Clause library load failed:", loadError);
          setError(makeApiErrorMessage(loadError));
        }
      } finally {
        setIsLoading(false);
      }
    };

    void loadClauses();
  }, [categoryFilter, contractTypeFilter, includeInactive, search]);

  const selectedClause = useMemo(
    () => clauses.find((item) => item.id === selectedClauseId) || null,
    [clauses, selectedClauseId]
  );

  const isFeatureDisabled = Boolean(featureDisabledMessage);

  return (
    <div className="min-h-0 flex-1 overflow-y-auto adm-board-page">
      <div className="adm-board-container max-w-[1240px] space-y-4">
        <section className="adm-board-panel p-4">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <h1 className="font-serif text-[30px] font-medium leading-tight text-[#1F2821]">Záradéktár</h1>
              <p className="mt-1 text-[13px] text-[#6D6A62]">Jóváhagyott szerződéses záradékok belső gyűjteménye.</p>
            </div>
            {!isFeatureDisabled && !isLoading && !error && <AdminStatusPill tone="green">Elérhető</AdminStatusPill>}
          </div>
        </section>

        {isLoading && clauses.length === 0 ? (
          <section className="adm-board-panel p-6 text-sm text-[#6D6A62]">Záradéktár betöltése…</section>
        ) : isFeatureDisabled ? (
          <section className="adm-board-panel p-5">
            <div className="max-w-2xl">
              <p className="text-base font-semibold text-[#1F2821]">A záradéktár jelenleg nem érhető el.</p>
              <p className="mt-2 text-sm leading-6 text-[#514D45]">
                A dokumentumok és a meglévő munkapéldányok továbbra is megnyithatók.
              </p>
              <div className="mt-4">
                <AdminButton size="sm" variant="neutral" onClick={() => { window.location.href = "/documents/compare"; }}>
                  Vissza a dokumentumokhoz
                </AdminButton>
              </div>
            </div>
          </section>
        ) : error ? (
          <section className="rounded-[8px] border border-[#F2DAD6] bg-[#FFF5F3] p-4 text-sm text-[#8B2A2A]">
            {error}
          </section>
        ) : (
          <section className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_340px]">
            <div className="space-y-4">
              <section className="adm-board-panel p-4">
                <div className="grid gap-3 md:grid-cols-[minmax(0,1fr)_220px_220px_auto] md:items-end">
                  <label className="text-[10px] font-bold uppercase tracking-[0.14em] text-[#7B776D]">
                    Keresés
                    <input
                      value={search}
                      onChange={(event) => setSearch(event.target.value)}
                      placeholder="Cím, összefoglaló vagy kulcsszó"
                      className="mt-2 w-full rounded border border-[#DDD7CA] bg-white px-3 py-2 text-xs normal-case tracking-normal text-[#1F2821]"
                    />
                  </label>
                  <label className="text-[10px] font-bold uppercase tracking-[0.14em] text-[#7B776D]">
                    Kategória
                    <select
                      value={categoryFilter}
                      onChange={(event) => setCategoryFilter(event.target.value as "ALL" | ClauseCategory)}
                      className="mt-2 w-full rounded border border-[#DDD7CA] bg-white px-3 py-2 text-xs normal-case tracking-normal text-[#1F2821]"
                    >
                      <option value="ALL">Minden kategória</option>
                      {Object.entries(CATEGORY_LABELS).map(([value, label]) => (
                        <option key={value} value={value}>{label}</option>
                      ))}
                    </select>
                  </label>
                  <label className="text-[10px] font-bold uppercase tracking-[0.14em] text-[#7B776D]">
                    Szerződéstípus
                    <select
                      value={contractTypeFilter}
                      onChange={(event) => setContractTypeFilter(event.target.value as "ALL" | ClauseContractType)}
                      className="mt-2 w-full rounded border border-[#DDD7CA] bg-white px-3 py-2 text-xs normal-case tracking-normal text-[#1F2821]"
                    >
                      <option value="ALL">Minden szerződéstípus</option>
                      {Object.entries(CONTRACT_TYPE_LABELS).map(([value, label]) => (
                        <option key={value} value={value}>{label}</option>
                      ))}
                    </select>
                  </label>
                  <label className="inline-flex items-center gap-2 rounded border border-[#DDD7CA] bg-white px-3 py-2 text-xs text-[#514D45]">
                    <input type="checkbox" checked={includeInactive} onChange={(event) => setIncludeInactive(event.target.checked)} />
                    Archiváltak
                  </label>
                </div>
              </section>

              <section className="adm-board-panel p-4">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <h2 className="font-serif text-xl font-medium text-[#1F2821]">Záradékok</h2>
                  <AdminButton size="sm" variant="neutral" onClick={() => globalThis.location.reload()}>
                    Frissítés
                  </AdminButton>
                </div>
                {clauses.length === 0 ? (
                  <div className="adm-board-empty adm-board-empty-compact mt-3">
                    <p className="text-sm font-semibold text-[#1F2821]">Nincs találat.</p>
                    <p className="mt-2 text-[11px] text-[#6D6A62]">Módosítsd a keresést vagy a szűrőket.</p>
                  </div>
                ) : (
                  <div className="mt-3 divide-y divide-[#EEE7D9] overflow-hidden rounded-[8px] border border-[#EEE7D9] bg-white">
                    {clauses.map((clause) => (
                      <button
                        key={clause.id}
                        type="button"
                        onClick={() => setSelectedClauseId(clause.id)}
                        className={`w-full p-3 text-left transition-colors ${selectedClauseId === clause.id ? "bg-[#FBF6E7]" : "hover:bg-[#FBF9F3]"}`}
                      >
                        <div className="flex flex-wrap items-start justify-between gap-2">
                          <div>
                            <h3 className="text-sm font-semibold text-[#1F2821]">{clause.title}</h3>
                            <p className="mt-1 text-[11px] text-[#6D6A62]">{CATEGORY_LABELS[clause.category]} · {CONTRACT_TYPE_LABELS[clause.contractType]}</p>
                          </div>
                          <div className="flex flex-wrap gap-1.5">
                            <AdminBadge tone={clause.isActive ? "green" : "neutral"}>{getStatusLabel(clause)}</AdminBadge>
                            <AdminBadge tone="gold">{CLAUSE_KIND_LABELS[clause.clauseKind]}</AdminBadge>
                          </div>
                        </div>
                        <p className="mt-2 text-[12px] leading-5 text-[#514D45]">{previewText(clause)}</p>
                      </button>
                    ))}
                  </div>
                )}
              </section>
            </div>

            <aside className="adm-board-panel p-4">
              <h2 className="font-serif text-xl font-medium text-[#1F2821]">Részletek</h2>
              {!selectedClause ? (
                <div className="adm-board-empty adm-board-empty-compact mt-3 text-[11px] text-[#6D6A62]">
                  Válassz záradékot a részletekhez.
                </div>
              ) : (
                <div className="mt-3 space-y-3">
                  <div className="rounded-[8px] border border-[#EEE7D9] bg-[#FBF9F3] p-3">
                    <h3 className="text-sm font-semibold text-[#1F2821]">{selectedClause.title}</h3>
                    <p className="mt-1 text-[11px] text-[#6D6A62]">{selectedClause.summary || "Nincs külön rövid magyarázat rögzítve."}</p>
                  </div>
                  <div className="rounded-[8px] border border-[#EEE7D9] bg-white p-3 text-[11px] text-[#514D45]">
                    <p><span className="font-semibold text-[#1F2821]">Státusz:</span> {getStatusLabel(selectedClause)}</p>
                    <p className="mt-1"><span className="font-semibold text-[#1F2821]">Utolsó frissítés:</span> {formatDate(selectedClause.updatedAt)}</p>
                  </div>
                  <div className="rounded-[8px] border border-[#EEE7D9] bg-white p-3">
                    <p className="text-[10px] font-bold uppercase tracking-[0.14em] text-[#7B776D]">Szövegelőnézet</p>
                    <p className="mt-2 whitespace-pre-wrap text-[12px] leading-6 text-[#1F2821]">
                      {selectedClause.body.length > 900 ? `${selectedClause.body.slice(0, 900)}...` : selectedClause.body}
                    </p>
                  </div>
                </div>
              )}
            </aside>
          </section>
        )}
      </div>
    </div>
  );
}
