"use client";

import { Suspense, useEffect, useMemo, useState } from "react";
import { useParams, useRouter, useSearchParams, usePathname } from "next/navigation";
import Link from "next/link";
import { AuthenticatedApp } from "@/components/AuthenticatedApp";
import { ClientWorkspaceTabs } from "@/components/clients/ClientWorkspaceTabs";
import { getClient, type Client } from "@/lib/api";
import { listAdminWorkspaces } from "@/lib/clientPortalAdminApi";
import {
  getClientCalendar,
  type ClientCalendarItem,
  type ClientCalendarSourceType,
  type ClientCalendarDateKind,
} from "@/lib/clientCalendarApi";
import { getClientColorDefinition } from "@/lib/clientColors";

type ViewKey = "day" | "month" | "year" | "five-year";

const VIEWS: Array<[ViewKey, string]> = [
  ["day", "Nap"],
  ["month", "Hónap"],
  ["year", "Év"],
  ["five-year", "5 év"],
];

const MONTH_NAMES = ["Január", "Február", "Március", "Április", "Május", "Június", "Július", "Augusztus", "Szeptember", "Október", "November", "December"];
const WEEKDAY_NAMES = ["H", "K", "Sze", "Cs", "P", "Szo", "V"];

const sourceLabels: Record<ClientCalendarSourceType, string> = {
  CONTRACT: "Szerződés",
  OBLIGATION: "Kötelezettség",
  ENTITLEMENT: "Jogosultság",
  COMPANY_MILESTONE: "Társasági mérföldkő",
  CASE_DEADLINE: "Ügy határideje",
  TASK: "Feladat",
  CASE_INTAKE_DEADLINE: "Ügyfelvételi határidő",
};

const dateKindLabels: Record<ClientCalendarDateKind, string> = {
  SIGNATURE: "Aláírás",
  EFFECTIVE: "Hatálybalépés",
  EXPIRY: "Lejárat",
  CRITICAL_DATE: "Kritikus dátum",
  NEXT_DUE: "Esedékesség",
  EXERCISE_BY: "Lehívási határidő",
  TARGET_DATE: "Céldátum",
  MILESTONE_DATE: "Mérföldkő",
  DEADLINE: "Határidő",
  DUE_DATE: "Esedékesség",
  INTAKE_DUE: "Határidő",
};

// Restrained, stable category markers — deliberately independent from the
// client's identity color so the accent stays client-identity only.
const sourceDotClass: Record<ClientCalendarSourceType, string> = {
  CONTRACT: "bg-[var(--adm-ochre-500)]",
  OBLIGATION: "bg-amber-500",
  ENTITLEMENT: "bg-emerald-600",
  COMPANY_MILESTONE: "bg-indigo-600",
  CASE_DEADLINE: "bg-red-600",
  TASK: "bg-sky-600",
  CASE_INTAKE_DEADLINE: "bg-slate-500",
};

