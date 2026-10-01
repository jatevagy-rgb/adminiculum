"use client";

import { useEffect, useState } from "react";
import type { CaseWorkspace } from "@/lib/api";
import { getCaseStatusLabel } from "@/lib/caseLabels";

// Presentation references only. Shared text remains in the canonical case fields.
// User-created content and user-scoped ordering require a persistence contract.
export type CaseTileDescriptor = {
  id: string;
  kind: "current-state" | "subject" | "goal";
  contentRef: string;
  tone: "info" | "teal" | "green";
  order: number;
  placements: readonly ("overview" | "document")[];
  title: string;
  body: string;
};

export function caseContextTiles(c: CaseWorkspace["case"]): CaseTileDescriptor[] {
  const context = c.startingContext;
  return [
    { kind: "current-state", contentRef: context.currentSituation?.trim() ? "case.intakeCurrentSituation" : "case.status", tone: "info", title: "Jelenlegi állapot", body: context.currentSituation?.trim() || getCaseStatusLabel(c.status) },
    { kind: "subject", contentRef: context.originReason?.trim() ? "case.intakeOriginReason" : "case.description", tone: "teal", title: "Miről szól az ügy?", body: context.originReason?.trim() || c.description?.trim() || "Az ügy tárgya még nincs rögzítve." },
    { kind: "goal", contentRef: "case.intakeClientExpectation", tone: "green", title: "Az ügy célja", body: context.clientExpectation?.trim() || "Az ügy célja még nincs rögzítve." },
  ].map((tile, order) => ({ ...tile, id: `${c.id}:${tile.kind}`, order, placements: ["overview", "document"] })) as CaseTileDescriptor[];
}

const tones = {
  info: "border-[var(--adm-blue-700)] bg-[var(--adm-blue-100)]",
  teal: "border-[var(--adm-palette-teal)] bg-[var(--card-bg)]",
  green: "border-[var(--adm-green-800)] bg-[var(--card-bg)]",
};

export function CaseContextTiles({ caseRecord }: { caseRecord: CaseWorkspace["case"] }) {
  return <section aria-label="Ügykontextus" data-testid="word-case-context" className="grid min-w-0 grid-cols-1 gap-3 md:grid-cols-3">
    {caseContextTiles(caseRecord).map((tile) => <article key={tile.id} data-tile-id={tile.id} data-content-ref={tile.contentRef} className={`min-w-0 rounded-lg border-l-4 p-4 ${tones[tile.tone]}`}>
      <h3 className="text-sm font-semibold text-[var(--adm-green-800)]">{tile.title}</h3>
      <p className="mt-2 whitespace-pre-line break-words text-sm leading-6 text-[var(--adm-text)]">{tile.body}</p>
    </article>)}
  </section>;
}

export function deadlineRemaining(dueAt: string, now: number): string {
  const due = Date.parse(dueAt);
  if (!Number.isFinite(due)) return "A határidő nem értelmezhető.";
  const minutes = Math.ceil(Math.abs(due - now) / 60000);
  const duration = minutes >= 1440 ? `${Math.floor(minutes / 1440)} nap ${Math.floor(minutes % 1440 / 60)} óra` : minutes >= 60 ? `${Math.floor(minutes / 60)} óra ${minutes % 60} perc` : `${minutes} perc`;
  return due < now ? `${duration} késés` : `${duration} van hátra`;
}

export function PersistedDeadline({ dueAt }: { dueAt: string | null }) {
  const [now, setNow] = useState<number | null>(null);
  useEffect(() => {
    setNow(Date.now());
    const timer = window.setInterval(() => setNow(Date.now()), 60000);
    return () => window.clearInterval(timer);
  }, [dueAt]);
  if (!dueAt) return <span>Nincs rögzített határidő</span>;
  if (!Number.isFinite(Date.parse(dueAt))) return <span>A határidő nem értelmezhető.</span>;
  return <span data-testid="persisted-deadline" className="inline-flex flex-wrap gap-x-2">
    <time dateTime={dueAt}>{new Date(dueAt).toLocaleString("hu-HU", { dateStyle: "short", timeStyle: "short" })}</time>
    {now !== null ? <span className="text-[var(--adm-text-muted)]">· {deadlineRemaining(dueAt, now)}</span> : null}
  </span>;
}
