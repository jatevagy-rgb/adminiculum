"use client";

import Link from "next/link";
import type { ReactNode } from "react";
import { AdminButton, AdminStatusPill } from "@/components/adminiculum/ui";
import { CompactState, SafePanelError } from "@/components/adminiculum/OperationalPrimitives";
import { CaseWorkspaceNav } from "@/components/cases/CaseWorkspaceNav";

type WorkRow = {
  id: string;
  title: string;
  meta: string;
  href: string;
  status?: string | null;
};

type DocumentRow = {
  id: string;
  title: string;
  meta: string;
  onOpen: () => void;
  onDownload?: () => void;
  onDelete?: () => void;
};

type EventRow = {
  id: string;
  title: string;
  meta: string;
  href?: string | null;
};

type CaseCenterOverviewProps = {
  caseId: string;
  caseNumber: string;
  title: string;
  clientName: string;
  matterType: string;
  status?: string | null;
  responsibleName?: string | null;
  deadline?: string | null;
  nextStep: {
    title: string;
    detail: string;
    actionLabel: string;
    onAction: () => void;
  };
  activeWork: WorkRow[];
  activeWorkError?: boolean;
  onReloadActiveWork?: () => void;
  documents: DocumentRow[];
  onOpenDocuments: () => void;
  onUploadDocument?: () => void;
  deadlineSummary?: {
    title: string;
    meta: string;
    href: string;
  } | null;
  communicationSummary?: {
    title: string;
    meta: string;
    href: string;
  } | null;
  events: EventRow[];
  managementSlot?: ReactNode;
  hiddenInputs?: ReactNode;
};

function StatusText({ value }: { value?: string | null }) {
  const normalized = String(value || "").toUpperCase();
  const label =
    normalized === "TODO" || normalized === "PENDING"
      ? "Teendő"
      : normalized === "IN_PROGRESS"
      ? "Folyamatban"
      : normalized === "CLIENT_INPUT"
        ? "Ügyféltől érkezett"
        : normalized === "DRAFT"
          ? "Piszkozat"
      : normalized === "SUBMITTED" || normalized === "IN_REVIEW"
        ? "Review alatt"
        : normalized === "UNDER_REVIEW" || normalized === "REVIEW_NEEDED"
          ? "Ellenőrzésre vár"
        : normalized === "BLOCKED"
          ? "Blokkolva"
          : normalized === "COMPLETED" || normalized === "DONE"
            ? "Kész"
            : value || "Nyitott";
  const tone =
    normalized === "BLOCKED"
      ? "burgundy"
      : ["SUBMITTED", "IN_REVIEW", "UNDER_REVIEW", "REVIEW_NEEDED"].includes(normalized)
        ? "gold"
        : normalized === "COMPLETED" || normalized === "DONE"
          ? "green"
          : "neutral";
  return <AdminStatusPill tone={tone}>{label}</AdminStatusPill>;
}

