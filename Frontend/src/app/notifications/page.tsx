"use client";

import { useEffect, useMemo, useState, type ReactNode } from "react";
import { AuthenticatedApp } from "@/components/AuthenticatedApp";
import { getCommunications, type CommunicationItem } from "@/lib/api";
import { classifyAudience } from "@/lib/communicationIntake";

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

const COMMUNICATION_LIST_LIMIT = 50;

export default function NotificationsPage() {
  return (
    <AuthenticatedApp section="notifications">
      <CommunicationWorkspace />
    </AuthenticatedApp>
  );
}

function CommunicationWorkspace() {
  const [activeFilter, setActiveFilter] = useState(filters[0]);
  const [communications, setCommunications] = useState<CommunicationItem[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);

  useEffect(() => {
    const view = new URLSearchParams(window.location.search).get("view") || "all";
    const nextFilter = viewFilters[view] || filters[0];
    setActiveFilter(nextFilter);
  }, []);

  useEffect(() => {
    let mounted = true;

    async function loadReadOnlyCommunications() {
      setIsLoading(true);
      setLoadError(null);
      try {
        const result = await getCommunications({ limit: COMMUNICATION_LIST_LIMIT });
        if (!mounted) return;
        setCommunications(Array.isArray(result.communications) ? result.communications : []);
      } catch (error) {
        console.error("Read-only communications load failed:", error);
        if (!mounted) return;
        setCommunications([]);
        setLoadError("A kommunikációs lista most nem érhető el. A munkatér üres állapotban marad.");
      } finally {
        if (mounted) setIsLoading(false);
      }
    }

    loadReadOnlyCommunications();

    return () => {
      mounted = false;
    };
  }, []);

  const filteredCommunications = useMemo(
    () => applyWorkspaceFilter(communications, activeFilter),
    [activeFilter, communications],
  );
  const externalCommunications = useMemo(
    () => filteredCommunications.filter((item) => classifyCommunicationAudience(item) === "external"),
    [filteredCommunications],
  );
  const internalCommunications = useMemo(
    () => filteredCommunications.filter((item) => classifyCommunicationAudience(item) === "internal"),
    [filteredCommunications],
  );
  const replyView = filterViews[activeFilter] === "replies";
  const panelEmptyText = replyView
    ? "A read-only lista nem tartalmaz megbízható válaszállapot-mezőt, ezért itt csak később jelennek meg tételek."
    : undefined;

  return (
    <main className="adm-dash-stage min-h-screen px-3 pb-4 pt-3 sm:px-5 xl:px-6">
      <section className="mx-auto w-full max-w-[1440px] space-y-3">
        <header className="adm-panel adm-panel-primary overflow-hidden">
          <div className="flex flex-wrap items-start justify-between gap-3 border-b-[3px] border-[var(--adm-blue-500)] bg-white px-4 py-3 lg:px-5">
            <div>
              <p className="adm-kicker text-[var(--adm-blue-700)]">Kommunikáció</p>
              <h1 className="adm-heading mt-1 text-[28px] leading-tight">Kommunikációs munkatér</h1>
              <p className="mt-1 max-w-3xl text-[12px] leading-5 text-[var(--adm-text-muted)]">
                Levelek, belső jelzések és ügyhöz kapcsolható kommunikáció read-only listában.
              </p>
            </div>
            <span className="rounded-[var(--adm-radius-sm)] border border-[var(--adm-blue-500)]/30 bg-[var(--adm-blue-100)]/35 px-3 py-1 text-[10.5px] font-semibold text-[var(--adm-blue-700)]">
              Read-only lista
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

        {loadError ? (
          <div className="rounded-[var(--adm-radius-sm)] border border-[var(--adm-border)] bg-white px-3 py-2 text-[11px] font-semibold text-[var(--adm-text-muted)]">
            {loadError}
          </div>
        ) : null}

        <section className="grid gap-3 xl:grid-cols-2">
          <CommunicationPanel
            title="Külső kommunikáció"
            accent="var(--adm-blue-500)"
            countLabel={`${Math.min(externalCommunications.length, 8)}/8`}
            capacityLabel="Kapacitás: 8 levélelőnézet"
            items={externalCommunications.slice(0, 8)}
            isLoading={isLoading}
            emptyTitle="Nincs új külső kommunikáció."
            emptyText={panelEmptyText || "A bejövő és kimenő külső levelek itt rendezhetők ügyfélhez, ügyhöz és válaszállapothoz."}
          />
          <CommunicationPanel
            title="Belső kommunikáció"
            accent="var(--adm-blue-700)"
            countLabel={`${Math.min(internalCommunications.length, 8)}/8`}
            capacityLabel="Kapacitás: 8 belső jelzés"
            items={internalCommunications.slice(0, 8)}
            isLoading={isLoading}
            emptyTitle="Nincs új belső kommunikáció."
            emptyText={panelEmptyText || "A belső jelzések, átadási kommentek és review-visszajelzések itt sorolhatók munkába."}
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
  items,
  isLoading,
  emptyTitle,
  emptyText,
}: {
  title: string;
  accent: string;
  countLabel: string;
  capacityLabel: string;
  items: CommunicationItem[];
  isLoading: boolean;
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
        {isLoading ? (
          <div className="mt-3 flex min-h-[155px] flex-1 items-center rounded-[var(--adm-radius-sm)] border border-dashed border-[var(--adm-border)] bg-[var(--adm-surface)] p-4">
            <p className="text-xs font-semibold text-[var(--adm-text-muted)]">Kommunikációs lista betöltése…</p>
          </div>
        ) : items.length === 0 ? (
          <div className="mt-3 flex min-h-[155px] flex-1 items-center rounded-[var(--adm-radius-sm)] border border-dashed border-[var(--adm-border)] bg-[var(--adm-surface)] p-4">
            <div>
              <p className="text-xs font-semibold text-[var(--adm-text)]">{emptyTitle}</p>
              <p className="mt-1 max-w-xl text-[11px] leading-4 text-[var(--adm-text-muted)]">{emptyText}</p>
            </div>
          </div>
        ) : (
          <ul className="mt-3 grid gap-1.5">
            {items.map((item) => (
              <CommunicationRow key={item.id} item={item} />
            ))}
          </ul>
        )}
        <p className="mt-2 text-[9px] font-bold uppercase tracking-[0.12em] text-[var(--adm-text-soft)]">{capacityLabel}</p>
      </div>
    </article>
  );
}

