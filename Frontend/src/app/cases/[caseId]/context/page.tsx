"use client";

import { use, useCallback, useEffect, useState } from "react";
import { AuthenticatedApp } from "@/components/AuthenticatedApp";
import { CaseWorkspaceNav } from "@/components/cases/CaseWorkspaceNav";
import { CaseContextView } from "@/components/cases/CaseContextView";
import { CaseContextV2 } from "@/components/cases/caseContextV2/CaseContextV2";
import { getCaseById, getCases, type CaseListItem } from "@/lib/api";

type CaseContextPageProps = {
  params: Promise<{ caseId: string }>;
};

/**
 * Case Workspace — Kontextus route.
 *
 * The V1 read-only case-context surface (CaseContextView: starting context,
 * description, linked communications) renders first. The additive V2
 * "További kontextus" surface (CaseContextV2: paste/communication sources,
 * ephemeral manual terms, detect/review/anonymize) renders below it on the
 * same route. The Communications Workspace remains the canonical place for
 * communication work.
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
        <CaseContextV2 caseId={canonicalCaseId} />
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
