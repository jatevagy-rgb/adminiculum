"use client";

import Link from "next/link";
import type { CaseWorkspace } from "@/lib/api";
import { getCaseStatusLabel } from "@/lib/caseLabels";
import { taskStatusLabel } from "@/lib/taskWorkflowPresentation";
import { ACCENT, fmtDate, fmtDateTime, type Accent } from "@/components/cases/CaseCockpitPanels";

export type CaseInsightTile = {
  key: string;
  title: string;
  accent: Accent;
  status?: string;
  body: string;
  detail?: string;
  action?: { label: string; href: string };
};

export type CaseInsightTileDefinition = {
  key: CaseInsightTile["key"];
  title: CaseInsightTile["title"];
  derive: (workspace: CaseWorkspace, caseId: string) => CaseInsightTile | null;
};

const urgencyLabels: Record<string, string> = {
  CRITICAL: "Sürgős",
  ATTENTION: "Figyelmet igényel",
  STEADY: "Ütemben",
};

const documentWorkStatusLabels: Record<string, string> = {
  NOT_IN_REVIEW: "Nincs felülvizsgálat alatt",
  IN_REVIEW: "Felülvizsgálat alatt",
  WAITING_FOR_PROCESSING: "Feldolgozás alatt",
  IN_PROGRESS: "Munka alatt",
  INTERNAL_REVIEW: "Belső felülvizsgálat",
  CHANGES_REQUESTED: "Módosítás szükséges",
  APPROVED: "Jóváhagyva",
  READY_FOR_CLIENT: "Ügyfélnek előkészítve",
  INTERNAL_ONLY: "Belső",
  CLIENT_READY: "Ügyfélnek előkészítve",
  PUBLISHED: "Közzétéve",
  LAWYER_UPLOAD: "Ügyvédi feltöltés",
  CLIENT_UPLOAD: "Ügyfél feltöltése",
  ORIGINAL: "Eredeti",
  WORKING_COPY: "Munkapéldány",
};

const reviewStatusLabels: Record<string, string> = {
  DRAFT: "Tervezet",
  ASSIGNED: "Kiosztva",
  READY_FOR_REVIEW: "Véleményezésre kész",
  IN_REVIEW: "Véleményezés alatt",
  CHANGES_REQUESTED: "Módosítás szükséges",
  RESUBMITTED: "Újra benyújtva",
  APPROVED: "Jóváhagyva",
  CLOSED: "Lezárva",
  CANCELLED: "Megszakítva",
};

const humanEnumLabel = (value?: string | null): string => {
  if (!value) return "Nincs adat";
  const normalized = value.toUpperCase();
  return documentWorkStatusLabels[normalized]
    || normalized.replace(/_/g, " ").toLocaleLowerCase("hu-HU").replace(/^./, (character) => character.toLocaleUpperCase("hu-HU"));
};

const reviewStatusLabel = (value?: string | null): string => {
  if (!value) return "Ismeretlen review állapot";
  return reviewStatusLabels[value.toUpperCase()] || "Ismeretlen review állapot";
};

const pointLabel = (count: number, singular: string, plural: string): string => `${count} ${count === 1 ? singular : plural}`;

const firstNonEmpty = (...values: Array<string | null | undefined>): string | null => {
  const value = values.find((candidate) => Boolean(candidate && candidate.trim()));
  return value?.trim() || null;
};

const activeDocument = (workspace: CaseWorkspace) => {
  const active = workspace.cockpit.activeDocuments[0];
  return active ? workspace.documents.find((document) => document.id === active.id) || null : null;
};

