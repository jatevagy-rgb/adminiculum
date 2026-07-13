"use client";

/**
 * CaseMatterDossierPanel — WORKFLOW-CORE-LITIGATION-CASE-LIFECYCLE-1
 *
 * Operational matter dossier: case lifecycle status + closure readiness +
 * backend-derived lifecycle actions, plus the read-only litigation dossier
 * (evidence, pleadings, procedural dates). All actions are gated by
 * backend capabilities; unsupported areas are shown truthfully rather than as
 * decorative empty panels. Document content is never displayed.
 */

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { AdminBadge, AdminButton, AdminPanel, AdminSectionHeader, AdminStatusPill } from "@/components/adminiculum/ui";
import {
  archiveCaseLifecycle,
  closeCaseLifecycle,
  getCaseLifecycle,
  getCaseLitigationDossier,
  reopenCaseLifecycle,
  type CaseLifecycleResponse,
  type LitigationDossierResponse,
} from "@/lib/api";

type Props = {
  caseId: string;
  compact?: boolean;
};

const CATEGORY_LABELS: Record<string, string> = {
  INTAKE: "Beérkezés",
  ACTIVE: "Aktív",
  ON_HOLD: "Felfüggesztve",
  CLOSING: "Lezárás alatt",
  CLOSED: "Lezárva",
  ARCHIVED: "Archiválva",
};

const CATEGORY_TONE: Record<string, "green" | "gold" | "amber" | "neutral" | "sage" | "blue"> = {
  INTAKE: "blue",
  ACTIVE: "green",
  ON_HOLD: "amber",
  CLOSING: "gold",
  CLOSED: "neutral",
  ARCHIVED: "neutral",
};

function formatDate(value?: string | null): string {
  if (!value) return "—";
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? "—" : date.toLocaleDateString("hu-HU");
}