const pad2 = (n: number) => String(n).padStart(2, "0");
const dateKey = (d: Date) => `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
const parseKey = (key: string): Date | null => {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(key);
  if (!m) return null;
  const d = new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
  return Number.isNaN(d.getTime()) ? null : d;
};

/** Item dates are ISO-8601 instants; the calendar groups by their UTC day. */
const itemDayKey = (item: ClientCalendarItem) => item.date.slice(0, 10);

function rangeForView(view: ViewKey, anchor: Date): { from: string; to: string } {
  const y = anchor.getFullYear();
  if (view === "day") {
    const key = dateKey(anchor);
    return { from: key, to: key };
  }
  if (view === "month") {
    const from = new Date(y, anchor.getMonth(), 1);
    const to = new Date(y, anchor.getMonth() + 1, 0);
    return { from: dateKey(from), to: dateKey(to) };
  }
  if (view === "year") {
    return { from: `${y}-01-01`, to: `${y}-12-31` };
  }
  return { from: `${y}-01-01`, to: `${y + 4}-12-31` };
}

function stepAnchor(view: ViewKey, anchor: Date, direction: -1 | 1): Date {
  const d = new Date(anchor);
  if (view === "day") d.setDate(d.getDate() + direction);
  else if (view === "month") d.setMonth(d.getMonth() + direction);
  else if (view === "year") d.setFullYear(d.getFullYear() + direction);
  else d.setFullYear(d.getFullYear() + 5 * direction);
  return d;
}

function ClientCalendarContent() {
  const params = useParams();
  const clientId = String(params?.clientId || "");
  const searchParams = useSearchParams();
  const router = useRouter();
  const pathname = usePathname();

  const initialView = ((): ViewKey => {
    const raw = searchParams?.get("view");
    return raw === "day" || raw === "month" || raw === "year" || raw === "five-year" ? raw : "month";
  })();
  const initialAnchor = parseKey(searchParams?.get("date") || "") || new Date();

  const [client, setClient] = useState<Client | null>(null);
  const [organizationMode, setOrganizationMode] = useState(false);
  const [view, setView] = useState<ViewKey>(initialView);
  const [anchor, setAnchor] = useState<Date>(initialAnchor);
  const [selectedDay, setSelectedDay] = useState<string>(dateKey(initialAnchor));
  const [items, setItems] = useState<ClientCalendarItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [calendarError, setCalendarError] = useState<string | null>(null);

  const clientColorDef = client ? getClientColorDefinition(client.colorKey) : null;

  // Deep-link/query state: ?view=&date= survives refresh and can be shared.
  useEffect(() => {
    const paramsNext = new URLSearchParams();
    paramsNext.set("view", view);
    paramsNext.set("date", dateKey(anchor));
    router.replace(`${pathname}?${paramsNext.toString()}`);
  }, [view, anchor, router, pathname]);

  useEffect(() => {
    if (!clientId) return;
    void Promise.all([getClient(clientId), listAdminWorkspaces(clientId).catch(() => ({ items: [] }))])
      .then(([clientResult, workspaces]) => {
        setClient(clientResult);
        setOrganizationMode(workspaces.items.some((item) => item.mode !== "INDIVIDUAL" && item.status !== "ARCHIVED"));
      })
      .catch(() => setError("Az ügyfél adatai jelenleg nem érhetők el."));
  }, [clientId]);

  useEffect(() => {
    if (!clientId) return;
    const range = rangeForView(view, anchor);
    setLoading(true);
    void getClientCalendar(clientId, range)
      .then((result) => { setItems(result.items || []); setCalendarError(null); })
      // A failed load must never render as a truthful "no events" state.
      .catch(() => setCalendarError("A naptáradatok most nem érhetők el."))
      .finally(() => setLoading(false));
  }, [clientId, view, anchor]);

  const itemsByDay = useMemo(() => {
    const map = new Map<string, ClientCalendarItem[]>();
    for (const item of items) {
      const key = itemDayKey(item);
      map.set(key, [...(map.get(key) || []), item]);
    }
    return map;
  }, [items]);

  const itemsByMonth = useMemo(() => {
    const map = new Map<string, ClientCalendarItem[]>();
    for (const item of items) {
      const key = itemDayKey(item).slice(0, 7);
      map.set(key, [...(map.get(key) || []), item]);
    }
    return map;
  }, [items]);

  const itemHref = (item: ClientCalendarItem): string =>
    item.caseId
      ? `/cases/${encodeURIComponent(item.caseId)}`
      : `/clients/${encodeURIComponent(clientId)}/vallalati-mukodes`;

  const renderItemRow = (item: ClientCalendarItem) => (
    <Link
      key={item.id}
      href={itemHref(item)}
      className="flex items-start gap-3 rounded-lg border border-[var(--adm-border)] bg-white p-3 hover:border-[var(--adm-ochre-500)]"
    >
      <span className={`mt-1.5 h-2.5 w-2.5 shrink-0 rounded-full ${sourceDotClass[item.sourceType]}`} aria-hidden="true" />
      <span className="min-w-0 flex-1">
        <span className="flex flex-wrap items-center gap-x-2 gap-y-1">
          <span className="text-sm font-semibold text-[var(--adm-text)]">{item.title}</span>
          {item.status ? <span className="rounded-full bg-[var(--adm-surface)] px-2 py-0.5 text-[10px] font-semibold text-[var(--adm-text-muted)]">{item.status}</span> : null}
        </span>
        <span className="mt-0.5 block text-xs text-[var(--adm-text-muted)]">
          {sourceLabels[item.sourceType]} · {dateKindLabels[item.dateKind]}
        </span>
      </span>
    </Link>
  );

  const dayItems = itemsByDay.get(selectedDay) || [];

  const renderDayView = () => (
    <section className="adm-board-panel p-5">
      <h2 className="font-serif text-xl text-[var(--adm-text)]">
        {anchor.getFullYear()}. {MONTH_NAMES[anchor.getMonth()].toLowerCase()} {anchor.getDate()}.
      </h2>
      <div className="mt-4 grid gap-2">
        {dayItems.length ? dayItems.map(renderItemRow) : calendarError ? (
          <p className="text-sm text-[var(--adm-text-muted)]">{calendarError}</p>
        ) : (
          <p className="text-sm text-[var(--adm-text-muted)]">Nincs rögzített esemény ezen a napon.</p>
        )}
      </div>
    </section>
  );

  const renderMonthView = () => {
    const y = anchor.getFullYear();
    const m = anchor.getMonth();
    const first = new Date(y, m, 1);
    const daysInMonth = new Date(y, m + 1, 0).getDate();
    const startOffset = (first.getDay() + 6) % 7; // Monday-first
    const cells: Array<{ key: string; day: number } | null> = [];
    for (let i = 0; i < startOffset; i += 1) cells.push(null);
    for (let d = 1; d <= daysInMonth; d += 1) cells.push({ key: dateKey(new Date(y, m, d)), day: d });
    while (cells.length % 7 !== 0) cells.push(null);
    const todayKey = dateKey(new Date());

    return (
      <section className="adm-board-panel p-5">
        <h2 className="font-serif text-xl text-[var(--adm-text)]">{y}. {MONTH_NAMES[m]}</h2>
        <div className="mt-4 grid grid-cols-7 gap-1 text-center text-[10px] font-semibold uppercase tracking-[0.14em] text-[var(--adm-text-muted)]">
          {WEEKDAY_NAMES.map((name) => <div key={name} className="py-1">{name}</div>)}
        </div>
        <div className="grid grid-cols-7 gap-1">
          {cells.map((cell, index) => cell === null ? (
            <div key={`empty-${index}`} className="min-h-16 rounded border border-transparent" />
          ) : (
            <button
              key={cell.key}
              type="button"
              onClick={() => setSelectedDay(cell.key)}
              className={`min-h-16 rounded border p-1.5 text-left text-xs transition-colors ${
                selectedDay === cell.key
                  ? "border-[var(--adm-ochre-500)] bg-[var(--adm-surface)]"
                  : "border-[var(--adm-border)] bg-white hover:border-[var(--adm-ochre-500)]"
              }`}
            >
              <span className={`font-semibold ${cell.key === todayKey ? "text-[var(--adm-ochre-500)]" : "text-[var(--adm-text)]"}`}>{cell.day}</span>
              <span className="mt-1 flex flex-wrap gap-0.5">
                {(itemsByDay.get(cell.key) || []).slice(0, 4).map((item) => (
                  <span key={item.id} className={`h-1.5 w-1.5 rounded-full ${sourceDotClass[item.sourceType]}`} title={`${sourceLabels[item.sourceType]}: ${item.title}`} />
                ))}
                {(itemsByDay.get(cell.key) || []).length > 4 ? (
                  <span className="text-[9px] text-[var(--adm-text-muted)]">+{(itemsByDay.get(cell.key) || []).length - 4}</span>
                ) : null}
              </span>
            </button>
          ))}
        </div>
        <div className="mt-5 border-t border-[var(--adm-border)] pt-4">
          <h3 className="text-sm font-semibold text-[var(--adm-text)]">{selectedDay} — események</h3>
          <div className="mt-3 grid gap-2">
            {dayItems.length ? dayItems.map(renderItemRow) : calendarError ? (
              <p className="text-sm text-[var(--adm-text-muted)]">{calendarError}</p>
            ) : (
              <p className="text-sm text-[var(--adm-text-muted)]">Nincs rögzített esemény ezen a napon.</p>
            )}
          </div>
        </div>
      </section>
    );
  };

  const renderYearView = () => {
    const y = anchor.getFullYear();
    return (
      <section className="adm-board-panel p-5">
        <h2 className="font-serif text-xl text-[var(--adm-text)]">{y}. év</h2>
        <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          {MONTH_NAMES.map((name, monthIndex) => {
            const monthKey = `${y}-${pad2(monthIndex + 1)}`;
            const monthItems = itemsByMonth.get(monthKey) || [];
            const populatedDays = new Set(monthItems.map(itemDayKey)).size;
            return (
              <button
                key={monthKey}
                type="button"
                onClick={() => { setAnchor(new Date(y, monthIndex, 1)); setView("month"); setSelectedDay(`${monthKey}-01`); }}
                className="rounded-xl border border-[var(--adm-border)] bg-white p-4 text-left transition-colors hover:border-[var(--adm-ochre-500)]"
              >
                <p className="text-sm font-semibold text-[var(--adm-text)]">{name}</p>
                <p className="mt-1 text-xs text-[var(--adm-text-muted)]">
                  {monthItems.length ? `${monthItems.length} esemény` : "—"}
                </p>
                <span className="mt-2 flex flex-wrap gap-1">
                  {monthItems.slice(0, 8).map((item) => (
                    <span key={item.id} className={`h-1.5 w-1.5 rounded-full ${sourceDotClass[item.sourceType]}`} />
                  ))}
                  {populatedDays > 8 ? <span className="text-[9px] text-[var(--adm-text-muted)]">…</span> : null}
                </span>
              </button>
            );
          })}
        </div>
      </section>
    );
  };

  const renderFiveYearView = () => {
    const startYear = anchor.getFullYear();
    const years = Array.from({ length: 5 }, (_, i) => startYear + i);
    return (
      <section className="adm-board-panel p-5">
        <h2 className="font-serif text-xl text-[var(--adm-text)]">{startYear}–{startYear + 4} hosszú távú ütemezés</h2>
        <p className="mt-1 text-xs text-[var(--adm-text-muted)]">Szerződéses és jogi határidők idővonalon — csak rögzített, hiteles dátumok.</p>
        <div className="mt-4 space-y-6">
          {years.map((year) => {
            const yearItems = items.filter((item) => itemDayKey(item).startsWith(`${year}-`));
            return (
              <div key={year} className="border-l-2 border-[var(--adm-border)] pl-4">
                <p className="text-sm font-bold uppercase tracking-[0.14em] text-[var(--adm-text)]">{year}</p>
                {yearItems.length ? (
                  <div className="mt-2 space-y-2">
                    {[...new Set(yearItems.map((item) => itemDayKey(item).slice(0, 7)))].sort().map((monthKey) => {
                      const monthItems = items.filter((item) => itemDayKey(item).startsWith(monthKey));
                      const monthIndex = Number(monthKey.slice(5, 7)) - 1;
                      return (
                        <div key={monthKey}>
                          <p className="text-xs font-semibold text-[var(--adm-text-muted)]">{MONTH_NAMES[monthIndex]}</p>
                          <div className="mt-1 grid gap-1.5">
                            {monthItems.map((item) => (
                              <div key={item.id} className="flex items-baseline gap-2">
                                <span className="w-16 shrink-0 text-xs tabular-nums text-[var(--adm-text-muted)]">{itemDayKey(item).slice(8)}.</span>
                                <Link href={itemHref(item)} className="flex min-w-0 flex-1 items-start gap-2 rounded px-1 py-0.5 hover:bg-[var(--adm-surface)]">
                                  <span className={`mt-1.5 h-2 w-2 shrink-0 rounded-full ${sourceDotClass[item.sourceType]}`} aria-hidden="true" />
                                  <span className="min-w-0">
                                    <span className="text-sm text-[var(--adm-text)]">{item.title}</span>
                                    <span className="block text-[10px] uppercase tracking-[0.1em] text-[var(--adm-text-muted)]">
                                      {sourceLabels[item.sourceType]} · {dateKindLabels[item.dateKind]}{item.status ? ` · ${item.status}` : ""}
                                    </span>
                                  </span>
                                </Link>
                              </div>
                            ))}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                ) : calendarError ? (
                  <p className="mt-2 text-xs text-[var(--adm-text-muted)]">{calendarError}</p>
                ) : (
                  <p className="mt-2 text-xs text-[var(--adm-text-muted)]">Nincs rögzített esemény.</p>
                )}
              </div>
            );
          })}
        </div>
      </section>
    );
  };

  return (
    <AuthenticatedApp section="clients">
      <div className="flex-1 min-h-0 overflow-y-auto adm-board-page">
        <div className="adm-board-container space-y-5">
          {error ? <div className="rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-800">{error}</div> : null}
          {client ? (
            <>
              <ClientWorkspaceTabs clientId={client.id} active="calendar" organizationMode={organizationMode} />
              <header className={`adm-board-panel p-5 ${clientColorDef?.key ? `border-t-2 ${clientColorDef.accentTopBorderClass}` : ""}`}>
                <p className="text-[10px] font-semibold uppercase tracking-[0.2em] text-[var(--adm-text-muted)]">Ügyfél munkaterület · Naptár</p>
                <h1 className="mt-1 font-serif text-3xl text-[var(--adm-text)]">{client.name}</h1>
                <p className="mt-2 text-sm text-[var(--adm-text-muted)]">Az ügyfélhez tartozó rögzített szerződéses és jogi határidők.</p>
              </header>

              <section className="adm-board-panel p-4">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div className="flex flex-wrap gap-1" role="tablist" aria-label="Naptár nézet">
                    {VIEWS.map(([key, label]) => (
                      <button
                        key={key}
                        type="button"
                        onClick={() => setView(key)}
                        aria-current={view === key ? "page" : undefined}
                        className={`rounded px-3 py-1.5 text-xs font-semibold transition-colors ${
                          view === key ? "bg-[var(--adm-green-800)] text-[var(--adm-ivory-50)]" : "bg-[var(--adm-surface)] text-[var(--adm-text)] hover:bg-[var(--adm-sand-100)]"
                        }`}
                      >
                        {label}
                      </button>
                    ))}
                  </div>
                  <div className="flex items-center gap-2">
                    <button type="button" onClick={() => setAnchor(stepAnchor(view, anchor, -1))} className="rounded border border-[var(--adm-border)] bg-white px-3 py-1.5 text-xs font-semibold text-[var(--adm-text)] hover:bg-[var(--adm-surface)]" aria-label="Előző időszak">←</button>
                    <button type="button" onClick={() => { const t = new Date(); setAnchor(t); setSelectedDay(dateKey(t)); }} className="rounded border border-[var(--adm-border)] bg-white px-3 py-1.5 text-xs font-semibold text-[var(--adm-text)] hover:bg-[var(--adm-surface)]">Ma</button>
                    <button type="button" onClick={() => setAnchor(stepAnchor(view, anchor, 1))} className="rounded border border-[var(--adm-border)] bg-white px-3 py-1.5 text-xs font-semibold text-[var(--adm-text)] hover:bg-[var(--adm-surface)]" aria-label="Következő időszak">→</button>
                  </div>
                </div>
                <div className="mt-3 flex flex-wrap gap-3 border-t border-[var(--adm-border)] pt-3" aria-label="Kategória jelmagyarázat">
                  {(Object.keys(sourceLabels) as ClientCalendarSourceType[]).map((key) => (
                    <span key={key} className="flex items-center gap-1.5 text-[10px] text-[var(--adm-text-muted)]">
                      <span className={`h-2 w-2 rounded-full ${sourceDotClass[key]}`} aria-hidden="true" />
                      {sourceLabels[key]}
                    </span>
                  ))}
                </div>
              </section>

              {loading ? <p className="text-xs text-[var(--adm-text-muted)]">Naptár betöltése…</p> : null}
              {calendarError ? <div className="rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-800">{calendarError}</div> : null}
              {view === "day" ? renderDayView() : null}
              {view === "month" ? renderMonthView() : null}
              {view === "year" ? renderYearView() : null}
              {view === "five-year" ? renderFiveYearView() : null}
            </>
          ) : !error ? <div className="adm-board-panel p-5 text-sm text-[var(--adm-text-muted)]">Ügyfél betöltése…</div> : null}
        </div>
      </div>
    </AuthenticatedApp>
  );
}

export default function ClientCalendarPage() {
  return (
    <Suspense fallback={<div className="p-6 text-xs text-[var(--adm-text-muted)]">Naptár betöltése…</div>}>
      <ClientCalendarContent />
    </Suspense>
  );
}
