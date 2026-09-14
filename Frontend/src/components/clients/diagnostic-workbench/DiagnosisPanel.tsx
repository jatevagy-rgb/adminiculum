"use client";

import type { DiagnosticWorkbenchDto } from "@/lib/diagnosticWorkbenchApi";
import {
  PROVENANCE_LABELS_HU,
  verificationStatusLabelHu,
} from "@/lib/diagnosticWorkbenchApi";

interface DiagnosisPanelProps {
  problems: DiagnosticWorkbenchDto["problems"];
}

export function DiagnosisPanel({ problems }: DiagnosisPanelProps) {
  const provenance = PROVENANCE_LABELS_HU.DERIVED_DIAGNOSIS;
  const hasDiagnoses = problems.diagnoses && problems.diagnoses.length > 0;
  const hasDomains = problems.domains && problems.domains.length > 0;

  return (
    <section
      data-testid="diagnostic-problems-panel"
      className="rounded-xl border border-[var(--adm-border)] bg-white p-5 shadow-xs space-y-6"
    >
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-[var(--adm-border)] pb-4">
        <div>
          <div className="flex items-center gap-2">
            <h2 className="text-base font-semibold text-[var(--adm-text)]">
              3. Feltárt működési problémák & Diagnózisok
            </h2>
            <span
              className={`rounded-full border px-2 py-0.5 text-[11px] font-medium ${provenance.tone}`}
            >
              {provenance.label}
            </span>
          </div>
          <p className="mt-1 text-xs text-[var(--adm-text-muted)]">
            A tényekből és megfigyelésekből származtatott diagnosztikai megállapítások és problématartományok.
          </p>
        </div>
      </div>

      {/* Problem Domains */}
      {hasDomains ? (
        <div className="space-y-3">
          <h3 className="text-xs font-semibold uppercase tracking-wider text-[var(--adm-text-muted)]">
            Érintett problématartományok ({problems.domains.length})
          </h3>
          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-3">
            {problems.domains.map((dom) => (
              <div
                key={dom.id}
                className="rounded-lg border border-[var(--adm-border)] bg-[var(--adm-surface)] p-3 text-xs space-y-1"
              >
                <div className="flex items-center justify-between">
                  <span className="font-semibold text-[var(--adm-text)]">{dom.name}</span>
                  <span className="font-mono text-[10px] text-[var(--adm-text-muted)]">{dom.key}</span>
                </div>
                {dom.description ? (
                  <p className="text-[var(--adm-text-muted)] line-clamp-2">{dom.description}</p>
                ) : null}
              </div>
            ))}
          </div>
        </div>
      ) : null}

      {/* Diagnoses List */}
      <div className="space-y-3">
        <h3 className="text-sm font-semibold text-[var(--adm-text)] flex items-center justify-between">
          <span>Levezetett diagnózisok listája</span>
          <span className="text-xs font-normal text-[var(--adm-text-muted)]">
            {problems.diagnoses.length} tétel
          </span>
        </h3>

        {!hasDiagnoses ? (
          <div className="rounded-lg border border-dashed border-[var(--adm-border)] bg-[var(--adm-surface)] p-6 text-center text-sm text-[var(--adm-text-muted)]">
            Nincs még feltárt diagnózis.
          </div>
        ) : (
          <div className="space-y-3">
            {problems.diagnoses.map((diag) => (
              <div
                key={diag.id}
                className="rounded-lg border border-[var(--adm-border)] p-4 bg-white space-y-3"
              >
                <div className="flex flex-wrap items-start justify-between gap-2 border-b border-slate-100 pb-2">
                  <div className="space-y-1">
                    <h4 className="text-sm font-semibold text-[var(--adm-text)]">
                      {diag.title}
                    </h4>
                    <div className="flex flex-wrap gap-2 text-[10px] text-[var(--adm-text-muted)]">
                      {diag.problemDomain ? (
                        <span className="font-medium text-slate-700">
                          Tartomány: {diag.problemDomain.name}
                        </span>
                      ) : null}
                      {diag.businessProcess ? (
                        <>
                          <span>·</span>
                          <span className="text-slate-700">
                            Folyamat: {diag.businessProcess.name}
                          </span>
                        </>
                      ) : null}
                    </div>
                  </div>

                  <span className="rounded bg-slate-100 px-2 py-0.5 text-[10px] font-medium text-slate-700">
                    {diag.status}
                  </span>
                </div>

                {diag.summary ? (
                  <p className="text-xs text-[var(--adm-text)] leading-relaxed">
                    {diag.summary}
                  </p>
                ) : null}

                {/* Linked Evidence */}
                {diag.evidence && diag.evidence.length > 0 ? (
                  <div className="pt-2 border-t border-slate-100 space-y-1.5">
                    <span className="text-[11px] font-medium text-[var(--adm-text-muted)]">
                      Kapcsolódó bizonyítékok ({diag.evidence.length}):
                    </span>
                    <div className="flex flex-wrap gap-2">
                      {diag.evidence.map((ev) => (
                        <div
                          key={ev.id}
                          className="flex items-center gap-1.5 rounded-md border border-slate-200 bg-slate-50 px-2 py-1 text-[11px]"
                        >
                          <span className="font-medium text-[var(--adm-text)] truncate max-w-[200px]" title={ev.title}>
                            {ev.title}
                          </span>
                          <span className="text-[10px] text-slate-500">
                            ({verificationStatusLabelHu(ev.verificationStatus)})
                          </span>
                        </div>
                      ))}
                    </div>
                  </div>
                ) : (
                  <p className="text-[11px] text-[var(--adm-text-muted)] italic">
                    Nincs közvetlenül kapcsolt bizonyíték.
                  </p>
                )}
              </div>
            ))}
          </div>
        )}
      </div>
    </section>
  );
}
