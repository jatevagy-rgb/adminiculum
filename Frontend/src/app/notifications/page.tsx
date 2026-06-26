"use client";

import { useEffect, useState, type ReactNode } from "react";
import { AuthenticatedApp } from "@/components/AuthenticatedApp";

const filters = [
  "Összes",
  "Külső",
  "Belső",
  "Válaszra vár",
  "Ügyfélhez sorolt",
  "Ügyhöz sorolt",
  "Feladathoz kapcsolt",
];

const filterViews: Record<string, string> = {
  Összes: "all",
  Külső: "external",
  Belső: "internal",
  "Válaszra vár": "replies",
  "Ügyfélhez sorolt": "clients",
  "Ügyhöz sorolt": "cases",
  "Feladathoz kapcsolt": "tasks",
};

const viewFilters = Object.fromEntries(Object.entries(filterViews).map(([label, view]) => [view, label]));

const filterTone: Record<string, string> = {
  Összes: "var(--adm-blue-950)",
  Külső: "var(--adm-blue-500)",
  Belső: "var(--adm-blue-700)",
  "Válaszra vár": "var(--adm-warm-500)",
  "Ügyfélhez sorolt": "var(--adm-blue-500)",
  "Ügyhöz sorolt": "var(--adm-blue-700)",
  "Feladathoz kapcsolt": "var(--adm-blue-950)",
};

const communicationColumns = ["Feladó / forrás", "Tárgy / jelzés", "Ügyfél / ügy", "Státusz", "Idő"];

export default function NotificationsPage() {
  return (
    <AuthenticatedApp section="notifications">
      <CommunicationWorkspace />
    </AuthenticatedApp>
  );
}

function CommunicationWorkspace() {
  const [activeFilter, setActiveFilter] = useState(filters[0]);

  useEffect(() => {
    const view = new URLSearchParams(window.location.search).get("view") || "all";
    const nextFilter = viewFilters[view] || filters[0];
    setActiveFilter(nextFilter);
  }, []);

  return (
    <main className="adm-dash-stage min-h-screen px-3 pb-4 pt-3 sm:px-5 xl:px-6">
      <section className="mx-auto w-full max-w-[1440px] space-y-3">
        <header className="adm-panel adm-panel-primary overflow-hidden">
          <div className="flex flex-wrap items-start justify-between gap-3 border-b-[3px] border-[var(--adm-blue-500)] bg-white px-4 py-3 lg:px-5">
            <div>
              <p className="adm-kicker text-[var(--adm-blue-700)]">Kommunikáció</p>
              <h1 className="adm-heading mt-1 text-[28px] leading-tight">Kommunikációs munkatér</h1>
              <p className="mt-1 max-w-3xl text-[12px] leading-5 text-[var(--adm-text-muted)]">
                Levelek, belső jelzések, válaszállapotok és ügyhöz kapcsolható kommunikáció.
              </p>
            </div>
            <span className="rounded-[var(--adm-radius-sm)] border border-[var(--adm-blue-500)]/30 bg-[var(--adm-blue-100)]/35 px-3 py-1 text-[10.5px] font-semibold text-[var(--adm-blue-700)]">
              Outlook később
            </span>
          </div>

          <nav className="flex gap-1 overflow-x-auto bg-[var(--adm-surface)] px-4 py-2.5 lg:px-5" aria-label="Kommunikációs szűrők">
            {filters.map((filter) => {
              const isActive = activeFilter === filter;
              const tone = filterTone[filter] || "var(--adm-blue-500)";
              return (
                <button
                  key={filter}
                  type="button"
                  onClick={() => {
                    setActiveFilter(filter);
                    const view = filterViews[filter];
                    const url = view === "all" ? "/notifications" : `/notifications?view=${view}`;
                    window.history.replaceState(null, "", url);
                  }}
                  className="shrink-0 rounded-[var(--adm-radius-sm)] border px-3 py-1.5 text-[11px] font-bold transition-colors"
                  style={{
                    borderColor: isActive ? tone : "var(--adm-border)",
                    background: isActive ? tone : "#FFFFFF",
                    color: isActive ? "#FFFFFF" : "var(--adm-text-muted)",
                  }}
                >
                  {filter}
                </button>
              );
            })}
          </nav>
        </header>

        <section className="grid gap-3 xl:grid-cols-2">
          <CommunicationPanel
            title="Külső kommunikáció"
            accent="var(--adm-blue-500)"
            countLabel="0/8"
            capacityLabel="Kapacitás: 8 levélelőnézet"
            emptyTitle="Nincs új külső kommunikáció."
            emptyText="A bejövő és kimenő külső levelek itt rendezhetők ügyfélhez, ügyhöz és válaszállapothoz."
          />
          <CommunicationPanel
            title="Belső kommunikáció"
            accent="var(--adm-blue-700)"
            countLabel="0/8"
            capacityLabel="Kapacitás: 8 belső jelzés"
            emptyTitle="Nincs új belső kommunikáció."
            emptyText="A belső jelzések, átadási kommentek és review-visszajelzések itt sorolhatók munkába."
          />
        </section>

        <section className="adm-panel overflow-hidden">
          <div className="border-b border-[var(--adm-border)] bg-white px-4 py-3 lg:px-5">
            <p className="adm-kicker text-[var(--adm-blue-950)]">Munkába rendezés</p>
            <h2 className="adm-heading mt-0.5 text-[22px]">Kommunikáció feldolgozása</h2>
          </div>
          <div className="grid gap-3 p-3 lg:grid-cols-[1.15fr_0.9fr_0.95fr] lg:p-4">
            <WorkflowTool accent="var(--adm-blue-950)" kicker="Besorolás" title="Ügyhöz rendezés">
              <div className="flex flex-wrap items-center gap-2">
                {["Levél/jelzés", "Ügyfél", "Ügy", "Feladat"].map((step, index) => (
                  <span key={step} className="inline-flex items-center gap-2">
                    <span className="rounded-[var(--adm-radius-sm)] border border-[var(--adm-blue-950)]/20 bg-white px-2.5 py-1 text-[10.5px] font-bold text-[var(--adm-blue-950)]">
                      {step}
                    </span>
                    {index < 3 ? <span className="text-[var(--adm-text-soft)]">→</span> : null}
                  </span>
                ))}
              </div>
              <p className="mt-3 text-[11.5px] font-semibold text-[var(--adm-text-muted)]">
                A besorolás később megjegyezhető lesz.
              </p>
            </WorkflowTool>

            <WorkflowTool accent="var(--adm-warm-500)" kicker="Válaszállapot" title="Válasz követése">
              <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-1">
                <ReplyLane label="Tőlünk várnak választ" />
                <ReplyLane label="Mi várunk válaszra" />
              </div>
              <p className="mt-3 rounded-[var(--adm-radius-sm)] border border-dashed border-[var(--adm-warm-400)]/45 bg-[#FFF8E2] px-3 py-2 text-[11px] font-semibold text-[var(--adm-text-muted)]">
                Nincs nyitott válaszállapot.
              </p>
            </WorkflowTool>

            <WorkflowTool accent="var(--adm-blue-700)" kicker="Feladathoz kapcsolás" title="Munka kiadása">
              <div className="grid grid-cols-2 gap-2">
                {["Levél / szál", "Feladat", "Ügy", "Felelős"].map((item) => (
                  <span key={item} className="rounded-[var(--adm-radius-sm)] border border-[var(--adm-border)] bg-white px-2.5 py-2 text-[11px] font-bold text-[var(--adm-text)]">
                    {item}
                  </span>
                ))}
              </div>
              <p className="mt-3 text-[11.5px] font-semibold text-[var(--adm-text-muted)]">
                Feladatkiadáskor a releváns levél vagy szál kapcsolható lesz.
              </p>
            </WorkflowTool>
          </div>
        </section>
      </section>
    </main>
  );
}

