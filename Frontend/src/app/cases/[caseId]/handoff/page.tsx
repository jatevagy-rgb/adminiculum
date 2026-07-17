"use client";

import { use, useEffect, useState } from "react";
import Link from "next/link";
import { AuthenticatedApp } from "@/components/AuthenticatedApp";
import { OperationalPageHeader } from "@/components/adminiculum/OperationalPrimitives";
import { CaseWorkspaceNav } from "@/components/cases/CaseWorkspaceNav";
import { HandoffPackagePanel } from "@/components/handoff/HandoffPackagePanel";
import { getCaseSummary } from "@/lib/api";

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

  useEffect(() => {
    let cancelled = false;

    const loadCase = async () => {
      setIsLoading(true);
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
          title="Leadás"
          subtitle="A kiválasztott ügyirat előkészítése ügyvédi review-ra."
          secondaryActions={
            <Link href={`/cases/${encodeURIComponent(caseId)}/documents`} className="adm-link-button px-3 py-2 text-xs">
              Dokumentumtár
            </Link>
          }
          primaryAction={
            <Link href="/reviews" className="adm-link-button adm-link-button-primary px-3 py-2 text-xs">
              Review sor
            </Link>
          }
        />

        {isLoading ? (
          <div className="adm-board-panel p-4 text-sm text-[var(--adm-text-muted)]">Ügyadatok betöltése…</div>
        ) : null}

        <HandoffPackagePanel caseId={caseId} />
      </section>
    </main>
  );
}
