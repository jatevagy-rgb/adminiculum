"use client";

import { use, useCallback, useEffect, useState } from "react";
import { AuthenticatedApp } from "@/components/AuthenticatedApp";
import { CaseWorkspaceNav } from "@/components/cases/CaseWorkspaceNav";
import { ClientPublicationPanel } from "@/components/documents/publication/ClientPublicationPanel";
import { getCases, type CaseListItem } from "@/lib/api";

type CaseClientPortalPageProps = {
  params: Promise<{ caseId: string }>;
};

// Case-level customer-portal surface. Customer-safe Case progress (status,
// milestones, requests, updates) is a Case concept — NOT a Document concept —
// so it is reachable here even when the Case has zero documents / zero document
// publications. Document publication remains a separate module on the
// Dokumentumok surface.
function CaseClientPortalContent({ params }: CaseClientPortalPageProps) {
  const resolvedParams = use(params);
  const [caseRecord, setCaseRecord] = useState<CaseListItem | null>(null);
  const [loadError, setLoadError] = useState(false);

  const loadCase = useCallback(async () => {
    setLoadError(false);
    try {
      const response = await getCases(1, 200);
      const record = response.data.find(
        (item: CaseListItem) => item.caseNumber === resolvedParams.caseId || item.id === resolvedParams.caseId,
      );
      if (!record) {
        setLoadError(true);
        return;
      }
      setCaseRecord(record);
    } catch {
      setLoadError(true);
    }
  }, [resolvedParams.caseId]);

  useEffect(() => { void loadCase(); }, [loadCase]);

  return (
    <div className="min-h-screen bg-[var(--adm-bg,#faf8f3)]">
      <CaseWorkspaceNav
        caseId={caseRecord?.id || resolvedParams.caseId}
        caseNumber={caseRecord?.caseNumber}
        title={caseRecord?.title}
        clientName={caseRecord?.clientName}
        activeTab="clientPortal"
        status={caseRecord?.status}
        responsibleName={caseRecord?.assignedLawyer?.name}
        deadline={caseRecord?.deadline}
      />
      <main className="mx-auto w-full max-w-[1400px] px-4 py-5 lg:px-5">
        <div className="mb-4">
          <p className="text-[10px] font-bold uppercase tracking-[0.18em] text-[var(--adm-text-muted)]">Ügyfélportál</p>
          <h2 className="font-serif text-2xl font-semibold text-[var(--adm-text)]">Ügyfélnek publikált ügyállapot és előrehaladás</h2>
          <p className="mt-1 max-w-3xl text-sm text-[#3D4842]">
            Az ügy állapotának és mérföldköveinek ügyfélbiztos közzététele. A megosztott dokumentumok külön modulban, a Dokumentumok felületen kezelhetők — ide nem szükséges dokumentum a progressz publikálásához.
          </p>
        </div>
        {loadError ? (
          <div className="rounded-[12px] border border-[#F2DAD6] bg-[var(--adm-terracotta-100)] p-4 text-sm font-semibold text-[var(--adm-terracotta-700)]">
            Az ügy betöltése nem sikerült.
          </div>
        ) : (
          <ClientPublicationPanel
            caseId={caseRecord?.id || resolvedParams.caseId}
            clientId={caseRecord?.clientId ?? null}
          />
        )}
      </main>
    </div>
  );
}

export default function CaseClientPortalPage({ params }: CaseClientPortalPageProps) {
  return (
    <AuthenticatedApp section="case-detail">
      <CaseClientPortalContent params={params} />
    </AuthenticatedApp>
  );
}