export function CaseCenterOverview({
  caseId,
  caseNumber,
  title,
  clientName,
  matterType,
  status,
  responsibleName,
  deadline,
  nextStep,
  activeWork,
  activeWorkError = false,
  onReloadActiveWork,
  documents,
  onOpenDocuments,
  onUploadDocument,
  deadlineSummary,
  communicationSummary,
  events,
  managementSlot,
  hiddenInputs,
}: CaseCenterOverviewProps) {
  return (
    <div className="min-h-full bg-[var(--adm-ivory-50)]">
      <CaseWorkspaceNav
        caseId={caseId}
        caseNumber={caseNumber}
        title={title}
        clientName={clientName}
        activeTab="overview"
        status={status}
        responsibleName={responsibleName}
        deadline={deadline}
      />

      {hiddenInputs}

      <main className="mx-auto max-w-[1440px] space-y-4 p-4 lg:p-5">
        <section className="border border-[var(--adm-green-800)] bg-[var(--adm-green-800)] px-5 py-4 text-[var(--adm-ivory-50)]" aria-labelledby="case-next-step-heading">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
            <div className="min-w-0">
              <p className="text-[10px] font-bold uppercase tracking-[0.14em] text-[var(--adm-ochre-500)]">Következő lépés</p>
              <h2 id="case-next-step-heading" className="mt-1 font-serif text-[25px] font-medium leading-tight">{nextStep.title}</h2>
              <p className="mt-1 text-[12px] text-[var(--adm-ivory-50)]/78">{nextStep.detail}</p>
            </div>
            <AdminButton variant="gold" className="shrink-0" onClick={nextStep.onAction}>{nextStep.actionLabel}</AdminButton>
          </div>
        </section>

        <div className="grid gap-4 xl:grid-cols-[minmax(0,1.25fr)_minmax(360px,0.75fr)]">
          <section className="border border-[var(--adm-border)] bg-white" aria-labelledby="case-active-work-heading">
            <div className="flex items-center justify-between border-b border-[var(--adm-border)] px-4 py-3">
              <div>
                <h2 id="case-active-work-heading" className="font-serif text-[20px] font-medium text-[var(--adm-text)]">Aktív munka</h2>
                <p className="mt-0.5 text-[10px] text-[var(--adm-text-muted)]">{matterType}</p>
              </div>
              <Link href={`/tasks?caseId=${encodeURIComponent(caseId)}`} className="text-[11px] font-semibold text-[var(--adm-green-800)] hover:underline">Minden feladat</Link>
            </div>
            {activeWorkError ? (
              <div className="p-4"><SafePanelError onRetry={onReloadActiveWork} detail="A feladatok most nem érhetők el; az ügy többi része használható." /></div>
            ) : activeWork.length === 0 ? (
              <div className="p-4"><CompactState title="Nincs aktív feladat." detail="A következő lépésből vagy a Feladatok oldalon indítható új munka." /></div>
            ) : (
              <div className="divide-y divide-[var(--adm-border)]">
                {activeWork.slice(0, 5).map((item) => (
                  <Link key={item.id} href={item.href} className="flex items-center justify-between gap-3 px-4 py-3 hover:bg-[var(--adm-surface)]">
                    <span className="min-w-0">
                      <span className="block truncate text-[13px] font-semibold text-[var(--adm-text)]">{item.title}</span>
                      <span className="mt-1 block text-[10px] text-[var(--adm-text-muted)]">{item.meta}</span>
                    </span>
                    <StatusText value={item.status} />
                  </Link>
                ))}
              </div>
            )}
          </section>

          <section className="border border-[var(--adm-border)] bg-white" aria-labelledby="case-documents-heading">
            <div className="flex items-center justify-between border-b border-[var(--adm-border)] px-4 py-3">
              <h2 id="case-documents-heading" className="font-serif text-[20px] font-medium text-[var(--adm-text)]">Legutóbbi dokumentumok</h2>
              <div className="flex gap-2">
                {onUploadDocument ? <button type="button" onClick={onUploadDocument} className="text-[11px] font-semibold text-[var(--adm-green-800)] hover:underline">Feltöltés</button> : null}
                <button type="button" onClick={onOpenDocuments} className="text-[11px] font-semibold text-[var(--adm-green-800)] hover:underline">Dokumentumtár</button>
              </div>
            </div>
            {documents.length === 0 ? (
              <div className="p-4">
                <CompactState
                  title="Még nincs dokumentum."
                  detail="Az ügy első munkalépése egy irat feltöltése."
                  action={onUploadDocument ? <AdminButton size="sm" variant="primary" onClick={onUploadDocument}>Dokumentum feltöltése</AdminButton> : null}
                />
              </div>
            ) : (
              <div className="divide-y divide-[var(--adm-border)]">
                {documents.slice(0, 5).map((document) => (
                  <div key={document.id} className="flex items-center gap-3 px-4 py-3">
                    <button type="button" onClick={document.onOpen} className="min-w-0 flex-1 text-left">
                      <span className="block truncate text-[12px] font-semibold text-[var(--adm-text)]">{document.title}</span>
                      <span className="mt-1 block text-[10px] text-[var(--adm-text-muted)]">{document.meta}</span>
                    </button>
                    {document.onDownload ? <button type="button" onClick={document.onDownload} className="text-[10px] font-semibold text-[var(--adm-text-muted)] hover:text-[var(--adm-text)]">Letöltés</button> : null}
                    {document.onDelete ? <button type="button" onClick={document.onDelete} className="text-[10px] font-semibold text-[var(--adm-terracotta-700)] hover:underline">Törlés</button> : null}
                  </div>
                ))}
              </div>
            )}
          </section>
        </div>

        <div className="grid gap-4 md:grid-cols-2">
          <section className="border border-[var(--adm-border)] bg-white px-4 py-3">
            <div className="flex items-start justify-between gap-3">
              <div>
                <h2 className="font-serif text-[18px] font-medium text-[var(--adm-text)]">Határidő</h2>
                {deadlineSummary ? (
                  <>
                    <p className="mt-2 text-[13px] font-semibold text-[var(--adm-text)]">{deadlineSummary.title}</p>
                    <p className="mt-1 text-[11px] text-[var(--adm-text-muted)]">{deadlineSummary.meta}</p>
                  </>
                ) : <p className="mt-2 text-[11px] text-[var(--adm-text-muted)]">Nincs nyitott határidő.</p>}
              </div>
              <Link href={deadlineSummary?.href || `/deadlines?scope=CASE&caseId=${encodeURIComponent(caseId)}`} className="text-[11px] font-semibold text-[var(--adm-green-800)] hover:underline">Megnyitás</Link>
            </div>
          </section>

          <section className="border border-[var(--adm-border)] bg-white px-4 py-3">
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <h2 className="font-serif text-[18px] font-medium text-[var(--adm-text)]">Kommunikáció</h2>
                {communicationSummary ? (
                  <>
                    <p className="mt-2 truncate text-[13px] font-semibold text-[var(--adm-text)]">{communicationSummary.title}</p>
                    <p className="mt-1 text-[11px] text-[var(--adm-text-muted)]">{communicationSummary.meta}</p>
                  </>
                ) : <p className="mt-2 text-[11px] text-[var(--adm-text-muted)]">Még nincs rögzített ügykommunikáció.</p>}
              </div>
              <Link href={communicationSummary?.href || `/cases/${caseId}/communications`} className="text-[11px] font-semibold text-[var(--adm-green-800)] hover:underline">Megnyitás</Link>
            </div>
          </section>
        </div>

        <section className="border border-[var(--adm-border)] bg-white" aria-labelledby="case-events-heading">
          <div className="border-b border-[var(--adm-border)] px-4 py-3">
            <h2 id="case-events-heading" className="font-serif text-[19px] font-medium text-[var(--adm-text)]">Legutóbbi események</h2>
          </div>
          {events.length === 0 ? (
            <div className="p-4"><CompactState title="Még nincs megjeleníthető ügyesemény." /></div>
          ) : (
            <ol className="divide-y divide-[var(--adm-border)]">
              {events.slice(0, 5).map((event) => (
                <li key={event.id} className="flex items-center justify-between gap-3 px-4 py-3">
                  <span className="min-w-0">
                    <span className="block truncate text-[12px] font-semibold text-[var(--adm-text)]">{event.title}</span>
                    <span className="mt-1 block text-[10px] text-[var(--adm-text-muted)]">{event.meta}</span>
                  </span>
                  {event.href ? <Link href={event.href} className="shrink-0 text-[10px] font-semibold text-[var(--adm-green-800)] hover:underline">Megnyitás</Link> : null}
                </li>
              ))}
            </ol>
          )}
        </section>

        {managementSlot ? (
          <details className="border border-[var(--adm-border)] bg-white">
            <summary className="cursor-pointer px-4 py-3 text-[12px] font-semibold text-[var(--adm-text)]">Ügyadatok és felelősség</summary>
            <div className="border-t border-[var(--adm-border)] p-4">{managementSlot}</div>
          </details>
        ) : null}
      </main>
    </div>
  );
}
