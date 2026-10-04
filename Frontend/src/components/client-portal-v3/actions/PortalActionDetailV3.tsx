"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { ApiError } from "@/lib/api";
import { SafePanelError } from "@/components/ui";
import {
  getPortalActionRequest,
  type PortalActionRequest,
} from "@/lib/clientPortalApi";

/**
 * Client Portal 3.0 action detail — the /portal/action-requests/:requestId
 * ORGANIZATION body. Consumes the canonical customer-safe action-request
 * projection (GET /client-portal/action-requests/:id). Display-only surface:
 * the DTO carries no canonical destination or inline-completion capability,
 * so no navigation or completion action is fabricated. Nested matter
 * request/upload journeys remain the F6 surface.
 */

function formatDate(value?: string | null) {
  if (!value) return null;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  return new Intl.DateTimeFormat("hu-HU", { year: "numeric", month: "long", day: "numeric" }).format(date);
}

const CARD =
  "min-w-0 rounded-[8px] border border-[var(--adm-border-canonical)] bg-[var(--adm-canvas-white)] p-4 sm:p-5";
const EYEBROW = "text-[11px] font-bold uppercase tracking-[0.14em] text-[var(--adm-text-secondary)]";
const MUTED = "text-[var(--adm-text-secondary)]";

export function PortalActionDetailV3({ requestId }: { requestId: string }) {
  const [action, setAction] = useState<PortalActionRequest | null>(null);
  const [loading, setLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [reloadNonce, setReloadNonce] = useState(0);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    setNotFound(false);
    try {
      const result = await getPortalActionRequest(requestId);
      setAction(result);
    } catch (err) {
      setAction(null);
      if (err instanceof ApiError && (err.status === 404 || err.status === 403)) {
        setNotFound(true);
      } else {
        setError("A teendő jelenleg nem tölthető be. Próbálja újra később.");
      }
    } finally {
      setLoading(false);
    }
  }, [requestId]);

  useEffect(() => {
    void load();
  }, [load, reloadNonce]);

  if (loading) {
    return (
      <div aria-label="Teendő betöltése" data-testid="portal-action-detail-loading" className="space-y-3">
        <div className="h-6 w-48 animate-pulse rounded-[8px] bg-[var(--adm-canvas-subtle)]" />
        <div className="h-40 animate-pulse rounded-[8px] border border-[var(--adm-border-canonical)] bg-[var(--adm-canvas-white)]" />
      </div>
    );
  }

  if (notFound) {
    return (
      <div data-testid="portal-action-detail-v3">
        <section className={CARD} data-testid="portal-action-detail-not-found">
          <Link
            href="/portal/teendoim"
            className="inline-flex text-sm text-[var(--adm-text-secondary)] hover:text-[var(--adm-text-primary)] hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--adm-brand-green)]"
          >
            ← Vissza a teendőkhöz
          </Link>
          <h1 className="mt-2 font-serif text-2xl font-semibold tracking-tight text-[var(--adm-text-primary)]">
            A teendő nem található
          </h1>
          <p className={`mt-2 text-sm leading-6 ${MUTED}`}>
            A keresett teendő nem található vagy már nem elérhető az Ön számára. Előfordulhat, hogy lezárult, visszavonták,
            vagy más úton rendezték.
          </p>
        </section>
      </div>
    );
  }

  if (error || !action) {
    return (
      <div data-testid="portal-action-detail-v3">
        <SafePanelError
          detail={error || "A teendő jelenleg nem érhető el."}
          onRetry={() => setReloadNonce((value) => value + 1)}
        />
      </div>
    );
  }

  const dueLabel = formatDate(action.dueAt);

  return (
    <div className="space-y-4" data-testid="portal-action-detail-v3">
      <div>
        <Link
          href="/portal/teendoim"
          className="inline-flex text-sm text-[var(--adm-text-secondary)] hover:text-[var(--adm-text-primary)] hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--adm-brand-green)]"
        >
          ← Vissza a teendőkhöz
        </Link>
      </div>

      <header className={CARD} data-testid="portal-action-detail-header">
        <p className={EYEBROW}>{action.typeLabel}</p>
        <div className="mt-1 flex flex-wrap items-start justify-between gap-3">
          <h1 className="break-words font-serif text-2xl font-semibold tracking-tight text-[var(--adm-text-primary)] sm:text-3xl">
            {action.title}
          </h1>
          <span
            data-testid="portal-action-detail-status"
            className="rounded-[6px] border border-[var(--adm-border-canonical)] bg-[var(--adm-canvas-subtle)] px-2.5 py-0.5 text-xs font-semibold text-[var(--adm-text-primary)]"
          >
            {action.statusLabel}
          </span>
        </div>
        {action.matterTitle ? (
          <p className={`mt-1 text-xs ${MUTED}`} data-testid="portal-action-detail-matter">
            Kapcsolódó ügy: {action.matterTitle}
          </p>
        ) : null}
        {dueLabel ? (
          <p className="mt-2 text-sm font-semibold text-[var(--adm-brand-terracotta)]" data-testid="portal-action-detail-due">
            Határidő: {dueLabel}
          </p>
        ) : null}
      </header>

      <section className={CARD}>
        <p className={EYEBROW}>Mi a teendője?</p>
        <p className="mt-2 whitespace-pre-wrap break-words text-sm leading-6 text-[var(--adm-text-primary)]">
          {action.instructions || "Nincs további közzétett instrukció."}
        </p>
      </section>

      <section
        data-testid="portal-action-detail-note"
        className="rounded-[8px] border border-[var(--adm-border-canonical)] bg-[var(--adm-canvas-subtle)] p-4"
      >
        <p className={`text-sm leading-6 ${MUTED}`}>{action.readOnlyNote}</p>
      </section>
    </div>
  );
}
