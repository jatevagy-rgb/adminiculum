"use client";

import { use, useEffect, useState } from "react";
import Link from "next/link";
import { AuthenticatedApp } from "@/components/AuthenticatedApp";
import { OperationalPageHeader } from "@/components/adminiculum/OperationalPrimitives";
import { CaseWorkspaceNav } from "@/components/cases/CaseWorkspaceNav";
import { HandoffPackagePanel } from "@/components/handoff/HandoffPackagePanel";
import { ApiError, getCaseSummary } from "@/lib/api";

type CaseHandoffPageProps = {
  params: Promise<{ caseId: string }>;
};

type CaseHeaderInfo = {
  caseNumber: string;
  title: string;
  clientName: string;
};

export default function CaseHandoffPage({ params }: CaseHandoffPageProps) {
  return (
    <AuthenticatedApp section="case-detail">
      <CaseHandoffPageContent params={params} />
    </AuthenticatedApp>
  );
}

function CaseHandoffPageContent({ params }: CaseHandoffPageProps) {
  const resolved = use(params);
  const caseId = resolved.caseId;

  const [caseInfo, setCaseInfo] = useState<CaseHeaderInfo | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    const loadCase = async () => {
      setIsLoading(true);
      setCaseInfo(null);
      setError(null);
      try {
        const summary = await getCaseSummary(caseId);
        if (!cancelled) {
          setCaseInfo({
            caseNumber: summary.case.caseNumber,
            title: summary.case.title,
            clientName: summary.case.clientName,
          });
        }
      } catch (error) {
        console.error("Case handoff page summary load failed:", error);
        if (!cancelled) {
          setCaseInfo(null);
          setError(error instanceof ApiError && (error.status === 403 || error.status === 404)
            ? "Az ügy nem található vagy nem érhető el számodra."
            : "Az ügyadatok betöltése nem sikerült. Próbáld újra az oldal frissítésével.");
        }
      } finally {
        if (!cancelled) {
          setIsLoading(false);
        }
      }
    };

    void loadCase();

    return () => {
      cancelled = true;
    };
  }, [caseId]);

  return (
    <main className="min-h-screen adm-board-page text-[var(--adm-green-800)]">
      <CaseWorkspaceNav
        caseId={caseId}
        caseNumber={caseInfo?.caseNumber}
        title={caseInfo?.title}
        clientName={caseInfo?.clientName}
        activeTab="documents"
      />

      <section className="mx-auto w-full max-w-[980px] space-y-4 p-4 lg:p-5">
        <OperationalPageHeader
          title="Korábbi leadások"
          level="h2"
          subtitle="A korábban indított leadások folytatása és teljes története. Új Leadás az ügy feladatainál indítható."
          secondaryActions={
            <Link href={`/cases/${encodeURIComponent(caseId)}/documents`} className="adm-link-button px-3 py-2 text-xs">
              Dokumentumtár
            </Link>
          }
          primaryAction={
            <Link href={`/cases/${encodeURIComponent(caseId)}#ck-tasks`} data-testid="canonical-case-tasks-link" className="adm-link-button adm-link-button-primary px-3 py-2 text-xs">
              Ugrás az ügy feladataihoz
            </Link>
          }
        />

        {isLoading ? (
          <div role="status" className="adm-board-panel p-4 text-sm text-[var(--adm-text-muted)]">Ügyadatok betöltése…</div>
        ) : null}

        {error ? <p role="alert" className="adm-board-panel p-4 text-sm text-[var(--adm-terracotta-700)]">{error}</p> : null}
        {!isLoading && !error && caseInfo ? <HandoffPackagePanel key={caseId} caseId={caseId} mode="legacy-continuation" /> : null}
      </section>
    </main>
  );
}
