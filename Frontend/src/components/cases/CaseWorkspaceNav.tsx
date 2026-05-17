"use client";

import { useRouter } from "next/navigation";

export type CaseWorkspaceNavTab = "overview" | "documents" | "workspace" | "communications" | "versions" | "time";

type CaseWorkspaceNavProps = {
  caseId: string;
  caseNumber?: string | null;
  title?: string | null;
  clientName?: string | null;
  activeTab: CaseWorkspaceNavTab;
  activeDocumentId?: string | null;
  helperText?: string;
};

const itemClass = (active: boolean) =>
  `w-full rounded px-3 py-2 text-left text-xs font-semibold transition-colors ${
    active
      ? "bg-[#C39A22] text-[#062416]"
      : "text-[#F4EFDB]/85 hover:bg-[#0B301F] hover:text-[#F4EFDB]"
  }`;

export function CaseWorkspaceNav({ caseId, caseNumber, title, clientName, activeTab, activeDocumentId, helperText }: CaseWorkspaceNavProps) {
  const router = useRouter();
  const workspaceHref = activeDocumentId
    ? `/documents/compare?caseId=${encodeURIComponent(caseId)}&documentId=${encodeURIComponent(activeDocumentId)}`
    : `/documents/compare?caseId=${encodeURIComponent(caseId)}`;

  return (
    <aside className="flex w-56 shrink-0 flex-col border-r border-[rgba(22,32,26,0.20)] bg-[#082817] text-[#F4EFDB]">
      <div className="border-b border-[#0E3A26] p-4">
        <p className="mb-2 text-[10px] uppercase tracking-[0.2em] text-[#C39A22]">Ügy</p>
        <p className="text-[12px] font-semibold leading-tight text-[#F4EFDB]">{title || "Ügy megnevezése nem elérhető"}</p>
        {caseNumber ? <p className="mt-1 text-[10px] text-[#F4EFDB]/60">{caseNumber}</p> : null}
        {clientName ? <p className="mt-1 text-[10px] text-[#F4EFDB]/60">{clientName}</p> : null}
      </div>

      <nav className="flex-1 space-y-2 p-2">
        <button type="button" onClick={() => router.push(`/cases/${caseId}`)} className={itemClass(activeTab === "overview")}>Ügy áttekintő</button>
        <button type="button" onClick={() => router.push(`/cases/${caseId}/documents`)} className={itemClass(activeTab === "documents")}>Dokumentumtár</button>
        <button type="button" onClick={() => router.push(workspaceHref)} className={itemClass(activeTab === "workspace")}>Szerződés-workspace</button>
        <button type="button" onClick={() => router.push(`/cases/${caseId}/communications`)} className={itemClass(activeTab === "communications")}>Kommunikáció</button>
        <button type="button" onClick={() => router.push(`/documents/compare?caseId=${encodeURIComponent(caseId)}`)} className={itemClass(activeTab === "versions")}>Verzió-összevetés</button>
        <button type="button" onClick={() => router.push("/time-entries")} className={itemClass(activeTab === "time")}>Munkaórák</button>
      </nav>

      <div className="border-t border-[#0E3A26] p-3">
        <p className="text-[9px] leading-4 text-[#F4EFDB]/65">{helperText || "Ügyközpontú munkafelület, egységes navigációval."}</p>
      </div>
    </aside>
  );
}
