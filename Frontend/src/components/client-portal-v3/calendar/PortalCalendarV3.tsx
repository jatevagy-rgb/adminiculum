"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import { Button, IconButton, SafePanelError } from "@/components/ui";
import {
  getPortalCalendar,
  type PortalCalendar,
  type PortalCalendarCategory,
  type PortalCalendarItem,
} from "@/lib/clientPortalApi";
import { PortalEmptyInline } from "../shared/PortalEmptyInline";

const WEEKDAYS = ["H", "K", "Sze", "Cs", "P", "Szo", "V"];

const STATUS_LABEL: Record<PortalCalendarItem["status"], string> = {
  OPEN: "Nyitott",
  DONE: "Teljesítve",
  INFO: "Tájékoztató",
};

function formatDate(value: string | null): string | null {
  if (!value) return null;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  return new Intl.DateTimeFormat("hu-HU", { year: "numeric", month: "2-digit", day: "2-digit" }).format(date);
}

/** Presentation-only day-key arithmetic; never derives new dates from item data. */
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

/**
 * Customer-safe status presentation: OPEN / DONE / INFO only. Terracotta is
 * reserved for overdue (OPEN with a canonical day before the server today);
 * success/info use the canonical semantic tokens.
 */
function statusTextClass(item: PortalCalendarItem, today: string): string {
  if (item.status === "DONE") return "text-[var(--adm-semantic-success)]";
  if (item.status === "INFO") return "text-[var(--adm-semantic-info)]";
  return item.day < today ? "text-[var(--adm-brand-terracotta)]" : "text-[var(--adm-text-secondary)]";
}

function statusLabel(item: PortalCalendarItem, today: string): string {
  const base = STATUS_LABEL[item.status];
  return item.status === "OPEN" && item.day < today ? `${base} · Lejárt` : base;
}

/** One calendar entry; the href is always the canonical published destination. */
function CalendarItemRow({ item, today }: { item: PortalCalendarItem; today: string }) {
  const dateLabel = formatDate(item.date);
  return (
    <li data-testid="portal-calendar-item" className="border-b border-[var(--adm-border-canonical)] last:border-b-0">
      <Link
        href={item.href}
        className="block px-4 py-3 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--adm-brand-green)] focus-visible:ring-offset-2"
      >
        <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
          <p className="break-words text-sm font-medium text-[var(--adm-text-primary)]">{item.title}</p>
          <span className={`text-xs font-semibold ${statusTextClass(item, today)}`}>{statusLabel(item, today)}</span>
        </div>
        <p className="mt-1 text-xs text-[var(--adm-text-secondary)]">
          {dateLabel ? `${dateLabel}` : ""}
          {item.categoryLabel ? `${dateLabel ? " · " : ""}${item.categoryLabel}` : ""}
          {item.matterTitle ? ` · ${item.matterTitle}` : ""}
        </p>
      </Link>
    </li>
  );
}

/**
 * Client Portal 3.0 calendar — the /portal/naptar ORGANIZATION body. Reuses
 * the canonical customer-safe calendar projection (getPortalCalendar) without
 * a second date engine or persistence. All nine canonical categories are
 * rendered from the server category list; no date is ever inferred from item
 * metadata and no KPI wall is fabricated — the summary uses the server counts.
 */
