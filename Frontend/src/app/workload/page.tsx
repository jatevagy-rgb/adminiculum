"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { AuthenticatedApp } from "@/components/AuthenticatedApp";
import { getWorkflowWorkload, type WorkflowWorkloadResponse } from "@/lib/api";

type Scope = "MY_WORK" | "MY_CASES" | "TEAM";

const SCOPE_LABELS: Record<Scope, string> = {
  MY_WORK: "Saját munka",
  MY_CASES: "Ügyeim",
  TEAM: "Csapatnézet",
};

function minutesLabel(minutes: number): string {
  if (!minutes) return "0 óra";
  const hours = Math.floor(minutes / 60);
  const rest = minutes % 60;
  return rest ? `${hours} óra ${rest} perc` : `${hours} óra`;
}

function dateLabel(value: string | null): string {
  if (!value) return "Nincs határidő";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "Nincs határidő";
  return date.toLocaleDateString("hu-HU", { dateStyle: "medium" });
}

function WorkloadContent() {
  const [scope, setScope] = useState<Scope>("MY_WORK");
  const [data, setData] = useState<WorkflowWorkloadResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async (nextScope: Scope) => {
    setLoading(true);
    setError(null);
    try {
      const response = await getWorkflowWorkload({ scope: nextScope });
      setData(response);
    } catch (loadError) {
      setData(null);
      setError(loadError instanceof Error ? loadError.message : "A munkateher nézet most nem elérhető.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load(scope);
  }, [load, scope]);

  const scopeOptions = useMemo(() => {
    const teamAvailable = data?.availability.teamScope || scope === "TEAM";
    return (["MY_WORK", "MY_CASES", "TEAM"] as Scope[]).filter((item) => item !== "TEAM" || teamAvailable);
  }, [data?.availability.teamScope, scope]);

  return (
    <div className="min-h-screen bg-[var(--adm-bg)] text-[var(--adm-ink)]">
      <main className="mx-auto flex w-full max-w-7xl flex-col gap-6 px-6 py-8">
        <section className="rounded-[28px] border border-[var(--adm-border)] bg-white p-6 shadow-[0_18px_55px_rgba(2,48,71,0.08)]">
          <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.22em] text-[var(--adm-steel)]">Felelősség · munkateher · idő</p>
              <h1 className="mt-2 text-3xl font-semibold text-[var(--adm-ink)]">Munkaszervezési központ</h1>
              <p className="mt-2 max-w-3xl text-sm leading-6 text-[var(--adm-slate)]">
                Belső, ügyközpontú áttekintés nyitott feladatokról, határidős figyelmet igénylő munkáról és rögzített időről. Nem teljesítmény-rangsor és nem passzív időmérés.
              </p>
            </div>
            <Link href="/time-entries" className="rounded-full border border-[var(--adm-border)] px-4 py-2 text-sm font-semibold text-[var(--adm-ink)] transition hover:border-[var(--adm-ink)]">
              Időrögzítés megnyitása
            </Link>
          </div>
        </section>

        <section className="flex flex-wrap gap-2">
          {scopeOptions.map((option) => (
            <button
              key={option}
              type="button"
              onClick={() => setScope(option)}
              className={`rounded-full border px-4 py-2 text-sm font-semibold transition ${
                scope === option
                  ? "border-[var(--adm-ink)] bg-[var(--adm-ink)] text-white"
                  : "border-[var(--adm-border)] bg-white text-[var(--adm-slate)] hover:border-[var(--adm-ink)]"
              }`}
            >
              {SCOPE_LABELS[option]}
            </button>
          ))}
        </section>

        {loading ? (
          <div className="rounded-3xl border border-[var(--adm-border)] bg-white p-6 text-sm text-[var(--adm-slate)]">Munkateher adatok betöltése…</div>
        ) : error ? (
          <div className="rounded-3xl border border-[#FCD34D] bg-[#FFFBEB] p-6 text-sm text-[#92400E]">{error}</div>
        ) : data ? (
          <>
            <section className="grid gap-4 md:grid-cols-4">
              <SummaryCard label="Ügyek" value={String(data.summary.caseCount)} />
              <SummaryCard label="Nyitott feladat" value={String(data.summary.openTaskCount)} />
              <SummaryCard label="Lejárt figyelem" value={String(data.summary.overdueTaskCount)} accent="terracotta" />
              <SummaryCard label="Rögzített idő" value={minutesLabel(data.summary.recordedMinutes)} />
            </section>

            <section className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_minmax(360px,0.8fr)]">
              <div className="rounded-[28px] border border-[var(--adm-border)] bg-white p-5">
                <div className="mb-4 flex items-center justify-between">
                  <h2 className="text-lg font-semibold text-[var(--adm-ink)]">Felelősök és nyitott munka</h2>
                  <span className="rounded-full bg-[var(--adm-blue-50)] px-3 py-1 text-xs font-semibold text-[var(--adm-blue-700)]">operatív nézet</span>
                </div>
                {data.people.length ? (
                  <div className="space-y-3">
                    {data.people.map((person) => (
                      <div key={person.user.id} className="rounded-2xl border border-[var(--adm-border)] p-4">
                        <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
                          <div>
                            <p className="font-semibold text-[var(--adm-ink)]">{person.user.name || person.user.email || "Névtelen felhasználó"}</p>
                            <p className="text-xs text-[var(--adm-steel)]">{person.caseCount} ügy · {person.user.role || "belső szerep"}</p>
                          </div>
                          <div className="flex flex-wrap gap-2 text-xs font-semibold">
                            <span className="rounded-full bg-[var(--adm-blue-50)] px-3 py-1 text-[var(--adm-blue-700)]">{person.openTaskCount} nyitott</span>
                            <span className="rounded-full bg-[#FFF7ED] px-3 py-1 text-[#C2410C]">{person.overdueTaskCount} lejárt</span>
                            <span className="rounded-full bg-[#F0FDFA] px-3 py-1 text-[#0F766E]">{minutesLabel(person.recordedMinutes)}</span>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                ) : (
                  <p className="rounded-2xl border border-dashed border-[var(--adm-border)] p-5 text-sm text-[var(--adm-slate)]">
                    Ebben a nézetben nincs megjeleníthető nyitott feladat vagy rögzített idő.
                  </p>
                )}
              </div>

              <div className="rounded-[28px] border border-[var(--adm-border)] bg-white p-5">
                <h2 className="text-lg font-semibold text-[var(--adm-ink)]">Ügyek, ahol érdemes folytatni</h2>
                <div className="mt-4 space-y-3">
                  {data.cases.slice(0, 8).map((caseItem) => (
                    <Link
                      key={caseItem.id}
                      href={`/cases/${caseItem.id}`}
                      className="block rounded-2xl border border-[var(--adm-border)] p-4 transition hover:border-[var(--adm-blue-500)] hover:bg-[var(--adm-blue-50)]"
                    >
                      <p className="text-sm font-semibold text-[var(--adm-ink)]">{caseItem.caseNumber} · {caseItem.title}</p>
                      <p className="mt-1 text-xs text-[var(--adm-steel)]">{dateLabel(caseItem.deadline)} · {caseItem.openTaskCount} nyitott feladat</p>
                    </Link>
                  ))}
                  {!data.cases.length && (
                    <p className="rounded-2xl border border-dashed border-[var(--adm-border)] p-5 text-sm text-[var(--adm-slate)]">
                      Nincs ügy ebben a munkateher nézetben.
                    </p>
                  )}
                </div>
              </div>
            </section>

            <section className="rounded-3xl border border-[var(--adm-border)] bg-white p-5 text-sm text-[var(--adm-slate)]">
              Aktív/passzív időmérő nincs bekapcsolva. A nézet csak kézzel rögzített, matter-alapú időbejegyzéseket mutat ott, ahol ez a jelenlegi adatmodellben támogatott.
            </section>
          </>
        ) : null}
      </main>
    </div>
  );
}

function SummaryCard({ label, value, accent }: { label: string; value: string; accent?: "terracotta" }) {
  return (
    <div className={`rounded-[24px] border bg-white p-5 ${accent === "terracotta" ? "border-[#FDBA74]" : "border-[var(--adm-border)]"}`}>
      <p className="text-xs font-semibold uppercase tracking-[0.18em] text-[var(--adm-steel)]">{label}</p>
      <p className="mt-2 text-2xl font-semibold text-[var(--adm-ink)]">{value}</p>
    </div>
  );
}

export default function WorkloadPage() {
  return (
    <AuthenticatedApp section="tasks">
      <WorkloadContent />
    </AuthenticatedApp>
  );
}