function CommunicationPanel({
  title,
  accent,
  countLabel,
  capacityLabel,
  emptyTitle,
  emptyText,
}: {
  title: string;
  accent: string;
  countLabel: string;
  capacityLabel: string;
  emptyTitle: string;
  emptyText: string;
}) {
  return (
    <article className="adm-panel flex min-h-[340px] flex-col overflow-hidden">
      <div className="flex items-center justify-between gap-2 px-4 py-4 text-white" style={{ background: accent }}>
        <h2 className="adm-heading text-[24px] text-white">{title}</h2>
        <span className="rounded-[var(--adm-radius-sm)] border border-white/25 bg-white/15 px-2.5 py-1 text-[10px] font-bold text-white">
          {countLabel}
        </span>
      </div>
      <div className="flex flex-1 flex-col p-4">
        <div className="grid grid-cols-[1.05fr_1.2fr_1fr_0.75fr_0.55fr] overflow-hidden rounded-[var(--adm-radius-sm)] border border-[var(--adm-border)] bg-white">
          {communicationColumns.map((column) => (
            <div key={column} className="border-r border-[var(--adm-border)] px-2.5 py-2 text-[10px] font-bold uppercase tracking-[0.08em] text-[var(--adm-text-soft)] last:border-r-0">
              {column}
            </div>
          ))}
        </div>
        <div className="mt-3 flex min-h-[155px] flex-1 items-center rounded-[var(--adm-radius-sm)] border border-dashed border-[var(--adm-border)] bg-[var(--adm-surface)] p-4">
          <div>
            <p className="text-xs font-semibold text-[var(--adm-text)]">{emptyTitle}</p>
            <p className="mt-1 max-w-xl text-[11px] leading-4 text-[var(--adm-text-muted)]">{emptyText}</p>
          </div>
        </div>
        <p className="mt-2 text-[9px] font-bold uppercase tracking-[0.12em] text-[var(--adm-text-soft)]">{capacityLabel}</p>
      </div>
    </article>
  );
}

function WorkflowTool({
  accent,
  kicker,
  title,
  children,
}: {
  accent: string;
  kicker: string;
  title: string;
  children: ReactNode;
}) {
  return (
    <article className="rounded-[var(--adm-radius-md)] border border-[var(--adm-border)] bg-[var(--adm-surface)] p-3" style={{ borderTop: `3px solid ${accent}` }}>
      <p className="adm-kicker" style={{ color: accent }}>{kicker}</p>
      <h3 className="adm-heading mt-1 text-[18px]">{title}</h3>
      <div className="mt-3">{children}</div>
    </article>
  );
}

function ReplyLane({ label }: { label: string }) {
  return (
    <div className="rounded-[var(--adm-radius-sm)] border border-[var(--adm-warm-400)]/35 bg-white px-3 py-2">
      <p className="text-[10px] font-bold uppercase tracking-[0.12em] text-[var(--adm-warm-600)]">{label}</p>
      <p className="mt-1 text-[11px] text-[var(--adm-text-muted)]">0 tétel</p>
    </div>
  );
}
