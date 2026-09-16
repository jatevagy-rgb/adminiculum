"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import {
  getPortalCalendar,
  type PortalCalendar,
  type PortalCalendarCategory,
  type PortalCalendarItem,
} from "@/lib/clientPortalApi";
import { Card, formatDate } from "./MatterWorkspace";

const WEEKDAYS = ["H", "K", "Sze", "Cs", "P", "Szo", "V"];

const CATEGORY_DOT: Record<PortalCalendarCategory, string> = {
  MATTER_TARGET: "bg-[var(--adm-blue-700)]",
  PUBLISHED_DEADLINE: "bg-[#b95e4b]",
  ACTION_REQUEST: "bg-[#b8860b]",
  CUSTOMER_REQUEST: "bg-[#6f5514]",
  CONTRACT_DATE: "bg-[#3f6552]",
  COMPANY_MILESTONE: "bg-[#7a5f18]",
};

const STATUS_LABEL: Record<PortalCalendarItem["status"], string> = {
  OPEN: "Nyitott",
  DONE: "Teljesítve",
  INFO: "Tájékoztató",
};

const STATUS_CLASS: Record<PortalCalendarItem["status"], string> = {
  OPEN: "bg-[#fdf3dc] text-[#6f5514]",
  DONE: "bg-[#e6f0e9] text-[#2f5d45]",
  INFO: "bg-[var(--adm-ivory-100)] text-[var(--adm-text-muted)]",
};

function pad(value: number): string {
  return String(value).padStart(2, "0");
}

