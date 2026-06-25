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
    <main className="min-h-screen adm-board-page text-[var(--adm-green-800)]">
      <div className="mx-auto flex w-full max-w-[1500px]">
        <CaseWorkspaceNav
          caseId={caseId}
          caseNumber={caseInfo?.caseNumber}
          title={caseInfo?.title}
          clientName={caseInfo?.clientName}
          activeTab="documents"
          helperText="Leadási csomag nézet: belső review-előkészítés ügyvédi munkafolyamathoz."
        />

        <section className="flex-1 p-5 lg:p-6">
          <div className="mb-4 flex flex-wrap gap-2">
            <Link
              href={`/cases/${encodeURIComponent(caseId)}`}
              className="adm-link-button px-3 py-1.5 text-xs"
            >
              ← Vissza az ügyhöz
            </Link>
            <Link
              href={`/cases/${encodeURIComponent(caseId)}/documents`}
              className="adm-link-button px-3 py-1.5 text-xs"
            >
              ← Vissza a Dokumentumtárba
            </Link>
            <Link
              href={`/documents/compare?caseId=${encodeURIComponent(caseId)}`}
              className="adm-link-button px-3 py-1.5 text-xs"
            >
              Szerződés-workspace
            </Link>
            <Link
              href={`/cases/${encodeURIComponent(caseId)}/communications`}
              className="adm-link-button px-3 py-1.5 text-xs"
            >
              Kommunikáció
            </Link>
            <Link
              href={`/time-entries?caseId=${encodeURIComponent(caseId)}`}
              className="adm-link-button px-3 py-1.5 text-xs"
            >
              Munkaórák
            </Link>
            <Link
              href="/reviews"
              className="adm-link-button adm-link-button-primary px-3 py-1.5 text-xs"
            >
              Review sor
            </Link>
          </div>

          <header className="adm-board-hero mb-5 grid gap-0 overflow-hidden lg:grid-cols-[minmax(0,1fr)_300px]">
            <div className="p-5">
              <p className="text-[10px] uppercase tracking-[0.24em] text-[var(--adm-text-muted)]">Output workflow</p>
              <h1 className="mt-1 font-serif text-[40px] leading-tight text-[var(--adm-green-800)]">
                Leadási csomag
              </h1>
              <p className="mt-2 text-sm text-[var(--adm-text-muted)]">
                Ügyvédi review-ra előkészített belső munkacsomag.
              </p>
              <p className="mt-2 text-[10px] text-[var(--adm-text-muted)]">
                Dokumentumtár → Szerződés-workspace → Leadási csomag → Review sor
              </p>
              {isLoading ? (
                <p className="mt-3 text-xs text-[var(--adm-text-muted)]">Ügyadatok betöltése…</p>
              ) : caseInfo ? (
                <p className="mt-3 text-xs text-[var(--adm-text-muted)]">
                  {caseInfo.caseNumber} · {caseInfo.title}
                </p>
              ) : null}
            </div>
            <aside className="adm-board-rail rounded-none border-0 p-5">
              <p className="text-[10px] font-bold uppercase tracking-[0.18em] text-[var(--adm-sage-300)]">Státusz</p>
              <p className="mt-2 text-[12px] leading-5 text-[var(--adm-ivory-100)]/80">
                Ez a csomag előkészítő munkairat. Ügyvédi jóváhagyás nélkül nem minősül végleges jogi állásfoglalásnak.
              </p>
              <p className="mt-4 rounded-[var(--adm-radius-sm)] border border-white/10 bg-white/5 px-3 py-2 text-[10px] text-[var(--adm-ivory-100)]/70">
                Nincs külső megosztás, megnyitási követés vagy ügyfélkapcsolati funkció ezen a felületen.
              </p>
            </aside>
          </header>

          <HandoffPackagePanel caseId={caseId} />
        </section>
      </div>
    </main>
  );
}
