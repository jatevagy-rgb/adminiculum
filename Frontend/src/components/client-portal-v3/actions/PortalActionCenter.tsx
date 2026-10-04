"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { Button, SafePanelError } from "@/components/ui";
import { getPortalActionCenter, type PortalActionCenter, type PortalActionItem } from "@/lib/clientPortalApi";
import { PortalActionRow } from "./PortalActionRow";
import { PortalEmptyInline } from "../shared/PortalEmptyInline";

type FilterKey = "ALL" | "DEADLINE" | "LEGAL" | "COMPLIANCE" | "DATA";

const FILTER_LABELS: Record<FilterKey, string> = {
  ALL: "Minden",
  DEADLINE: "Határidős",
  LEGAL: "Ügyek",
  COMPLIANCE: "Megfelelés",
  DATA: "Adatkérés",
};

const DATA_KINDS = new Set(["UPLOAD", "FORM", "ANSWER", "CORRECTION", "INTAKE_MORE_INFO"]);

function matchesFilter(item: PortalActionItem, filter: FilterKey): boolean {
  switch (filter) {
    case "ALL":
      return true;
    case "DEADLINE":
      return item.dueAt !== null;
    case "LEGAL":
      return item.domain === "LEGAL";
    case "COMPLIANCE":
      return item.domain === "COMPLIANCE";
    case "DATA":
      return DATA_KINDS.has(item.kind);
    default:
      return true;
  }
}

/**
 * Client Portal 3.0 unified Action Center — the /portal/teendoim ORGANIZATION
 * body. Active customer work only: the backend read model already excludes
 * submitted/under-review/terminal items, so no "completed" group exists here.
 * Filtering is presentation-only and never changes source selection.
 */
export function PortalActionCenter() {
  const [data, setData] = useState<PortalActionCenter | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [filter, setFilter] = useState<FilterKey>("ALL");
  const [reloadNonce, setReloadNonce] = useState(0);

  const load = useCallback(() => {
    setLoading(true);
    setError(null);
    getPortalActionCenter()
      .then((result) => setData(result))
      .catch((failure) => setError(failure instanceof Error ? failure.message : String(failure)))
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    load();
  }, [load, reloadNonce]);

  const items = useMemo(() => (data?.items ?? []).filter((item) => matchesFilter(item, filter)), [data, filter]);

  const availableFilters = useMemo<FilterKey[]>(() => {
    const all = data?.items ?? [];
    const filters: FilterKey[] = ["ALL"];
    if (all.some((item) => item.dueAt !== null)) filters.push("DEADLINE");
    if (all.some((item) => item.domain === "LEGAL")) filters.push("LEGAL");
    if (all.some((item) => item.domain === "COMPLIANCE")) filters.push("COMPLIANCE");
    if (all.some((item) => DATA_KINDS.has(item.kind))) filters.push("DATA");
    return filters;
  }, [data]);

  return (
    <div className="space-y-4" data-testid="portal-action-center">
      <div>
        <h1 className="font-serif text-2xl font-semibold tracking-tight text-[var(--adm-text-primary)] sm:text-3xl">Teendők</h1>
        {data && data.counts.open > 0 ? (
          <p className="mt-1 text-sm text-[var(--adm-text-secondary)]">
            {data.counts.overdue > 0 ? `${data.counts.overdue} lejárt, ` : ""}
            {data.counts.dueSoon > 0 ? `${data.counts.dueSoon} hamarosan esedékes, ` : ""}
            összesen {data.counts.open} nyitott teendő
          </p>
        ) : null}
      </div>

      {loading ? (
        <div aria-label="Teendők betöltése" data-testid="portal-action-center-loading" className="space-y-2 rounded-[8px] border border-[var(--adm-border-canonical)] bg-[var(--adm-canvas-white)] p-4">
          {[0, 1, 2].map((row) => (
            <div key={row} className="flex animate-pulse items-center justify-between gap-4 py-3">
              <div className="w-full max-w-sm space-y-2">
                <div className="h-3.5 w-2/3 rounded bg-[var(--adm-canvas-subtle)]" />
                <div className="h-3 w-1/3 rounded bg-[var(--adm-canvas-subtle)]" />
              </div>
              <div className="h-10 w-32 shrink-0 rounded-[8px] bg-[var(--adm-canvas-subtle)]" />
            </div>
          ))}
        </div>
      ) : null}

      {!loading && error ? (
        <SafePanelError
          detail="A teendők jelenleg nem tölthetők be. Próbálja újra."
          onRetry={() => setReloadNonce((value) => value + 1)}
        />
      ) : null}

      {!loading && !error && data && data.items.length === 0 ? (
        <PortalEmptyInline>Jelenleg nincs teendője.</PortalEmptyInline>
      ) : null}

      {!loading && !error && data && data.items.length > 0 ? (
        <>
          <div className="flex flex-wrap gap-2" data-testid="portal-action-center-filters">
            {availableFilters.map((key) => (
              <Button
                key={key}
                variant={filter === key ? "secondary" : "neutral"}
                size="sm"
                onClick={() => setFilter(key)}
                aria-pressed={filter === key}
              >
                {FILTER_LABELS[key]}
              </Button>
            ))}
          </div>
          {items.length ? (
            <ul data-testid="portal-action-center-list" className="overflow-hidden rounded-[8px] border border-[var(--adm-border-canonical)] bg-[var(--adm-canvas-white)]">
              {items.map((item) => (
                <PortalActionRow key={item.id} item={item} />
              ))}
            </ul>
          ) : (
            <PortalEmptyInline>Ebben a nézetben nincs teendő.</PortalEmptyInline>
          )}
        </>
      ) : null}
    </div>
  );
}
