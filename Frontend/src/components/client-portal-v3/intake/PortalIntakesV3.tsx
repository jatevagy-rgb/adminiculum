"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import { SafePanelError } from "@/components/ui";
import { listOwnIntakes, type CustomerIntake } from "@/lib/clientIntakeApi";
import { PortalEmptyInline } from "../shared/PortalEmptyInline";
import { formatIntakeDate, PortalIntakeStatusBadge } from "./PortalIntakeSections";

type IntakeFilter = "ALL" | "ACTION_REQUIRED" | "LINKED" | "DRAFT";

const FILTER_LABELS: Record<IntakeFilter, string> = {
  ALL: "Minden",
  ACTION_REQUIRED: "Válaszát várjuk",
  LINKED: "Ügy elérhető",
  DRAFT: "Piszkozatok",
};

const PAGE_SIZE = 20;

function PlusIcon() {
  return (
    <svg aria-hidden="true" width="16" height="16" viewBox="0 0 16 16" fill="currentColor">
      <path d="M8 3.25a.75.75 0 0 1 .75.75v3.25H12a.75.75 0 0 1 0 1.5H8.75V12a.75.75 0 0 1-1.5 0V8.75H4a.75.75 0 0 1 0-1.5h3.25V4A.75.75 0 0 1 8 3.25Z" />
    </svg>
  );
}

/**
 * Client Portal 3.0 intake list — the /portal/megkeresesek ORGANIZATION body.
 * Displays customer-initiated inquiries, allows filtering by actionability and
 * linkage, and provides access to new intake creation.
 */
