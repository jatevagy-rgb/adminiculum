"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { AuthenticatedApp } from "@/components/AuthenticatedApp";
import { Alert, Button, DataTable, DataTableBody, DataTableCell, DataTableEmpty, DataTableHead, DataTableHeaderCell, DataTableRow, EmptyState, PageHeader, QuietLink } from "@/components/ui";
import { getWorkflowWorkload, type WorkflowWorkloadResponse } from "@/lib/api";
import { getCaseMatterTypeLabel } from "@/lib/caseLabels";

type Scope = "MY_WORK" | "MY_CASES" | "TEAM";
const SCOPE_LABELS: Record<Scope, string> = { MY_WORK: "Saját munka", MY_CASES: "Ügyeim", TEAM: "Csapatnézet" };
const ROLE_LABELS: Record<string, string> = {
  ADMIN: "Adminisztrátor", PARTNER: "Partner", LAWYER: "Ügyvéd", TRAINEE: "Ügyvédjelölt",
  LEGAL_ASSISTANT: "Jogi asszisztens", CLIENT: "Ügyfél", EXTERNAL_REVIEWER: "Külső bíráló", COLLAB_LAWYER: "Együttműködő ügyvéd",
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
  return Number.isNaN(date.getTime()) ? "Nincs határidő" : date.toLocaleDateString("hu-HU", { dateStyle: "medium" });
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
      setData(await getWorkflowWorkload({ scope: nextScope }));
    } catch (loadError) {
      setData(null);
      setError(loadError instanceof Error ? loadError.message : "A munkateher nézet most nem elérhető.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { void load(scope); }, [load, scope]);
  const scopeOptions = useMemo(() => {
    const teamAvailable = data?.availability.teamScope || scope === "TEAM";
    return (["MY_WORK", "MY_CASES", "TEAM"] as Scope[]).filter((item) => item !== "TEAM" || teamAvailable);
  }, [data?.availability.teamScope, scope]);

  return (
    <div className="min-h-screen bg-white text-[#1F2937]">
      <main className="mx-auto flex w-full max-w-7xl flex-col gap-5 px-4 py-5 sm:px-6">
        <PageHeader title="Munkaterhelés" actions={scopeOptions.map((option) => (
          <Button key={option} size="sm" variant={scope === option ? "primary" : "neutral"} aria-pressed={scope === option} onClick={() => setScope(option)}>{SCOPE_LABELS[option]}</Button>
        ))} />
        {loading ? (
          <div className="rounded-[12px] border border-[#E5E7E6] bg-white p-5 text-sm text-[#6B7280]">Munkateher adatok betöltése…</div>
        ) : error ? (
          <Alert variant="warning">{error}</Alert>
        ) : data ? (
          <>
            <section className="grid gap-px overflow-hidden rounded-[12px] border border-[#E5E7E6] bg-[#E5E7E6] md:grid-cols-4">
              <SummaryCell label="Ügyek" value={String(data.summary.caseCount)} />
              <SummaryCell label="Nyitott feladat" value={String(data.summary.openTaskCount)} />
              <SummaryCell label="Lejárt figyelem" value={String(data.summary.overdueTaskCount)} overdue={data.summary.overdueTaskCount > 0} />
              <SummaryCell label="Rögzített idő" value={minutesLabel(data.summary.recordedMinutes)} />
            </section>
            <section className="space-y-3">
              <h2 className="text-base font-semibold">Felelősök és nyitott munka</h2>
              <DataTable>
                <DataTableHead><DataTableRow>
                  <DataTableHeaderCell>Munkatárs</DataTableHeaderCell><DataTableHeaderCell>Szerep</DataTableHeaderCell><DataTableHeaderCell>Ügyek</DataTableHeaderCell><DataTableHeaderCell>Nyitott feladat</DataTableHeaderCell><DataTableHeaderCell>Lejárt</DataTableHeaderCell><DataTableHeaderCell>Rögzített idő</DataTableHeaderCell>
                </DataTableRow></DataTableHead>
                <DataTableBody>
                  {data.people.length ? data.people.map((person) => (
                    <DataTableRow key={person.user.id}>
                      <DataTableCell>{person.user.name || person.user.email || "Névtelen felhasználó"}</DataTableCell>
                      <DataTableCell muted>{ROLE_LABELS[person.user.role || ""] || person.user.role || "Belső szerep"}</DataTableCell>
                      <DataTableCell>{person.caseCount}</DataTableCell><DataTableCell>{person.openTaskCount}</DataTableCell>
                      <DataTableCell className={person.overdueTaskCount > 0 ? "text-[#B85C4B]" : undefined}>{person.overdueTaskCount}</DataTableCell>
                      <DataTableCell>{minutesLabel(person.recordedMinutes)}</DataTableCell>
                    </DataTableRow>
                  )) : <DataTableEmpty colSpan={6}><EmptyState className="border-0 rounded-none" title="Nincs megjeleníthető nyitott munka." /></DataTableEmpty>}
                </DataTableBody>
              </DataTable>
            </section>
            <section className="space-y-3">
              <h2 className="text-base font-semibold">Ügyek, ahol érdemes folytatni</h2>
              <div className="overflow-hidden rounded-[12px] border border-[#E5E7E6] bg-white divide-y divide-[#E5E7E6]">
                {data.cases.length ? data.cases.slice(0, 8).map((caseItem) => (
                  <div key={caseItem.id} className="flex flex-wrap items-center justify-between gap-3 p-3">
                    <div>
                      <QuietLink href={`/cases/${caseItem.id}`}>{caseItem.caseNumber} · {caseItem.title}</QuietLink>
                      <p className="mt-1 text-xs text-[#6B7280]">{getCaseMatterTypeLabel(caseItem.title)} · {dateLabel(caseItem.deadline)} · {caseItem.openTaskCount} nyitott feladat</p>
                    </div>
                    {data.availability.caseTime ? <Button size="sm" variant="secondary" onClick={() => window.location.assign(`/time-entries?caseId=${caseItem.id}`)}>Időrögzítés</Button> : null}
                  </div>
                )) : <EmptyState className="border-0 rounded-none" title="Nincs ügy ebben a munkateher nézetben." />}
              </div>
            </section>
            <p className="text-sm text-[#6B7280]">Aktív/passzív időmérő nincs bekapcsolva. A nézet csak kézzel rögzített időbejegyzéseket mutat.</p>
          </>
        ) : null}
      </main>
    </div>
  );
}

function SummaryCell({ label, value, overdue = false }: { label: string; value: string; overdue?: boolean }) {
  return <div className="bg-white p-4"><p className="text-xs font-semibold uppercase tracking-[0.12em] text-[#6B7280]">{label}</p><p className={`mt-2 text-xl font-semibold ${overdue ? "text-[#B85C4B]" : "text-[#1F2937]"}`}>{value}</p></div>;
}

export default function WorkloadPage() {
  return <AuthenticatedApp section="tasks"><WorkloadContent /></AuthenticatedApp>;
}
