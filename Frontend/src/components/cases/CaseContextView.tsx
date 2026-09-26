"use client";

/**
 * CASE WORKSPACE — Kontextus V1.
 *
 * A dedicated case-context surface built ONLY from already-persisted canonical
 * data on the case workspace DTO: `case.startingContext`, `case.description` and
 * the case-linked `communications` projection. It creates no new persistence, no
 * free-text context editor, no context anonymizer and no second outcome/context
 * model. Communication work itself stays in the canonical Communications
 * Workspace; this surface only shows linked metadata and links into it.
 */
import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { getCaseWorkspace, type CaseWorkspace } from "@/lib/api";
import { AdminPanel, AdminSectionHeader, AdminStatusPill } from "@/components/adminiculum/ui";
import { CompactState, SafePanelError } from "@/components/adminiculum/OperationalPrimitives";

type ContextFieldKey = "originReason" | "currentSituation" | "clientExpectation" | "urgentAction" | "nextStep";

const CONTEXT_FIELDS: Array<{ key: ContextFieldKey; label: string }> = [
  { key: "originReason", label: "Az ügy indoka" },
  { key: "currentSituation", label: "Jelenlegi helyzet" },
  { key: "clientExpectation", label: "Ügyfél elvárása" },
  { key: "urgentAction", label: "Sürgős teendő" },
  { key: "nextStep", label: "Következő lépés" },
];

function formatDateTime(value: string | null | undefined): string {
  if (!value) return "—";
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? value : date.toLocaleString("hu-HU");
}

export function CaseContextView({ caseId }: { caseId: string }) {
  const [workspace, setWorkspace] = useState<CaseWorkspace | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      setWorkspace(await getCaseWorkspace(caseId));
    } catch {
      setError("Az ügy kontextusa most nem tölthető be.");
    } finally {
      setLoading(false);
    }
  }, [caseId]);

  useEffect(() => { void load(); }, [load]);

  if (loading) {
    return <CompactState title="A kontextus betöltés alatt…" detail="Az induló helyzet, az ügyleírás és a kapcsolt kommunikáció betöltése folyamatban." />;
  }

  if (error || !workspace) {
    return <SafePanelError detail={error ?? "Az ügy kontextusa most nem tölthető be."} onRetry={() => void load()} />;
  }

  const startingContext = workspace.case.startingContext;
  const contextEntries = CONTEXT_FIELDS
    .map((field) => ({ label: field.label, value: startingContext[field.key] }))
    .filter((entry): entry is { label: string; value: string } => Boolean(entry.value && entry.value.trim()));
  const description = workspace.case.description?.trim() || null;
  const communications = workspace.communications ?? [];

  return (
    <div className="space-y-5" data-testid="case-context-view">
      <AdminPanel data-testid="case-context-starting">
        <AdminSectionHeader
          title="Induló helyzet és ügyvédi instrukció"
          subtitle="Miért indult az ügy, hol tart, mit vár az ügyfél, mi sürgős és mi a következő lépés."
        />
        {contextEntries.length > 0 ? (
          <dl data-testid="case-context-entries" className="grid grid-cols-1 gap-x-6 gap-y-2.5 px-4 py-3 sm:grid-cols-2">
            {contextEntries.map((entry) => (
              <div key={entry.label} className="min-w-0" data-testid={`case-context-${entry.label}`}>
                <dt className="text-[9.5px] font-bold uppercase tracking-[0.12em] text-[var(--adm-text-muted)]">{entry.label}</dt>
                <dd className="mt-0.5 whitespace-pre-line text-[12.5px] leading-5 text-[var(--adm-text)]">{entry.value}</dd>
              </div>
            ))}
          </dl>
        ) : (
          <p data-testid="case-context-empty" className="px-4 py-3 text-[12px] text-[var(--adm-text-muted)]">
            Ehhez az ügyhöz még nincs rögzített induló helyzet vagy ügyvédi instrukció.
          </p>
        )}
      </AdminPanel>

      {description ? (
        <AdminPanel data-testid="case-context-description">
          <AdminSectionHeader title="Ügyleírás" subtitle="Az ügy szabad szöveges leírása." />
          <p className="whitespace-pre-line px-4 py-3 text-[12.5px] leading-5 text-[var(--adm-text)]">{description}</p>
        </AdminPanel>
      ) : null}

      <AdminPanel data-testid="case-context-communications">
        <AdminSectionHeader
          title="Kapcsolt kommunikáció"
          subtitle="Az ügyhöz kapcsolt üzenetek. A kommunikáció kezelése továbbra is a Kommunikáció munkaterületen történik."
          action={
            <Link href={`/cases/${encodeURIComponent(caseId)}/communications`} className="adm-link-button px-3 py-1.5 text-[11px]" data-testid="case-context-communications-link">
              Kommunikáció megnyitása →
            </Link>
          }
        />
        {communications.length === 0 ? (
          <p data-testid="case-context-communications-empty" className="px-4 py-3 text-[12px] text-[var(--adm-text-muted)]">
            Ehhez az ügyhöz még nincs kapcsolt kommunikáció.
          </p>
        ) : (
          <ul className="divide-y divide-[var(--adm-border)]">
            {communications.map((communication) => (
              <li key={communication.id} className="px-4 py-3" data-testid={`case-context-communication-${communication.id}`}>
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="min-w-0 flex-1">
                    <p className="text-[12.5px] font-semibold text-[var(--adm-text)]">{communication.subject || "Nincs tárgy"}</p>
                    <p className="mt-0.5 text-[11px] text-[var(--adm-text-muted)]">
                      {[communication.sender, formatDateTime(communication.timestamp)].filter(Boolean).join(" · ")}
                    </p>
                    {communication.contentPreview ? (
                      <p className="mt-1 line-clamp-2 text-[12px] leading-5 text-[var(--adm-text)]">{communication.contentPreview}</p>
                    ) : null}
                  </div>
                  <div className="flex shrink-0 flex-col items-end gap-1">
                    {communication.internal ? <AdminStatusPill tone="neutral">Belső</AdminStatusPill> : null}
                    <Link
                      href={`/cases/${encodeURIComponent(caseId)}/communications`}
                      className="text-[11px] font-semibold text-[var(--adm-green-800)] hover:underline"
                    >
                      Megnyitás →
                    </Link>
                  </div>
                </div>
              </li>
            ))}
          </ul>
        )}
      </AdminPanel>
    </div>
  );
}
