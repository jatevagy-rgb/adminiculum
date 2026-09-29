"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { SafePanelError } from "@/components/ui";
import {
  getPortalOrganizationDocuments,
  portalDownloadUrl,
  type OrgDocumentLibraryDto,
  type OrgDocumentLibrarySubmissionStatus,
} from "@/lib/clientPortalApi";
import { PortalEmptyInline } from "../shared/PortalEmptyInline";

function formatDate(value: string | null): string | null {
  if (!value) return null;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  return new Intl.DateTimeFormat("hu-HU", { year: "numeric", month: "2-digit", day: "2-digit" }).format(date);
}

const SUBMISSION_STATUS_LABELS: Record<OrgDocumentLibrarySubmissionStatus, string> = {
  SUBMITTED: "Beküldve",
  CORRECTION_REQUESTED: "Javítás szükséges",
  ACCEPTED_INTO_MATTER: "Átvette az iroda az ügybe",
  REJECTED: "Nem fogadható el",
};

function submissionStatusClass(status: OrgDocumentLibrarySubmissionStatus): string {
  if (status === "CORRECTION_REQUESTED") return "text-[var(--adm-brand-terracotta)]";
  if (status === "REJECTED") return "text-[var(--adm-brand-terracotta)]";
  if (status === "ACCEPTED_INTO_MATTER") return "text-[var(--adm-brand-green)]";
  return "text-[var(--adm-text-secondary)]";
}

function SectionPanel({ title, count, children, testid }: { title: string; count: number; children: React.ReactNode; testid?: string }) {
  return (
    <section data-testid={testid} className="rounded-[8px] border border-[var(--adm-border-canonical)] bg-[var(--adm-canvas-white)]">
      <div className="flex flex-wrap items-baseline justify-between gap-2 border-b border-[var(--adm-border-canonical)] px-4 py-3">
        <h2 className="font-serif text-lg font-semibold text-[var(--adm-text-primary)]">{title}</h2>
        {count > 0 ? <span className="text-xs text-[var(--adm-text-secondary)]">{count} tétel</span> : null}
      </div>
      {children}
    </section>
  );
}

/**
 * Client Portal 3.0 document library — the /portal/dokumentumok ORGANIZATION
 * body. Two semantically distinct segments: "Irodától" (documents explicitly
 * published by the office) and "Saját beküldések" (the customer's own
 * submission history). Open requests never appear here — they belong to the
 * Action Center.
 */
