"use client";

/**
 * CaseIntakeReadinessPanel — WORKFLOW-CORE-INTAKE-MATTER-OPENING-1
 *
 * Compact intake/opening-readiness section for Case Detail. Shows client,
 * client role, responsible lawyer, conflict-review availability, readiness
 * progress, blockers, and capability-gated activate/decline actions. For
 * already active/closed cases it collapses into a concise opening summary.
 * All state comes from the backend contract; nothing is persisted locally.
 */

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { AdminBadge, AdminButton, AdminPanel, AdminSectionHeader } from "@/components/adminiculum/ui";
import {
  activateMatterIntake,
  declineMatterIntake,
  getCaseIntakeReadiness,
  type MatterIntakeReadinessResponse,
} from "@/lib/api";

const INTAKE_STATUS = "CLIENT_INPUT";

export function CaseIntakeReadinessPanel({ caseId }: { caseId: string }) {
  const [readiness, setReadiness] = useState<MatterIntakeReadinessResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      setReadiness(await getCaseIntakeReadiness(caseId));
    } catch (err) {
      setError(err instanceof Error ? err.message : "A beérkezési állapot nem tölthető be.");
    } finally {
      setLoading(false);
    }
  }, [caseId]);

  useEffect(() => {
    void load();
  }, [load]);

  const runAction = useCallback(async (action: () => Promise<MatterIntakeReadinessResponse>) => {
    setBusy(true);
    setActionError(null);
    try {
      setReadiness(await action());
    } catch (err) {
      setActionError(err instanceof Error ? err.message : "A művelet nem hajtható végre.");
    } finally {
      setBusy(false);
    }
  }, []);

  if (loading) {
    return (
      <AdminPanel className="p-4">
        <p className="text-[12px] text-[#7A8479]">Beérkezési állapot betöltése…</p>
      </AdminPanel>
    );
  }
  if (error || !readiness) {
    return (
      <AdminPanel className="p-4">
        <p className="text-[12px] text-[#8B2A2A]">{error || "Nincs adat."}</p>
      </AdminPanel>
    );
  }

  const isIntake = readiness.case.status === INTAKE_STATUS;

  // Concise opening-record summary for non-intake (already opened/closed) cases.
  if (!isIntake) {
    return (
      <AdminPanel className="px-4 py-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <p className="text-[12px] text-[#3D4842]">
            <span className="font-semibold">Ügynyitási adatok:</span>{" "}
            {readiness.client?.displayName || "Nincs ügyfél"} ·{" "}
            {readiness.case.clientRole || "szerep nélkül"} ·{" "}
            {readiness.responsibility.responsibleLawyer?.displayName || "felelős ügyvéd nélkül"}
          </p>
          <AdminBadge tone="neutral">Megnyitva</AdminBadge>
        </div>
      </AdminPanel>
    );
  }

  const ready = readiness.readiness.readyForActivation;

  return (
    <AdminPanel className="overflow-hidden">
      <AdminSectionHeader
        eyebrow="Ügyfelvétel"
        title="Beérkezési és nyitási készenlét"
        subtitle="Operatív munkafolyamat-állapot — nem jogi vagy megfelelőségi tanúsítás."
        action={
          ready ? (
            <AdminBadge tone="green" dot>
              Aktiválható
            </AdminBadge>
          ) : (
            <AdminBadge tone="amber" dot>
              {readiness.readiness.completedRequiredItems}/{readiness.readiness.totalRequiredItems} kötelező elem kész
            </AdminBadge>
          )
        }
      />

      <div className="grid gap-3 px-4 py-3 sm:grid-cols-3">
        <div>
          <p className="text-[10.5px] font-bold uppercase tracking-[0.12em] text-[#7A8479]">Ügyfél</p>
          <p className="text-[13px] text-[#16201A]">{readiness.client?.displayName || "Nincs kapcsolva"}</p>
        </div>
        <div>
          <p className="text-[10.5px] font-bold uppercase tracking-[0.12em] text-[#7A8479]">Ügyfél szerep</p>
          <p className="text-[13px] text-[#16201A]">{readiness.case.clientRole || "—"}</p>
        </div>
        <div>
          <p className="text-[10.5px] font-bold uppercase tracking-[0.12em] text-[#7A8479]">Felelős ügyvéd</p>
          <p className="text-[13px] text-[#16201A]">
            {readiness.responsibility.responsibleLawyer?.displayName || "Nincs kijelölve"}
          </p>
        </div>
      </div>

      <div className="border-t border-[rgba(22,32,26,0.10)] px-4 py-3">
        <ul className="space-y-1">
          {readiness.checklist.map((item) => (
            <li key={item.code} className="flex items-center gap-2 text-[12px]">
              {!item.available ? (
                <span className="text-[#7A8479]">◌</span>
              ) : item.complete ? (
                <span className="text-[#123B27]">●</span>
              ) : (
                <span className="text-[#B97A0F]">○</span>
              )}
              <span className={!item.available ? "italic text-[#7A8479]" : "text-[#16201A]"}>
                {item.label}
                {item.required ? " *" : ""}
              </span>
            </li>
          ))}
        </ul>
        {!readiness.availability.conflictReviewPersistence ? (
          <p className="mt-2 text-[11px] italic text-[#7A8479]">
            Az összeférhetetlenségi ellenőrzés nincs strukturáltan rögzítve; elvégzése a rendszeren kívüli emberi
            felelősség marad.
          </p>
        ) : null}
      </div>

      {readiness.blockers.length > 0 ? (
        <div className="border-t border-[rgba(22,32,26,0.10)] px-4 py-3">
          <p className="text-[11px] font-semibold text-[#7d530a]">Az ügy aktiválása jelenleg nem engedélyezett:</p>
          <ul className="mt-1 space-y-0.5">
            {readiness.blockers.map((blocker) => (
              <li key={blocker.code} className="text-[12px] text-[#7d530a]">
                – {blocker.label}
              </li>
            ))}
          </ul>
        </div>
      ) : null}

      <div className="flex flex-wrap items-center justify-between gap-2 border-t border-[rgba(22,32,26,0.10)] px-4 py-3">
        <Link href="/intake" className="text-[12px] font-semibold text-[#2D4A7C] underline">
          Ügyfelvételi sor megnyitása →
        </Link>
        <div className="flex gap-2">
          {readiness.capabilities.canDeclineMatter ? (
            <AdminButton
              size="sm"
              variant="danger"
              disabled={busy}
              onClick={() => void runAction(() => declineMatterIntake(caseId))}
            >
              Beérkezés elutasítása
            </AdminButton>
          ) : null}
          {readiness.capabilities.canActivateMatter ? (
            <AdminButton
              size="sm"
              variant="primary"
              disabled={busy}
              onClick={() => void runAction(() => activateMatterIntake(caseId))}
            >
              Ügy aktiválása
            </AdminButton>
          ) : null}
        </div>
      </div>
      {actionError ? <p className="px-4 pb-3 text-[12px] text-[#8B2A2A]">{actionError}</p> : null}
    </AdminPanel>
  );
}