export const CASE_INSIGHT_TILE_REGISTRY: CaseInsightTileDefinition[] = [
  {
    key: "current-state",
    title: "Ügy aktuális állása",
    derive: (workspace) => {
      const { case: caseRecord, cockpit } = workspace;
      const detail = [
        cockpit.nextStep?.label ? `Következő lépés: ${cockpit.nextStep.label}` : null,
        caseRecord.deadline ? `Határidő: ${fmtDate(caseRecord.deadline)}` : null,
        cockpit.responsible?.name ? `Felelős: ${cockpit.responsible.name}` : null,
      ].filter(Boolean).join(" · ");
      return {
        key: "current-state",
        title: "Ügy aktuális állása",
        accent: cockpit.urgency === "CRITICAL" ? "terracotta" : cockpit.urgency === "ATTENTION" ? "ochre" : "green",
        status: urgencyLabels[cockpit.urgency] || "Ütemben",
        body: getCaseStatusLabel(caseRecord.status),
        detail: detail || undefined,
        action: { label: "Aktív munka megnyitása", href: "#ck-tasks" },
      };
    },
  },
  {
    key: "case-context",
    title: "Miről szól az ügy?",
    derive: (workspace) => {
      const { startingContext, description } = workspace.case;
      const body = firstNonEmpty(startingContext.originReason, startingContext.currentSituation, description);
      const detail = firstNonEmpty(startingContext.clientExpectation, startingContext.urgentAction);
      if (!body && !detail) return null;
      return {
        key: "case-context",
        title: "Miről szól az ügy?",
        accent: "petrol",
        body: body || detail || "Nincs rögzített ügykontekstus.",
        detail: body && detail ? detail : undefined,
      };
    },
  },
  {
    key: "document-review",
    title: "Dokumentum / review állapot",
    derive: (workspace, caseId) => {
      const document = activeDocument(workspace);
      if (!document) return null;
      const reviewSummary = document.reviewSummary;
      if (reviewSummary) {
        // DOCUMENT-LEVEL vs CURRENT-VERSION review truth. A review can be bound to
        // a historical version while the current version has none; that is NOT
        // "no review". We expose the document-level active review, the version it
        // reviews, and the version the user is looking at as distinct facts.
        const documentReviewStatus = reviewSummary.activeReviewStatus ?? reviewSummary.reviewStatus;
        const hasAnyReview = Boolean(reviewSummary.activeReviewId ?? reviewSummary.reviewId);
        const reviewVersionNumber = reviewSummary.activeReviewVersionNumber
          ?? reviewSummary.reviewVersionNumber
          ?? (reviewSummary.reviewVersionId && reviewSummary.reviewVersionId === reviewSummary.currentVersionId
            ? reviewSummary.currentVersionNumber
            : null);
        const currentVersionLabel = reviewSummary.currentVersionNumber !== null ? `v${reviewSummary.currentVersionNumber}` : null;
        const reviewVersionLabel = reviewVersionNumber !== null ? `v${reviewVersionNumber}` : null;
        const reviewOnAnotherVersion = Boolean(hasAnyReview && reviewVersionLabel && currentVersionLabel && reviewVersionLabel !== currentVersionLabel);

        const detail = [
          currentVersionLabel ? `Verzió: ${currentVersionLabel}` : null,
          reviewOnAnotherVersion ? `Review verzió: ${reviewVersionLabel}` : null,
          reviewSummary.comparisonId && reviewSummary.totalSegments > 0
            ? `${reviewSummary.reviewedSegments} / ${reviewSummary.totalSegments} változás ellenőrizve`
            : null,
          reviewSummary.openPointCount > 0 ? pointLabel(reviewSummary.openPointCount, "nyitott észrevétel", "nyitott észrevétel") : null,
          reviewSummary.blockingPointCount > 0 ? pointLabel(reviewSummary.blockingPointCount, "blokkoló észrevétel", "blokkoló észrevétel") : null,
          reviewSummary.nextAction.label ? `Következő: ${reviewSummary.nextAction.label}` : null,
        ].filter(Boolean).join(" · ");
        return {
          key: "document-review",
          title: "Dokumentum / review állapot",
          accent: "ochre",
          status: documentReviewStatus ? reviewStatusLabel(documentReviewStatus) : hasAnyReview ? "Ismeretlen review állapot" : "Nincs aktív felülvizsgálat",
          body: reviewSummary.documentTitle || document.fileName,
          detail: detail || undefined,
          action: { label: "Dokumentum munkatér", href: `/cases/${encodeURIComponent(caseId)}/documents?documentId=${encodeURIComponent(document.id)}` },
        };
      }
      const activeReason = workspace.cockpit.activeDocuments.find((item) => item.id === document.id)?.reason;
      const detail = [
        document.version ? `Verzió: ${document.version}` : null,
        document.reviewer?.name ? `Ellenőrző: ${document.reviewer.name}` : null,
        document.dueDate ? `Határidő: ${fmtDate(document.dueDate)}` : null,
        document.nextStep ? `Következő: ${document.nextStep}` : null,
      ].filter(Boolean).join(" · ");
      return {
        key: "document-review",
        title: "Dokumentum / review állapot",
        accent: "ochre",
        status: humanEnumLabel(activeReason === "REVIEW_PENDING" ? "INTERNAL_REVIEW" : document.workStatus),
        body: document.fileName,
        detail: detail || undefined,
        action: { label: "Dokumentum munkatér", href: `/cases/${encodeURIComponent(caseId)}/documents?documentId=${encodeURIComponent(document.id)}` },
      };
    },
  },
  {
    key: "recent-activity",
    title: "Mi történt mostanában?",
    derive: (workspace) => {
      const latest = workspace.activity[0];
      if (!latest) return null;
      return {
        key: "recent-activity",
        title: "Mi történt mostanában?",
        accent: "neutral",
        body: `${latest.actor || "Rendszer"} ${latest.actionLabel}`,
        detail: `${latest.objectLabel} · ${fmtDateTime(latest.occurredAt)}`,
        action: { label: "Aktivitás megnyitása", href: "#ck-activity" },
      };
    },
  },
  {
    key: "review-handoff",
    title: "Review / leadás",
    derive: (workspace) => {
      const actionable = workspace.tasks.filter((task) => ["IN_REVIEW", "UNDER_REVIEW", "SUBMITTED", "RETURNED", "BLOCKED"].includes(task.status.toUpperCase()));
      if (actionable.length === 0) return null;
      const first = actionable[0];
      return {
        key: "review-handoff",
        title: "Review / leadás",
        accent: actionable.some((task) => task.status.toUpperCase() === "BLOCKED") ? "terracotta" : "navy",
        status: `${actionable.length} aktív tétel`,
        body: first.title,
        detail: `${taskStatusLabel(first.status)}${first.dueDate ? ` · ${fmtDate(first.dueDate)}` : ""}`,
        action: { label: "Review / leadás megnyitása", href: "#ck-tasks" },
      };
    },
  },
];

