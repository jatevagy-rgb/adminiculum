"use client";

import { useMemo } from "react";
import type { DiagnosticWorkbenchDto } from "@/lib/diagnosticWorkbenchApi";
import {
  PROVENANCE_LABELS_HU,
  verificationStatusLabelHu,
} from "@/lib/diagnosticWorkbenchApi";
import { GrowProcessMap } from "@/components/clients/GrowProcessMap";
import type { ProcessStepLike } from "@/lib/processMapProjection";

interface CanonicalStatePanelProps {
  client: DiagnosticWorkbenchDto["client"];
  known: DiagnosticWorkbenchDto["known"];
}

export function CanonicalStatePanel({ client, known }: CanonicalStatePanelProps) {
  const hasFacts = known.facts && known.facts.length > 0;
  const hasProcesses = known.processes && known.processes.length > 0;
  const hasSystems = known.systems && known.systems.length > 0;
  const hasAnyData = hasFacts || hasProcesses || hasSystems || client.operatingProfile;

  const provenance = PROVENANCE_LABELS_HU.CANONICAL_STATE;

  return (
    <section
      data-testid="diagnostic-canonical-state-panel"
      className="rounded-xl border border-[var(--adm-border)] bg-white p-5 shadow-xs space-y-6"
    >
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-[var(--adm-border)] pb-4">
        <div>
          <div className="flex items-center gap-2">
            <h2 className="text-base font-semibold text-[var(--adm-text)]">
              1. Kanonikus vállalati állapot
            </h2>
            <span
              className={`rounded-full border px-2 py-0.5 text-[11px] font-medium ${provenance.tone}`}
            >
              {provenance.label}
            </span>
          </div>
          <p className="mt-1 text-xs text-[var(--adm-text-muted)]">
            A vállalat törzsadatbázisában nyilvántartott profil, tények, rendszerek és üzleti folyamatok.
          </p>
        </div>
      </div>

      {!hasAnyData ? (
        <div className="rounded-lg border border-dashed border-[var(--adm-border)] bg-[var(--adm-surface)] p-6 text-center text-sm text-[var(--adm-text-muted)]">
          Még nincs elegendő rögzített vállalati adat.
        </div>
      ) : (
        <div className="space-y-6">
          {/* Operating Profile */}
          {client.operatingProfile ? (
            <div className="rounded-lg border border-[var(--adm-border)] bg-[var(--adm-surface)] p-4">
              <h3 className="text-xs font-semibold uppercase tracking-wider text-[var(--adm-text-muted)]">
                Működési profil & Megfelelőség
              </h3>
              <div className="mt-3 grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-4 text-xs">
                <div>
                  <span className="text-[var(--adm-text-muted)]">Státusz:</span>
                  <p className="font-medium text-[var(--adm-text)]">
                    {client.operatingProfile.status || "—"}
                  </p>
                </div>
                <div>
                  <span className="text-[var(--adm-text-muted)]">Megfelelőségi szint:</span>
                  <p className="font-medium text-[var(--adm-text)]">
                    {client.operatingProfile.complianceEnrollmentStatus || "—"}
                  </p>
                </div>
                <div>
                  <span className="text-[var(--adm-text-muted)]">Utolsó felülvizsgálat:</span>
                  <p className="font-medium text-[var(--adm-text)]">
                    {client.operatingProfile.lastReviewedAt
                      ? new Date(client.operatingProfile.lastReviewedAt).toLocaleDateString("hu-HU")
                      : "—"}
                  </p>
                </div>
                <div>
                  <span className="text-[var(--adm-text-muted)]">Következő felülvizsgálat:</span>
                  <p className="font-medium text-[var(--adm-text)]">
                    {client.operatingProfile.nextReviewAt
                      ? new Date(client.operatingProfile.nextReviewAt).toLocaleDateString("hu-HU")
                      : "—"}
                  </p>
                </div>
              </div>
              {client.operatingProfile.summary ? (
                <div className="mt-3 border-t border-[var(--adm-border)] pt-2 text-xs text-[var(--adm-text)]">
                  <span className="font-medium">Összegzés: </span>
                  {client.operatingProfile.summary}
                </div>
              ) : null}
            </div>
          ) : null}

          {/* Facts Section */}
          <div className="space-y-3">
            <h3 className="text-sm font-semibold text-[var(--adm-text)] flex items-center justify-between">
              <span>Nyilvántartott vállalati tények</span>
              <span className="text-xs font-normal text-[var(--adm-text-muted)]">
                {known.facts.length} tétel
              </span>
            </h3>

            {!hasFacts ? (
              <p className="text-xs text-[var(--adm-text-muted)] italic">
                Még nincs elegendő rögzített vállalati adat.
              </p>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs border-collapse">
                  <thead>
                    <tr className="border-b border-[var(--adm-border)] text-[var(--adm-text-muted)] bg-[var(--adm-surface)]">
                      <th className="py-2 px-3 font-medium">Tény típusa / Mező</th>
                      <th className="py-2 px-3 font-medium">Érték</th>
                      <th className="py-2 px-3 font-medium">Hitelesítés</th>
                      <th className="py-2 px-3 font-medium">Módszer</th>
                      <th className="py-2 px-3 font-medium">Érvényesség</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-[var(--adm-border)]">
                    {known.facts.map((fact) => {
                      const isUnknown =
                        fact.verificationStatus === "UNKNOWN" ||
                        fact.value === "UNKNOWN" ||
                        !fact.value;
                      return (
                        <tr
                          key={fact.id}
                          className={`hover:bg-slate-50/50 ${
                            isUnknown ? "bg-amber-50/30" : ""
                          }`}
                        >
                          <td className="py-2 px-3 font-medium text-[var(--adm-text)]">
                            <div>{fact.factDefinition?.key || fact.type}</div>
                            {fact.factDefinition?.domainCode ? (
                              <span className="text-[10px] text-[var(--adm-text-muted)]">
                                {fact.factDefinition.domainCode}
                              </span>
                            ) : null}
                          </td>
                          <td className="py-2 px-3">
                            <span
                              className={`font-mono text-xs ${
                                isUnknown ? "text-amber-800 font-semibold" : "text-[var(--adm-text)]"
                              }`}
                            >
                              {fact.value || "—"}
                            </span>
                          </td>
                          <td className="py-2 px-3">
                            <span
                              className={`inline-flex items-center rounded-md px-1.5 py-0.5 text-[10px] font-medium border ${
                                fact.verificationStatus === "VERIFIED"
                                  ? "border-emerald-200 bg-emerald-50 text-emerald-800"
                                  : fact.verificationStatus === "UNKNOWN"
                                  ? "border-amber-300 bg-amber-100 text-amber-900 font-semibold"
                                  : "border-slate-200 bg-slate-50 text-slate-700"
                              }`}
                            >
                              {verificationStatusLabelHu(fact.verificationStatus)}
                            </span>
                          </td>
                          <td className="py-2 px-3 text-[var(--adm-text-muted)]">
                            {fact.determinationMethod || "—"}
                          </td>
                          <td className="py-2 px-3 text-[var(--adm-text-muted)] whitespace-nowrap">
                            {fact.validFrom ? new Date(fact.validFrom).toLocaleDateString("hu-HU") : "—"}
                            {fact.validTo ? ` – ${new Date(fact.validTo).toLocaleDateString("hu-HU")}` : ""}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </div>

          {/* Systems Section */}
          <div className="space-y-3 border-t border-[var(--adm-border)] pt-4">
            <h3 className="text-sm font-semibold text-[var(--adm-text)] flex items-center justify-between">
              <span>Nyilvántartott informatikai rendszerek</span>
              <span className="text-xs font-normal text-[var(--adm-text-muted)]">
                {known.systems.length} rendszer
              </span>
            </h3>

            {!hasSystems ? (
              <p className="text-xs text-[var(--adm-text-muted)] italic">
                Még nincs rögzített informatikai rendszer.
              </p>
            ) : (
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                {known.systems.map((sys) => (
                  <div
                    key={sys.id}
                    className="rounded-lg border border-[var(--adm-border)] p-3 text-xs space-y-1 bg-white"
                  >
                    <div className="flex items-center justify-between">
                      <span className="font-semibold text-[var(--adm-text)]">{sys.name}</span>
                      <span className="rounded bg-slate-100 px-1.5 py-0.5 text-[10px] text-slate-700">
                        {sys.category}
                      </span>
                    </div>
                    {sys.vendor ? (
                      <p className="text-[var(--adm-text-muted)]">Szállító: {sys.vendor}</p>
                    ) : null}
                    {sys.purpose ? (
                      <p className="text-[var(--adm-text)] line-clamp-2">{sys.purpose}</p>
                    ) : null}
                    <div className="pt-1 flex items-center justify-between text-[10px] text-[var(--adm-text-muted)] border-t border-slate-100">
                      <span>Felelős: {sys.owner?.name || "—"}</span>
                      <span>Státusz: {sys.status}</span>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Processes Section */}
          <div className="space-y-4 border-t border-[var(--adm-border)] pt-4">
            <h3 className="text-sm font-semibold text-[var(--adm-text)] flex items-center justify-between">
              <span>Nyilvántartott üzleti folyamatok & folyamattérkép</span>
              <span className="text-xs font-normal text-[var(--adm-text-muted)]">
                {known.processes.length} folyamat
              </span>
            </h3>

            {!hasProcesses ? (
              <p className="text-xs text-[var(--adm-text-muted)] italic">
                Még nincs rögzített üzleti folyamat.
              </p>
            ) : (
              <div className="space-y-4">
                {known.processes.map((proc) => {
                  const mappedSteps: ProcessStepLike[] = (proc.steps || []).map((s) => ({
                    id: s.id,
                    position: s.position,
                    name: s.name,
                    stepType: s.stepType,
                    isApproval: s.isApproval,
                    responsiblePersonId: s.responsiblePerson?.id,
                    responsiblePersonName: s.responsiblePerson?.name,
                    systemId: s.system?.id,
                    systemName: s.system?.name,
                    estimatedActiveMinutes: s.estimatedActiveMinutes,
                    estimatedWaitingMinutes: s.estimatedWaitingMinutes,
                  }));

                  return (
                    <div
                      key={proc.id}
                      className="rounded-lg border border-[var(--adm-border)] p-4 bg-white space-y-3"
                    >
                      <div className="flex flex-wrap items-baseline justify-between gap-2 border-b border-slate-100 pb-2">
                        <div>
                          <h4 className="text-xs font-semibold text-[var(--adm-text)]">
                            {proc.name}
                          </h4>
                          <div className="flex flex-wrap gap-2 text-[10px] text-[var(--adm-text-muted)] mt-0.5">
                            <span>Kategória: {proc.category}</span>
                            <span>·</span>
                            <span>Kritikusság: {proc.criticality}</span>
                            <span>·</span>
                            <span>Gyakoriság: {proc.frequency}</span>
                            <span>·</span>
                            <span>Felelős: {proc.owner?.name || "Nincs kijelölve"}</span>
                          </div>
                        </div>
                        <span className="rounded bg-slate-100 px-2 py-0.5 text-[10px] font-medium text-slate-700">
                          {proc.status}
                        </span>
                      </div>

                      {proc.description ? (
                        <p className="text-xs text-[var(--adm-text)]">{proc.description}</p>
                      ) : null}

                      <div className="pt-2">
                        <p className="text-[11px] font-medium text-[var(--adm-text-muted)] mb-2">
                          Folyamatlépések ({proc.steps.length} lépés):
                        </p>
                        <GrowProcessMap steps={mappedSteps} compact />
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>
      )}
    </section>
  );
}
