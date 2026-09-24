"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import {
  complianceCenterApi,
  type ComplianceCenterOverview,
  type OfficeDocumentFamily,
  type OfficeLegalSourceReviewSignal,
} from "@/lib/complianceCenterApi";
import { complianceIntelligenceApi, type ComplianceMonitoringManifest } from "@/lib/complianceIntelligenceApi";
import {
  DataTable,
  DataTableBody,
  DataTableCell,
  DataTableHead,
  DataTableHeaderCell,
  DataTableRow,
} from "@/components/ui";
import { AdminBadge, AdminButton, AdminPanel, AdminStatusPill } from "@/components/adminiculum/ui";
import { CompactState, OperationalPageHeader, SafePanelError } from "@/components/adminiculum/OperationalPrimitives";
import { LegalSourceImpactPanel } from "./LegalSourceImpactPanel";

type View = "overview" | "legal-sources" | "documents" | "review-work";

const workKindLabels: Record<string, string> = {
  FINDING: "Megállapítás",
  STALE_EVIDENCE: "Elavult bizonyíték",
  CONTROL_REVIEW: "Kontroll-felülvizsgálat",
};

function formatDate(value: string | null): string {
  if (!value) return "—";
  try {
    return new Date(value).toLocaleDateString("hu-HU");
  } catch {
    return value;
  }
}

function SummaryStrip({ overview }: { overview: ComplianceCenterOverview }) {
  const cells = [
    { label: "Aktív ügyfelek", value: overview.summary.clientsWithOpenWork },
    { label: "Nyitott megállapítás", value: overview.summary.openFindings },
    { label: "Elavult bizonyíték", value: overview.summary.staleEvidence },
    { label: "Lejárt kontroll-felülvizsgálat", value: overview.summary.controlsNeedingReview },
    { label: "Jogforrás felülvizsgálat", value: overview.summary.legalSourcesReviewRequired },
  ];
  return (
    <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
      {cells.map((cell) => (
        <AdminPanel key={cell.label} className="p-3">
          <p className="text-[10px] uppercase tracking-[0.14em] text-[var(--adm-text-muted)]">{cell.label}</p>
          <p className="mt-1 font-serif text-2xl font-medium text-[var(--adm-text)]">{cell.value}</p>
        </AdminPanel>
      ))}
    </div>
  );
}

function LegalSourcesTable({
  sources,
  onSelect,
  selectedId,
}: {
  sources: OfficeLegalSourceReviewSignal[];
  onSelect: (id: string) => void;
  selectedId: string | null;
}) {
  if (!sources.length) {
    return <CompactState title="Nincs rögzített jogforrás" detail="A jogforrás-nyilvántartás jelenleg üres." />;
  }
  return (
    <DataTable minWidth={900}>
      <DataTableHead>
        <DataTableHeaderCell>Jogforrás</DataTableHeaderCell>
        <DataTableHeaderCell>Verzió</DataTableHeaderCell>
        <DataTableHeaderCell>Felülvizsgálat</DataTableHeaderCell>
        <DataTableHeaderCell>Érintett követelmény</DataTableHeaderCell>
        <DataTableHeaderCell>Érintett dokumentum</DataTableHeaderCell>
        <DataTableHeaderCell>Érintett ügyfél</DataTableHeaderCell>
        <DataTableHeaderCell />
      </DataTableHead>
      <DataTableBody>
        {sources.map((source) => (
          <DataTableRow key={source.legalSourceVersionId} selected={selectedId === source.legalSourceVersionId}>
            <DataTableCell>
              <span className="font-medium text-[var(--adm-text)]">
                {source.canonicalCitation || source.sourceKey}
              </span>
              {source.title ? (
                <span className="block text-[11px] text-[var(--adm-text-muted)]">{source.title}</span>
              ) : null}
            </DataTableCell>
            <DataTableCell muted>{source.versionLabel || "—"}</DataTableCell>
            <DataTableCell>
              {source.reviewRequired ? (
                <AdminBadge tone="amber" dot>Felülvizsgálat szükséges</AdminBadge>
              ) : (
                <AdminBadge tone="green">Aktuális</AdminBadge>
              )}
            </DataTableCell>
            <DataTableCell muted>{source.impactedRequirementCount}</DataTableCell>
            <DataTableCell muted>{source.impactedDocumentCount}</DataTableCell>
            <DataTableCell muted>{source.impactedClientCount}</DataTableCell>
            <DataTableCell>
              <AdminButton
                size="sm"
                variant="neutral"
                onClick={() => onSelect(source.legalSourceVersionId)}
                aria-pressed={selectedId === source.legalSourceVersionId}
              >
                Hatásvizsgálat
              </AdminButton>
            </DataTableCell>
          </DataTableRow>
        ))}
      </DataTableBody>
    </DataTable>
  );
}

