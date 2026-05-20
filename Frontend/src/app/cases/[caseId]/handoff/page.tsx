"use client";

import { use, useEffect, useState } from "react";
import Link from "next/link";
import { AuthenticatedApp } from "@/components/AuthenticatedApp";
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
    <main className="min-h-screen bg-[#F4EFE5] text-[#1F3B2D]">
      <div className="mx-auto flex w-full max-w-[1400px]">
        <CaseWorkspaceNav
          caseId={caseId}
          caseNumber={caseInfo?.caseNumber}
          title={caseInfo?.title}
          clientName={caseInfo?.clientName}
          activeTab="documents"
          helperText="Leadási csomag nézet: belső review-előkészítés ügyvédi munkafolyamathoz."
        />

        <section className="flex-1 p-6 lg:p-8">
          <div className="mb-4 flex flex-wrap gap-2">
            <Link
              href={`/cases/${encodeURIComponent(caseId)}`}
              className="rounded border border-[#D8CDB6] bg-[#FAF5EA] px-3 py-1.5 text-xs font-semibold text-[#1F3B2D] hover:bg-[#F2E8D6]"
            >
              ← Vissza az ügyhöz
            </Link>
            <Link
              href={`/cases/${encodeURIComponent(caseId)}/documents`}
              className="rounded border border-[#D8CDB6] bg-[#FAF5EA] px-3 py-1.5 text-xs font-semibold text-[#1F3B2D] hover:bg-[#F2E8D6]"
            >
              ← Vissza a Dokumentumtárba
            </Link>
            <Link
              href={`/documents/compare?caseId=${encodeURIComponent(caseId)}`}
              className="rounded border border-[#D8CDB6] bg-[#FAF5EA] px-3 py-1.5 text-xs font-semibold text-[#1F3B2D] hover:bg-[#F2E8D6]"
            >
              Szerződés-workspace
            </Link>
            <Link
              href={`/cases/${encodeURIComponent(caseId)}/communications`}
              className="rounded border border-[#D8CDB6] bg-[#FAF5EA] px-3 py-1.5 text-xs font-semibold text-[#1F3B2D] hover:bg-[#F2E8D6]"
            >
              Kommunikáció
            </Link>
            <Link
              href={`/time-entries?caseId=${encodeURIComponent(caseId)}`}
              className="rounded border border-[#D8CDB6] bg-[#FAF5EA] px-3 py-1.5 text-xs font-semibold text-[#1F3B2D] hover:bg-[#F2E8D6]"
            >
              Munkaórák
            </Link>
          </div>

          <header className="mb-6 rounded-xl border border-[#D8CDB6] bg-[#FFFDF7] p-5">
            <h1 className="text-2xl text-[#1F3B2D]" style={{ fontFamily: "var(--font-newsreader)" }}>
              Leadási csomag
            </h1>
            <p className="mt-2 text-sm text-[#4F5A50]">
              Ügyvédi review-ra előkészített belső munkacsomag.
            </p>
            <p className="mt-2 text-xs text-[#7B5E2E]">
              Ez a csomag előkészítő munkairat. Ügyvédi jóváhagyás nélkül nem minősül végleges jogi állásfoglalásnak.
            </p>
            {isLoading ? (
              <p className="mt-3 text-xs text-[#6E736D]">Ügyadatok betöltése…</p>
            ) : caseInfo ? (
              <p className="mt-3 text-xs text-[#6E736D]">
                {caseInfo.caseNumber} · {caseInfo.title}
              </p>
            ) : null}
          </header>

          <HandoffPackagePanel caseId={caseId} />
        </section>
      </div>
    </main>
  );
}
