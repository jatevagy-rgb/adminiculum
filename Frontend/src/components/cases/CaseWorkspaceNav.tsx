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
  `rounded-[5px] border px-3 py-1.5 text-[11px] font-semibold transition-colors ${
    active
      ? "border-[#B58A2A] bg-[#F7F0D9] text-[#1F4A33]"
      : "border-[#D7CCB0] bg-white text-[#1F2821] hover:bg-[#F7F0D9]"
  }`;

export function CaseWorkspaceNav({ caseId, caseNumber, title, clientName, activeTab, activeDocumentId, helperText }: CaseWorkspaceNavProps) {
  const router = useRouter();
  const workspaceHref = activeDocumentId
    ? `/documents/compare?caseId=${encodeURIComponent(caseId)}&documentId=${encodeURIComponent(activeDocumentId)}`
    : `/documents/compare?caseId=${encodeURIComponent(caseId)}`;

  return (
    <section className="rounded-[10px] border border-[#D8CFB6] bg-[#FBF6E7] p-3">
      <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
        <div>
          <p className="mb-2 text-[10px] font-bold uppercase tracking-[0.18em] text-[#1F4A33]">Ügy munkaterület</p>
          <p className="text-[13px] font-semibold leading-tight text-[#1F2821]">{title || "Ügy megnevezése nem elérhető"}</p>
          <div className="mt-1 flex flex-wrap gap-2 text-[10px] text-[#6D6A62]">
            {caseNumber ? <span>{caseNumber}</span> : null}
            {clientName ? <span>{clientName}</span> : null}
          </div>
        </div>
        <div className="rounded-[6px] border border-[#D8CFB6] bg-white px-3 py-2 text-[11px] text-[#514D45]">
          {helperText || "Ügyközpontú munkafelület, egységes navigációval."}
        </div>
      </div>

      <nav className="mt-3 flex flex-wrap gap-2">
        <button type="button" onClick={() => router.push(`/cases/${caseId}`)} className={itemClass(activeTab === "overview")}>Ügy áttekintése</button>
        <button type="button" onClick={() => router.push(`/cases/${caseId}/documents`)} className={itemClass(activeTab === "documents")}>Dokumentumtár</button>
        <button type="button" onClick={() => router.push(workspaceHref)} className={itemClass(activeTab === "workspace")}>Szerződés-workspace</button>
        <button type="button" onClick={() => router.push(`/cases/${caseId}/communications`)} className={itemClass(activeTab === "communications")}>Kommunikáció</button>
        <button type="button" onClick={() => router.push(`/documents/compare?caseId=${encodeURIComponent(caseId)}`)} className={itemClass(activeTab === "versions")}>Előzmények</button>
        <button type="button" onClick={() => router.push(`/time-entries?caseId=${encodeURIComponent(caseId)}`)} className={itemClass(activeTab === "time")}>Munkaórák</button>
      </nav>
    </section>
  );
}