export function PortalDocumentLibraryV3() {
  const [data, setData] = useState<OrgDocumentLibraryDto | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [reloadNonce, setReloadNonce] = useState(0);

  const load = useCallback(() => {
    setLoading(true);
    setError(false);
    getPortalOrganizationDocuments()
      .then((result) => setData(result))
      .catch(() => setError(true))
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    load();
  }, [load, reloadNonce]);

  return (
    <div className="space-y-5" data-testid="portal-document-library-v3">
      <div>
        <h1 className="font-serif text-2xl font-semibold tracking-tight text-[var(--adm-text-primary)] sm:text-3xl">Dokumentumok</h1>
        <p className="mt-1 text-sm text-[var(--adm-text-secondary)]">Az iroda által közzétett dokumentumok és az Ön saját beküldései.</p>
      </div>

      {loading ? (
        <div aria-label="Dokumentumok betöltése" data-testid="portal-document-library-loading" className="space-y-3">
          {[0, 1].map((row) => (
            <div key={row} className="h-28 animate-pulse rounded-[8px] border border-[var(--adm-border-canonical)] bg-[var(--adm-canvas-white)]" />
          ))}
        </div>
      ) : null}

      {!loading && error ? (
        <SafePanelError detail="A dokumentumok jelenleg nem tölthetők be. Próbálja újra." onRetry={() => setReloadNonce((value) => value + 1)} />
      ) : null}

      {!loading && !error && data ? (
        <>
          <SectionPanel title="Irodától" count={data.published.length} testid="portal-document-library-published">
            {data.published.length ? (
              <ul>
                {data.published.map((document) => {
                  const published = formatDate(document.publishedAt);
                  return (
                    <li key={document.publicationId} data-testid="portal-published-document-row" className="border-b border-[var(--adm-border-canonical)] px-4 py-3 last:border-b-0">
                      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between sm:gap-4">
                        <div className="min-w-0">
                          <p className="truncate text-sm font-medium text-[var(--adm-text-primary)]">{document.title}</p>
                          <p className="mt-0.5 text-xs text-[var(--adm-text-secondary)]">
                            {document.matterTitle ? `${document.matterTitle} · ` : ""}
                            {document.versionLabel ? `Változat: ${document.versionLabel}` : ""}
                            {document.versionLabel && published ? " · " : ""}
                            {published ? `Közzétéve: ${published}` : ""}
                          </p>
                          {document.tags.length ? (
                            <p className="mt-1.5 flex flex-wrap gap-1.5">
                              {document.tags.map((tag) => (
                                <span key={tag} className="border border-[var(--adm-border-canonical)] px-1.5 py-0.5 text-[11px] text-[var(--adm-text-secondary)]">{tag}</span>
                              ))}
                            </p>
                          ) : null}
                        </div>
                        <div className="flex shrink-0 items-center gap-2">
                          <Link
                            href={`/portal/documents/${encodeURIComponent(document.publicationId)}`}
                            data-testid="portal-published-document-cta"
                            className="inline-flex h-10 items-center justify-center rounded-[8px] border border-[var(--adm-brand-green)] px-4 text-sm font-medium text-[var(--adm-brand-green)] transition-colors hover:bg-[var(--adm-brand-green)] hover:text-[var(--adm-canvas-white)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--adm-brand-green)] focus-visible:ring-offset-2 motion-reduce:transition-none"
                          >
                            Megnyitás
                          </Link>
                          {document.downloadAvailable ? (
                            <a
                              href={portalDownloadUrl(document.publicationId)}
                              className="inline-flex h-10 items-center justify-center rounded-[8px] px-3 text-sm font-medium text-[var(--adm-text-secondary)] hover:text-[var(--adm-text-primary)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--adm-brand-green)] focus-visible:ring-offset-2"
                            >
                              Letöltés
                            </a>
                          ) : null}
                        </div>
                      </div>
                    </li>
                  );
                })}
              </ul>
            ) : (
              <div className="px-4 py-3">
                <PortalEmptyInline>Az iroda még nem tett közzé dokumentumot ezen az ügyfélfelületen.</PortalEmptyInline>
              </div>
            )}
          </SectionPanel>

          <SectionPanel title="Saját beküldések" count={data.submitted.length} testid="portal-document-library-submitted">
            {data.submitted.length ? (
              <ul>
                {data.submitted.map((submission) => {
                  const submitted = formatDate(submission.submittedAt);
                  const correctionHref =
                    submission.status === "CORRECTION_REQUESTED" && submission.matterPublicationId && submission.requestId
                      ? `/portal/matters/${encodeURIComponent(submission.matterPublicationId)}/requests/${encodeURIComponent(submission.requestId)}`
                      : null;
                  return (
                    <li key={submission.submissionId} data-testid="portal-submission-history-row" className="border-b border-[var(--adm-border-canonical)] px-4 py-3 last:border-b-0">
                      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between sm:gap-4">
                        <div className="min-w-0">
                          <p className="truncate text-sm font-medium text-[var(--adm-text-primary)]">{submission.requestTitle}</p>
                          <p className="mt-0.5 text-xs text-[var(--adm-text-secondary)]">
                            {submission.matterTitle ? `${submission.matterTitle} · ` : ""}
                            {submitted ? `Beküldve: ${submitted}` : ""}
                          </p>
                          <p className={`mt-1.5 text-xs font-semibold ${submissionStatusClass(submission.status)}`}>
                            {SUBMISSION_STATUS_LABELS[submission.status]}
                          </p>
                          {submission.files.length ? (
                            <ul className="mt-2 space-y-1">
                              {submission.files.map((file) => (
                                <li key={file.id} className="break-words text-xs text-[var(--adm-text-secondary)]">
                                  {file.title} · <span className={file.statusLabel === "Nem fogadható el" ? "text-[var(--adm-brand-terracotta)]" : "text-[var(--adm-text-secondary)]"}>{file.statusLabel}</span>
                                </li>
                              ))}
                            </ul>
                          ) : null}
                        </div>
                        {correctionHref ? (
                          <Link
                            href={correctionHref}
                            data-testid="portal-submission-correction-cta"
                            className="inline-flex h-10 shrink-0 items-center justify-center rounded-[8px] border border-[var(--adm-brand-terracotta)] px-4 text-sm font-medium text-[var(--adm-brand-terracotta)] transition-colors hover:bg-[var(--adm-brand-terracotta)] hover:text-[var(--adm-canvas-white)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--adm-brand-terracotta)] focus-visible:ring-offset-2 motion-reduce:transition-none"
                          >
                            Javítás megnyitása
                          </Link>
                        ) : null}
                      </div>
                    </li>
                  );
                })}
              </ul>
            ) : (
              <div className="px-4 py-3">
                <PortalEmptyInline>Még nincs beküldött anyaga.</PortalEmptyInline>
              </div>
            )}
          </SectionPanel>
        </>
      ) : null}
    </div>
  );
}
