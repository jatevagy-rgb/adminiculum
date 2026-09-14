"use client";

import type { DiagnosticWorkbenchDto } from "@/lib/diagnosticWorkbenchApi";
import {
  PROVENANCE_LABELS_HU,
  verificationStatusLabelHu,
  sufficiencyBadge,
} from "@/lib/diagnosticWorkbenchApi";

interface EvidenceSufficiencyPanelProps {
  evidence: DiagnosticWorkbenchDto["evidence"];
  missing: DiagnosticWorkbenchDto["missing"];
  sufficiency: DiagnosticWorkbenchDto["problems"]["sufficiency"];
}

export function EvidenceSufficiencyPanel({
  evidence,
  missing,
  sufficiency,
}: EvidenceSufficiencyPanelProps) {
  const clientProv = PROVENANCE_LABELS_HU.EVIDENCE_RECORD;
  const researchProv = PROVENANCE_LABELS_HU.RESEARCH_EVIDENCE;

  const hasClientRecords = evidence.records && evidence.records.length > 0;
  const hasResearch = evidence.research && evidence.research.length > 0;

  return (
    <section
      data-testid="diagnostic-evidence-panel"
      className="rounded-xl border border-[var(--adm-border)] bg-white p-5 shadow-xs space-y-6"
    >
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-[var(--adm-border)] pb-4">
        <div>
          <h2 className="text-base font-semibold text-[var(--adm-text)]">
            4. Bizonyítékok & Döntési elégségesség
          </h2>
          <p className="mt-1 text-xs text-[var(--adm-text-muted)]">
            Ügyfélspecifikus tényalapú bizonyítékok és tudományos/módszertani kutatási háttér szigorúan elkülönítve.
          </p>
        </div>
      </div>

      {/* Missing / Evidence Gaps Diagnostics Banner */}
      <div className="rounded-lg border border-[var(--adm-border)] bg-[var(--adm-surface)] p-4 space-y-3">
        <h3 className="text-xs font-semibold uppercase tracking-wider text-[var(--adm-text)]">
          Bizonyítottsági diagnosztika & Hiányzó adatok
        </h3>

        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 text-xs">
          <div
            className={`rounded-lg border p-3 ${
              missing.hasUnknownFacts
                ? "border-amber-300 bg-amber-50/70 text-amber-900"
                : "border-slate-200 bg-white text-slate-700"
            }`}
          >
            <span className="font-semibold block">Ismeretlen tények (UNKNOWN):</span>
            <span className="mt-1 block text-sm">
              {missing.hasUnknownFacts ? "Van megerősítetlen tény" : "Nincs ismeretlen tény"}
            </span>
          </div>

          <div
            className={`rounded-lg border p-3 ${
              missing.hasConflictingEvidence
                ? "border-rose-300 bg-rose-50/70 text-rose-900"
                : "border-slate-200 bg-white text-slate-700"
            }`}
          >
            <span className="font-semibold block">Ellentmondó bizonyíték:</span>
            <span className="mt-1 block text-sm">
              {missing.hasConflictingEvidence ? "Ellentmondás észlelve" : "Nincs észlelt ellentmondás"}
            </span>
          </div>

          <div
            className={`rounded-lg border p-3 ${
              missing.insufficientRecommendationCount > 0
                ? "border-amber-300 bg-amber-50/70 text-amber-900"
                : "border-slate-200 bg-white text-slate-700"
            }`}
          >
            <span className="font-semibold block">Elégtelen alátámasztású javaslat:</span>
            <span className="mt-1 block text-sm font-bold">
              {missing.insufficientRecommendationCount} db javaslat
            </span>
          </div>
        </div>

        {missing.unresolvedItems && missing.unresolvedItems.length > 0 ? (
          <div className="mt-2 rounded border border-amber-200 bg-amber-50/50 p-3 text-xs text-amber-950 space-y-1">
            <span className="font-semibold block">Nyitott / megoldatlan tételek:</span>
            <ul className="list-disc list-inside space-y-0.5 text-[11px]">
              {missing.unresolvedItems.map((item, idx) => (
                <li key={idx}>
                  <span className="font-mono font-medium">{item.code}</span>: {item.message}
                </li>
              ))}
            </ul>
          </div>
        ) : null}
      </div>

      {/* Part A: Client-specific Evidence Records */}
      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <h3 className="text-sm font-semibold text-[var(--adm-text)]">
              Ügyfélspecifikus bizonyítékok
            </h3>
            <span
              className={`rounded-full border px-2 py-0.5 text-[10px] font-medium ${clientProv.tone}`}
            >
              {clientProv.label}
            </span>
          </div>
          <span className="text-xs text-[var(--adm-text-muted)]">
            {evidence.records.length} tétel
          </span>
        </div>

        {!hasClientRecords ? (
          <div className="rounded-lg border border-dashed border-[var(--adm-border)] bg-[var(--adm-surface)] p-6 text-center text-sm text-[var(--adm-text-muted)]">
            Még nincs kapcsolt bizonyíték.
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            {evidence.records.map((rec) => (
              <div
                key={rec.id}
                className="rounded-lg border border-[var(--adm-border)] p-3 text-xs bg-white space-y-2"
              >
                <div className="flex items-start justify-between gap-2">
                  <span className="font-semibold text-[var(--adm-text)]">{rec.title}</span>
                  <span className="rounded bg-slate-100 px-1.5 py-0.5 text-[10px] text-slate-700">
                    {rec.status}
                  </span>
                </div>

                {rec.description ? (
                  <p className="text-[var(--adm-text)] line-clamp-2">{rec.description}</p>
                ) : null}

                <div className="pt-2 border-t border-slate-100 flex flex-wrap gap-x-3 gap-y-1 text-[10px] text-[var(--adm-text-muted)]">
                  <span>Forrástípus: {rec.sourceType}</span>
                  {rec.validFrom ? (
                    <span>
                      Érvényes: {new Date(rec.validFrom).toLocaleDateString("hu-HU")}
                      {rec.validUntil ? ` – ${new Date(rec.validUntil).toLocaleDateString("hu-HU")}` : ""}
                    </span>
                  ) : null}
                  {rec.clientFactId ? <span>Tény: {rec.clientFactId.slice(0, 8)}...</span> : null}
                  {rec.observationId ? <span>Megfigyelés: {rec.observationId.slice(0, 8)}...</span> : null}
                  {rec.documentVersionId ? <span>Dokumentum: {rec.documentVersionId.slice(0, 8)}...</span> : null}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Part B: Research Evidence (Methodological / Benchmark) */}
      <div className="space-y-3 border-t border-[var(--adm-border)] pt-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <h3 className="text-sm font-semibold text-[var(--adm-text)]">
              Kutatási háttér
            </h3>
            <span
              className={`rounded-full border px-2 py-0.5 text-[10px] font-medium ${researchProv.tone}`}
            >
              {researchProv.label}
            </span>
          </div>
          <span className="text-xs text-[var(--adm-text-muted)]">
            {evidence.research.length} tétel
          </span>
        </div>

        {/* Mandatory Explicit Research Notice */}
        <div className="rounded-lg border border-slate-200 bg-slate-50 p-3 text-xs text-slate-700">
          <p className="font-medium text-slate-900">Módszertani megjegyzés:</p>
          <p className="mt-0.5">
            A kutatási háttér a következtetést támasztja alá; nem a vállalat saját mért adata.
          </p>
        </div>

        {!hasResearch ? (
          <p className="text-xs text-[var(--adm-text-muted)] italic">
            Nincs csatolt kutatási háttéranyag.
          </p>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            {evidence.research.map((res) => (
              <div
                key={res.id}
                className="rounded-lg border border-[var(--adm-border)] p-3 text-xs bg-white space-y-2"
              >
                <div className="flex items-start justify-between gap-2">
                  <span className="font-semibold text-[var(--adm-text)]">{res.title}</span>
                  <span className="rounded bg-slate-100 px-1.5 py-0.5 text-[10px] text-slate-700">
                    {res.kind}
                  </span>
                </div>

                {res.boundedClaim ? (
                  <p className="text-[var(--adm-text)] italic text-[11px] bg-slate-50 p-2 rounded border border-slate-100">
                    &ldquo;{res.boundedClaim}&rdquo;
                  </p>
                ) : null}

                <div className="flex flex-wrap gap-x-3 gap-y-1 text-[10.5px] text-[var(--adm-text-muted)] pt-1">
                  <span>Eredet: {res.origin || "—"}</span>
                  <span>Hitelesítés: {verificationStatusLabelHu(res.verificationStatus)}</span>
                  <span>Erősség: {res.strength}</span>
                </div>

                {res.domainKeys && res.domainKeys.length > 0 ? (
                  <div className="flex flex-wrap gap-1 pt-1">
                    {res.domainKeys.map((dk) => (
                      <span
                        key={dk}
                        className="rounded bg-slate-100 px-1.5 py-0.5 text-[9.5px] font-mono text-slate-600"
                      >
                        {dk}
                      </span>
                    ))}
                  </div>
                ) : null}
              </div>
            ))}
          </div>
        )}
      </div>
    </section>
  );
}
