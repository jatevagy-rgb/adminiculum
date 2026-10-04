"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { SafePanelError } from "@/components/ui";
import { getPortalDocument, portalDownloadUrl, type PortalDocument } from "@/lib/clientPortalApi";
import { ApiError } from "@/lib/api";
import { PortalEmptyInline } from "../shared/PortalEmptyInline";

function formatDate(value: string | null | undefined): string | null {
  if (!value) return null;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  return new Intl.DateTimeFormat("hu-HU", { year: "numeric", month: "2-digit", day: "2-digit" }).format(date);
}

function formatBytes(size: number | null | undefined): string | null {
  if (size === null || size === undefined) return null;
  if (size < 1024) return `${size} B`;
  if (size < 1024 * 1024) return `${Math.round(size / 1024)} KB`;
  return `${Math.round(size / (1024 * 1024))} MB`;
}

/**
 * Client Portal 3.0 document detail — the ORGANIZATION body of
 * /portal/documents/:publicationId. The publication id in the URL IS the
 * canonical document publication identity; the exact published
 * ClientDocumentPublication → DocumentVersion relation is shown and
 * downloaded — never the internal "latest" version.
 */
export function PortalDocumentDetailV3({ publicationId }: { publicationId?: string }) {
  const [document, setDocument] = useState<PortalDocument | null>(null);
  const [loading, setLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);
  const [error, setError] = useState(false);
  const [reloadNonce, setReloadNonce] = useState(0);

  const load = useCallback(() => {
    if (!publicationId) {
      setLoading(false);
      setNotFound(true);
      return;
    }
    setLoading(true);
    setNotFound(false);
    setError(false);
    getPortalDocument(publicationId)
      .then((result) => setDocument(result))
      .catch((failure) => {
        // 401/403/404 share one fail-closed customer copy: the portal never
        // reveals whether a hidden resource exists.
        if (failure instanceof ApiError && [401, 403, 404].includes(failure.status)) setNotFound(true);
        else setError(true);
      })
      .finally(() => setLoading(false));
  }, [publicationId]);

  useEffect(() => {
    load();
  }, [load, reloadNonce]);

  const published = formatDate(document?.publishedAt);
  const sizeLabel = formatBytes(document?.size);

  return (
    <div className="space-y-4" data-testid="portal-document-detail-v3">
      <div>
        <Link href="/portal/dokumentumok" className="text-sm font-medium text-[var(--adm-text-secondary)] hover:text-[var(--adm-text-primary)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--adm-brand-green)] focus-visible:ring-offset-2">
          ← Vissza a dokumentumokhoz
        </Link>
      </div>

      {loading ? (
        <div aria-label="Dokumentum betöltése" data-testid="portal-document-detail-loading" className="h-40 animate-pulse rounded-[8px] border border-[var(--adm-border-canonical)] bg-[var(--adm-canvas-white)]" />
      ) : null}

      {!loading && (notFound || error) ? (
        <div className="rounded-[8px] border border-[var(--adm-border-canonical)] bg-[var(--adm-canvas-white)] p-4">
          {error ? (
            <SafePanelError detail="A dokumentum jelenleg nem tölthető be. Próbálja újra." onRetry={() => setReloadNonce((value) => value + 1)} />
          ) : (
            <PortalEmptyInline>Ez a dokumentum nem érhető el ezen az ügyfélfelületen.</PortalEmptyInline>
          )}
        </div>
      ) : null}

      {!loading && !error && !notFound && document ? (
        <section className="rounded-[8px] border border-[var(--adm-border-canonical)] bg-[var(--adm-canvas-white)] px-4 py-5 sm:px-5">
          <h1 className="break-words font-serif text-2xl font-semibold tracking-tight text-[var(--adm-text-primary)] sm:text-3xl">{document.title}</h1>
          <dl className="mt-4 grid gap-3 text-sm sm:grid-cols-2">
            {document.matterTitle ? (
              <div>
                <dt className="text-xs font-semibold uppercase tracking-[0.08em] text-[var(--adm-text-secondary)]">Ügy</dt>
                <dd className="mt-1 text-[var(--adm-text-primary)]">{document.matterTitle}</dd>
              </div>
            ) : null}
            <div>
              <dt className="text-xs font-semibold uppercase tracking-[0.08em] text-[var(--adm-text-secondary)]">Változat</dt>
              <dd className="mt-1 text-[var(--adm-text-primary)]" data-testid="portal-document-version-label">{document.versionLabel}</dd>
            </div>
            <div>
              <dt className="text-xs font-semibold uppercase tracking-[0.08em] text-[var(--adm-text-secondary)]">Közzétéve</dt>
              <dd className="mt-1 text-[var(--adm-text-primary)]">{published || "—"}</dd>
            </div>
            {sizeLabel ? (
              <div>
                <dt className="text-xs font-semibold uppercase tracking-[0.08em] text-[var(--adm-text-secondary)]">Méret</dt>
                <dd className="mt-1 text-[var(--adm-text-primary)]">{sizeLabel}</dd>
              </div>
            ) : null}
          </dl>
          {document.stateLabel ? <p className="mt-3 text-xs font-semibold text-[var(--adm-text-secondary)]">{document.stateLabel}</p> : null}
          {document.explanation ? <p className="mt-4 break-words text-sm leading-6 text-[var(--adm-text-primary)]">{document.explanation}</p> : null}
          <div className="mt-5 flex flex-wrap gap-2">
            {document.downloadAvailable ? (
              <a
                href={portalDownloadUrl(document.id)}
                data-testid="portal-document-download-cta"
                className="inline-flex h-10 items-center justify-center rounded-[8px] border border-[var(--adm-brand-green)] bg-[var(--adm-brand-green)] px-4 text-sm font-medium text-[var(--adm-canvas-white)] transition-colors hover:border-[var(--adm-brand-deep)] hover:bg-[var(--adm-brand-deep)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--adm-brand-green)] focus-visible:ring-offset-2 motion-reduce:transition-none"
              >
                Letöltés
              </a>
            ) : null}
          </div>
        </section>
      ) : null}
    </div>
  );
}
