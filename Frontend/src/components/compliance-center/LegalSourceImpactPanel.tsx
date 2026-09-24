"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import {
  complianceIntelligenceApi,
  type LegalSourceImpactProjection,
} from "@/lib/complianceIntelligenceApi";
import {
  DataTable,
  DataTableBody,
  DataTableCell,
  DataTableHead,
  DataTableHeaderCell,
  DataTableRow,
} from "@/components/ui";
import { AdminBadge, AdminButton, AdminSectionHeader } from "@/components/adminiculum/ui";
import { SafePanelError } from "@/components/adminiculum/OperationalPrimitives";

const supportRoleLabels: Record<string, string> = {
  PRIMARY: "Elsődleges forrás",
  SUPPORTING: "Támogató forrás",
  CONTEXT: "Kontextus",
};

const implementationStatusLabels: Record<string, string> = {
  NOT_ASSESSED: "Nincs felmérve",
  PLANNED: "Tervezett",
  IMPLEMENTING: "Bevezetés alatt",
  IMPLEMENTED: "Bevezetve",
  PARTIAL: "Részben bevezetve",
  NOT_IMPLEMENTED: "Nincs bevezetve",
};

function formatDate(value: string | null | undefined): string {
  if (!value) return "—";
  try {
    return new Date(value).toLocaleDateString("hu-HU");
  } catch {
    return value;
  }
}

/**
 * C4C — legal-source impact drilldown. INTERNAL ONLY.
 *
 * Renders the exact-version impact chain (documents → requirements → controls →
 * clients) from the existing canonical legal-source-impact projection. It makes
 * no claims of automatic non-compliance: the review signal is "felülvizsgálat
 * szükséges", never an automatic legal conclusion.
 */