function toDayKey(date: Date): string {
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

function parseDayKey(key: string): Date {
  const [year, month, day] = key.split("-").map(Number);
  return new Date(year, month - 1, day);
}

function addDaysKey(key: string, days: number): string {
  const date = parseDayKey(key);
  date.setDate(date.getDate() + days);
  return toDayKey(date);
}

function addMonthsKey(key: string, months: number): string {
  const [year, month] = key.split("-").map(Number);
  const date = new Date(year, month - 1 + months, 1);
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}`;
}

function monthLabel(monthKey: string): string {
  const [year, month] = monthKey.split("-").map(Number);
  return new Intl.DateTimeFormat("hu-HU", { year: "numeric", month: "long" }).format(new Date(year, month - 1, 1));
}

function monthBounds(monthKey: string): { start: string; end: string } {
  const [year, month] = monthKey.split("-").map(Number);
  return { start: `${monthKey}-01`, end: toDayKey(new Date(year, month, 0)) };
}

function dayLabel(dayKey: string): string {
  return new Intl.DateTimeFormat("hu-HU", { weekday: "long", year: "numeric", month: "long", day: "numeric" }).format(parseDayKey(dayKey));
}

function KpiCard({ label, value, tone = "default" }: { label: string; value: number; tone?: "default" | "alert" | "today" }) {
  const toneClass = tone === "alert" ? "text-[#b95e4b]" : tone === "today" ? "text-[var(--adm-blue-700)]" : "text-[var(--adm-text)]";
  return (
    <div className="cp-card p-4">
      <p className="cp-kicker">{label}</p>
      <p className={`mt-2 font-serif text-3xl font-medium ${toneClass}`}>{value}</p>
    </div>
  );
}

function ItemRow({ item }: { item: PortalCalendarItem }) {
  return (
    <Link className="cp-row cp-card-hover block p-4 focus:outline-none focus:ring-4 focus:ring-[#d7c48a]/40" href={item.href}>
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="cp-kicker">{item.categoryLabel}{item.matterTitle ? ` · ${item.matterTitle}` : ""}</p>
          <h3 className="cp-title mt-1 break-words text-lg">{item.title}</h3>
        </div>
        <span className={`shrink-0 rounded-full px-3 py-1 text-xs font-semibold ${STATUS_CLASS[item.status]}`}>{STATUS_LABEL[item.status]}</span>
      </div>
      <p className="mt-2 text-sm text-[var(--adm-text-muted)]">{formatDate(item.date)}{item.day ? ` · ${item.day}` : ""}</p>
    </Link>
  );
}

export function PortalCalendarView() {
  const [localToday] = useState(() => toDayKey(new Date()));
  const [monthKey, setMonthKey] = useState(() => localToday.slice(0, 7));
  const [data, setData] = useState<PortalCalendar | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [activeCategories, setActiveCategories] = useState<PortalCalendarCategory[]>([]);
  const [selectedDay, setSelectedDay] = useState(localToday);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      setLoading(true);
      setError(null);
      const bounds = monthBounds(monthKey);
      const windowFrom = bounds.start < localToday ? bounds.start : localToday;
      const windowToRaw = addDaysKey(localToday, 90);
      const windowTo = bounds.end > windowToRaw ? bounds.end : windowToRaw;
      try {
        const result = await getPortalCalendar({ from: windowFrom, to: windowTo });
        if (!cancelled) setData(result);
      } catch {
        if (!cancelled) setError("A naptáradatok most nem érhetők el.");
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    void load();
    return () => { cancelled = true; };
  }, [localToday, monthKey]);

  useEffect(() => {
    const bounds = monthBounds(monthKey);
    setSelectedDay(localToday >= bounds.start && localToday <= bounds.end ? localToday : bounds.start);
  }, [localToday, monthKey]);

  const serverToday = data?.today || localToday;
  const activeSet = useMemo(() => new Set(activeCategories), [activeCategories]);
  const filteredItems = useMemo(
    () => (data ? data.items.filter((item) => activeSet.size === 0 || activeSet.has(item.category)) : []),
    [activeSet, data],
  );

  const itemsByDay = useMemo(() => {
    const map = new Map<string, PortalCalendarItem[]>();
    for (const item of filteredItems) {
      const list = map.get(item.day) || [];
      list.push(item);
      map.set(item.day, list);
    }
    return map;
  }, [filteredItems]);

  const kpis = useMemo(() => {
    const open = filteredItems.filter((item) => item.status === "OPEN");
    const next7 = addDaysKey(serverToday, 7);
    return {
      overdue: open.filter((item) => item.day < serverToday).length,
      today: open.filter((item) => item.day === serverToday).length,
      next7Days: open.filter((item) => item.day > serverToday && item.day <= next7).length,
      open: open.length,
    };
  }, [filteredItems, serverToday]);

  const nextEvents = useMemo(
    () => filteredItems.filter((item) => item.day >= serverToday).slice(0, 8),
    [filteredItems, serverToday],
  );

  const gridCells = useMemo(() => {
    const [year, month] = monthKey.split("-").map(Number);
    const first = new Date(year, month - 1, 1);
    const offset = (first.getDay() + 6) % 7;
    return Array.from({ length: 42 }, (_, index) => {
      const date = new Date(year, month - 1, 1 - offset + index);
      return { key: toDayKey(date), inMonth: date.getMonth() === month - 1, dayNumber: date.getDate() };
    });
  }, [monthKey]);

  const monthItems = useMemo(() => {
    const bounds = monthBounds(monthKey);
    return filteredItems.filter((item) => item.day >= bounds.start && item.day <= bounds.end);
  }, [filteredItems, monthKey]);

  const selectedItems = itemsByDay.get(selectedDay) || [];
  const canPrev = monthKey > addMonthsKey(localToday.slice(0, 7), -12);
  const canNext = monthKey < addMonthsKey(localToday.slice(0, 7), 12);

  const toggleCategory = (category: PortalCalendarCategory) => {
    setActiveCategories((current) => current.includes(category) ? current.filter((key) => key !== category) : [...current, category]);
  };

  return (
    <div className="space-y-6">
      <div>
        <p className="cp-kicker">Naptár</p>
        <h1 className="cp-title mt-2 text-3xl">Határidők és teendők</h1>
        <p className="cp-subtitle mt-2 max-w-2xl text-sm">
          Ez a naptár kizárólag az iroda által közzétett, ügyfélbiztos határidőket és teendőket tartalmazza. A mai nap: {serverToday}.
        </p>
      </div>

      <section aria-label="Közelgő határidők összegzése" className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <KpiCard label="Lejárt" value={kpis.overdue} tone="alert" />
        <KpiCard label="Ma esedékes" value={kpis.today} tone="today" />
        <KpiCard label="Következő 7 nap" value={kpis.next7Days} />
        <KpiCard label="Nyitott teendő" value={kpis.open} />
      </section>

      {data && data.categories.length ? (
        <section aria-label="Szűrés kategória szerint" className="flex flex-wrap items-center gap-2">
          <span className="cp-kicker">Szűrés:</span>
          {data.categories.map((category) => {
            const active = activeSet.has(category.key);
            return (
              <button
                key={category.key}
                type="button"
                aria-pressed={active}
                onClick={() => toggleCategory(category.key)}
                className={`rounded-full border px-3 py-1.5 text-xs font-semibold transition-colors focus:outline-none focus:ring-4 focus:ring-[#d7c48a]/40 ${active ? "border-[var(--adm-blue-950)] bg-[var(--adm-blue-950)] text-white" : "border-[var(--adm-border)] bg-white text-[var(--adm-text)]"}`}
              >
                <span className={`mr-2 inline-block h-2 w-2 rounded-full align-middle ${CATEGORY_DOT[category.key]}`} aria-hidden />
                {category.label} ({category.count})
              </button>
            );
          })}
          {activeCategories.length ? (
            <button type="button" className="text-xs font-semibold text-[var(--adm-blue-700)] hover:underline" onClick={() => setActiveCategories([])}>Szűrők törlése</button>
          ) : null}
        </section>
      ) : null}

      {loading ? <Card>Naptár betöltése…</Card> : null}
      {error ? <div className="rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-800">{error}</div> : null}

      {!loading && !error && data ? (
        <>
          <div className="grid gap-4 lg:grid-cols-[1.7fr_1fr]">
            <Card>
              <div className="flex flex-wrap items-center justify-between gap-3">
                <h2 className="cp-card-heading">{monthLabel(monthKey)}</h2>
                <div className="flex items-center gap-2">
                  <button type="button" disabled={!canPrev} onClick={() => setMonthKey(addMonthsKey(monthKey, -1))} className="rounded-full border border-[var(--adm-border)] px-3 py-1.5 text-sm disabled:opacity-40 focus:outline-none focus:ring-4 focus:ring-[#d7c48a]/40" aria-label="Előző hónap">‹ Előző</button>
                  <button type="button" disabled={!canNext} onClick={() => setMonthKey(addMonthsKey(monthKey, 1))} className="rounded-full border border-[var(--adm-border)] px-3 py-1.5 text-sm disabled:opacity-40 focus:outline-none focus:ring-4 focus:ring-[#d7c48a]/40" aria-label="Következő hónap">Következő ›</button>
                </div>
              </div>
              <div className="mt-4 grid grid-cols-7 gap-1 text-center">
                {WEEKDAYS.map((day) => <div key={day} className="py-1 text-[11px] font-semibold uppercase tracking-wide text-[var(--adm-text-muted)]">{day}</div>)}
                {gridCells.map((cell) => {
                  const dayItems = itemsByDay.get(cell.key) || [];
                  const isToday = cell.key === serverToday;
                  const isSelected = cell.key === selectedDay;
                  return (
                    <button
                      key={cell.key}
                      type="button"
                      onClick={() => setSelectedDay(cell.key)}
                      aria-pressed={isSelected}
                      aria-label={`${dayLabel(cell.key)}${dayItems.length ? `, ${dayItems.length} határidő` : ""}`}
                      className={`min-h-[62px] rounded-lg border p-1.5 text-left align-top transition-colors focus:outline-none focus:ring-2 focus:ring-[var(--adm-green-800)] focus:ring-offset-1 ${isSelected ? "border-[var(--adm-blue-950)] bg-[var(--adm-ivory-100)]" : "border-[var(--adm-border)] bg-white hover:bg-[var(--adm-surface)]"} ${cell.inMonth ? "" : "opacity-40"}`}
                    >
                      <span className={`inline-flex h-6 w-6 items-center justify-center rounded-full text-xs font-semibold ${isToday ? "bg-[var(--adm-blue-950)] text-white" : "text-[var(--adm-text)]"}`}>{cell.dayNumber}</span>
                      <span className="mt-1 flex flex-wrap gap-0.5">
                        {dayItems.slice(0, 3).map((item) => <span key={item.id} className={`h-1.5 w-1.5 rounded-full ${CATEGORY_DOT[item.category]}`} title={item.title} />)}
                        {dayItems.length > 3 ? <span className="text-[9px] leading-none text-[var(--adm-text-muted)]">+{dayItems.length - 3}</span> : null}
                      </span>
                    </button>
                  );
                })}
              </div>
              <div className="mt-4 border-t border-[var(--adm-border)] pt-4">
                <h3 className="cp-kicker">{dayLabel(selectedDay)}</h3>
                <div className="mt-3 grid gap-3">
                  {selectedItems.length ? selectedItems.map((item) => <ItemRow key={item.id} item={item} />) : <p className="cp-empty">Erre a napra nincs közzétett határidő.</p>}
                </div>
              </div>
            </Card>

            <Card>
              <h2 className="cp-card-heading">Következő események</h2>
              <p className="cp-subtitle mt-1 text-sm">A mai naptól számított közzétett határidők.</p>
              <div className="mt-4 grid gap-3">
                {nextEvents.length ? nextEvents.map((item) => <ItemRow key={item.id} item={item} />) : <p className="cp-empty">Jelenleg nincs közzétett közelgő határidő.</p>}
              </div>
            </Card>
          </div>

          <Card>
            <h2 className="cp-card-heading">Határidők és teendők — {monthLabel(monthKey)}</h2>
            {monthItems.length ? (
              <div className="mt-4 overflow-x-auto">
                <table className="w-full min-w-[640px] border-collapse text-left text-sm">
                  <thead>
                    <tr className="border-b border-[var(--adm-border)] text-[11px] uppercase tracking-wide text-[var(--adm-text-muted)]">
                      <th scope="col" className="py-2 pr-3">Dátum</th>
                      <th scope="col" className="py-2 pr-3">Kategória</th>
                      <th scope="col" className="py-2 pr-3">Megnevezés</th>
                      <th scope="col" className="py-2 pr-3">Állapot</th>
                      <th scope="col" className="py-2">Megnyitás</th>
                    </tr>
                  </thead>
                  <tbody>
                    {monthItems.map((item) => (
                      <tr key={item.id} className="border-b border-[var(--adm-border)] last:border-b-0">
                        <td className="py-3 pr-3 whitespace-nowrap">{formatDate(item.date)}</td>
                        <td className="py-3 pr-3"><span className={`mr-2 inline-block h-2 w-2 rounded-full align-middle ${CATEGORY_DOT[item.category]}`} aria-hidden />{item.categoryLabel}</td>
                        <td className="py-3 pr-3">
                          <span className="font-medium text-[var(--adm-text)]">{item.title}</span>
                          {item.matterTitle ? <span className="block text-xs text-[var(--adm-text-muted)]">{item.matterTitle}</span> : null}
                        </td>
                        <td className="py-3 pr-3"><span className={`rounded-full px-3 py-1 text-xs font-semibold ${STATUS_CLASS[item.status]}`}>{STATUS_LABEL[item.status]}</span></td>
                        <td className="py-3"><Link className="font-semibold text-[var(--adm-blue-700)] hover:underline" href={item.href}>Megnyitás →</Link></td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : <p className="cp-empty mt-4">Ebben a hónapban nincs közzétett határidő vagy teendő.</p>}
          </Card>
        </>
      ) : null}
    </div>
  );
}
