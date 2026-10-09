"use client";

import { useEffect, useState } from "react";
import {
  getDiagnosticWorkbench,
  type DiagnosticWorkbenchDto,
} from "@/lib/diagnosticWorkbenchApi";
import { ApiError } from "@/lib/api";
import { growDiagnosticSummary } from "@/lib/growDiagnosticSummary";
import { CanonicalStatePanel } from "./CanonicalStatePanel";
import { ObservationPanel } from "./ObservationPanel";
import { DiagnosisPanel } from "./DiagnosisPanel";
import { EvidenceSufficiencyPanel } from "./EvidenceSufficiencyPanel";
import { InternalRecommendationPanel } from "./InternalRecommendationPanel";

interface GrowDiagnosticWorkbenchProps {
  clientId: string;
  clientName: string;
}

export function GrowDiagnosticWorkbench({
  clientId,
  clientName,
}: GrowDiagnosticWorkbenchProps) {
  const [result, setResult] = useState<{ clientId: string; data: DiagnosticWorkbenchDto } | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [statusCode, setStatusCode] = useState<number | null>(null);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setResult(null);
    setError(null);
    setStatusCode(null);

    getDiagnosticWorkbench(clientId)
      .then((dto) => {
        if (!cancelled) {
          setResult({ clientId, data: dto });
          setLoading(false);
        }
      })
      .catch((err: unknown) => {
        if (!cancelled) {
          if (err instanceof ApiError) {
            setStatusCode(err.status);
            if (err.status === 403) {
              setError("Nincs jogosultsága a belső diagnosztikai munkaasztal megtekintésére.");
            } else if (err.status === 404) {
              setError("Az ügyfél nem található vagy nem érhető el diagnosztikai profil.");
            } else {
              setError("A diagnosztikai adatok betöltése sikertelen.");
            }
          } else {
            setError("Hiba történt a diagnosztikai adatok lekérése során.");
          }
          setLoading(false);
        }
      });

    return () => {
      cancelled = true;
    };
  }, [clientId]);

  if (loading || (result && result.clientId !== clientId)) {
    return (
      <div
        data-testid="diagnostic-workbench-loading"
        className="rounded-xl border border-[var(--adm-border)] bg-white p-8 text-center text-sm text-[var(--adm-text-muted)]"
      >
        <div className="inline-block h-6 w-6 animate-spin rounded-full border-2 border-slate-300 border-t-slate-600 mb-2" />
        <p>Diagnosztikai adatok betöltése folyamatban…</p>
      </div>
    );
  }

  if (error) {
    return (
      <div
        data-testid="diagnostic-workbench-error"
        className={`rounded-xl border p-5 text-sm ${
          statusCode === 403
            ? "border-amber-200 bg-amber-50 text-amber-900"
            : statusCode === 404
            ? "border-slate-200 bg-slate-50 text-slate-800"
            : "border-rose-200 bg-rose-50 text-rose-800"
        }`}
        role="alert"
      >
        <h3 className="font-semibold text-base mb-1">
          {statusCode === 403
            ? "Hozzáférés megtagadva (403)"
            : statusCode === 404
            ? "Ügyfél nem található (404)"
            : "Hiba történt"}
        </h3>
        <p>{error}</p>
      </div>
    );
  }

  const data = result?.clientId === clientId ? result.data : null;
  if (!data) {
    return null;
  }

  return (
    <div
      data-testid="grow-diagnostic-workbench"
      className="space-y-6 pb-12"
    >
      {/* Workbench Header */}
      <div className="rounded-xl border border-[var(--adm-border)] bg-white p-5 shadow-xs">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <div className="flex items-center gap-2">
              <span className="rounded bg-slate-900 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider text-white">
                Belső vizsgálat
              </span>
              <h1 className="text-lg font-bold text-[var(--adm-text)]">
                Diagnosztikai munkaasztal — {data.client?.name || clientName}
              </h1>
            </div>
            <p className="mt-1 text-xs text-[var(--adm-text-muted)]">
              A rögzített tények, ügyféljelzések és működési adatok külön kezelve. Az ellenőrizendő részletek lent lenyithatók.
            </p>
          </div>
        </div>
      </div>

      <section aria-label="Diagnosztikai áttekintés" className="grid gap-3 md:grid-cols-2" data-testid="diagnostic-readable-summary">
        {growDiagnosticSummary(data).map(({ question, answer }) => (
          <article key={question} className="min-w-0 rounded-xl border border-[var(--adm-border)] bg-white p-4">
            <h2 className="font-serif text-base font-semibold text-[var(--adm-text)]">{question}</h2>
            <p className="mt-2 break-words text-sm leading-relaxed text-[var(--adm-text-muted)]">{answer}</p>
          </article>
        ))}
      </section>

      <details className="rounded-xl border border-[var(--adm-border)] bg-white p-4" data-testid="diagnostic-technical-detail">
        <summary className="cursor-pointer text-sm font-semibold text-[var(--adm-green-800)]">Részletes diagnosztika és technikai eredet</summary>
        <div className="mt-5 space-y-6">
          <CanonicalStatePanel client={data.client} known={data.known} />
          <ObservationPanel observed={data.observed} />
          <DiagnosisPanel problems={data.problems} />
          <EvidenceSufficiencyPanel
            evidence={data.evidence}
            missing={data.missing}
            sufficiency={data.problems.sufficiency}
            diagnoses={data.problems.diagnoses}
            recommendations={data.proposed.recommendations}
          />
          <InternalRecommendationPanel proposed={data.proposed} />
        </div>
      </details>
    </div>
  );
}
