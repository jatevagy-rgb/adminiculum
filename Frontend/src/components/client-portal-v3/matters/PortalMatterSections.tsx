import Link from "next/link";
import type { PortalDocument, PortalSafeUpdate } from "@/lib/clientPortalApi";
import { PortalEmptyInline } from "../shared/PortalEmptyInline";

function formatDate(value: string | null | undefined): string | null {
  if (!value) return null;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  return new Intl.DateTimeFormat("hu-HU", { year: "numeric", month: "2-digit", day: "2-digit" }).format(date);
}

/**
 * Exact published matter documents from the canonical matter snapshot. Open
 * document requests never appear here — they live in the request journey.
 */
export function PortalMatterDocumentsSection({ documents }: { documents: PortalDocument[] }) {
  return (
    <section data-testid="portal-matter-documents" className="rounded-[8px] border border-[var(--adm-border-canonical)] bg-[var(--adm-canvas-white)]">
      <h2 className="border-b border-[var(--adm-border-canonical)] px-4 py-3 font-serif text-lg font-semibold text-[var(--adm-text-primary)]">Dokumentumok</h2>
      {documents.length ? (
        <ul>
          {documents.map((document) => {
            const published = formatDate(document.publishedAt);
            return (
              <li key={document.id} className="border-b border-[var(--adm-border-canonical)] px-4 py-3 last:border-b-0">
                <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between sm:gap-4">
                  <div className="min-w-0">
                    <p className="truncate text-sm font-medium text-[var(--adm-text-primary)]">{document.title}</p>
                    <p className="mt-0.5 text-xs text-[var(--adm-text-secondary)]">
                      {document.versionLabel ? `Változat: ${document.versionLabel}` : ""}
                      {document.versionLabel && published ? " · " : ""}
                      {published ? `Közzétéve: ${published}` : ""}
                      {document.stateLabel ? ` · ${document.stateLabel}` : ""}
                    </p>
                  </div>
                  <Link
                    href={`/portal/documents/${encodeURIComponent(document.id)}`}
                    data-testid="portal-matter-document-cta"
                    className="inline-flex h-10 shrink-0 items-center justify-center rounded-[8px] border border-[var(--adm-brand-green)] px-4 text-sm font-medium text-[var(--adm-brand-green)] transition-colors hover:bg-[var(--adm-brand-green)] hover:text-[var(--adm-canvas-white)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--adm-brand-green)] focus-visible:ring-offset-2 motion-reduce:transition-none"
                  >
                    Megnyitás
                  </Link>
                </div>
              </li>
            );
          })}
        </ul>
      ) : (
        <div className="px-4 py-3">
          <PortalEmptyInline>Még nincs Önnel megosztott dokumentum ebben az ügyben.</PortalEmptyInline>
        </div>
      )}
    </section>
  );
}

/**
 * Customer-safe published updates from the canonical matter snapshot, rendered
 * in the backend-provided order. No internal audit/workflow activity is
 * invented here.
 */
export function PortalMatterUpdatesSection({ updates }: { updates: PortalSafeUpdate[] }) {
  return (
    <section data-testid="portal-matter-updates" className="rounded-[8px] border border-[var(--adm-border-canonical)] bg-[var(--adm-canvas-white)]">
      <h2 className="border-b border-[var(--adm-border-canonical)] px-4 py-3 font-serif text-lg font-semibold text-[var(--adm-text-primary)]">Közzétett frissítések</h2>
      {updates.length ? (
        <ul>
          {updates.map((update) => (
            <li key={update.id} className="border-b border-[var(--adm-border-canonical)] px-4 py-3 last:border-b-0">
              <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
                <p className="text-sm font-medium text-[var(--adm-text-primary)]">{update.title}</p>
                <p className="text-xs text-[var(--adm-text-secondary)]">{formatDate(update.publishedAt)}</p>
              </div>
              {update.body ? <p className="mt-1 text-sm text-[var(--adm-text-primary)]">{update.body}</p> : null}
            </li>
          ))}
        </ul>
      ) : (
        <div className="px-4 py-3">
          <PortalEmptyInline>Még nincs közzétett frissítés ehhez az ügyhöz.</PortalEmptyInline>
        </div>
      )}
    </section>
  );
}