export function PortalCalendarV3() {
  const [localToday] = useState(() => toDayKey(new Date()));
  const [monthKey, setMonthKey] = useState(() => localToday.slice(0, 7));
  const [data, setData] = useState<PortalCalendar | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [activeCategories, setActiveCategories] = useState<PortalCalendarCategory[]>([]);
  const [selectedDay, setSelectedDay] = useState(localToday);
  const [reloadNonce, setReloadNonce] = useState(0);

  const load = useCallback(() => {
    setLoading(true);
    setError(false);
    const bounds = monthBounds(monthKey);
    const windowFrom = bounds.start < localToday ? bounds.start : localToday;
    const windowToRaw = addDaysKey(localToday, 90);
    const windowTo = bounds.end > windowToRaw ? bounds.end : windowToRaw;
    getPortalCalendar({ from: windowFrom, to: windowTo })
      .then((result) => setData(result))
      .catch(() => setError(true))
      .finally(() => setLoading(false));
  }, [localToday, monthKey]);

  useEffect(() => {
    load();
  }, [load, reloadNonce]);

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

  const monthDays = useMemo(() => {
    const [year, month] = monthKey.split("-").map(Number);
    const count = new Date(year, month, 0).getDate();
    return Array.from({ length: count }, (_, index) => `${monthKey}-${pad(index + 1)}`);
  }, [monthKey]);

  const selectedItems = itemsByDay.get(selectedDay) || [];
  const canPrev = monthKey > addMonthsKey(localToday.slice(0, 7), -12);
  const canNext = monthKey < addMonthsKey(localToday.slice(0, 7), 12);

  const toggleCategory = (category: PortalCalendarCategory) => {
    setActiveCategories((current) => (current.includes(category) ? current.filter((key) => key !== category) : [...current, category]));
  };

  return (
    <div className="space-y-4" data-testid="portal-calendar-v3">
      <div>
        <h1 className="font-serif text-2xl font-semibold tracking-tight text-[var(--adm-text-primary)] sm:text-3xl">Naptár</h1>
        <p className="mt-1 text-sm text-[var(--adm-text-secondary)]">
          Ez a naptár kizárólag az iroda által közzétett, ügyfélbiztos határidőket és eseményeket tartalmazza.
        </p>
        {data ? (
          <p className="mt-1 text-sm text-[var(--adm-text-secondary)]" data-testid="portal-calendar-summary">
            {data.counts.open > 0 ? `${data.counts.open} nyitott teendő` : "Nincs nyitott teendő"}
            {data.counts.overdue > 0 ? ` · ${data.counts.overdue} lejárt` : ""}
            {data.counts.dueToday > 0 ? ` · ${data.counts.dueToday} ma esedékes` : ""}
            {data.counts.dueNext7Days > 0 ? ` · ${data.counts.dueNext7Days} a következő 7 napban` : ""}
          </p>
        ) : null}
      </div>

      {loading ? (
        <div
          aria-label="Naptár betöltése"
          data-testid="portal-calendar-loading"
          className="space-y-2 rounded-[8px] border border-[var(--adm-border-canonical)] bg-[var(--adm-canvas-white)] p-4"
        >
          {[0, 1, 2].map((row) => (
            <div key={row} className="h-14 animate-pulse rounded bg-[var(--adm-canvas-subtle)]" />
          ))}
        </div>
      ) : null}

      {!loading && error ? (
        <SafePanelError detail="A naptáradatok jelenleg nem tölthetők be. Próbálja újra." onRetry={() => setReloadNonce((value) => value + 1)} />
      ) : null}

      {!loading && !error && data && data.items.length === 0 ? (
        <PortalEmptyInline>Ebben az időszakban nincs közzétett határidő vagy esemény.</PortalEmptyInline>
      ) : null}

      {!loading && !error && data && data.items.length > 0 ? (
        <>
          {data.categories.length ? (
            <section aria-label="Szűrés kategória szerint" data-testid="portal-calendar-filters" className="flex flex-wrap items-center gap-2">
              {data.categories.map((category) => {
                const active = activeSet.has(category.key);
                return (
                  <Button key={category.key} variant={active ? "secondary" : "neutral"} size="sm" aria-pressed={active} onClick={() => toggleCategory(category.key)}>
                    {category.label} ({category.count})
                  </Button>
                );
              })}
              {activeCategories.length ? (
                <Button variant="ghost" size="sm" onClick={() => setActiveCategories([])}>
                  Szűrők törlése
                </Button>
              ) : null}
            </section>
          ) : null}

          <div className="grid gap-4 lg:grid-cols-[1.7fr_1fr]">
            <section aria-label="Havi bontás" className="overflow-hidden rounded-[8px] border border-[var(--adm-border-canonical)] bg-[var(--adm-canvas-white)]">
              <div className="flex flex-wrap items-center justify-between gap-3 border-b border-[var(--adm-border-canonical)] px-4 py-3">
                <h2 className="font-serif text-lg font-semibold text-[var(--adm-text-primary)]">{monthLabel(monthKey)}</h2>
                <div className="flex items-center gap-2">
                  <IconButton aria-label="Előző hónap" variant="ghost" disabled={!canPrev} onClick={() => setMonthKey(addMonthsKey(monthKey, -1))}>
                    ←
                  </IconButton>
                  <IconButton aria-label="Következő hónap" variant="ghost" disabled={!canNext} onClick={() => setMonthKey(addMonthsKey(monthKey, 1))}>
                    →
                  </IconButton>
                </div>
              </div>

              <div className="px-4 pt-4">
                <div className="hidden gap-1 text-center lg:grid lg:grid-cols-7" data-testid="portal-calendar-grid">
                  {WEEKDAYS.map((day) => (
                    <div key={day} className="py-1 text-[11px] font-semibold uppercase tracking-wide text-[var(--adm-text-secondary)]">
                      {day}
                    </div>
                  ))}
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
                        aria-label={`${dayLabel(cell.key)}${dayItems.length ? `, ${dayItems.length} esemény` : ""}`}
                        className={`flex min-h-[44px] flex-col items-center justify-center gap-1 p-1 text-left transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--adm-brand-green)] focus-visible:ring-offset-1 ${
                          isSelected ? "bg-[var(--adm-canvas-subtle)] ring-2 ring-inset ring-[var(--adm-brand-green)]" : "hover:bg-[var(--adm-canvas-subtle)]"
                        } ${cell.inMonth ? "" : "opacity-40"}`}
                      >
                        <span
                          className={`inline-flex h-6 w-6 items-center justify-center rounded-full text-xs font-semibold ${
                            isToday ? "bg-[var(--adm-brand-green)] text-[var(--adm-canvas-white)]" : "text-[var(--adm-text-primary)]"
                          }`}
                        >
                          {cell.dayNumber}
                        </span>
                        <span className="flex h-1.5 items-center gap-0.5">
                          {dayItems.slice(0, 3).map((item) => (
                            <span key={item.id} className="h-1.5 w-1.5 rounded-full bg-[var(--adm-brand-deep)]" title={item.title} aria-hidden />
                          ))}
                          {dayItems.length > 3 ? <span className="text-[9px] leading-none text-[var(--adm-text-secondary)]">+{dayItems.length - 3}</span> : null}
                        </span>
                      </button>
                    );
                  })}
                </div>

                <div className="mt-4 flex gap-1 overflow-x-auto pb-1 lg:hidden" data-testid="portal-calendar-day-strip" aria-label="Napválasztó">
                  {monthDays.map((dayKey) => {
                    const dayItems = itemsByDay.get(dayKey) || [];
                    const isToday = dayKey === serverToday;
                    const isSelected = dayKey === selectedDay;
                    return (
                      <button
                        key={dayKey}
                        type="button"
                        onClick={() => setSelectedDay(dayKey)}
                        aria-pressed={isSelected}
                        aria-label={`${dayLabel(dayKey)}${dayItems.length ? `, ${dayItems.length} esemény` : ""}`}
                        className={`flex h-10 w-10 shrink-0 flex-col items-center justify-center gap-0.5 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--adm-brand-green)] ${
                          isToday ? "bg-[var(--adm-brand-green)] text-[var(--adm-canvas-white)]" : "text-[var(--adm-text-primary)] hover:bg-[var(--adm-canvas-subtle)]"
                        } ${isSelected ? "ring-2 ring-inset ring-[var(--adm-brand-green)]" : ""}`}
                      >
                        <span className="text-xs font-semibold leading-none">{dayKey.slice(8)}</span>
                        {dayItems.length ? (
                          <span className={`h-1.5 w-1.5 rounded-full ${isToday ? "bg-[var(--adm-canvas-white)]" : "bg-[var(--adm-brand-deep)]"}`} aria-hidden />
                        ) : null}
                      </button>
                    );
                  })}
                </div>

                <div className="mt-4 border-t border-[var(--adm-border-canonical)]">
                  <div className="pb-2 pt-4">
                    <h3 className="text-sm font-semibold text-[var(--adm-text-primary)]">{dayLabel(selectedDay)}</h3>
                  </div>
                  {selectedItems.length ? (
                    <ul>{selectedItems.map((item) => <CalendarItemRow key={item.id} item={item} today={serverToday} />)}</ul>
                  ) : (
                    <div className="pb-4">
                      <PortalEmptyInline>Erre a napra nincs közzétett határidő.</PortalEmptyInline>
                    </div>
                  )}
                </div>
              </div>
            </section>

            <section aria-label="Következő események" className="overflow-hidden rounded-[8px] border border-[var(--adm-border-canonical)] bg-[var(--adm-canvas-white)]">
              <div className="border-b border-[var(--adm-border-canonical)] px-4 py-3">
                <h2 className="font-serif text-lg font-semibold text-[var(--adm-text-primary)]">Következő események</h2>
                <p className="mt-0.5 text-xs text-[var(--adm-text-secondary)]">A mai naptól számított közzétett határidők.</p>
              </div>
              {nextEvents.length ? (
                <ul>{nextEvents.map((item) => <CalendarItemRow key={item.id} item={item} today={serverToday} />)}</ul>
              ) : (
                <div className="px-4 py-4">
                  <PortalEmptyInline>Jelenleg nincs közzétett közelgő határidő.</PortalEmptyInline>
                </div>
              )}
            </section>
          </div>
        </>
      ) : null}
    </div>
  );
}