export function PortalIntakesV3() {
  const [items, setItems] = useState<CustomerIntake[]>([]);
  const [total, setTotal] = useState(0);
  const [offset, setOffset] = useState(0);
  const [filter, setFilter] = useState<IntakeFilter>("ALL");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [reloadNonce, setReloadNonce] = useState(0);

  const load = useCallback(async () => {
    setLoading(true);
    setError(false);
    try {
      const page = await listOwnIntakes(PAGE_SIZE, offset);
      setItems(page.items || []);
      setTotal(page.total || 0);
    } catch {
      setError(true);
    } finally {
      setLoading(false);
    }
  }, [offset]);

  useEffect(() => {
    void load();
  }, [load, reloadNonce]);

  const filteredItems = useMemo(() => {
    return items.filter((item) => {
      const code = (item.status?.code || "").toLowerCase();
      if (filter === "ACTION_REQUIRED") {
        return code === "more-information-required" || code === "more_information_required";
      }
      if (filter === "LINKED") {
        return (
          code === "linked" ||
          code === "converted" ||
          code === "linked-to-existing-case" ||
          code === "converted-to-case" ||
          Boolean(item.linkedMatterPublicationId) ||
          Boolean(item.linkedPublicCaseReference)
        );
      }
      if (filter === "DRAFT") {
        return code === "draft";
      }
      return true;
    });
  }, [items, filter]);

  return (
    <div className="space-y-5" data-testid="portal-intakes-v3">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="font-serif text-2xl font-semibold tracking-tight text-[var(--adm-text-primary)] sm:text-3xl">
            Megkeresések
          </h1>
          <p className="mt-1 text-sm text-[var(--adm-text-secondary)]">
            Az iroda felé indított megkeresések és azok aktuális állapota.
          </p>
        </div>

        <Link
          href="/portal/megkeresesek/uj"
          data-testid="portal-new-intake-cta"
          className="inline-flex h-10 items-center justify-center gap-2 rounded-[8px] border border-[var(--adm-brand-green)] bg-[var(--adm-brand-green)] px-4 text-sm font-medium text-[var(--adm-canvas-white)] transition-colors hover:border-[var(--adm-brand-deep)] hover:bg-[var(--adm-brand-deep)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--adm-brand-green)] focus-visible:ring-offset-2 motion-reduce:transition-none"
        >
          <PlusIcon />
          <span>Új megkeresés</span>
        </Link>
      </div>

      <div className="flex flex-wrap items-center gap-2" data-testid="portal-intakes-filters">
        {(Object.keys(FILTER_LABELS) as IntakeFilter[]).map((key) => {
          const isActive = filter === key;
          return (
            <button
              key={key}
              type="button"
              onClick={() => setFilter(key)}
              aria-pressed={isActive}
              className={`inline-flex h-8 items-center justify-center rounded-[8px] px-3 text-xs font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--adm-brand-green)] focus-visible:ring-offset-2 ${
                isActive
                  ? "border border-[var(--adm-border-canonical)] bg-[var(--adm-canvas-subtle)] text-[var(--adm-text-primary)] font-semibold"
                  : "border border-[var(--adm-border-canonical)] bg-[var(--adm-canvas-white)] text-[var(--adm-text-secondary)] hover:bg-[var(--adm-canvas-subtle)] hover:text-[var(--adm-text-primary)]"
              }`}
            >
              {FILTER_LABELS[key]}
            </button>
          );
        })}
      </div>

      {loading ? (
        <div aria-label="Megkeresések betöltése" data-testid="portal-intakes-loading" className="space-y-3">
          {[0, 1, 2].map((row) => (
            <div
              key={row}
              className="h-24 animate-pulse rounded-[8px] border border-[var(--adm-border-canonical)] bg-[var(--adm-canvas-white)]"
            />
          ))}
        </div>
      ) : null}

      {!loading && error ? (
        <SafePanelError
          detail="A megkeresések jelenleg nem tölthetők be. Próbálja újra."
          onRetry={() => setReloadNonce((value) => value + 1)}
        />
      ) : null}

      {!loading && !error && items.length === 0 ? (
        <section
          data-testid="portal-intakes-empty"
          className="rounded-[8px] border border-[var(--adm-border-canonical)] bg-[var(--adm-canvas-white)] p-6 text-center"
        >
          <PortalEmptyInline>Még nincs megkeresése. Indítson új megkeresést az „Új megkeresés” gombbal.</PortalEmptyInline>
        </section>
      ) : null}

      {!loading && !error && items.length > 0 && filteredItems.length === 0 ? (
        <section
          data-testid="portal-intakes-filter-empty"
          className="rounded-[8px] border border-[var(--adm-border-canonical)] bg-[var(--adm-canvas-white)] p-6 text-center"
        >
          <PortalEmptyInline>A kiválasztott szűrőhöz nem található megkeresés.</PortalEmptyInline>
        </section>
      ) : null}

      {!loading && !error && filteredItems.length > 0 ? (
        <ul className="space-y-3" data-testid="portal-intakes-list">
          {filteredItems.map((intake) => {
            const isActionRequired =
              (intake.status?.code || "").toLowerCase() === "more-information-required" ||
              (intake.status?.code || "").toLowerCase() === "more_information_required";
            const updatedDate = formatIntakeDate(intake.updatedAt || intake.submittedAt);

            return (
              <li
                key={intake.reference}
                data-testid="portal-intake-row"
                className="group rounded-[8px] border border-[var(--adm-border-canonical)] bg-[var(--adm-canvas-white)] p-5 transition-colors hover:border-[var(--adm-brand-green)]/60"
              >
                <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                  <div className="min-w-0">
                    <Link
                      href={`/portal/megkeresesek/${encodeURIComponent(intake.reference)}`}
                      className="block font-medium text-[var(--adm-text-primary)] hover:text-[var(--adm-brand-green)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--adm-brand-green)] focus-visible:ring-offset-2"
                    >
                      <h2 className="break-words text-base font-semibold">{intake.subject}</h2>
                    </Link>
                    <p className="mt-1 text-xs text-[var(--adm-text-secondary)]">
                      {intake.organizationGroupName ? `${intake.organizationGroupName} · ` : ""}
                      {updatedDate ? `Frissítve: ${updatedDate}` : "Piszkozat"}
                    </p>
                  </div>

                  <div className="flex flex-wrap items-center gap-2 sm:flex-col sm:items-end">
                    <PortalIntakeStatusBadge status={intake.status} />
                    {isActionRequired ? (
                      <span className="text-xs font-semibold text-[var(--adm-brand-terracotta)]">
                        Válaszát várjuk
                      </span>
                    ) : null}
                    {intake.linkedMatterPublicationId ? (
                      <Link
                        href={`/portal/matters/${encodeURIComponent(intake.linkedMatterPublicationId)}`}
                        className="text-xs font-medium text-[var(--adm-brand-green)] hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--adm-brand-green)]"
                      >
                        Ügy megnyitása →
                      </Link>
                    ) : null}
                  </div>
                </div>
              </li>
            );
          })}
        </ul>
      ) : null}

      {!loading && !error && total > PAGE_SIZE ? (
        <div className="flex items-center justify-between border-t border-[var(--adm-border-canonical)] pt-4 text-sm text-[var(--adm-text-secondary)]">
          <button
            type="button"
            disabled={offset === 0}
            onClick={() => setOffset(Math.max(0, offset - PAGE_SIZE))}
            className="inline-flex h-10 items-center justify-center rounded-[8px] border border-[var(--adm-border-canonical)] bg-[var(--adm-canvas-white)] px-4 text-sm font-medium text-[var(--adm-text-primary)] hover:bg-[var(--adm-canvas-subtle)] disabled:opacity-40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--adm-brand-green)]"
          >
            Előző
          </button>
          <span>
            {offset + 1}–{Math.min(offset + PAGE_SIZE, total)} / {total}
          </span>
          <button
            type="button"
            disabled={offset + PAGE_SIZE >= total}
            onClick={() => setOffset(offset + PAGE_SIZE)}
            className="inline-flex h-10 items-center justify-center rounded-[8px] border border-[var(--adm-border-canonical)] bg-[var(--adm-canvas-white)] px-4 text-sm font-medium text-[var(--adm-text-primary)] hover:bg-[var(--adm-canvas-subtle)] disabled:opacity-40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--adm-brand-green)]"
          >
            Következő
          </button>
        </div>
      ) : null}
    </div>
  );
}
