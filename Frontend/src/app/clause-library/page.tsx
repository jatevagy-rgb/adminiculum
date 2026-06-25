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
    return error.message;
  }
  if (error instanceof Error) {
    if (/networkerror|failed to fetch|load failed/i.test(error.message)) {
      return "A művelet nem érhető el. Ellenőrizd a kapcsolatot vagy próbáld újra.";
    }
    return error.message;
  }
  return "Ismeretlen hiba";
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
    <div className="min-h-0 flex-1 overflow-y-auto bg-[#F3EBD4]">
      <div className="mx-auto max-w-[1520px] space-y-4 px-4 py-4 xl:px-6">
        <section className="rounded-[10px] border border-[#D8CFB6] bg-[#FBF6E7] p-4">
          <div className="flex flex-col gap-3 xl:flex-row xl:items-start xl:justify-between">
            <div className="space-y-2">
              <div className="inline-flex items-center gap-2 rounded-[5px] border border-[#1F4A33] bg-[#1F4A33] px-3 py-1 text-[10px] font-bold uppercase tracking-[0.14em] text-[#F4EFDB]">
                Klauzulatár
              </div>
              <div>
                <h1 className="font-serif text-[30px] font-medium leading-tight text-[#1F2821]">Klauzulatár</h1>
                <p className="mt-1 max-w-3xl text-[13px] text-[#6D6A62]">
                  Jóváhagyott és előkészítés alatt álló szerződéses szövegblokkok.
                </p>
              </div>
            </div>
            <div className="grid gap-2 rounded-[8px] border border-[#D8CFB6] bg-white p-3 text-[11px] text-[#514D45] sm:grid-cols-3">
              <div>
                <p className="font-semibold text-[#1F2821]">Adatforrás</p>
                <p className="mt-1">{isFeatureDisabled ? "Feature flag letiltva" : "Valós Clause Library endpoint"}</p>
              </div>
              <div>
                <p className="font-semibold text-[#1F2821]">Beszúrás</p>
                <p className="mt-1">Későbbi patchben aktiválható</p>
              </div>
              <div>
                <p className="font-semibold text-[#1F2821]">Későbbi munkamód</p>
                <p className="mt-1">Prompt / workflow előkészítés, nem aktív generálás</p>
              </div>
            </div>
          </div>
        </section>

        <section className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_320px]">
          <div className="space-y-4">
            <section className="rounded-[10px] border border-[#D8CFB6] bg-white p-4">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <h2 className="font-serif text-xl font-medium text-[#1F2821]">Szűrés és keresés</h2>
                <AdminStatusPill tone={isFeatureDisabled ? "gold" : "green"}>
                  {isFeatureDisabled ? "Foundation állapot" : "Valós lista"}
                </AdminStatusPill>
              </div>
              <div className="mt-3 grid gap-3 md:grid-cols-2 xl:grid-cols-3">
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
                      <option key={value} value={value}>
                        {label}
                      </option>
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
                      <option key={value} value={value}>
                        {label}
                      </option>
                    ))}
                  </select>
                </label>
                <label className="text-[10px] font-bold uppercase tracking-[0.14em] text-[#7B776D]">
                  Nyelv
                  <select
                    disabled
                    title="Nyelvi metaadat későbbi patchben lesz strukturáltan kezelhető."
                    className="mt-2 w-full rounded border border-[#DDD7CA] bg-[#F6F2E8] px-3 py-2 text-xs normal-case tracking-normal text-[#7B776D] disabled:cursor-not-allowed"
                  >
                    <option>Előkészítés alatt</option>
                  </select>
                </label>
                <label className="text-[10px] font-bold uppercase tracking-[0.14em] text-[#7B776D]">
                  Kockázati profil
                  <select
                    disabled
                    title="A kockázati profil külön mezőként későbbi patchben lesz kezelhető."
                    className="mt-2 w-full rounded border border-[#DDD7CA] bg-[#F6F2E8] px-3 py-2 text-xs normal-case tracking-normal text-[#7B776D] disabled:cursor-not-allowed"
                  >
                    <option>Előkészítés alatt</option>
                  </select>
                </label>
                <label className="text-[10px] font-bold uppercase tracking-[0.14em] text-[#7B776D]">
                  Ügyfél / house style
                  <select
                    disabled
                    title="A kliens- és house style-kompatibilitás későbbi patchben lesz kapcsolható."
                    className="mt-2 w-full rounded border border-[#DDD7CA] bg-[#F6F2E8] px-3 py-2 text-xs normal-case tracking-normal text-[#7B776D] disabled:cursor-not-allowed"
                  >
                    <option>Előkészítés alatt</option>
                  </select>
                </label>
              </div>
              <label className="mt-3 inline-flex items-center gap-2 text-xs text-[#514D45]">
                <input
                  type="checkbox"
                  checked={includeInactive}
                  onChange={(event) => setIncludeInactive(event.target.checked)}
                />
                Archivált tételek mutatása
              </label>
            </section>

            <section className="rounded-[10px] border border-[#D8CFB6] bg-white p-4">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div>
                  <h2 className="font-serif text-xl font-medium text-[#1F2821]">Záradéklista</h2>
                  <p className="mt-1 text-[11px] text-[#6D6A62]">
                    Valós clause adatok esetén listáz, egyébként őszinte empty vagy disabled state jelenik meg.
                  </p>
                </div>
                <AdminButton size="sm" variant="neutral" onClick={() => globalThis.location.reload()}>
                  Frissítés
                </AdminButton>
              </div>

              {featureDisabledMessage ? (
                <div className="mt-3 rounded-[8px] border border-[#E8DFC9] bg-[#FBF6E7] p-4">
                  <p className="text-sm font-semibold text-[#1F2821]">A záradékkönyvtár jelenleg nincs bekapcsolva.</p>
                  <p className="mt-2 text-[11px] text-[#514D45]">
                    Ebben a környezetben a Clause Library feature flag le van tiltva. Aktiváláshoz szükséges:
                    {" "}
                    <code>ENABLE_CLAUSE_LIBRARY=true</code>
                  </p>
                </div>
              ) : error ? (
                <div className="mt-3 rounded-[8px] border border-[#F2DAD6] bg-[#FFF5F3] p-4 text-sm text-[#8B2A2A]">
                  {error}
                  <p className="mt-2 text-[11px] text-[#8B2A2A]">
                    A Klauzulatár oldala betöltve marad, de a lista jelenleg nem elérhető.
                  </p>
                </div>
              ) : isLoading ? (
                <p className="mt-3 text-xs text-[#7B776D]">Klauzulatár betöltése...</p>
              ) : clauses.length === 0 ? (
                <div className="mt-3 rounded-[8px] border border-dashed border-[#DDD7CA] bg-[#FBF9F3] p-4">
                  <p className="text-sm font-semibold text-[#1F2821]">Még nincs jóváhagyott klauzula.</p>
                  <p className="mt-2 text-[11px] text-[#6D6A62]">
                    A klauzulatár feltöltése és jóváhagyási workflow-ja későbbi patchben aktiválható.
                  </p>
                </div>
              ) : (
                <div className="mt-3 grid gap-3">
                  {clauses.map((clause) => (
                    <article
                      key={clause.id}
                      className={`rounded-[8px] border p-4 transition-colors ${
                        selectedClauseId === clause.id
                          ? "border-[#C8B98A] bg-[#FBF6E7]"
                          : "border-[#EEE7D9] bg-[#FBF9F3]"
                      }`}
                    >
                      <div className="flex flex-wrap items-start justify-between gap-2">
                        <div className="space-y-1">
                          <h3 className="text-sm font-semibold text-[#1F2821]">{clause.title}</h3>
                          <p className="text-[11px] text-[#6D6A62]">{CATEGORY_LABELS[clause.category]} · {CONTRACT_TYPE_LABELS[clause.contractType]}</p>
                        </div>
                        <div className="flex flex-wrap items-center gap-2">
                          <AdminBadge tone={clause.isActive ? "green" : "neutral"}>{getStatusLabel(clause)}</AdminBadge>
                          <AdminBadge tone="gold">{CLAUSE_KIND_LABELS[clause.clauseKind]}</AdminBadge>
                          <AdminStatusPill tone="neutral">Kockázat: előkészítés alatt</AdminStatusPill>
                          <AdminStatusPill tone="neutral">Nyelv: nincs metaadat</AdminStatusPill>
                        </div>
                      </div>
                      <p className="mt-3 text-[12px] leading-6 text-[#514D45]">{previewText(clause)}</p>
                      <div className="mt-3 flex flex-wrap items-center justify-between gap-2">
                        <div className="flex flex-wrap gap-1.5">
                          {(clause.keywords || []).slice(0, 5).map((keyword) => (
                            <span key={`${clause.id}-${keyword}`} className="rounded-full border border-[#DDD7CA] bg-white px-2 py-0.5 text-[10px] text-[#514D45]">
                              {keyword}
                            </span>
                          ))}
                        </div>
                        <div className="flex flex-wrap gap-2">
                          <AdminButton size="xs" variant="neutral" onClick={() => setSelectedClauseId(clause.id)}>
                            Megnyitás
                          </AdminButton>
                          <button
                            type="button"
                            disabled
                            title="A dokumentumba illesztés későbbi patchben lesz aktiválható."
                            className="rounded-[5px] border border-[#DDD7CA] bg-white px-3 py-1.5 text-[11px] font-semibold text-[#7B776D] disabled:cursor-not-allowed"
                          >
                            Beszúrás
                          </button>
                        </div>
                      </div>
                    </article>
                  ))}
                </div>
              )}
            </section>
          </div>

          <aside className="space-y-4">
            <section className="rounded-[10px] border border-[#D8CFB6] bg-white p-4">
              <h2 className="font-serif text-xl font-medium text-[#1F2821]">Záradék részletei</h2>
              {!selectedClause ? (
                <div className="mt-3 rounded-[8px] border border-dashed border-[#DDD7CA] bg-[#FBF9F3] p-4 text-[11px] text-[#6D6A62]">
                  Válassz ki egy záradékot a listából a részletek megnyitásához.
                </div>
              ) : (
                <div className="mt-3 space-y-3">
                  <div className="rounded-[8px] border border-[#EEE7D9] bg-[#FBF9F3] p-3">
                    <h3 className="text-sm font-semibold text-[#1F2821]">{selectedClause.title}</h3>
                    <p className="mt-1 text-[11px] text-[#6D6A62]">{selectedClause.summary || "Ehhez a tételhez még nincs külön rövid magyarázat rögzítve."}</p>
                  </div>
                  <div className="rounded-[8px] border border-[#EEE7D9] bg-white p-3 text-[11px] text-[#514D45]">
                    <p><span className="font-semibold text-[#1F2821]">Státusz:</span> {getStatusLabel(selectedClause)}</p>
                    <p className="mt-1"><span className="font-semibold text-[#1F2821]">Utolsó frissítés:</span> {formatDate(selectedClause.updatedAt)}</p>
                    <p className="mt-1"><span className="font-semibold text-[#1F2821]">House style kompatibilitás:</span> Későbbi patchben kapcsolható.</p>
                    <p className="mt-1"><span className="font-semibold text-[#1F2821]">Kapcsolódó jogi referencia:</span> Külön mezőként későbbi patchben.</p>
                  </div>
                  <div className="rounded-[8px] border border-[#EEE7D9] bg-white p-3 text-[11px] text-[#514D45]">
                    <p className="font-semibold text-[#1F2821]">Használati iránymutatás</p>
                    <p className="mt-1">Mikor használd: a strukturált “when to use” mező későbbi patchben kerül be.</p>
                    <p className="mt-1">Mikor ne használd: a strukturált “when not to use” mező későbbi patchben kerül be.</p>
                  </div>
                  <div className="rounded-[8px] border border-[#EEE7D9] bg-white p-3">
                    <p className="text-[10px] font-bold uppercase tracking-[0.14em] text-[#7B776D]">Szövegelőnézet</p>
                    <p className="mt-2 whitespace-pre-wrap text-[12px] leading-6 text-[#1F2821]">
                      {selectedClause.body.length > 900 ? `${selectedClause.body.slice(0, 900)}...` : selectedClause.body}
                    </p>
                  </div>
                </div>
              )}
            </section>

            <section className="rounded-[10px] border border-[#D8CFB6] bg-white p-4">
              <h2 className="font-serif text-xl font-medium text-[#1F2821]">Kapcsolódó munkamódok</h2>
              <div className="mt-3 space-y-2">
                {[
                  "Szerződéskészítés",
                  "Szerződésátnézés",
                  "Perirat szövegblokkok",
                  "Ügyfél house style",
                ].map((item) => (
                  <div key={item} className="flex items-center justify-between rounded-[6px] border border-[#EEE7D9] bg-[#FBF9F3] px-3 py-2">
                    <span className="text-[11px] text-[#1F2821]">{item}</span>
                    <AdminStatusPill tone="neutral">Foundation</AdminStatusPill>
                  </div>
                ))}
              </div>
            </section>
          </aside>
        </section>
      </div>
    </div>
  );
}
