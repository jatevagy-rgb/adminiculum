"use client";

import type { DiagnosticWorkbenchDto } from "@/lib/diagnosticWorkbenchApi";
import {
  PROVENANCE_LABELS_HU,
  sufficiencyBadge,
  recommendationStatusLabelHu,
  interventionLabelHu,
  verificationStatusLabelHu,
} from "@/lib/diagnosticWorkbenchApi";

interface InternalRecommendationPanelProps {
  proposed: DiagnosticWorkbenchDto["proposed"];
}

export function InternalRecommendationPanel({ proposed }: InternalRecommendationPanelProps) {
  const provenance = PROVENANCE_LABELS_HU.RECOMMENDATION;
  const hasRecommendations = proposed.recommendations && proposed.recommendations.length > 0;

  return (
    <section
      data-testid="diagnostic-recommendations-panel"
      className="rounded-xl border border-[var(--adm-border)] bg-white p-5 shadow-xs space-y-6"
    >
      {/* Prominent Internal Only Warning Banner */}
      <div className="rounded-xl border-2 border-amber-400 bg-amber-50 p-4 text-amber-950">
        <div className="flex items-center gap-2 font-bold text-sm tracking-wide">
          <svg
            className="h-5 w-5 text-amber-600 shrink-0"
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
            aria-hidden="true"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"
            />
          </svg>
          <span>BELSŐ TERVEZET — AZ ÜGYFÉLPORTÁLON NEM LÁTHATÓ</span>
        </div>
        <p className="mt-1 text-xs text-amber-900 ml-7">
          Ez a felület belső tanácsadói és szakértői vizsgálatra szolgál. A javaslatok ebben a változatban nem kerülnek közzétételre az ügyfél felé, és semmilyen ügyféloldali döntési folyamatot nem indítanak el.
        </p>
      </div>

      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-[var(--adm-border)] pb-4">
        <div>
          <div className="flex items-center gap-2">
            <h2 className="text-base font-semibold text-[var(--adm-text)]">
              5. Belső javaslatok & Fejlesztési irányok
            </h2>
            <span
              className={`rounded-full border px-2 py-0.5 text-[11px] font-medium ${provenance.tone}`}
            >
              {provenance.label}
            </span>
          </div>
          <p className="mt-1 text-xs text-[var(--adm-text-muted)]">
            Determinisztikusan képzett vagy szakértői javaslattervezetek a feltárt diagnózisok orvoslására.
          </p>
        </div>

        <span className="text-xs text-[var(--adm-text-muted)]">
          {proposed.recommendations.length} javaslat
        </span>
      </div>

      {!hasRecommendations ? (
        <div className="rounded-lg border border-dashed border-[var(--adm-border)] bg-[var(--adm-surface)] p-6 text-center text-sm text-[var(--adm-text-muted)]">
          Nincs belső javaslat.
        </div>
      ) : (
        <div className="space-y-4">
          {proposed.recommendations.map((rec) => {
            const suffBadge = sufficiencyBadge(rec.sufficiency);
            const isAccepted = rec.status === "ACCEPTED";

            return (
              <div
                key={rec.id}
                className="rounded-lg border border-[var(--adm-border)] p-4 bg-white space-y-3"
              >
                <div className="flex flex-wrap items-start justify-between gap-2 border-b border-slate-100 pb-2">
                  <div className="space-y-1">
                    <h3 className="text-sm font-semibold text-[var(--adm-text)]">
                      {rec.title}
                    </h3>
                    <div className="flex flex-wrap gap-2 text-[10.5px] text-[var(--adm-text-muted)]">
                      {rec.domain ? (
                        <span className="text-slate-700">Tartomány: {rec.domain.name}</span>
                      ) : null}
                      {rec.businessProcess ? (
                        <>
                          <span>·</span>
                          <span className="text-slate-700">
                            Folyamat: {rec.businessProcess.name}
                          </span>
                        </>
                      ) : null}
                      <span>·</span>
                      <span>Típus: {rec.kind}</span>
                    </div>
                  </div>

                  <div className="flex items-center gap-2">
                    <span
                      className={`inline-flex items-center rounded-md px-2 py-0.5 text-[10.5px] font-medium border ${suffBadge.tone}`}
                    >
                      {suffBadge.label}
                    </span>

                    <span
                      className={`inline-flex items-center rounded-md px-2 py-0.5 text-[10.5px] font-medium border ${
                        isAccepted
                          ? "border-emerald-300 bg-emerald-50 text-emerald-900 font-semibold"
                          : "border-slate-200 bg-slate-50 text-slate-700"
                      }`}
                    >
                      {recommendationStatusLabelHu(rec.status)}
                    </span>
                  </div>
                </div>

                {isAccepted ? (
                  <div className="rounded border border-emerald-200 bg-emerald-50/60 px-3 py-1.5 text-[11px] text-emerald-900">
                    <span className="font-semibold">Belső státusz:</span> Belsőleg elfogadott. Ügyféloldali közzététel ebben a verzióban nem támogatott.
                  </div>
                ) : null}

                <div className="space-y-2 text-xs">
                  <div>
                    <span className="font-medium text-[var(--adm-text-muted)]">Problémafelvetés:</span>
                    <p className="mt-0.5 text-[var(--adm-text)]">{rec.problemStatement}</p>
                  </div>

                  <div>
                    <span className="font-medium text-[var(--adm-text-muted)]">Javasolt beavatkozási irány:</span>
                    <p className="mt-0.5 text-[var(--adm-text)]">{rec.direction}</p>
                  </div>
                </div>

                {/* Intervention Codes and Impact Tags */}
                <div className="pt-2 border-t border-slate-100 flex flex-wrap gap-2 text-xs">
                  {rec.interventionCodes && rec.interventionCodes.length > 0 ? (
                    <div className="flex flex-wrap items-center gap-1.5">
                      <span className="text-[10px] text-[var(--adm-text-muted)]">Beavatkozások:</span>
                      {rec.interventionCodes.map((code) => (
                        <span
                          key={code}
                          className="rounded-full border border-blue-200 bg-blue-50 px-2 py-0.5 text-[10px] text-blue-800"
                        >
                          {interventionLabelHu(code)}
                        </span>
                      ))}
                    </div>
                  ) : null}

                  {rec.impactTags && rec.impactTags.length > 0 ? (
                    <div className="flex flex-wrap items-center gap-1.5 ml-auto">
                      <span className="text-[10px] text-[var(--adm-text-muted)]">Hatások:</span>
                      {rec.impactTags.map((tag) => (
                        <span
                          key={tag}
                          className="rounded-full bg-slate-100 px-2 py-0.5 text-[10px] text-slate-700 font-medium"
                        >
                          #{tag}
                        </span>
                      ))}
                    </div>
                  ) : null}
                </div>

                {/* Linked Evidence */}
                {rec.evidence && rec.evidence.length > 0 ? (
                  <div className="pt-2 border-t border-slate-100 space-y-1">
                    <span className="text-[10.5px] font-medium text-[var(--adm-text-muted)]">
                      Kapcsolódó bizonyítékok ({rec.evidence.length}):
                    </span>
                    <div className="flex flex-wrap gap-1.5">
                      {rec.evidence.map((ev) => (
                        <span
                          key={ev.id}
                          className="rounded border border-slate-200 bg-slate-50 px-2 py-0.5 text-[10px] text-slate-700"
                          title={ev.title}
                        >
                          {ev.title} ({verificationStatusLabelHu(ev.verificationStatus)})
                        </span>
                      ))}
                    </div>
                  </div>
                ) : null}
              </div>
            );
          })}
        </div>
      )}
    </section>
  );
}
