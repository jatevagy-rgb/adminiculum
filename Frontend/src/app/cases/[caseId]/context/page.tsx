"use client";

import { use, useCallback, useEffect, useState } from "react";
import { AuthenticatedApp } from "@/components/AuthenticatedApp";
import { CaseWorkspaceNav } from "@/components/cases/CaseWorkspaceNav";
import { CaseContextView } from "@/components/cases/CaseContextView";
import { getCaseById, getCases, type CaseListItem } from "@/lib/api";

type CaseContextPageProps = {
  params: Promise<{ caseId: string }>;
};

/**
 * Case Workspace — Kontextus V1 route.
 *
 * A dedicated, read-only case-context surface. It reuses the canonical case
 * workspace projection (starting context, description, linked communications)
 * and the shared case nav (which owns the page H1). It introduces no new
 * persistence and does not replace the Communications Workspace.
 */
function CaseContextContent({ params }: CaseContextPageProps) {
  const resolvedParams = use(params);
  const [caseRecord, setCaseRecord] = useState<CaseListItem | null>(null);

  const loadCase = useCallback(async () => {
    try {
      // Resolve the canonical Case.id first; the list lookup stays only for
      // legacy case-number URLs, matching the sibling case routes.
      let record: CaseListItem | null = null;
      try {
        record = await getCaseById(resolvedParams.caseId);
      } catch {
        const response = await getCases(1, 200);
        record = response.data.find(
          (item: CaseListItem) => item.caseNumber === resolvedParams.caseId || item.id === resolvedParams.caseId,
        ) || null;
      }
      setCaseRecord(record);
    } catch {
      setCaseRecord(null);
    }
  }, [resolvedParams.caseId]);

  useEffect(() => { void loadCase(); }, [loadCase]);

  const canonicalCaseId = caseRecord?.id || resolvedParams.caseId;

  return (
    <main className="min-h-screen bg-[var(--adm-ivory-50)]">
      <CaseWorkspaceNav
        caseId={canonicalCaseId}
        caseNumber={caseRecord?.caseNumber}
        title={caseRecord?.title}
        clientName={caseRecord?.clientName}
        activeTab="context"
        status={caseRecord?.status}
        responsibleName={caseRecord?.assignedLawyer?.name}
        deadline={caseRecord?.deadline}
      />
      <div className="mx-auto w-full max-w-[1400px] px-4 py-5 lg:px-5">
        <CaseContextView caseId={canonicalCaseId} />
      </div>
    </main>
  );
}

export default function CaseContextPage({ params }: CaseContextPageProps) {
  return (
    <AuthenticatedApp section="case-detail">
      <CaseContextContent params={params} />
    </AuthenticatedApp>
  );
}
