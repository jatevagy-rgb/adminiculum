"use client";

import { useState } from "react";
import type { DiagnosticWorkbenchDto, ProcessMetricCode } from "@/lib/diagnosticWorkbenchApi";
import {
  PROVENANCE_LABELS_HU,
  PROCESS_METRIC_LABELS_HU,
  formatProcessMetricValue,
} from "@/lib/diagnosticWorkbenchApi";

interface ObservationPanelProps {
  observed: DiagnosticWorkbenchDto["observed"];
}

export function ObservationPanel({ observed }: ObservationPanelProps) {
  const [activeTab, setActiveTab] = useState<"declared" | "measured">("declared");

  const declaredProv = PROVENANCE_LABELS_HU.DECLARED_OBSERVATION;
  const measuredProv = PROVENANCE_LABELS_HU.MEASURED_SNAPSHOT;

  const hasObservations = observed.observations && observed.observations.length > 0;
  const hasSnapshots = observed.processSnapshots && observed.processSnapshots.length > 0;

  return (
    <section
      data-testid="diagnostic-observation-panel"
      className="rounded-xl border border-[var(--adm-border)] bg-white p-5 shadow-xs space-y-5"
    >
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-[var(--adm-border)] pb-4">
        <div>
          <div className="flex items-center gap-2">
            <h2 className="text-base font-semibold text-[var(--adm-text)]">
              2. Megfigyelési réteg & Folyamatmetrikák
            </h2>
          </div>
          <p className="mt-1 text-xs text-[var(--adm-text-muted)]">
            Ügyfél által deklarált felmérési válaszok és determinisztikusan számított folyamatpillanatképek.
          </p>
        </div>

        {/* Sub-tabs for Declared vs Measured */}
        <div className="flex items-center gap-1 rounded-lg border border-[var(--adm-border)] bg-[var(--adm-surface)] p-1 text-xs">
          <button
            type="button"
            onClick={() => setActiveTab("declared")}
            className={`rounded-md px-3 py-1.5 font-medium transition-colors ${
              activeTab === "declared"
                ? "bg-white text-[var(--adm-text)] shadow-xs"
                : "text-[var(--adm-text-muted)] hover:text-[var(--adm-text)]"
            }`}
          >
            Deklarált megfigyelések ({observed.observations?.length ?? 0})
          </button>
          <button
            type="button"
            onClick={() => setActiveTab("measured")}
            className={`rounded-md px-3 py-1.5 font-medium transition-colors ${
              activeTab === "measured"
                ? "bg-white text-[var(--adm-text)] shadow-xs"
                : "text-[var(--adm-text-muted)] hover:text-[var(--adm-text)]"
            }`}
          >
            Mért pillanatképek ({observed.processSnapshots?.length ?? 0})
          </button>
        </div>
      </div>

      {activeTab === "declared" ? (
        <div className="space-y-4">
          <div className="flex items-center gap-2">
            <span
              className={`rounded-full border px-2 py-0.5 text-[11px] font-medium ${declaredProv.tone}`}
            >
              {declaredProv.label}
            </span>
            <span className="text-xs text-[var(--adm-text-muted)]">
              Ügyféloldali felmérésekből és űrlapokból rögzített megfigyelések (nyers payload nélkül).
            </span>
          </div>

          {!hasObservations ? (
            <div className="rounded-lg border border-dashed border-[var(--adm-border)] bg-[var(--adm-surface)] p-6 text-center text-sm text-[var(--adm-text-muted)]">
              Még nincs deklarált megfigyelés.
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              {observed.observations.map((obs) => (
                <div
                  key={obs.id}
                  className="rounded-lg border border-[var(--adm-border)] p-3 text-xs bg-white space-y-2"
                >
                  <div className="flex items-start justify-between gap-2">
                    <span className="font-semibold text-[var(--adm-text)]">
                      {obs.observationType}
                    </span>
                    <span className="text-[10px] text-[var(--adm-text-muted)] whitespace-nowrap">
                      {new Date(obs.observedAt).toLocaleString("hu-HU")}
                    </span>
                  </div>

                  <div className="space-y-1 text-[11px] text-[var(--adm-text-muted)]">
                    <div className="flex justify-between">
                      <span>Forrás:</span>
                      <span className="font-medium text-[var(--adm-text)]">
                        {obs.source.name} ({obs.source.sourceType})
                      </span>
                    </div>
                    {obs.sourceRecordId ? (
                      <div className="flex justify-between">
                        <span>Forrásrekord azonosító:</span>
                        <span className="font-mono">{obs.sourceRecordId}</span>
                      </div>
                    ) : null}
                    <div className="flex justify-between items-baseline">
                      <span>Input ujjlenyomat (hash):</span>
                      <span className="font-mono text-[10px] text-slate-600 truncate max-w-[160px]" title={obs.inputDigest}>
                        {obs.inputDigest}
                      </span>
                    </div>
                    {obs.discoveryRun ? (
                      <div className="flex justify-between">
                        <span>Kutatási futás:</span>
                        <span className="font-medium text-[var(--adm-text)]">
                          {obs.discoveryRun.status} ({new Date(obs.discoveryRun.startedAt).toLocaleDateString("hu-HU")})
                        </span>
                      </div>
                    ) : null}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      ) : (
        <div className="space-y-4">
          <div className="flex items-center gap-2">
            <span
              className={`rounded-full border px-2 py-0.5 text-[11px] font-medium ${measuredProv.tone}`}
            >
              {measuredProv.label}
            </span>
            <span className="text-xs text-[var(--adm-text-muted)]">
              Determinisztikusan számított folyamatmetrikák a folyamatlépésekből (nem azonos a becsült lépésidőkkel).
            </span>
          </div>

          {!hasSnapshots ? (
            <div className="rounded-lg border border-dashed border-[var(--adm-border)] bg-[var(--adm-surface)] p-6 text-center text-sm text-[var(--adm-text-muted)]">
              Még nincs mért folyamatadat.
            </div>
          ) : (
            <div className="space-y-4">
              {observed.processSnapshots.map((snap) => (
                <div
                  key={snap.id}
                  className="rounded-lg border border-[var(--adm-border)] p-4 bg-white space-y-3"
                >
                  <div className="flex flex-wrap items-baseline justify-between gap-2 border-b border-slate-100 pb-2">
                    <div>
                      <h3 className="text-xs font-semibold text-[var(--adm-text)]">
                        {snap.businessProcess.name}
                      </h3>
                      <div className="flex flex-wrap gap-2 text-[10px] text-[var(--adm-text-muted)] mt-0.5">
                        <span>Verzió: {snap.metricVersion}</span>
                        <span>·</span>
                        <span>Rögzítve: {new Date(snap.observedAt).toLocaleString("hu-HU")}</span>
                        {snap.provenance?.calculatedBy ? (
                          <>
                            <span>·</span>
                            <span>Számította: {snap.provenance.calculatedBy}</span>
                          </>
                        ) : null}
                        {snap.provenance?.stepCount !== undefined ? (
                          <>
                            <span>·</span>
                            <span>Lépésszám: {snap.provenance.stepCount}</span>
                          </>
                        ) : null}
                      </div>
                    </div>
                    <div className="text-[10px] text-slate-500 font-mono">
                      digest: {snap.snapshotDigest.slice(0, 12)}...
                    </div>
                  </div>

                  {/* Canonical 12 Metrics Table */}
                  <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 gap-2">
                    {snap.metrics.map((metric) => {
                      const meta = PROCESS_METRIC_LABELS_HU[metric.code as ProcessMetricCode] || {
                        title: metric.code,
                        unitLabel: "",
                      };
                      const formatted = formatProcessMetricValue(metric);
                      return (
                        <div
                          key={metric.code}
                          className="rounded border border-slate-100 bg-slate-50/70 p-2 text-center"
                        >
                          <span className="block text-[10px] text-[var(--adm-text-muted)] truncate" title={meta.title}>
                            {meta.title}
                          </span>
                          <span className="mt-1 block text-xs font-bold text-[var(--adm-text)]">
                            {formatted}
                          </span>
                        </div>
                      );
                    })}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </section>
  );
}