export function LegalSourceImpactPanel({ legalSourceVersionId }: { legalSourceVersionId: string }) {
  const [impact, setImpact] = useState<LegalSourceImpactProjection | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = () => {
    setLoading(true);
    setError(null);
    complianceIntelligenceApi
      .legalSourceImpact(legalSourceVersionId)
      .then(setImpact)
      .catch(() => setError("A jogforrás-hatásvizsgálat jelenleg nem tölthető be."))
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [legalSourceVersionId]);

  if (loading) {
    return <p className="text-sm text-[var(--adm-text-muted)]">Hatásvizsgálat betöltése…</p>;
  }
  if (error || !impact) {
    return <SafePanelError onRetry={load} detail={error ?? "A hatásvizsgálat nem érhető el."} />;
  }

  const subject = impact.subject;
  const requirementImpact = impact.requirementImpact;
  const controlImpact = impact.controlImpact;
  const documentImpact = impact.documentReferenceImpact;
  const applicabilityImpact = impact.applicabilityImpact;

  return (
    <div className="space-y-5">
      <div className="rounded-[var(--adm-radius-md)] border border-[var(--adm-border)] bg-white">
        <AdminSectionHeader
          eyebrow="Jogforrás"
          title={subject?.canonicalCitation || subject?.sourceKey || "Jogforrás"}
          subtitle={
            subject?.title
              ? `${subject.title}${subject.legalSourceVersionId ? "" : ""}`
              : "Pontos verzió-azonosítással rögzített jogforrás-hatás."
          }
          action={
            impact.review.reviewRequired ? (
              <AdminBadge tone="amber" dot>
                Felülvizsgálat szükséges
              </AdminBadge>
            ) : (
              <AdminBadge tone="neutral">Nincs felülvizsgálati jelzés</AdminBadge>
            )
          }
        />
        <p className="border-t border-[var(--adm-border)] px-4 py-2 text-[11px] text-[var(--adm-text-muted)]">
          A jogforrás-változás felülvizsgálati kötelezettséget jelez; nem állít automatikus meg nem felelést.
        </p>
      </div>

      {/* Érintett dokumentumok */}
      <section className="rounded-[var(--adm-radius-md)] border border-[var(--adm-border)] bg-white p-4">
        <h3 className="text-[10px] uppercase tracking-[0.2em] text-[var(--adm-green-800)]">
          Érintett dokumentumok
        </h3>
        {documentImpact.references.length === 0 ? (
          <p className="mt-3 text-sm text-[var(--adm-text-muted)]">Nincs pontosan hivatkozott dokumentumverzió ehhez a jogforráshoz.</p>
        ) : (
          <div className="mt-3">
            <DataTable minWidth={760}>
              <DataTableHead>
                <DataTableHeaderCell>Dokumentum</DataTableHeaderCell>
                <DataTableHeaderCell>Verzió</DataTableHeaderCell>
                <DataTableHeaderCell>Hivatkozás</DataTableHeaderCell>
                <DataTableHeaderCell>Ügyfél</DataTableHeaderCell>
              </DataTableHead>
              <DataTableBody>
                {documentImpact.references.map((reference) => (
                  <DataTableRow key={`${reference.documentVersionId}-${reference.clauseRef}`}>
                    <DataTableCell>
                      <Link
                        href={`/documents/${encodeURIComponent(reference.documentId)}?version=${encodeURIComponent(reference.documentVersionId)}`}
                        className="font-medium text-[var(--adm-text)] hover:underline"
                      >
                        {reference.documentName}
                      </Link>
                      {reference.clauseTitle ? (
                        <span className="block text-[11px] text-[var(--adm-text-muted)]">{reference.clauseTitle}</span>
                      ) : null}
                    </DataTableCell>
                    <DataTableCell muted>
                      {reference.version}
                      {reference.isCurrent ? (
                        <AdminBadge tone="green" className="ml-1">aktuális</AdminBadge>
                      ) : null}
                    </DataTableCell>
                    <DataTableCell muted>{reference.clauseRef}</DataTableCell>
                    <DataTableCell muted>{reference.clientName}</DataTableCell>
                  </DataTableRow>
                ))}
              </DataTableBody>
            </DataTable>
          </div>
        )}
      </section>

      {/* Érintett követelmények */}
      <section className="rounded-[var(--adm-radius-md)] border border-[var(--adm-border)] bg-white p-4">
        <h3 className="text-[10px] uppercase tracking-[0.2em] text-[var(--adm-green-800)]">
          Érintett követelmények
        </h3>
        {!requirementImpact.derivable || requirementImpact.citations.length === 0 ? (
          <p className="mt-3 text-sm text-[var(--adm-text-muted)]">
            {requirementImpact.derivable
              ? "Ehhez a jogforráshoz nincs pontosan kapcsolt követelményhivatkozás."
              : "A követelményhatás ehhez a jogforráshoz nem vezethető le pontosan."}
          </p>
        ) : (
          <ul className="mt-3 space-y-2">
            {requirementImpact.citations.map((citation) => (
              <li key={citation.citationId} className="rounded border border-[var(--adm-border)] p-2 text-sm">
                <span className="font-medium text-[var(--adm-text)]">{citation.versionTitle || citation.requirementKey}</span>
                <span className="ml-2 text-xs text-[var(--adm-text-muted)]">
                  {citation.versionKey} · {supportRoleLabels[citation.supportRole] || citation.supportRole}
                  {citation.citationLocator ? ` · ${citation.citationLocator}` : null}
                </span>
              </li>
            ))}
          </ul>
        )}
      </section>

      {/* Érintett intézkedések / kontrollok */}
      <section className="rounded-[var(--adm-radius-md)] border border-[var(--adm-border)] bg-white p-4">
        <h3 className="text-[10px] uppercase tracking-[0.2em] text-[var(--adm-green-800)]">
          Érintett intézkedések és kontrollok
        </h3>
        {!controlImpact.derivable || controlImpact.controlDefinitions.length === 0 ? (
          <p className="mt-3 text-sm text-[var(--adm-text-muted)]">
            {controlImpact.derivable
              ? "Ehhez a jogforráshoz nincs pontosan kapcsolt intézkedés."
              : "A kontrollhatás ehhez a jogforráshoz nem vezethető le pontosan."}
          </p>
        ) : (
          <div className="mt-3">
            <DataTable minWidth={760}>
              <DataTableHead>
                <DataTableHeaderCell>Intézkedés</DataTableHeaderCell>
                <DataTableHeaderCell>Ügyfél</DataTableHeaderCell>
                <DataTableHeaderCell>Állapot</DataTableHeaderCell>
                <DataTableHeaderCell>Következő felülvizsgálat</DataTableHeaderCell>
              </DataTableHead>
              <DataTableBody>
                {controlImpact.clientControls.map((clientControl) => {
                  const definition = controlImpact.controlDefinitions.find(
                    (item) => item.controlDefinitionId === clientControl.controlDefinitionId,
                  );
                  return (
                    <DataTableRow key={clientControl.clientControlId}>
                      <DataTableCell className="font-medium text-[var(--adm-text)]">
                        {definition?.title || clientControl.controlDefinitionId}
                      </DataTableCell>
                      <DataTableCell muted>{clientControl.clientId}</DataTableCell>
                      <DataTableCell muted>
                        {implementationStatusLabels[clientControl.implementationStatus] || clientControl.implementationStatus}
                      </DataTableCell>
                      <DataTableCell muted>{formatDate(clientControl.nextReviewAt)}</DataTableCell>
                    </DataTableRow>
                  );
                })}
              </DataTableBody>
            </DataTable>
          </div>
        )}
      </section>

      {/* Érintett ügyfelek */}
      <section className="rounded-[var(--adm-radius-md)] border border-[var(--adm-border)] bg-white p-4">
        <h3 className="text-[10px] uppercase tracking-[0.2em] text-[var(--adm-green-800)]">
          Érintett ügyfelek
        </h3>
        {impact.clients.length === 0 ? (
          <p className="mt-3 text-sm text-[var(--adm-text-muted)]">Nincs azonosított ügyfélhatás.</p>
        ) : (
          <ul className="mt-3 space-y-2">
            {impact.clients.map((client) => (
              <li key={client.clientId} className="flex flex-wrap items-center justify-between gap-2 rounded border border-[var(--adm-border)] p-2 text-sm">
                <Link href={`/clients/${encodeURIComponent(client.clientId)}/compliance`} className="font-medium text-[var(--adm-text)] hover:underline">
                  {client.clientName || client.clientId}
                </Link>
                <span className="text-xs text-[var(--adm-text-muted)]">
                  {[
                    client.documentReferenceCount ? `${client.documentReferenceCount} dokumentumhivatkozás` : null,
                    client.applicabilityCount ? `${client.applicabilityCount} alkalmazhatóság` : null,
                    client.clientControlCount ? `${client.clientControlCount} intézkedés` : null,
                  ]
                    .filter(Boolean)
                    .join(" · ")}
                </span>
              </li>
            ))}
          </ul>
        )}
      </section>

      {applicabilityImpact.applicabilities.length > 0 ? (
        <section className="rounded-[var(--adm-radius-md)] border border-[var(--adm-border)] bg-white p-4">
          <h3 className="text-[10px] uppercase tracking-[0.2em] text-[var(--adm-green-800)]">
            Alkalmazhatósági értékelések
          </h3>
          <ul className="mt-3 space-y-1">
            {applicabilityImpact.applicabilities.map((applicability) => (
              <li key={applicability.applicabilityId} className="text-sm text-[var(--adm-text)]">
                <span className="text-[var(--adm-text-muted)]">Értékelve:</span> {formatDate(applicability.evaluationAt)} ·{" "}
                <AdminBadge tone="neutral">{applicability.outcome}</AdminBadge>
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      <div className="flex justify-end">
        <AdminButton size="sm" variant="neutral" onClick={load}>
          Újratöltés
        </AdminButton>
      </div>
    </div>
  );
}
