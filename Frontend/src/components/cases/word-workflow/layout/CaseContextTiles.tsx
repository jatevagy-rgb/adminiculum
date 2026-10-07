"use client";

import { useEffect, useState } from "react";
import { DurableCaseTiles } from "./DurableCaseTiles";
import { CaseClientOwner } from "./CaseClientOwner";
import type { CaseWorkspace } from "@/lib/api";
import { getCaseStatusLabel } from "@/lib/caseLabels";
import { formatDeadline } from "@/lib/businessDateTime";

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

export function CaseContextTiles({ caseRecord, surface = "overview" }: { caseRecord: CaseWorkspace["case"]; surface?: "overview" | "document" }) {
  return <div className="space-y-3"><CaseClientOwner key={`${caseRecord.id}:owner`} caseId={caseRecord.id}/><DurableCaseTiles key={caseRecord.id} caseId={caseRecord.id} surface={surface} builtin={caseContextTiles(caseRecord)} /></div>;
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
    <time dateTime={dueAt}>{formatDeadline(dueAt)}</time>
    {now !== null ? <span className="text-[var(--adm-text-muted)]">· {deadlineRemaining(dueAt, now)}</span> : null}
  </span>;
}
