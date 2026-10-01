"use client";

import React, { useCallback, useEffect, useRef, useState } from "react";
import { getCaseWorkspace, type CaseWorkspace } from "@/lib/api";
import { getCaseStatusLabel } from "@/lib/caseLabels";
import { AdminButton, AdminBadge } from "@/components/adminiculum/ui";
import {
  copyDirectPromptToClipboard,
  ClipboardFallbackModal,
} from "./clipboard";
import {
  buildDirectCurrentStatePrompt,
  buildDirectCaseContextPrompt,
  buildDirectGoalActionPlanPrompt,
  resolveSafePromptContext,
  type SanitizedContextSource,
} from "./safeContextAdapter";

export interface WordCurrentStateTileProps {
  caseId: string;
  clientId: string | null;
  readOnly?: boolean;
  onChanged?: () => void;
  sanitizedContext?: SanitizedContextSource;
}

const urgencyLabels: Record<string, string> = {
  CRITICAL: "Sürgős",
  ATTENTION: "Figyelmet igényel",
  STEADY: "Ütemben",
};

export function WordCurrentStateTile({
  caseId,
  clientId,
  readOnly = false,
  sanitizedContext,
}: WordCurrentStateTileProps) {
  const [workspace, setWorkspace] = useState<CaseWorkspace | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Direct copy state
  const [copiedAction, setCopiedAction] = useState<string | null>(null);
  const [fallbackText, setFallbackText] = useState<string | null>(null);
  const [fallbackScope, setFallbackScope] = useState<string | null>(null);
  const [copiedScope, setCopiedScope] = useState<string | null>(null);
  const copiedTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const scope = `${caseId}\u0000${clientId ?? ""}\u0000${sanitizedContext?.documentId ?? ""}\u0000${sanitizedContext?.sourceId ?? ""}\u0000${sanitizedContext?.documentVersionId ?? ""}`;
  const currentScope = useRef(scope);
  currentScope.current = scope;

  const loadData = useCallback(async () => {
    if (!caseId) return;
    const requestScope = scope;
    setLoading(true);
    setError(null);
    setWorkspace(null);
    try {
      const data = await getCaseWorkspace(caseId);
      if (currentScope.current === requestScope) setWorkspace(data);
    } catch {
      if (currentScope.current === requestScope) setError("Az ügyadatok betöltése jelenleg sikertelen.");
    } finally {
      if (currentScope.current === requestScope) setLoading(false);
    }
  }, [caseId, scope]);

  useEffect(() => {
    setCopiedAction(null);
    setFallbackText(null);
    void loadData();
    return () => { if (copiedTimer.current) clearTimeout(copiedTimer.current); };
  }, [loadData]);

  const handleCopyPrompt = async (
    actionKey: "current-state" | "case-context" | "goal-action-plan"
  ) => {
    if (!workspace) return;
    const requestScope = scope;
    let promptText = "";

    try {
      const safeContext = await resolveSafePromptContext(sanitizedContext, { caseId, clientId, documentId: sanitizedContext?.documentId });
      if (currentScope.current !== requestScope) return;
      if (actionKey === "current-state") {
        promptText = buildDirectCurrentStatePrompt({
          caseId,
          clientId,
          sanitizedContext: safeContext,
        });
      } else if (actionKey === "case-context") {
        promptText = buildDirectCaseContextPrompt({
          caseId,
          clientId,
          sanitizedContext: safeContext,
        });
      } else if (actionKey === "goal-action-plan") {
        promptText = buildDirectGoalActionPlanPrompt({
          caseId,
          clientId,
          sanitizedContext: safeContext,
        });
      }

      const res = await copyDirectPromptToClipboard(promptText);
      if (currentScope.current !== requestScope) return;
      if (res.success) {
        setCopiedAction(actionKey);
        setCopiedScope(requestScope);
        if (copiedTimer.current) clearTimeout(copiedTimer.current);
        copiedTimer.current = setTimeout(() => setCopiedAction(null), 2500);
      } else {
        setFallbackText(promptText);
        setFallbackScope(requestScope);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "A prompt összeállítása sikertelen.");
    }
  };

  if (loading) {
    return (
      <div
        className="rounded border border-[var(--adm-border)] bg-white p-4"
        data-testid="word-current-state-loading"
      >
        <p className="text-[12px] text-[var(--adm-text-muted)]">
          Ügy aktuális állása és kontextus betöltése…
        </p>
      </div>
    );
  }

  if (error || !workspace) {
    return (
      <div
        className="rounded border border-red-200 bg-red-50 p-4"
        data-testid="word-current-state-error"
      >
        <p className="text-[12px] font-semibold text-red-800">
          {error || "Nem található ügyadat."}
        </p>
        <button
          type="button"
          onClick={() => void loadData()}
          className="mt-2 text-[11px] font-semibold text-red-700 underline"
        >
          Újrapróbálkozás
        </button>
      </div>
    );
  }

  const { case: caseRecord, cockpit } = workspace;
  const starting = caseRecord.startingContext || {};
  const statusHu = getCaseStatusLabel(caseRecord.status);
  const urgencyHu = urgencyLabels[cockpit.urgency] || "Normál";

  return (
    <div
      className="space-y-4 rounded-lg border-2 border-[var(--adm-blue-700)] bg-white p-4 shadow-sm"
      data-testid="word-current-state-tile"
    >
      {/* 1. Ügy aktuális állása */}
      <div className="border-b border-[var(--adm-border)] pb-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div>
            <span className="text-[10px] font-bold uppercase tracking-[0.14em] text-[var(--adm-blue-700)]">
              Ügy aktuális állása
            </span>
            <h3 className="text-[16px] font-bold text-[var(--adm-text)]">
              {caseRecord.caseNumber} · {caseRecord.title}
            </h3>
          </div>
          <div className="flex flex-wrap items-center gap-1.5">
            <AdminBadge tone="blue">{statusHu}</AdminBadge>
            <AdminBadge
              tone={
                cockpit.urgency === "CRITICAL"
                  ? "burgundy"
                  : cockpit.urgency === "ATTENTION"
                  ? "amber"
                  : "green"
              }
            >
              {urgencyHu}
            </AdminBadge>
          </div>
        </div>

        <dl className="mt-3 grid grid-cols-1 gap-2 text-[11.5px] sm:grid-cols-3">
          <div>
            <dt className="text-[10px] text-[var(--adm-text-muted)]">Felelős</dt>
            <dd className="font-medium text-[var(--adm-text)]">
              {cockpit.responsible?.name || "Nincs kijelölve"}
            </dd>
          </div>
          <div>
            <dt className="text-[10px] text-[var(--adm-text-muted)]">Határidő</dt>
            <dd className="font-medium text-[var(--adm-text)]">
              {caseRecord.deadline
                ? new Date(caseRecord.deadline).toLocaleDateString("hu-HU")
                : "Nincs határidő"}
            </dd>
          </div>
          <div>
            <dt className="text-[10px] text-[var(--adm-text-muted)]">Következő lépés</dt>
            <dd className="font-medium text-[var(--adm-text)]">
              {cockpit.nextStep?.label || "Nincs megadva"}
            </dd>
          </div>
        </dl>

        <div className="mt-3 flex items-center gap-2">
          <AdminButton
            variant="ai"
            size="sm"
            onClick={() => void handleCopyPrompt("current-state")}
            className="min-h-[40px] px-3 font-medium"
            data-testid="copy-current-state-prompt-btn"
          >
            📋 Aktuális állás prompt másolása
          </AdminButton>
          {copiedAction === "current-state" && copiedScope === scope ? (
            <span
              role="status"
              className="text-[11px] font-semibold text-[var(--adm-green-800)]"
              data-testid="copy-success-current-state"
            >
              ✓ Prompt másolva a vágólapra!
            </span>
          ) : null}
        </div>
      </div>

      {/* 2. Miről szól az ügy? (Ügykontextus) */}
      <div className="border-b border-[var(--adm-border)] pb-3">
        <span className="text-[10px] font-bold uppercase tracking-[0.14em] text-[var(--adm-text-muted)]">
          Miről szól az ügy?
        </span>
        <div className="mt-2 space-y-2 text-[12px] text-[var(--adm-text)]">
          {starting.originReason ? (
            <div>
              <span className="font-semibold text-[var(--adm-text-muted)]">Indok: </span>
              {starting.originReason}
            </div>
          ) : null}
          {starting.currentSituation ? (
            <div>
              <span className="font-semibold text-[var(--adm-text-muted)]">Helyzet: </span>
              {starting.currentSituation}
            </div>
          ) : null}
          {caseRecord.description ? (
            <div className="text-[11.5px] leading-relaxed text-[var(--adm-text-secondary)]">
              {caseRecord.description}
            </div>
          ) : null}
          {!starting.originReason && !starting.currentSituation && !caseRecord.description ? (
            <p className="italic text-[var(--adm-text-muted)]">
              Nincs rögzített leírás vagy induló helyzet.
            </p>
          ) : null}
        </div>

        <div className="mt-3 flex items-center gap-2">
          <AdminButton
            variant="ai"
            size="sm"
            onClick={() => void handleCopyPrompt("case-context")}
            className="min-h-[40px] px-3 font-medium"
            data-testid="copy-case-context-prompt-btn"
          >
            📋 Ügykontextus prompt másolása
          </AdminButton>
          {copiedAction === "case-context" && copiedScope === scope ? (
            <span
              role="status"
              className="text-[11px] font-semibold text-[var(--adm-green-800)]"
              data-testid="copy-success-case-context"
            >
              ✓ Prompt másolva a vágólapra!
            </span>
          ) : null}
        </div>
      </div>

      {/* 3. Cél és teendők */}
      <div>
        <span className="text-[10px] font-bold uppercase tracking-[0.14em] text-[var(--adm-text-muted)]">
          Cél és teendők
        </span>
        <div className="mt-2 space-y-2 text-[12px] text-[var(--adm-text)]">
          {starting.clientExpectation ? (
            <div>
              <span className="font-semibold text-[var(--adm-text-muted)]">Ügyfél elvárása: </span>
              {starting.clientExpectation}
            </div>
          ) : null}
          {starting.urgentAction ? (
            <div>
              <span className="font-semibold text-[var(--adm-text-muted)]">Sürgős teendő: </span>
              {starting.urgentAction}
            </div>
          ) : null}
          {cockpit.nextStep?.label ? (
            <div>
              <span className="font-semibold text-[var(--adm-text-muted)]">Következő lépés: </span>
              {cockpit.nextStep.label}
            </div>
          ) : null}
          {!starting.clientExpectation && !starting.urgentAction && !cockpit.nextStep?.label ? (
            <p className="italic text-[var(--adm-text-muted)]">
              Nincs rögzített cél vagy sürgős teendő.
            </p>
          ) : null}
        </div>

        <div className="mt-3 flex items-center gap-2">
          <AdminButton
            variant="ai"
            size="sm"
            onClick={() => void handleCopyPrompt("goal-action-plan")}
            className="min-h-[40px] px-3 font-medium"
            data-testid="copy-goal-prompt-btn"
          >
            📋 Cél és teendők prompt másolása
          </AdminButton>
          {copiedAction === "goal-action-plan" && copiedScope === scope ? (
            <span
              role="status"
              className="text-[11px] font-semibold text-[var(--adm-green-800)]"
              data-testid="copy-success-goal"
            >
              ✓ Prompt másolva a vágólapra!
            </span>
          ) : null}
        </div>
      </div>

      {/* Fallback modal if browser clipboard fails */}
      <ClipboardFallbackModal
        open={Boolean(fallbackText && fallbackScope === scope)}
        text={fallbackScope === scope ? fallbackText || "" : ""}
        onClose={() => setFallbackText(null)}
      />
    </div>
  );
}