export function CaseMatterDossierPanel({ caseId, compact = false }: Props) {
  const [lifecycle, setLifecycle] = useState<CaseLifecycleResponse | null>(null);
  const [dossier, setDossier] = useState<LitigationDossierResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [lc, ds] = await Promise.all([getCaseLifecycle(caseId), getCaseLitigationDossier(caseId)]);
      setLifecycle(lc);
      setDossier(ds);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Nem sikerült betölteni az ügy dossziéját.");
    } finally {
      setLoading(false);
    }
  }, [caseId]);

  useEffect(() => {
    void load();
  }, [load]);

  const runAction = useCallback(
    async (action: () => Promise<CaseLifecycleResponse>) => {
      setBusy(true);
      setActionError(null);
      try {
        const updated = await action();
        setLifecycle(updated);
        // Refresh the dossier so procedural dates / counts stay consistent.
        void getCaseLitigationDossier(caseId).then(setDossier).catch(() => undefined);
      } catch (err) {
        setActionError(err instanceof Error ? err.message : "A művelet nem hajtható végre.");
      } finally {
        setBusy(false);
      }
    },
    [caseId]
  );

  if (loading) {
    return (
      <AdminPanel className="p-4">
        <p className="text-[12px] text-[#7A8479]">Ügydosszié betöltése…</p>
      </AdminPanel>
    );
  }

  if (error) {
    return (
      <AdminPanel className="p-4">
        <p className="text-[12px] text-[#8B2A2A]">{error}</p>
        <AdminButton size="sm" className="mt-2" onClick={() => void load()}>
          Újratöltés
        </AdminButton>
      </AdminPanel>
    );
  }

  if (!lifecycle || !dossier) return null;

  const category = lifecycle.lifecycleCategory;
  const caps = lifecycle.capabilities;
  const ready = lifecycle.closureReadiness.ready;

  return (
    <AdminPanel className="overflow-hidden">
      <AdminSectionHeader
        eyebrow="Peres ügydosszié"
        title="Ügy állapota és jogi munka"
        subtitle="Operatív állapot — nem jogi következtetés."
        action={
          <AdminStatusPill tone={CATEGORY_TONE[category] || "neutral"}>
            {CATEGORY_LABELS[category] || category}
          </AdminStatusPill>
        }
      />

      <div className="grid gap-3 px-4 py-3 sm:grid-cols-3">
        <div>
          <p className="text-[10.5px] font-bold uppercase tracking-[0.12em] text-[#7A8479]">Felelős ügyvéd</p>
          <p className="text-[13px] text-[#16201A]">{lifecycle.responsibleLawyer?.displayName || "Nincs kijelölve"}</p>
        </div>
        <div>
          <p className="text-[10.5px] font-bold uppercase tracking-[0.12em] text-[#7A8479]">Megnyitva</p>
          <p className="text-[13px] text-[#16201A]">{formatDate(lifecycle.openedAt)}</p>
        </div>
        <div>
          <p className="text-[10.5px] font-bold uppercase tracking-[0.12em] text-[#7A8479]">Következő eljárási dátum</p>
          <p className="text-[13px] text-[#16201A]">
            {dossier.proceduralDates[0] ? formatDate(dossier.proceduralDates[0].dueAt) : "—"}
          </p>
        </div>
      </div>

      {/* Closure readiness */}
      <div className="border-t border-[rgba(22,32,26,0.10)] px-4 py-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <span className="text-[12px] font-semibold text-[#16201A]">Lezárási készenlét</span>
            {ready ? (
              <AdminBadge tone="green" dot>
                Operatívan lezárható
              </AdminBadge>
            ) : (
              <AdminBadge tone="amber" dot>
                Feltételek nem teljesülnek
              </AdminBadge>
            )}
          </div>
          <div className="flex flex-wrap gap-2">
            {caps.canClose ? (
              <AdminButton size="sm" variant="primary" disabled={busy} onClick={() => void runAction(() => closeCaseLifecycle(caseId))}>
                Ügy lezárása
              </AdminButton>
            ) : null}
            {caps.canReopen ? (
              <AdminButton size="sm" variant="neutral" disabled={busy} onClick={() => void runAction(() => reopenCaseLifecycle(caseId))}>
                Újranyitás
              </AdminButton>
            ) : null}
            {caps.canArchive ? (
              <AdminButton size="sm" variant="muted" disabled={busy} onClick={() => void runAction(() => archiveCaseLifecycle(caseId))}>
                Archiválás
              </AdminButton>
            ) : null}
          </div>
        </div>

        {!ready && lifecycle.blockers.length > 0 ? (
          <ul className="mt-2 space-y-1">
            {lifecycle.blockers.map((blocker) => (
              <li key={blocker.code} className="flex items-center gap-2 text-[12px] text-[#7d530a]">
                <span className="h-1.5 w-1.5 rounded-full bg-current" />
                <span>
                  {blocker.label}
                  {typeof blocker.count === "number" ? ` (${blocker.count})` : ""}
                </span>
                {blocker.href ? (
                  <Link href={blocker.href} className="underline">
                    megnyitás
                  </Link>
                ) : null}
              </li>
            ))}
          </ul>
        ) : null}

        {actionError ? <p className="mt-2 text-[12px] text-[#8B2A2A]">{actionError}</p> : null}
      </div>

      {!compact ? (
        <>
          {/* Evidence */}
          <DossierSection
            title="Bizonyítékok"
            available={dossier.availability.evidence}
            emptyLabel="Nincs bizonyítékként kategorizált dokumentum."
            unavailableLabel="A strukturált bizonyíték-kezelés jelenleg nem elérhető."
            count={dossier.evidence.length}
          >
            <ul className="space-y-1">
              {dossier.evidence.map((item) => (
                <li key={item.id} className="flex items-center justify-between gap-2 text-[12px] text-[#16201A]">
                  <span className="truncate">{item.displayName}</span>
                  <AdminBadge tone="neutral">{item.relation}</AdminBadge>
                </li>
              ))}
            </ul>
            {!dossier.availability.issueEvidenceRelations ? (
              <p className="mt-2 text-[11px] italic text-[#7A8479]">
                Bizonyíték–jogkérdés kapcsolatok nem elérhetők (nincs strukturált modell).
              </p>
            ) : null}
          </DossierSection>

          {/* Pleadings */}
          <DossierSection
            title="Beadványok"
            available={dossier.availability.pleadings}
            emptyLabel="Nincs beadványként (bírósági irat) kategorizált dokumentum."
            unavailableLabel="A beadvány-kezelés jelenleg nem elérhető."
            count={dossier.pleadings.length}
          >
            <ul className="space-y-1">
              {dossier.pleadings.map((item) => (
                <li key={item.id} className="flex items-center justify-between gap-2 text-[12px] text-[#16201A]">
                  <span className="truncate">{item.displayName}</span>
                  <span className="text-[11px] text-[#7A8479]">
                    {item.relatedTaskIds.length > 0 ? `${item.relatedTaskIds.length} feladat` : "—"}
                  </span>
                </li>
              ))}
            </ul>
            {!dossier.availability.filingStatus ? (
              <p className="mt-2 text-[11px] italic text-[#7A8479]">
                Benyújtási állapot nem elérhető (nincs strukturált mező).
              </p>
            ) : null}
          </DossierSection>

          {/* Procedural dates */}
          <DossierSection
            title="Eljárási dátumok"
            available={dossier.availability.proceduralDates}
            emptyLabel="Nincs közelgő eljárási dátum."
            unavailableLabel="Eljárási dátumok nem elérhetők."
            count={dossier.proceduralDates.length}
          >
            <ul className="space-y-1">
              {dossier.proceduralDates.map((item) => (
                <li key={item.id} className="flex items-center justify-between gap-2 text-[12px] text-[#16201A]">
                  <span className="truncate">{item.title}</span>
                  <span className="text-[11px] text-[#7A8479]">{formatDate(item.dueAt)}</span>
                </li>
              ))}
            </ul>
          </DossierSection>

          {/* Issues — truthfully unavailable */}
          {!dossier.availability.issues ? (
            <div className="border-t border-[rgba(22,32,26,0.10)] px-4 py-3">
              <p className="text-[12px] font-semibold text-[#16201A]">Jogkérdések és álláspontok</p>
              <p className="mt-1 text-[11px] italic text-[#7A8479]">
                A strukturált jogkérdés-modell jelenleg nem elérhető. A rendszer nem következtet jogkérdéseket a
                szövegből.
              </p>
            </div>
          ) : null}
        </>
      ) : (
        <div className="border-t border-[rgba(22,32,26,0.10)] px-4 py-3">
          <Link href={`/litigation-workspace?caseId=${encodeURIComponent(caseId)}`} className="text-[12px] font-semibold text-[#2D4A7C] underline">
            Peres munkaterület megnyitása →
          </Link>
        </div>
      )}
    </AdminPanel>
  );
}

function DossierSection({
  title,
  available,
  count,
  emptyLabel,
  unavailableLabel,
  children,
}: {
  title: string;
  available: boolean;
  count: number;
  emptyLabel: string;
  unavailableLabel: string;
  children: React.ReactNode;
}) {
  return (
    <div className="border-t border-[rgba(22,32,26,0.10)] px-4 py-3">
      <div className="mb-1 flex items-center justify-between">
        <p className="text-[12px] font-semibold text-[#16201A]">{title}</p>
        {available ? <AdminBadge tone="neutral">{count}</AdminBadge> : null}
      </div>
      {!available ? (
        <p className="text-[11px] italic text-[#7A8479]">{unavailableLabel}</p>
      ) : count === 0 ? (
        <p className="text-[11px] italic text-[#7A8479]">{emptyLabel}</p>
      ) : (
        children
      )}
    </div>
  );
}
