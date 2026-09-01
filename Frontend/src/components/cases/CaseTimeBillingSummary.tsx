"use client";

import { useCallback, useEffect, useState } from "react";
import { getCaseBillingPreparation, minutesToHours, type CaseBillingPreparation } from "@/lib/caseTimeBillingApi";

/**
 * Compact, Case-contextual time & billing-preparation block for the Case
 * Workspace. Case-first: it never shows a Matter identifier, a database id, a
 * rate, or an attribution-type code. Time that is not safely attributable to the
 * Case is surfaced simply as "Ellenőrzést igényel".
 */
export function CaseTimeBillingSummary({ caseId, onRecordTime, onGenerateReport }: {
  caseId: string;
  onRecordTime?: () => void;
  onGenerateReport?: () => void;
}) {
  const [prep, setPrep] = useState<CaseBillingPreparation | null>(null);
  const [state, setState] = useState<"loading" | "ready" | "error">("loading");

  const load = useCallback(async () => {
    setState("loading");
    try {
      setPrep(await getCaseBillingPreparation(caseId));
      setState("ready");
    } catch {
      setState("error");
    }
  }, [caseId]);

  useEffect(() => { void load(); }, [load]);

  const totalMinutes = prep ? prep.billableMinutes + prep.nonBillableMinutes : 0;

  return (
    <section className="rounded border border-[var(--adm-border)] bg-[var(--adm-surface)] p-4" aria-label="Idő és számlázás">
      <div className="flex items-center justify-between gap-2">
        <h3 className="text-sm font-semibold text-[var(--adm-text)]">Idő az ügyön</h3>
        <div className="flex gap-2">
          <button type="button" onClick={onRecordTime} className="rounded border border-[var(--adm-green-800)] bg-[var(--adm-green-800)] px-3 py-1.5 text-xs font-semibold text-white">Idő rögzítése</button>
          <button type="button" onClick={onGenerateReport} className="rounded border border-[var(--adm-border)] bg-white px-3 py-1.5 text-xs text-[var(--adm-text)]">Riport készítése</button>
        </div>
      </div>

      {state === "loading" ? <p className="mt-3 text-xs text-[var(--adm-text-muted)]">Betöltés…</p> : null}
      {state === "error" ? <p className="mt-3 text-xs text-[var(--adm-text-muted)]">Az idő-összesítő jelenleg nem érhető el.</p> : null}

      {state === "ready" && prep ? (
        <div className="mt-3 grid grid-cols-2 gap-3 md:grid-cols-3">
          <Stat label="Összes munkaóra" value={`${minutesToHours(totalMinutes)} óra`} />
          <Stat label="Számlázható" value={`${minutesToHours(prep.billableMinutes)} óra`} />
          {prep.needsReviewMinutes > 0 ? <Stat label="Ellenőrzést igényel" value={`${minutesToHours(prep.needsReviewMinutes)} óra`} /> : null}
          {prep.billingReadiness === "CASE_SCOPE_UNRESOLVED" ? (
            <p className="col-span-full text-[11px] text-[var(--adm-text-muted)]">Ehhez az ügyhöz még nincs számlázási hatókör beállítva.</p>
          ) : null}
        </div>
      ) : null}
    </section>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <p className="text-[11px] uppercase tracking-wide text-[var(--adm-text-muted)]">{label}</p>
      <p className="mt-0.5 text-sm font-semibold text-[var(--adm-text)]">{value}</p>
    </div>
  );
}

export default CaseTimeBillingSummary;