export function deriveCaseInsightTiles(workspace: CaseWorkspace, caseId: string): CaseInsightTile[] {
  return CASE_INSIGHT_TILE_REGISTRY
    .map((definition) => definition.derive(workspace, caseId))
    .filter((tile): tile is CaseInsightTile => Boolean(tile));
}

export function CaseInsightTiles({ workspace, caseId }: { workspace: CaseWorkspace; caseId: string }) {
  const tiles = deriveCaseInsightTiles(workspace, caseId);
  if (tiles.length === 0) return null;
  return (
    <section aria-label="Ügy áttekintése" data-testid="case-insight-tiles" className="space-y-2">
      <div>
        <h2 className="font-serif text-xl font-semibold text-[var(--adm-text)]">Ügy áttekintése</h2>
        <p className="text-[11px] text-[var(--adm-text-muted)]">Az ügy aktuális munkakontextusa a kanonikus adatok alapján.</p>
      </div>
      <div className="grid grid-cols-1 gap-2 md:grid-cols-2 xl:grid-cols-3">
        {tiles.map((tile) => {
          const accent = ACCENT[tile.accent];
          return (
            <article key={tile.key} data-testid={`case-insight-${tile.key}`} className="relative min-w-0 overflow-hidden rounded-lg bg-white p-3 shadow-[0_1px_2px_rgba(22,32,26,0.06)]">
              <span aria-hidden="true" className={`absolute inset-y-0 left-0 w-1 ${accent.bar}`} />
              <div className="pl-2">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <h3 className={`text-[10px] font-bold uppercase tracking-[0.1em] ${accent.text}`}>{tile.title}</h3>
                  {tile.status ? <span className={`rounded px-1.5 py-0.5 text-[9px] font-bold ${accent.soft} ${accent.text}`}>{tile.status}</span> : null}
                </div>
                <p className="mt-1 line-clamp-2 text-[13px] font-semibold text-[var(--adm-text)]">{tile.body}</p>
                {tile.detail ? <p className="mt-1 line-clamp-2 text-[11px] leading-4 text-[var(--adm-text-muted)]">{tile.detail}</p> : null}
                {tile.action ? <Link href={tile.action.href} className={`mt-2 inline-flex text-[11px] font-semibold ${accent.text} hover:underline`}>{tile.action.label} →</Link> : null}
              </div>
            </article>
          );
        })}
      </div>
    </section>
  );
}
