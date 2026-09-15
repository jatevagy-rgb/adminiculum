"use client";

import { useMemo } from "react";
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
  diagnoses?: DiagnosticWorkbenchDto["problems"]["diagnoses"];
  recommendations?: DiagnosticWorkbenchDto["proposed"]["recommendations"];
}

export function EvidenceSufficiencyPanel({
  evidence,
  missing,
  sufficiency,
  diagnoses = [],
  recommendations = [],
}: EvidenceSufficiencyPanelProps) {
  const clientProv = PROVENANCE_LABELS_HU.EVIDENCE_RECORD;
  const researchProv = PROVENANCE_LABELS_HU.RESEARCH_EVIDENCE;

  const hasClientRecords = evidence.records && evidence.records.length > 0;
  const hasResearch = evidence.research && evidence.research.length > 0;

  // Derive linked research evidence IDs from current diagnoses and recommendations
  const linkedEvidenceIds = useMemo(() => {
    const ids = new Set<string>();
    for (const diag of diagnoses || []) {
      for (const ev of diag.evidence || []) {
        if (ev.id) ids.add(ev.id);
      }
    }
    for (const rec of recommendations || []) {
      for (const ev of rec.evidence || []) {
        if (ev.id) ids.add(ev.id);
      }
    }
    return ids;
  }, [diagnoses, recommendations]);

  const linkedResearch = useMemo(() => {
    return (evidence.research || []).filter((r) => linkedEvidenceIds.has(r.id));
  }, [evidence.research, linkedEvidenceIds]);

  const unlinkedResearch = useMemo(() => {
    return (evidence.research || []).filter((r) => !linkedEvidenceIds.has(r.id));
  }, [evidence.research, linkedEvidenceIds]);

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
            <span className="font-semibold block">Explicit ismeretlen tények (UNKNOWN):</span>
            <span className="mt-1 block text-sm font-medium">
              {missing.hasUnknownFacts
                ? "Van explicit ismeretlenként jelölt tény."
                : "Nincs explicit UNKNOWN státuszú rögzített tény."}
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

        {missing.hasConflictingEvidence ? (
          <div className="rounded-lg border-2 border-rose-300 bg-rose-50 p-3 text-xs text-rose-900 flex items-center gap-2">
            <span className="font-bold">Figyelem:</span>
            <span>Ellentmondó bizonyíték észlelve a rendszerben. Felülvizsgálat szükséges!</span>
          </div>
        ) : null}

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

        {sufficiency && sufficiency.length > 0 ? (
          <div className="space-y-2 border-t border-[var(--adm-border)] pt-3">
            <h4 className="text-xs font-semibold uppercase tracking-wider text-[var(--adm-text)]">
              Döntési elégségesség (Sufficiency kiértékelések)
            </h4>
            <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-2">
              {sufficiency.map((s) => {
                const badge = sufficiencyBadge(s.decision);
                return (
                  <div
                    key={s.recommendationId}
                    className="rounded-lg border border-[var(--adm-border)] bg-white p-2.5 text-xs space-y-1"
                  >
                    <div className="flex items-center justify-between">
                      <span className="font-medium text-[var(--adm-text)]">
                        Javaslat: {s.recommendationId.slice(0, 8)}...
                      </span>
                      <span className={`rounded px-1.5 py-0.5 text-[10px] font-semibold border ${badge.tone}`}>
                        {badge.label}
                      </span>
                    </div>
                    <div className="text-[11px] text-[var(--adm-text-muted)] flex justify-between">
                      <span>Bizonyítékok száma:</span>
                      <span className="font-bold">{s.evidenceCount} db</span>
                    </div>
                    {s.decision === "NEEDS_MORE_DATA" ? (
                      <p className="text-[10px] text-amber-800 font-medium">
                        További adat szükséges a döntéshozatalhoz.
                      </p>
                    ) : s.decision === "CONFLICTING_EVIDENCE" ? (
                      <p className="text-[10px] text-rose-800 font-medium">
                        Ellentmondó bizonyíték észlelve.
                      </p>
                    ) : s.decision === "HUMAN_DOMAIN_REVIEW" ? (
                      <p className="text-[10px] text-blue-800 font-medium">
                        Szakértői felülvizsgálat szükséges.
                      </p>
                    ) : null}
                  </div>
                );
              })}
            </div>
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
      <div className="space-y-4 border-t border-[var(--adm-border)] pt-4">
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
            {evidence.research.length} tétel (összesen)
          </span>
        </div>

        {!hasResearch ? (
          <p className="text-xs text-[var(--adm-text-muted)] italic">
            Nincs csatolt kutatási háttéranyag.
          </p>
        ) : (
          <div className="space-y-5">
            {/* Subsection B1: Kapcsolt kutatási háttér (linked to current diagnoses or recommendations) */}
            <div className="space-y-3 rounded-lg border border-slate-200 bg-slate-50/50 p-4">
              <div className="flex items-center justify-between">
                <h4 className="text-xs font-bold uppercase tracking-wider text-slate-900">
                  Kapcsolt kutatási háttér ({linkedResearch.length})
                </h4>
                <span className="text-[11px] text-slate-500">
                  Közvetlenül hivatkozott háttéranyag
                </span>
              </div>

              {/* Explanatory sentence for linked research */}
              <div className="rounded border border-sky-200 bg-sky-50 p-2.5 text-xs text-sky-900">
                <p>
                  Ez a kutatási háttér a jelenlegi diagnózis/javaslat alátámasztásához kapcsolódik; nem a vállalat saját mért adata.
                </p>
              </div>

              {linkedResearch.length === 0 ? (
                <p className="text-xs text-[var(--adm-text-muted)] italic">
                  Nincs közvetlenül a jelenlegi diagnózisokhoz vagy javaslatokhoz kapcsolt kutatási háttér.
                </p>
              ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                  {linkedResearch.map((res) => (
                    <div
                      key={res.id}
                      className="rounded-lg border border-sky-200 bg-white p-3 text-xs space-y-2 shadow-xs"
                    >
                      <div className="flex items-start justify-between gap-2">
                        <span className="font-semibold text-[var(--adm-text)]">{res.title}</span>
                        <span className="rounded bg-sky-100 px-1.5 py-0.5 text-[10px] font-medium text-sky-800">
                          Kapcsolt kutatás
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

            {/* Subsection B2: További kutatási corpus (not linked to current diagnoses or recommendations) */}
            {unlinkedResearch.length > 0 ? (
              <div className="space-y-3 rounded-lg border border-slate-200 bg-white p-4">
                <div className="flex items-center justify-between">
                  <h4 className="text-xs font-bold uppercase tracking-wider text-slate-700">
                    További kutatási corpus ({unlinkedResearch.length})
                  </h4>
                  <span className="rounded bg-slate-100 px-2 py-0.5 text-[10px] font-medium text-slate-600">
                    Jelenleg nincs az adott diagnózishoz vagy javaslathoz kapcsolva.
                  </span>
                </div>

                <div className="rounded border border-slate-200 bg-slate-50 p-2.5 text-xs text-slate-600">
                  <p>
                    A háttértárban elérhető módszertani és tudományos kutatási referencia. Jelenleg nincs közvetlenül hozzárendelve a feltárt diagnózisokhoz vagy javaslatokhoz, ezért nem tekintendő közvetlen alátámasztásnak.
                  </p>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                  {unlinkedResearch.map((res) => (
                    <div
                      key={res.id}
                      className="rounded-lg border border-slate-200 bg-white p-3 text-xs space-y-2 opacity-85"
                    >
                      <div className="flex items-start justify-between gap-2">
                        <span className="font-medium text-[var(--adm-text)]">{res.title}</span>
                        <span className="rounded bg-slate-100 px-1.5 py-0.5 text-[10px] text-slate-600">
                          Corpus referencia
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
              </div>
            ) : null}
          </div>
        )}
      </div>
    </section>
  );
}