function CommunicationRow({ item }: { item: CommunicationItem }) {
  const source = item.senderName || item.senderEmail || item.recipientName || item.recipientEmail || "Belső bejegyzés";
  const subject = item.subject || item.summary || item.contentPreview || "Nincs tárgy";
  const linkedContext = formatLinkedContext(item);
  const status = formatStatus(item);
  const preview = item.summary || item.contentPreview;

  return (
    <li className="grid gap-2 rounded-[var(--adm-radius-sm)] border border-[var(--adm-border)] bg-white p-2.5 text-[11px] text-[var(--adm-text)] md:grid-cols-[1.05fr_1.2fr_1fr_0.75fr_0.55fr]">
      <div className="min-w-0">
        <p className="truncate font-semibold">{source}</p>
        <p className="mt-0.5 text-[10px] uppercase tracking-[0.08em] text-[var(--adm-text-soft)]">{item.type}</p>
      </div>
      <div className="min-w-0">
        <p className="truncate font-semibold">{subject}</p>
        {preview ? <p className="mt-0.5 line-clamp-1 text-[10.5px] text-[var(--adm-text-muted)]">{preview}</p> : null}
      </div>
      <p className="min-w-0 truncate text-[var(--adm-text-muted)]">{linkedContext}</p>
      <p className="min-w-0 truncate font-semibold text-[var(--adm-blue-700)]">{status}</p>
      <p className="whitespace-nowrap text-[var(--adm-text-soft)]">{formatDateShort(item.createdAt)}</p>
    </li>
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

function applyWorkspaceFilter(items: CommunicationItem[], activeFilter: string): CommunicationItem[] {
  const view = filterViews[activeFilter] || "all";
  if (view === "external") return items.filter((item) => classifyCommunicationAudience(item) === "external");
  if (view === "internal") return items.filter((item) => classifyCommunicationAudience(item) === "internal");
  if (view === "clients") return items.filter((item) => Boolean(item.clientId));
  if (view === "cases") return items.filter((item) => Boolean(item.caseId));
  if (view === "tasks") return items.filter((item) => item.sourceTaskCount > 0);
  if (view === "replies") return [];
  return items;
}

function classifyCommunicationAudience(item: CommunicationItem): "external" | "internal" {
  return classifyAudience({
    id: item.id,
    type: item.type,
    senderEmail: item.senderEmail,
    recipientEmail: item.recipientEmail,
    clientId: item.clientId,
  });
}

function formatLinkedContext(item: CommunicationItem): string {
  if (item.clientId && item.caseId) return "Ügyfél + ügy";
  if (item.clientId) return "Ügyfélhez sorolt";
  if (item.caseId) return "Ügyhöz sorolt";
  if (item.documentId) return "Dokumentumhoz kapcsolt";
  return "Nincs besorolva";
}

function formatStatus(item: CommunicationItem): string {
  if (item.sourceTaskCount > 0) return `${item.sourceTaskCount} feladat`;
  if (item.attachmentCount > 0) return `${item.attachmentCount} melléklet`;
  if (item.clientId || item.caseId) return "Besorolva";
  return "Rendezésre vár";
}

function formatDateShort(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "—";
  return date.toLocaleDateString("hu-HU", { month: "2-digit", day: "2-digit" });
}
