"use client";

import { useCallback, useEffect, useId, useState, type ReactNode } from "react";
import {
  complianceCenterApi,
  type LegalSourceObservationDecision,
  type LegalSourceObservationDetail,
  type LegalSourceObservationKind,
  type LegalSourceObservationListItem,
  type LegalSourceObservationReviewStatus,
} from "@/lib/complianceCenterApi";
import { ApiError } from "@/lib/api";
import {
  DataTable,
  DataTableBody,
  DataTableCell,
  DataTableHead,
  DataTableHeaderCell,
  DataTableRow,
} from "@/components/ui";
import { ConfirmationDialog } from "@/components/ui/ConfirmationDialog";
import { AdminBadge, AdminButton } from "@/components/adminiculum/ui";
import { CompactState, SafePanelError } from "@/components/adminiculum/OperationalPrimitives";

type BadgeTone = "green" | "gold" | "amber" | "blue" | "sage" | "violet" | "burgundy" | "neutral";

const PAGE_SIZE = 25;

const reviewStatusLabels: Record<LegalSourceObservationReviewStatus, string> = {
  NEW: "Új",
  IN_REVIEW: "Felülvizsgálat alatt",
  NO_IMPACT: "Nincs további hatásvizsgálat",
  IMPACT_CONFIRMED: "Hatásvizsgálat szükséges",
  REJECTED: "Elutasítva",
};

const reviewStatusTones: Record<LegalSourceObservationReviewStatus, BadgeTone> = {
  NEW: "blue",
  IN_REVIEW: "amber",
  NO_IMPACT: "neutral",
  IMPACT_CONFIRMED: "gold",
  REJECTED: "neutral",
};

const observationKindLabels: Record<LegalSourceObservationKind, string> = {
  AMENDMENT_PUBLISHED: "Módosítás közzétéve",
  CONSOLIDATED_VERSION_AVAILABLE: "Egységes szerkezetű változat elérhető",
};

const terminalStatusCopy: Partial<Record<LegalSourceObservationReviewStatus, string>> = {
  NO_IMPACT: "A jogforrás-esemény emberi felülvizsgálata alapján nincs szükség további hatásvizsgálatra.",
  IMPACT_CONFIRMED:
    "A forrásváltozás további hatásvizsgálatot igényel. Ez önmagában nem jelent ügyféloldali meg nem felelést.",
  REJECTED: "Az esemény a felülvizsgálati folyamatban elutasításra került. Az eredeti megfigyelési adat megmarad.",
};

function statusLabel(status: LegalSourceObservationReviewStatus): string {
  return reviewStatusLabels[status] ?? status;
}

function kindLabel(kind: LegalSourceObservationKind): string {
  return observationKindLabels[kind] ?? kind;
}

function formatDate(value: string | null): string {
  if (!value) return "—";
  try {
    return new Date(value).toLocaleDateString("hu-HU");
  } catch {
    return value;
  }
}

function formatDateTime(value: string | null): string {
  if (!value) return "—";
  try {
    return new Date(value).toLocaleString("hu-HU", { dateStyle: "short", timeStyle: "short" });
  } catch {
    return value;
  }
}

function reviewerLabel(
  reviewer: { name: string } | null,
  at: string | null,
): string {
  if (reviewer && at) return `${reviewer.name} · ${formatDateTime(at)}`;
  if (reviewer) return reviewer.name;
  return "—";
}

function DetailItem({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="min-w-0">
      <dt className="text-[10px] uppercase tracking-[0.14em] text-[var(--adm-text-muted)]">{label}</dt>
      <dd className="mt-0.5 break-words text-[13px] text-[var(--adm-text)]">{children}</dd>
    </div>
  );
}

