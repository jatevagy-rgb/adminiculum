"use client";

import { useState } from "react";
import { outcomeBasisLabelHu, roiProvenanceLabelHu, type OutcomeMeasurementDTO } from "@/lib/growApi";

export function GrowOutcomeComparison({ outcome }: { outcome: OutcomeMeasurementDTO }) {
  return (
    <>
      {outcome.metricsSummary?.before ? (
        <BeforeAfterTable summary={outcome.metricsSummary} />
      ) : (
        <p className="mt-3 text-xs text-[var(--adm-text-muted)]" data-testid="outcome-no-measurement">
          Nincs mérési adat.
        </p>
      )}
      {outcome.roi ? <RoiBlock roi={outcome.roi} /> : null}
    </>
  );
}

function BeforeAfterTable({ summary }: { summary: NonNullable<OutcomeMeasurementDTO["metricsSummary"]> }) {
  const before = summary.before ?? {};
  const after = summary.after ?? null;
  const rows = ["TOTAL_ACTIVE_MINUTES", "TOTAL_WAITING_MINUTES", "TOTAL_CYCLE_MINUTES"].filter(
    (k) => before[k] != null || after?.[k] != null,
  );
  if (!rows.length) return null;
  const labels: Record<string, string> = {
    TOTAL_ACTIVE_MINUTES: "Aktív idő",
    TOTAL_WAITING_MINUTES: "Várakozási idő",
    TOTAL_CYCLE_MINUTES: "Teljes átfutási idő",
  };
  return (
    <div className="mt-4 overflow-x-auto">
      <table className="w-full text-left text-xs">
        <thead>
          <tr className="border-b border-[var(--adm-border)] text-[10px] font-bold uppercase tracking-wider text-[var(--adm-text-muted)]">
            <th className="pb-2">Mutató</th>
            <th className="pb-2 text-right">Előtte</th>
            <th className="pb-2 text-right">Most</th>
            <th className="pb-2 text-right">Változás</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-[var(--adm-border)]">
          {rows.map((key) => {
            const b = before[key];
            const a = after?.[key];
            const hasDelta = b != null && a != null;
            const delta = hasDelta ? b - a : null;
            return (
              <tr key={key}>
                <td className="py-2 text-[var(--adm-text-muted)]">{labels[key]}</td>
                <td className="py-2 text-right font-medium text-[var(--adm-text)]">{b != null ? `${Math.round(b)} p` : "—"}</td>
                <td className="py-2 text-right font-medium text-[var(--adm-text)]">{a != null ? `${Math.round(a)} p` : "—"}</td>
                <td
                  className={`py-2 text-right font-semibold ${
                    delta != null && delta > 0
                      ? "text-[var(--adm-green-800)]"
                      : delta != null && delta < 0
                        ? "text-[var(--adm-terracotta-700)]"
                        : "text-[var(--adm-text-muted)]"
                  }`}
                >
                  {delta == null ? "—" : delta === 0 ? "0 p" : `${delta > 0 ? "−" : "+"}${Math.abs(Math.round(delta))} p`}
                </td>
              </tr>
            );
          })}
        </tbody>
        {summary.comparable === false ? (
          <tfoot>
            <tr>
              <td colSpan={4} className="pt-2 text-[10px] text-amber-900">
                A két mérés mérőszám-verziója eltér — a különbség óvatosan értelmezhető.
              </td>
            </tr>
          </tfoot>
        ) : null}
      </table>
    </div>
  );
}

function RoiBlock({ roi }: { roi: NonNullable<OutcomeMeasurementDTO["roi"]> }) {
  const [open, setOpen] = useState(false);
  const time = roi.timeSavedMinutesPerMonth;
  const cash = roi.cashSavedHufPerMonth;
  const fmt = (v: { low: number; base: number; high: number } | null | undefined, unit: string) =>
    v ? `${Math.round(v.low)}–${Math.round(v.base)}–${Math.round(v.high)} ${unit}` : "—";

  return (
    <div className="mt-4 rounded-[var(--adm-radius-lg)] border border-[var(--adm-border)] bg-[var(--adm-surface)]/70 p-4">
      <p className="text-[10px] font-bold uppercase tracking-widest text-[var(--adm-text-muted)]">
        Becsült hatás (alacsony / közép / magas)
      </p>
      <div className="mt-2 grid gap-1 text-xs text-[var(--adm-text)]">
        <p>
          Megtakarított idő / hónap: <span className="font-bold">{fmt(time, "perc")}</span>
        </p>
        <p>
          Megtakarított költség / hónap: <span className="font-bold">{cash ? fmt(cash, "Ft") : "nem becsülhető"}</span>
        </p>
      </div>
      <p className="mt-2 text-[10.5px] font-semibold text-amber-950">
        A megtakarított idő nem egyenlő pénzmegtakarítással.
      </p>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="mt-2 text-xs font-semibold text-[var(--adm-green-800)] hover:text-[var(--adm-text)] hover:underline"
        aria-expanded={open}
      >
        Hogyan számoltuk?
      </button>
      {open && roi.provenance ? (
        <dl className="mt-3 grid grid-cols-[minmax(90px,auto)_1fr] gap-x-3 gap-y-1.5 border-t border-[var(--adm-border)] pt-3 text-[11px]">
          <dt className="text-[var(--adm-text-muted)]">Alap</dt>
          <dd className="text-[var(--adm-text)]">{outcomeBasisLabelHu(roi.basis)}</dd>
          <dt className="text-[var(--adm-text-muted)]">Származás</dt>
          <dd className="text-[var(--adm-text)]">{roiProvenanceLabelHu(roi.provenanceType ?? roi.provenance?.type)}</dd>
          <dt className="text-[var(--adm-text-muted)]">Képlet</dt>
          <dd className="text-[var(--adm-text)]">{roi.provenance.formulaVersion}</dd>
          <dt className="text-[var(--adm-text-muted)]">Számítva</dt>
          <dd className="text-[var(--adm-text)]">{new Date(roi.provenance.computedAt).toLocaleString("hu-HU")}</dd>
          <dt className="text-[var(--adm-text-muted)]">Magyarázat</dt>
          <dd className="text-[var(--adm-text)]">{roi.provenance.explanationHu}</dd>
        </dl>
      ) : null}
    </div>
  );
}
