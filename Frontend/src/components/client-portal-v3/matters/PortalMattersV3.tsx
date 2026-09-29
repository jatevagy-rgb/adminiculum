"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import { Button, SafePanelError } from "@/components/ui";
import {
  getPortalOrganizationCases,
  getPortalOrganizationUnits,
  type PortalOrganizationCase,
  type PortalOrganizationUnit,
} from "@/lib/clientPortalApi";
import { PortalEmptyInline } from "../shared/PortalEmptyInline";

type RelationshipFilter = "ALL" | "OWN" | "SHARED";

const RELATIONSHIP_LABELS: Record<RelationshipFilter, string> = {
  ALL: "Minden",
  OWN: "Saját ügyek",
  SHARED: "Megosztott velem",
};

function formatDate(value: string | null): string | null {
  if (!value) return null;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  return new Intl.DateTimeFormat("hu-HU", { year: "numeric", month: "2-digit", day: "2-digit" }).format(date);
}

/**
 * Client Portal 3.0 matters list — the /portal/ugyek ORGANIZATION body.
 * Uses the canonical grant-scoped organization case projection only; filters
 * (relationship, optional unit) are pushed to the backend, never client-side
 * taxonomy invention. Rows link via matterPublicationId, never an internal
 * Case id.
 */
export function PortalMattersV3() {
  const [cases, setCases] = useState<PortalOrganizationCase[]>([]);
  const [units, setUnits] = useState<PortalOrganizationUnit[]>([]);
  const [relationship, setRelationship] = useState<RelationshipFilter>("ALL");
  const [unitId, setUnitId] = useState<string>("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [reloadNonce, setReloadNonce] = useState(0);

  const load = useCallback(async () => {
    setLoading(true);
    setError(false);
    try {
      const [casesPage, unitsPage] = await Promise.all([
        getPortalOrganizationCases({ relationship: relationship === "ALL" ? undefined : relationship, unitId: unitId || undefined, limit: 50 }),
        getPortalOrganizationUnits().catch(() => ({ items: [] as PortalOrganizationUnit[] })),
      ]);
      setCases(casesPage.items || []);
      setUnits(unitsPage.items || []);
    } catch {
      setError(true);
    } finally {
      setLoading(false);
    }
  }, [relationship, unitId]);

  useEffect(() => {
    void load();
  }, [load, reloadNonce]);

  const visibleCases = useMemo(() => cases, [cases]);

  return (
    <div className="space-y-4" data-testid="portal-matters-v3">
      <div>
        <h1 className="font-serif text-2xl font-semibold tracking-tight text-[var(--adm-text-primary)] sm:text-3xl">Ügyek</h1>
        {!loading && !error && visibleCases.length > 0 ? (
          <p className="mt-1 text-sm text-[var(--adm-text-secondary)]">Összesen {visibleCases.length} közzétett ügy</p>
        ) : null}
      </div>

      <div className="flex flex-wrap items-center gap-2" data-testid="portal-matters-filters">
        {(Object.keys(RELATIONSHIP_LABELS) as RelationshipFilter[]).map((key) => (
          <Button key={key} variant={relationship === key ? "secondary" : "neutral"} size="sm" onClick={() => setRelationship(key)} aria-pressed={relationship === key}>
            {RELATIONSHIP_LABELS[key]}
          </Button>
        ))}
        {units.length > 1 ? (
          <select
            aria-label="Szervezeti egység szűrő"
            value={unitId}
            onChange={(event) => setUnitId(event.target.value)}
            className="h-8 rounded-[8px] border border-[var(--adm-border-canonical)] bg-[var(--adm-canvas-white)] px-3 text-sm text-[var(--adm-text-primary)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--adm-brand-green)]"
          >
            <option value="">Minden szervezeti egység</option>
            {units.map((unit) => (
              <option key={unit.id} value={unit.id}>
                {unit.name}
              </option>
            ))}
          </select>
        ) : null}
      </div>

      {loading ? (
        <div aria-label="Ügyek betöltése" data-testid="portal-matters-loading" className="space-y-2 rounded-[8px] border border-[var(--adm-border-canonical)] bg-[var(--adm-canvas-white)] p-4">
          {[0, 1, 2].map((row) => (
            <div key={row} className="flex animate-pulse items-center justify-between gap-4 py-3">
              <div className="w-full max-w-md space-y-2">
                <div className="h-3.5 w-2/3 rounded bg-[var(--adm-canvas-subtle)]" />
                <div className="h-3 w-1/3 rounded bg-[var(--adm-canvas-subtle)]" />
              </div>
              <div className="h-10 w-24 shrink-0 rounded-[8px] bg-[var(--adm-canvas-subtle)]" />
            </div>
          ))}
        </div>
      ) : null}

      {!loading && error ? (
        <SafePanelError detail="Az ügyek jelenleg nem tölthetők be. Próbálja újra." onRetry={() => setReloadNonce((value) => value + 1)} />
      ) : null}

      {!loading && !error && visibleCases.length === 0 ? (
        <PortalEmptyInline>Jelenleg nincs közzétett ügye.</PortalEmptyInline>
      ) : null}

      {!loading && !error && visibleCases.length > 0 ? (
        <ul data-testid="portal-matters-list" className="overflow-hidden rounded-[8px] border border-[var(--adm-border-canonical)] bg-[var(--adm-canvas-white)]">
          {visibleCases.map((matter) => {
            const targetDate = formatDate(matter.publicTargetDate);
            const relationshipLabel = matter.relationshipToCase === "SHARED" ? "Megosztott velem" : "Saját ügy";
            return (
              <li key={matter.matterPublicationId} data-testid="portal-matter-row" className="border-b border-[var(--adm-border-canonical)] last:border-b-0">
                <Link
                  href={`/portal/matters/${encodeURIComponent(matter.matterPublicationId)}`}
                  className="flex flex-col gap-3 px-4 py-4 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-[var(--adm-brand-green)] sm:flex-row sm:items-center sm:justify-between sm:gap-4"
                >
                  <div className="min-w-0">
                    <p className="truncate text-sm font-semibold text-[var(--adm-text-primary)]">{matter.publicTitle}</p>
                    <p className="mt-1 text-xs text-[var(--adm-text-secondary)]">
                      {matter.publicReference} · {matter.publicStatus}
                      {matter.waitingOn ? ` · ${matter.waitingOn}` : ""}
                      {targetDate ? ` · Határidő: ${targetDate}` : ""}
                    </p>
                    <p className="mt-1 text-xs text-[var(--adm-text-secondary)]">
                      {matter.organizationUnitName ? `${matter.organizationUnitName} · ` : ""}
                      {relationshipLabel}
                      {matter.customerActionRequired ? (
                        <span className="ml-2 font-semibold text-[var(--adm-brand-terracotta)]">Ügyfél válasza szükséges</span>
                      ) : null}
                    </p>
                  </div>
                  <span className="inline-flex h-10 shrink-0 items-center justify-center rounded-[8px] border border-[var(--adm-brand-green)] px-4 text-sm font-medium text-[var(--adm-brand-green)]">
                    Megnyitás
                  </span>
                </Link>
              </li>
            );
          })}
        </ul>
      ) : null}
    </div>
  );
}
