"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { fetchApi } from "@/lib/api";
import { CustomerHistoryPolicyEditor } from './CustomerHistoryPolicyEditor';
import { BUSINESS_TIME_ZONE } from '@/lib/businessDateTime';
import { AdminStatusPill } from "@/components/ui";

type HistoryItem = {
  sourceKey: string;
  kind: "AUDIT" | "TIME";
  occurredAt: string;
  title: string;
  detail: string | null;
  authorName: string | null;
  minutes: number | null;
};
type HistoryPage = { items: HistoryItem[]; nextCursor: string | null; totalMinutes: number };

const LEVELS = [
  { name: "Rövid állapot", detail: "Közzétett állapot és az ügyfél teendői." },
  { name: "Mérföldkövek", detail: "Az előző szint és jóváhagyott mérföldkövek, frissítések." },
  { name: "Részletes ügytörténet", detail: "Az előző szint és külön jóváhagyott munkarészletek." },
];

function formatDate(value: string): string {
  return new Intl.DateTimeFormat("hu-HU", { timeZone: BUSINESS_TIME_ZONE, dateStyle: "medium", timeStyle: "short" }).format(new Date(value));
}

/** WF01 host imports this leaf; the backend read route is registered by integration. */
export function CaseHistoryPanel({ caseId, clientId, readOnly = false, onChanged }: {
  caseId: string; clientId: string | null; readOnly?: boolean; onChanged?: () => void;
}) {
  const [items, setItems] = useState<HistoryItem[]>([]);
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const [totalMinutes, setTotalMinutes] = useState(0);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const requestId = useRef(0);

  const load = useCallback(async (cursor: string | null = null) => {
    const currentRequest = ++requestId.current;
    setBusy(true);
    setError(null);
    try {
      const query = cursor ? `?cursor=${encodeURIComponent(cursor)}` : "";
      const page = await fetchApi<HistoryPage>(`/case-history/cases/${encodeURIComponent(caseId)}${query}`);
      if (currentRequest !== requestId.current) return;
      setItems((current) => cursor ? [...current, ...page.items] : page.items);
      setNextCursor(page.nextCursor);
      setTotalMinutes(page.totalMinutes);
    } catch {
      if (currentRequest === requestId.current) setError("Az ügytörténet jelenleg nem tölthető be.");
    } finally {
      if (currentRequest === requestId.current) setBusy(false);
    }
  }, [caseId]);

  useEffect(() => {
    setItems([]);
    setNextCursor(null);
    void load();
    return () => { requestId.current += 1; };
  }, [load, clientId]);

  return (
    <section aria-label="Ügytörténet" className="rounded-xl border border-[var(--adm-border)] bg-white p-4 md:p-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-base font-semibold text-[var(--adm-text)]">Ügytörténet</h2>
          <p className="mt-1 text-sm text-[var(--adm-text-muted)]">Belső időrend · {Math.floor(totalMinutes / 60)} óra {totalMinutes % 60} perc rögzített munkaidő</p>
        </div>
        <AdminStatusPill tone="green">Csak belső nézet</AdminStatusPill>
      </div>

      {error ? <div role="alert" className="mt-4 text-sm text-[var(--adm-terracotta-700)]">{error} <button type="button" className="min-h-10 rounded px-2 underline" onClick={() => void load()} disabled={busy}>Újrapróbálás</button></div> : null}
      {!error && !busy && items.length === 0 ? <p className="mt-5 text-sm text-[var(--adm-text-muted)]">Még nincs megjeleníthető esemény.</p> : null}
      <ol className="mt-5 space-y-3 border-l-2 border-[var(--adm-green-800)] pl-4">
        {items.map((item) => <li key={item.sourceKey} className="rounded-lg border border-[var(--adm-border)] bg-white p-3">
          <div className="flex flex-wrap items-baseline justify-between gap-2">
            <strong className="text-sm text-[var(--adm-text)]">{item.title}</strong>
            <time className="text-xs text-[var(--adm-text-muted)]" dateTime={item.occurredAt}>{formatDate(item.occurredAt)}</time>
          </div>
          {item.detail ? <p className="mt-1 whitespace-pre-wrap text-sm text-[var(--adm-text)]">{item.detail}</p> : null}
          <p className="mt-2 text-xs text-[var(--adm-text-muted)]">{item.authorName || "Rendszer"}{item.minutes !== null ? ` · ${item.minutes} perc` : ""}</p>
        </li>)}
      </ol>
      {nextCursor ? <button type="button" disabled={busy} onClick={() => void load(nextCursor)} className="mt-4 min-h-10 rounded-lg border border-[var(--adm-border)] px-4 text-sm font-medium text-[var(--adm-green-800)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-[var(--adm-green-800)]">További események</button> : null}
      {busy ? <p role="status" className="mt-3 text-sm text-[var(--adm-text-muted)]">Betöltés…</p> : null}

      <details className="mt-4 rounded-lg border border-[var(--adm-border)] bg-[var(--adm-surface)] p-3" aria-label="Ügytörténet megosztása">
        <summary className="min-h-10 cursor-pointer text-sm font-semibold text-[var(--adm-text)]">Ügytörténet megosztása az ügyféllel</summary>
        <CustomerHistoryPolicyEditor key={`${caseId}:policy`} caseId={caseId}/>
        <p className="mt-2 text-sm text-[var(--adm-text-muted)]">Az ügyfélnek látható tartalmat az ügytörténet megosztási szabálya határozza meg. A belső események nem jelennek meg automatikusan.</p>
        <ul className="mt-3 grid gap-2 md:grid-cols-3">{LEVELS.map((level) => <li key={level.name} className="rounded border border-[var(--adm-border)] bg-white p-3"><strong className="text-sm text-[var(--adm-text)]">{level.name}</strong><p className="mt-1 text-xs text-[var(--adm-text-muted)]">{level.detail}</p></li>)}</ul>
        {!readOnly && clientId ? <p className="mt-3 text-xs text-[var(--adm-text-muted)]">A szint, az egyedi elrejtés és az ügyféloldali felelős mentése a tartós jogosultsági szabály bevezetése után lesz elérhető.</p> : null}
      </details>
    </section>
  );
}