export function LegalSourceObservationReviewPanel() {
  const reviewStatusFilterId = useId();
  const kindFilterId = useId();
  const sourceIdentifierFilterId = useId();
  const noteId = useId();

  const [items, setItems] = useState<LegalSourceObservationListItem[]>([]);
  const [total, setTotal] = useState(0);
  const [offset, setOffset] = useState(0);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);

  const [reviewStatusFilter, setReviewStatusFilter] = useState<"" | LegalSourceObservationReviewStatus>("");
  const [kindFilter, setKindFilter] = useState<"" | LegalSourceObservationKind>("");
  const [sourceIdentifierInput, setSourceIdentifierInput] = useState("");
  const [sourceIdentifierFilter, setSourceIdentifierFilter] = useState("");

  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [detail, setDetail] = useState<LegalSourceObservationDetail | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [detailError, setDetailError] = useState<string | null>(null);

  const [note, setNote] = useState("");
  const [actionBusy, setActionBusy] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);
  const [confirmRejectOpen, setConfirmRejectOpen] = useState(false);

  const loadPage = useCallback(
    (nextOffset: number) => {
      setLoadError(null);
      if (nextOffset === 0) setLoading(true);
      else setLoadingMore(true);
      return complianceCenterApi
        .listLegalSourceObservations({
          reviewStatus: reviewStatusFilter || undefined,
          kind: kindFilter || undefined,
          sourceIdentifier: sourceIdentifierFilter || undefined,
          limit: PAGE_SIZE,
          offset: nextOffset,
        })
        .then((result) => {
          setItems((current) => (nextOffset === 0 ? result.items : [...current, ...result.items]));
          setTotal(result.pagination.total);
          setOffset(nextOffset);
        })
        .catch(() => {
          setLoadError("A beérkezett jogforrás-változások jelenleg nem tölthetők be.");
        })
        .finally(() => {
          setLoading(false);
          setLoadingMore(false);
        });
    },
    [reviewStatusFilter, kindFilter, sourceIdentifierFilter],
  );

  useEffect(() => {
    setSelectedId(null);
    setDetail(null);
    setDetailError(null);
    setActionError(null);
    void loadPage(0);
  }, [loadPage]);

  const openDetail = useCallback((id: string) => {
    setSelectedId(id);
    setDetail(null);
    setDetailError(null);
    setActionError(null);
    setNote("");
    setDetailLoading(true);
    complianceCenterApi
      .getLegalSourceObservation(id)
      .then(setDetail)
      .catch(() => setDetailError("A tétel részletei jelenleg nem érhetők el."))
      .finally(() => setDetailLoading(false));
  }, []);

  const refreshSelectedDetail = useCallback((id: string) => {
    complianceCenterApi
      .getLegalSourceObservation(id)
      .then((updated) => {
        setDetail(updated);
        setDetailError(null);
      })
      .catch(() => setDetailError("A tétel részletei jelenleg nem érhetők el."));
  }, []);

  const handleActionError = useCallback(
    (error: unknown) => {
      const status = error instanceof ApiError ? error.status : 0;
      if (status === 409) {
        setActionError(
          "A tételt időközben másik felülvizsgáló módosította. Az adatok újratöltésre kerültek, a művelet nem ismétlődik automatikusan.",
        );
        void loadPage(0);
        if (selectedId) refreshSelectedDetail(selectedId);
        return;
      }
      if (status === 404) {
        setActionError("A tétel már nem található. A lista frissítésre került.");
        setSelectedId(null);
        setDetail(null);
        void loadPage(0);
        return;
      }
      if (status === 400) {
        setActionError("A művelet a megadott adatokkal nem hajtható végre.");
        return;
      }
      setActionError("A művelet jelenleg nem hajtható végre. Próbáld újra később.");
    },
    [loadPage, refreshSelectedDetail, selectedId],
  );

  const runStartReview = () => {
    if (!selectedId || actionBusy) return;
    setActionBusy(true);
    setActionError(null);
    complianceCenterApi
      .startLegalSourceObservationReview(selectedId)
      .then((updated) => {
        setDetail(updated);
        void loadPage(0);
      })
      .catch(handleActionError)
      .finally(() => setActionBusy(false));
  };

  const submitDecision = (decision: LegalSourceObservationDecision) => {
    if (!selectedId || actionBusy) return;
    setActionBusy(true);
    setActionError(null);
    complianceCenterApi
      .decideLegalSourceObservationReview(selectedId, decision, note)
      .then((updated) => {
        setDetail(updated);
        setNote("");
        void loadPage(0);
      })
      .catch(handleActionError)
      .finally(() => setActionBusy(false));
  };

  const selectClass =
    "w-full rounded-[var(--adm-radius-sm)] border border-[var(--adm-border)] bg-white px-2.5 py-1.5 text-[12px] text-[var(--adm-text)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--adm-green-800)]";

  const canStartReview = detail?.reviewStatus === "NEW";
  const canDecide = detail?.reviewStatus === "IN_REVIEW";
  const terminalCopy = detail ? terminalStatusCopy[detail.reviewStatus] : undefined;
  const hasMore = offset + items.length < total;

  return (
    <div className="space-y-5">
      <section className="rounded-[var(--adm-radius-md)] border border-[var(--adm-border)] bg-white p-4">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div>
            <h2 className="text-[10px] uppercase tracking-[0.2em] text-[var(--adm-green-800)]">
              Beérkezett jogforrás-változások
            </h2>
            <p className="mt-1 text-xs text-[var(--adm-text-muted)]">
              Emberi felülvizsgálati sor a beérkezett jogforrás-megfigyelésekhez. A döntés az esemény emberi értékelése,
              önmagában nem állapít meg ügyféloldali meg nem felelést.
            </p>
          </div>
          <AdminBadge tone="neutral">{total} tétel</AdminBadge>
        </div>

        <div className="mt-3 flex flex-wrap items-end gap-3">
          <div className="w-full sm:w-44">
            <label htmlFor={reviewStatusFilterId} className="block text-[11px] font-semibold text-[var(--adm-text-muted)]">
              Állapot
            </label>
            <select
              id={reviewStatusFilterId}
              value={reviewStatusFilter}
              onChange={(event) =>
                setReviewStatusFilter(event.target.value as "" | LegalSourceObservationReviewStatus)
              }
              className={`${selectClass} mt-1`}
            >
              <option value="">Összes állapot</option>
              {Object.entries(reviewStatusLabels).map(([value, label]) => (
                <option key={value} value={value}>
                  {label}
                </option>
              ))}
            </select>
          </div>

          <div className="w-full sm:w-52">
            <label htmlFor={kindFilterId} className="block text-[11px] font-semibold text-[var(--adm-text-muted)]">
              Esemény
            </label>
            <select
              id={kindFilterId}
              value={kindFilter}
              onChange={(event) => setKindFilter(event.target.value as "" | LegalSourceObservationKind)}
              className={`${selectClass} mt-1`}
            >
              <option value="">Összes esemény</option>
              {Object.entries(observationKindLabels).map(([value, label]) => (
                <option key={value} value={value}>
                  {label}
                </option>
              ))}
            </select>
          </div>

          <form
            className="flex w-full items-end gap-2 sm:w-auto"
            onSubmit={(event) => {
              event.preventDefault();
              setSourceIdentifierFilter(sourceIdentifierInput.trim());
            }}
          >
            <div className="w-full sm:w-48">
              <label
                htmlFor={sourceIdentifierFilterId}
                className="block text-[11px] font-semibold text-[var(--adm-text-muted)]"
              >
                Jogforrás-azonosító
              </label>
              <input
                id={sourceIdentifierFilterId}
                type="text"
                value={sourceIdentifierInput}
                onChange={(event) => setSourceIdentifierInput(event.target.value)}
                placeholder="CELEX pl. 32016R0679"
                className={`${selectClass} mt-1`}
              />
            </div>
            <AdminButton size="sm" variant="neutral" type="submit">
              Szűrés
            </AdminButton>
          </form>
        </div>

        <div className="mt-4">
          {loading ? (
            <CompactState title="Beérkezett jogforrás-változások betöltése…" />
          ) : loadError && items.length === 0 ? (
            <SafePanelError onRetry={() => void loadPage(0)} detail={loadError} />
          ) : items.length === 0 ? (
            <CompactState
              title="Nincs megjeleníthető tétel"
              detail="A szűrőfeltételeknek megfelelő beérkezett jogforrás-változás jelenleg nincs."
            />
          ) : (
            <>
              {loadError ? (
                <div className="mb-3">
                  <CompactState
                    tone="error"
                    title="A lista frissítése nem sikerült."
                    detail={loadError}
                    action={
                      <AdminButton size="sm" variant="neutral" onClick={() => void loadPage(0)}>
                        Újratöltés
                      </AdminButton>
                    }
                  />
                </div>
              ) : null}
              <DataTable minWidth={1080}>
                <DataTableHead>
                  <DataTableHeaderCell>Állapot</DataTableHeaderCell>
                  <DataTableHeaderCell>Esemény</DataTableHeaderCell>
                  <DataTableHeaderCell>Jogforrás</DataTableHeaderCell>
                  <DataTableHeaderCell>Kapcsolódó azonosító</DataTableHeaderCell>
                  <DataTableHeaderCell>Észlelve</DataTableHeaderCell>
                  <DataTableHeaderCell>Beérkezett</DataTableHeaderCell>
                  <DataTableHeaderCell>Felülvizsgáló</DataTableHeaderCell>
                  <DataTableHeaderCell>Művelet</DataTableHeaderCell>
                </DataTableHead>
                <DataTableBody>
                  {items.map((item) => (
                    <DataTableRow key={item.id} selected={selectedId === item.id}>
                      <DataTableCell>
                        <AdminBadge tone={reviewStatusTones[item.reviewStatus]}>
                          {statusLabel(item.reviewStatus)}
                        </AdminBadge>
                      </DataTableCell>
                      <DataTableCell className="font-medium text-[var(--adm-text)]">
                        {kindLabel(item.kind)}
                      </DataTableCell>
                      <DataTableCell>{item.sourceIdentifier}</DataTableCell>
                      <DataTableCell muted>{item.relatedIdentifier}</DataTableCell>
                      <DataTableCell muted>{formatDate(item.capturedAt)}</DataTableCell>
                      <DataTableCell muted>{formatDate(item.ingestedAt)}</DataTableCell>
                      <DataTableCell muted>
                        {item.decidedBy?.name || item.reviewStartedBy?.name || "—"}
                      </DataTableCell>
                      <DataTableCell>
                        <AdminButton
                          size="sm"
                          variant="neutral"
                          onClick={() => openDetail(item.id)}
                          aria-pressed={selectedId === item.id}
                        >
                          Megnyitás
                        </AdminButton>
                      </DataTableCell>
                    </DataTableRow>
                  ))}
                </DataTableBody>
              </DataTable>
              {hasMore ? (
                <div className="mt-3 flex items-center justify-between gap-2">
                  <span className="text-[11px] text-[var(--adm-text-muted)]">
                    {items.length} / {total} tétel megjelenítve
                  </span>
                  <AdminButton
                    size="sm"
                    variant="neutral"
                    onClick={() => void loadPage(offset + PAGE_SIZE)}
                    disabled={loadingMore}
                  >
                    {loadingMore ? "Betöltés…" : "Továbbiak betöltése"}
                  </AdminButton>
                </div>
              ) : null}
            </>
          )}
        </div>
      </section>

      {selectedId ? (
        <section className="rounded-[var(--adm-radius-md)] border border-[var(--adm-border)] bg-white p-4">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div>
              <h2 className="text-[10px] uppercase tracking-[0.2em] text-[var(--adm-green-800)]">
                Jogforrás-esemény részletei
              </h2>
              <p className="mt-1 text-xs text-[var(--adm-text-muted)]">
                Belső felülvizsgálati nézet. Az eredeti megfigyelési adat a döntéstől függetlenül megmarad.
              </p>
            </div>
            {detail ? (
              <AdminBadge tone={reviewStatusTones[detail.reviewStatus]} dot>
                {statusLabel(detail.reviewStatus)}
              </AdminBadge>
            ) : null}
          </div>

          {detailLoading ? (
            <p className="mt-3 text-sm text-[var(--adm-text-muted)]">Részletek betöltése…</p>
          ) : detailError ? (
            <div className="mt-3">
              <SafePanelError detail={detailError} onRetry={() => openDetail(selectedId)} />
            </div>
          ) : detail ? (
            <>
              <dl className="mt-4 grid gap-x-6 gap-y-3 sm:grid-cols-2">
                <DetailItem label="Esemény">{kindLabel(detail.kind)}</DetailItem>
                <DetailItem label="Jogforrás azonosító">{detail.sourceIdentifier}</DetailItem>
                <DetailItem label="Kapcsolódó azonosító">{detail.relatedIdentifier}</DetailItem>
                <DetailItem label="Forrás">
                  <a
                    href={detail.sourceUri}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="break-all text-[var(--adm-green-800)] hover:underline"
                  >
                    {detail.sourceUri}
                  </a>
                </DetailItem>
                <DetailItem label="Észlelve">{formatDateTime(detail.capturedAt)}</DetailItem>
                <DetailItem label="Beérkezett">{formatDateTime(detail.ingestedAt)}</DetailItem>
                <DetailItem label="Hatály kezdete">{formatDate(detail.effectiveFrom)}</DetailItem>
                <DetailItem label="Állapot">{statusLabel(detail.reviewStatus)}</DetailItem>
              </dl>

              {detail.legalSource ? (
                <div className="mt-4 rounded border border-[var(--adm-border)] p-3">
                  <p className="text-[10px] uppercase tracking-[0.14em] text-[var(--adm-text-muted)]">
                    Kapcsolt jogforrás
                  </p>
                  <p className="mt-1 text-[13px] font-medium text-[var(--adm-text)]">
                    {detail.legalSource.canonicalCitation || detail.legalSource.sourceKey}
                  </p>
                  {detail.legalSource.title ? (
                    <p className="mt-0.5 text-[11px] text-[var(--adm-text-muted)]">{detail.legalSource.title}</p>
                  ) : null}
                </div>
              ) : null}

              {detail.legalSourceVersion ? (
                <div className="mt-3 rounded border border-[var(--adm-border)] p-3">
                  <p className="text-[10px] uppercase tracking-[0.14em] text-[var(--adm-text-muted)]">
                    Kapcsolt jogforrás-verzió
                  </p>
                  <p className="mt-1 text-[13px] font-medium text-[var(--adm-text)]">
                    {detail.legalSourceVersion.legalVersionKey}
                  </p>
                  <p className="mt-0.5 text-[11px] text-[var(--adm-text-muted)]">
                    Hatály kezdete: {formatDate(detail.legalSourceVersion.effectiveFrom)}
                  </p>
                </div>
              ) : null}

              <dl className="mt-4 grid gap-x-6 gap-y-3 border-t border-[var(--adm-border)] pt-4 sm:grid-cols-2">
                <DetailItem label="Felülvizsgálat kezdve">
                  {reviewerLabel(detail.reviewStartedBy, detail.reviewStartedAt)}
                </DetailItem>
                <DetailItem label="Döntés">{reviewerLabel(detail.decidedBy, detail.decidedAt)}</DetailItem>
                <DetailItem label="Döntés megjegyzése">{detail.decisionNote || "—"}</DetailItem>
              </dl>

              {canStartReview ? (
                <div className="mt-4 flex flex-wrap items-center gap-2">
                  <AdminButton size="sm" variant="primary" onClick={runStartReview} disabled={actionBusy}>
                    Felülvizsgálat megkezdése
                  </AdminButton>
                </div>
              ) : null}

              {canDecide ? (
                <div className="mt-4 space-y-3">
                  <div>
                    <label htmlFor={noteId} className="block text-[12px] font-semibold text-[var(--adm-text)]">
                      Felülvizsgálati megjegyzés (nem kötelező)
                    </label>
                    <textarea
                      id={noteId}
                      value={note}
                      onChange={(event) => setNote(event.target.value)}
                      maxLength={2000}
                      rows={3}
                      placeholder="A döntés rövid indoklása…"
                      className="mt-1 w-full rounded-[var(--adm-radius-sm)] border border-[var(--adm-border)] bg-white px-3 py-2 text-[13px] text-[var(--adm-text)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--adm-green-800)]"
                    />
                    <p className="mt-1 text-[11px] text-[var(--adm-text-muted)]">{note.length}/2000 karakter</p>
                  </div>
                  <div className="flex flex-wrap items-center gap-2">
                    <AdminButton
                      size="sm"
                      variant="neutral"
                      onClick={() => submitDecision("NO_IMPACT")}
                      disabled={actionBusy}
                    >
                      Nincs további hatásvizsgálat
                    </AdminButton>
                    <AdminButton
                      size="sm"
                      variant="warning"
                      onClick={() => submitDecision("IMPACT_CONFIRMED")}
                      disabled={actionBusy}
                    >
                      Hatásvizsgálat szükséges
                    </AdminButton>
                    <AdminButton
                      size="sm"
                      variant="danger"
                      onClick={() => setConfirmRejectOpen(true)}
                      disabled={actionBusy}
                    >
                      Elutasítás
                    </AdminButton>
                  </div>
                </div>
              ) : null}

              {terminalCopy ? (
                <p className="mt-4 rounded-[var(--adm-radius-sm)] border border-[var(--adm-border)] bg-[var(--adm-surface)] px-3 py-2 text-[12px] text-[var(--adm-text)]">
                  {terminalCopy}
                </p>
              ) : null}

              {actionBusy ? (
                <p role="status" className="mt-3 text-[11px] text-[var(--adm-text-muted)]">
                  Feldolgozás…
                </p>
              ) : null}

              {actionError ? (
                <div className="mt-3">
                  <CompactState tone="error" title="A művelet nem hajtható végre." detail={actionError} />
                </div>
              ) : null}
            </>
          ) : null}
        </section>
      ) : null}

      <ConfirmationDialog
        open={confirmRejectOpen}
        title="Jogforrás-esemény elutasítása"
        description="Az elutasítás lezárja a felülvizsgálatot, és a döntés később nem módosítható. Az eredeti megfigyelési adat megmarad."
        confirmLabel="Elutasítás"
        cancelLabel="Mégse"
        variant="danger"
        busy={actionBusy}
        busyLabel="Feldolgozás…"
        onConfirm={() => {
          setConfirmRejectOpen(false);
          submitDecision("REJECTED");
        }}
        onCancel={() => setConfirmRejectOpen(false)}
      />
    </div>
  );
}