export function ComplianceCenter() {
  const [view, setView] = useState<View>("overview");
  const [overview, setOverview] = useState<ComplianceCenterOverview | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedSourceId, setSelectedSourceId] = useState<string | null>(null);
  const [families, setFamilies] = useState<OfficeDocumentFamily[]>([]);
  const [familiesLoading, setFamiliesLoading] = useState(false);
  const [manifest, setManifest] = useState<ComplianceMonitoringManifest | null>(null);
  const [impactKey, setImpactKey] = useState(0);

  const load = useCallback(() => {
    setLoading(true);
    setError(null);
    complianceCenterApi
      .getOverview()
      .then(setOverview)
      .catch(() => setError("A megfelelőségi áttekintés jelenleg nem tölthető be."))
      .finally(() => setLoading(false));
  }, []);

  const loadFamilies = useCallback(() => {
    setFamiliesLoading(true);
    complianceCenterApi
      .getDocumentFamilies()
      .then((result) => setFamilies(result.documentFamilies))
      .catch(() => setFamilies([]))
      .finally(() => setFamiliesLoading(false));
  }, []);

  const loadManifest = useCallback(() => {
    complianceIntelligenceApi
      .monitoringManifest()
      .then(setManifest)
      .catch(() => setManifest(null));
  }, []);

  useEffect(() => {
    load();
    loadFamilies();
    loadManifest();
  }, [load, loadFamilies, loadManifest]);

  const selectedSource = useMemo(
    () => overview?.legalSources.find((source) => source.legalSourceVersionId === selectedSourceId) ?? null,
    [overview, selectedSourceId],
  );

  const reviewWork = overview?.reviewWork ?? [];
  const reviewRequiredSources = overview?.legalSources.filter((source) => source.reviewRequired) ?? [];
  const monitoredFamilies = families.filter((family) => family.legalSources.length > 0);
  const monitoredSourceCount = manifest?.sources.length ?? 0;

  const tabClass = (active: boolean) =>
    `rounded-[var(--adm-radius-sm)] px-3 py-1.5 text-[12px] font-semibold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--adm-green-800)] ${
      active ? "bg-[var(--adm-green-800)] text-white" : "text-[var(--adm-text-muted)] hover:text-[var(--adm-text)]"
    }`;

  return (
    <div className="adm-board-page flex-1 min-h-0 overflow-y-auto">
      <div className="adm-board-container space-y-5">
        <OperationalPageHeader
          title="Megfelelőségi központ"
          subtitle="Irodai szintű megfelelőségi áttekintés a jogosult ügyfelekre. A jogforrás-változás felülvizsgálati kötelezettséget jelez, nem automatikus meg nem felelést."
        />

        <div className="flex flex-wrap items-center gap-1 rounded-[var(--adm-radius-md)] border border-[var(--adm-border)] bg-white p-1" role="tablist" aria-label="Megfelelőségi nézetek">
          <button type="button" role="tab" aria-selected={view === "overview"} className={tabClass(view === "overview")} onClick={() => setView("overview")}>
            Áttekintés
          </button>
          <button type="button" role="tab" aria-selected={view === "legal-sources"} className={tabClass(view === "legal-sources")} onClick={() => setView("legal-sources")}>
            Jogforrás-változások
          </button>
          <button type="button" role="tab" aria-selected={view === "documents"} className={tabClass(view === "documents")} onClick={() => setView("documents")}>
            Dokumentumok
          </button>
          <button type="button" role="tab" aria-selected={view === "review-work"} className={tabClass(view === "review-work")} onClick={() => setView("review-work")}>
            Felülvizsgálati munka
          </button>
        </div>

        {loading ? (
          <CompactState title="Megfelelőségi áttekintés betöltése…" />
        ) : error || !overview ? (
          <SafePanelError onRetry={load} detail={error ?? "A megfelelőségi központ nem érhető el."} />
        ) : view === "overview" ? (
          <>
            <SummaryStrip overview={overview} />
            <section className="rounded-[var(--adm-radius-md)] border border-[var(--adm-border)] bg-white p-4">
              <h2 className="text-[10px] uppercase tracking-[0.2em] text-[var(--adm-green-800)]">Ügyfelek megfelelőségi állapota</h2>
              {overview.clients.length === 0 ? (
                <p className="mt-3 text-sm text-[var(--adm-text-muted)]">Nincs jogosult ügyfél.</p>
              ) : (
                <div className="mt-3">
                  <DataTable minWidth={860}>
                    <DataTableHead>
                      <DataTableHeaderCell>Ügyfél</DataTableHeaderCell>
                      <DataTableHeaderCell>Nyitott megállapítás</DataTableHeaderCell>
                      <DataTableHeaderCell>Elavult bizonyíték</DataTableHeaderCell>
                      <DataTableHeaderCell>Lejárt kontroll-felülvizsgálat</DataTableHeaderCell>
                      <DataTableHeaderCell />
                    </DataTableHead>
                    <DataTableBody>
                      {overview.clients.map((client) => (
                        <DataTableRow key={client.clientId}>
                          <DataTableCell className="font-medium text-[var(--adm-text)]">{client.clientName}</DataTableCell>
                          <DataTableCell muted>{client.openFindings}</DataTableCell>
                          <DataTableCell muted>{client.staleEvidence}</DataTableCell>
                          <DataTableCell muted>{client.controlsNeedingReview}</DataTableCell>
                          <DataTableCell>
                            <Link href={`/clients/${encodeURIComponent(client.clientId)}/compliance`} className="text-[12px] font-semibold text-[var(--adm-green-800)] hover:underline">
                              Megnyitás →
                            </Link>
                          </DataTableCell>
                        </DataTableRow>
                      ))}
                    </DataTableBody>
                  </DataTable>
                </div>
              )}
            </section>
          </>
        ) : view === "legal-sources" ? (
          <div className="space-y-5">
            <section className="rounded-[var(--adm-radius-md)] border border-[var(--adm-border)] bg-white p-4">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <h2 className="text-[10px] uppercase tracking-[0.2em] text-[var(--adm-green-800)]">Jogforrás-nyilvántartás</h2>
                <span className="text-[11px] text-[var(--adm-text-muted)]">
                  {reviewRequiredSources.length} jogforrás igényel felülvizsgálatot
                </span>
              </div>
              <div className="mt-3">
                <LegalSourcesTable
                  sources={overview.legalSources}
                  onSelect={(id) => setSelectedSourceId((current) => (current === id ? null : id))}
                  selectedId={selectedSourceId}
                />
              </div>
            </section>

            {/* AUTOMATIKUS FIGYELÉS vs EMBERI FELÜLVIZSGÁLAT — truthful boundary. */}
            <section className="rounded-[var(--adm-radius-md)] border border-[var(--adm-border)] bg-white p-4">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <h2 className="text-[10px] uppercase tracking-[0.2em] text-[var(--adm-green-800)]">Automatikus figyelés</h2>
                <AdminBadge tone="neutral">{monitoredSourceCount} figyelt jogforrás</AdminBadge>
              </div>
              <p className="mt-2 text-xs text-[var(--adm-text-muted)]">
                A rendszer a már rögzített jogforrás-kötéseket és a pontos dokumentumverzió-hivatkozásokat tartja nyilván. Nem fut folyamatos külső jogforrás-figyelő, ezért az itt megjelenő állapot a legutóbb rögzített kötéseken alapul — friss külső jogváltozás önmagától nem érkezik be.
              </p>
              {manifest && manifest.sources.length > 0 ? (
                <ul className="mt-3 space-y-1">
                  {manifest.sources.map((source) => (
                    <li key={`${source.identifierFamily}-${source.sourceIdentifier}`} className="flex flex-wrap items-center justify-between gap-2 rounded border border-[var(--adm-border)] px-3 py-2 text-xs text-[var(--adm-text)]">
                      <span>
                        <b>{source.sourceIdentifier}</b>
                        <span className="text-[var(--adm-text-muted)]"> · {source.identifierFamily}</span>
                        {source.locators.length ? <span className="text-[var(--adm-text-muted)]"> · {source.locators.join(", ")}</span> : null}
                      </span>
                      <span className="text-[var(--adm-text-muted)]">{source.referenceCount} hivatkozás</span>
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="mt-3 text-sm text-[var(--adm-text-muted)]">Nincs rögzített jogforrás-kötés.</p>
              )}
            </section>

            {selectedSource ? (
              <section className="rounded-[var(--adm-radius-md)] border border-[var(--adm-border)] bg-white p-4">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div>
                    <h2 className="text-[10px] uppercase tracking-[0.2em] text-[var(--adm-green-800)]">Hatásvizsgálat</h2>
                    <p className="mt-1 text-xs text-[var(--adm-text-muted)]">
                      A hatásvizsgálat a már rögzített jogforrás-verzióra fut, a jelenlegi kötések és dokumentumverziók alapján. Nem tölt le és nem hoz létre új jogforrás-verziót.
                    </p>
                  </div>
                  <div className="flex items-center gap-2">
                    <AdminStatusPill tone={selectedSource.reviewRequired ? "amber" : "green"}>
                      {selectedSource.reviewRequired ? "Felülvizsgálat szükséges" : "Aktuális"}
                    </AdminStatusPill>
                    <AdminButton size="sm" variant="neutral" onClick={() => setImpactKey((key) => key + 1)}>
                      Hatásvizsgálat futtatása
                    </AdminButton>
                  </div>
                </div>
                <div className="mt-4">
                  <LegalSourceImpactPanel key={impactKey} legalSourceVersionId={selectedSource.legalSourceVersionId} />
                </div>
              </section>
            ) : null}
          </div>
        ) : view === "documents" ? (
          <section className="rounded-[var(--adm-radius-md)] border border-[var(--adm-border)] bg-white p-4">
            <h2 className="text-[10px] uppercase tracking-[0.2em] text-[var(--adm-green-800)]">Dokumentumok ügyfeleken át</h2>
            <p className="mt-2 text-xs text-[var(--adm-text-muted)]">
              Az azonos nevű belső elemzési dokumentumok közös jogforrás-kötés szerint csoportosítva. A család a dokumentum valódi neve alapján jön létre — nincs mesterséges dokumentum-taxonómia.
            </p>
            {familiesLoading ? (
              <p className="mt-3 text-sm text-[var(--adm-text-muted)]">Dokumentumok betöltése…</p>
            ) : monitoredFamilies.length === 0 ? (
              <p className="mt-3 text-sm text-[var(--adm-text-muted)]">Nincs jogforrás-kötéssel rendelkező dokumentum.</p>
            ) : (
              <div className="mt-3 space-y-4">
                {monitoredFamilies.map((family) => (
                  <div key={family.name} className="rounded border border-[var(--adm-border)] p-3">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <h3 className="text-sm font-semibold text-[var(--adm-text)]">{family.name}</h3>
                      <span className="text-xs text-[var(--adm-text-muted)]">
                        {family.members.length} ügyfél · {family.legalSources.length} jogforrás
                      </span>
                    </div>
                    <div className="mt-2 grid gap-2 sm:grid-cols-2">
                      <div>
                        <p className="text-[10px] uppercase tracking-[0.14em] text-[var(--adm-text-muted)]">Érintett ügyfelek és verziók</p>
                        <ul className="mt-1 space-y-1">
                          {family.members.map((member) => (
                            <li key={member.documentVersionId} className="flex flex-wrap items-center justify-between gap-2 text-xs text-[var(--adm-text)]">
                              <Link href={`/clients/${encodeURIComponent(member.clientId)}/compliance`} className="hover:underline">
                                {member.clientName}
                              </Link>
                              <span className="text-[var(--adm-text-muted)]">
                                v{member.version}{member.isCurrent ? " · aktuális" : ""}
                              </span>
                            </li>
                          ))}
                        </ul>
                      </div>
                      <div>
                        <p className="text-[10px] uppercase tracking-[0.14em] text-[var(--adm-text-muted)]">Kapcsolt jogforrások</p>
                        <ul className="mt-1 space-y-1">
                          {family.legalSources.map((source) => (
                            <li key={source.legalSourceVersionId} className="flex flex-wrap items-center gap-2 text-xs text-[var(--adm-text)]">
                              <span>{source.canonicalCitation || source.sourceKey}</span>
                              {source.reviewRequired ? <AdminBadge tone="amber" dot>Felülvizsgálat szükséges</AdminBadge> : null}
                            </li>
                          ))}
                        </ul>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </section>
        ) : (
          <section className="rounded-[var(--adm-radius-md)] border border-[var(--adm-border)] bg-white p-4">
            <h2 className="text-[10px] uppercase tracking-[0.2em] text-[var(--adm-green-800)]">Felülvizsgálati munka</h2>
            <p className="mt-2 text-xs text-[var(--adm-text-muted)]">
              Levezetett, csak olvasható munkalista a már rögzített megállapításokból, elavult bizonyítékokból és lejárt kontroll-felülvizsgálatokból. Nem egy tartósan kiosztott feladatsor.
            </p>
            {reviewWork.length === 0 ? (
              <p className="mt-3 text-sm text-[var(--adm-text-muted)]">Jelenleg nincs felülvizsgálati tétel.</p>
            ) : (
              <div className="mt-3">
                <DataTable minWidth={860}>
                  <DataTableHead>
                    <DataTableHeaderCell>Típus</DataTableHeaderCell>
                    <DataTableHeaderCell>Tétel</DataTableHeaderCell>
                    <DataTableHeaderCell>Ügyfél</DataTableHeaderCell>
                    <DataTableHeaderCell>Dátum</DataTableHeaderCell>
                  </DataTableHead>
                  <DataTableBody>
                    {reviewWork.map((item) => (
                      <DataTableRow key={`${item.kind}-${item.refId}`}>
                        <DataTableCell>
                          <AdminBadge tone={item.kind === "STALE_EVIDENCE" ? "amber" : "neutral"}>
                            {workKindLabels[item.kind] || item.kind}
                          </AdminBadge>
                        </DataTableCell>
                        <DataTableCell className="font-medium text-[var(--adm-text)]">{item.title}</DataTableCell>
                        <DataTableCell>
                          <Link href={`/clients/${encodeURIComponent(item.clientId)}/compliance`} className="text-[var(--adm-text)] hover:underline">
                            {item.clientName}
                          </Link>
                        </DataTableCell>
                        <DataTableCell muted>{formatDate(item.dueAt)}</DataTableCell>
                      </DataTableRow>
                    ))}
                  </DataTableBody>
                </DataTable>
              </div>
            )}
          </section>
        )}
      </div>
    </div>
  );
}
