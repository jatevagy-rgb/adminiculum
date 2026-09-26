"use client";

/**
 * Leadás handoff (CASE-WORKSPACE-LEADAS-1).
 *
 * Compact confirmation that sits in front of the canonical submission
 * workflow. It does not submit, approve, return or mutate task status: it only
 * reads the canonical workflow, and for the "no time recorded" case it either
 * hands off to the existing time-entry flow or persists the canonical
 * `zeroTimeConfirmed` flag through the existing draft API. Everything else
 * continues into the existing TaskSubmissionWorkspace.
 */
import { useCallback, useEffect, useRef, useState } from "react";
import { CompactState } from "@/components/adminiculum/OperationalPrimitives";
import { AdminButton } from "@/components/adminiculum/ui";
import {
  createTaskSubmissionDraft,
  readTaskSubmissionWorkflow,
  updateTaskSubmissionDraft,
  type TaskLifecycleListItem,
  type TaskSubmissionWorkflow,
} from "@/lib/taskLifecycleApi";
import { leadasHandoffMode, taskWorkflowErrorMessage } from "@/lib/taskWorkflowPresentation";

const FOCUSABLE_SELECTOR = [
  "button:not([disabled])",
  "a[href]",
  "input:not([disabled])",
  "select:not([disabled])",
  "textarea:not([disabled])",
  "[tabindex]:not([tabindex='-1'])",
].join(",");

export function CaseSubmissionHandoff({
  item,
  onClose,
  onContinue,
  onRecordTime,
}: {
  item: TaskLifecycleListItem;
  onClose: () => void;
  onContinue: () => void;
  onRecordTime: () => void;
}) {
  const [workflow, setWorkflow] = useState<TaskSubmissionWorkflow | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [skipping, setSkipping] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const panelRef = useRef<HTMLDivElement | null>(null);
  const priorFocusRef = useRef<HTMLElement | null>(null);
  const busyRef = useRef(false);
  const onCloseRef = useRef(onClose);

  useEffect(() => { busyRef.current = skipping; }, [skipping]);
  useEffect(() => { onCloseRef.current = onClose; }, [onClose]);

  const load = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    try {
      setWorkflow(await readTaskSubmissionWorkflow(item.id));
    } catch (cause) {
      setError(taskWorkflowErrorMessage(cause));
    } finally {
      setIsLoading(false);
    }
  }, [item.id]);

  useEffect(() => { void load(); }, [load]);

  useEffect(() => {
    priorFocusRef.current = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    panelRef.current?.querySelector<HTMLElement>(FOCUSABLE_SELECTOR)?.focus();
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape" && !busyRef.current) {
        event.preventDefault();
        onCloseRef.current();
        return;
      }
      if (event.key !== "Tab" || !panelRef.current) return;
      const focusable = Array.from(panelRef.current.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR));
      if (focusable.length === 0) return;
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    };
    document.addEventListener("keydown", handleKeyDown);
    return () => {
      document.removeEventListener("keydown", handleKeyDown);
      priorFocusRef.current?.focus();
    };
  }, []);

  const skipTime = async () => {
    if (!workflow || skipping) return;
    setSkipping(true);
    setError(null);
    try {
      let current = workflow;
      if (!current.activeDraft && current.permittedActions.createDraft) {
        current = await createTaskSubmissionDraft(item.id);
      }
      const draft = current.activeDraft;
      if (draft && current.permittedActions.editDraft) {
        await updateTaskSubmissionDraft(item.id, draft.id, { zeroTimeConfirmed: true });
      }
      onContinue();
    } catch (cause) {
      setError(taskWorkflowErrorMessage(cause));
    } finally {
      setSkipping(false);
    }
  };

  const mode = leadasHandoffMode(workflow);

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/30 p-4" role="presentation">
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="case-submission-handoff-title"
        className="w-full max-w-md rounded-[var(--adm-radius-lg)] border border-[var(--adm-border)] bg-white shadow-2xl"
      >
        <div className="flex items-start justify-between gap-3 border-b border-[var(--adm-border)] px-5 py-4">
          <div className="min-w-0">
            <p className="text-[10px] font-bold uppercase tracking-[0.14em] text-[var(--adm-green-800)]">Leadás</p>
            <h2 id="case-submission-handoff-title" className="mt-1 truncate font-serif text-[20px] text-[var(--adm-text)]">{item.title}</h2>
          </div>
          <button
            type="button"
            onClick={onClose}
            disabled={skipping}
            aria-label="Leadás ablak bezárása"
            className="rounded px-1 text-xl leading-none text-[var(--adm-text-muted)] hover:text-[var(--adm-text)]"
          >
            ×
          </button>
        </div>

        <div className="space-y-3 px-5 py-4">
          {isLoading ? <CompactState title="A Leadás előkészítése…" /> : null}

          {!isLoading && !workflow ? (
            <CompactState
              tone="error"
              title="A Leadás most nem készíthető elő."
              detail={error || "A feladat munkatere nem érhető el."}
              action={<AdminButton size="sm" variant="neutral" onClick={() => void load()}>Újratöltés</AdminButton>}
            />
          ) : null}

          {!isLoading && workflow && mode === "OFFER_TIME" ? (
            <>
              <p data-testid="case-submission-missing-time" className="text-[12px] leading-5 text-[var(--adm-text)]">
                Ehhez a feladathoz még nincs rögzített munkaidő.
              </p>
              <p className="text-[11px] leading-5 text-[var(--adm-text-muted)]">
                Rögzíthet munkaidőt, vagy kihagyhatja. A kihagyás a meglévő „Nincs rögzítendő munkaidő” megerősítést rögzíti.
              </p>
              {error ? (
                <p role="alert" className="rounded border border-[#e3c5c0] bg-[#fff8f6] px-3 py-2 text-[11px] text-[var(--adm-terracotta-700)]">{error}</p>
              ) : null}
              <div className="flex flex-wrap justify-end gap-2 pt-1">
                <AdminButton variant="neutral" onClick={onClose} disabled={skipping}>Mégse</AdminButton>
                <AdminButton variant="neutral" onClick={() => void skipTime()} disabled={skipping} data-testid="case-submission-skip-time">
                  {skipping ? "Rögzítés…" : "Kihagyás"}
                </AdminButton>
                <AdminButton variant="primary" onClick={onRecordTime} disabled={skipping} data-testid="case-submission-record-time">
                  Munkaidő rögzítése
                </AdminButton>
              </div>
            </>
          ) : null}

          {!isLoading && workflow && mode === "CONTINUE" ? (
            <>
              <p className="text-[12px] leading-5 text-[var(--adm-text-muted)]">
                A Leadás a feladat meglévő munkaterében folytatódik.
              </p>
              {error ? (
                <p role="alert" className="rounded border border-[#e3c5c0] bg-[#fff8f6] px-3 py-2 text-[11px] text-[var(--adm-terracotta-700)]">{error}</p>
              ) : null}
              <div className="flex flex-wrap justify-end gap-2 pt-1">
                <AdminButton variant="neutral" onClick={onClose}>Mégse</AdminButton>
                <AdminButton variant="primary" onClick={onContinue} data-testid="case-submission-continue">Leadás folytatása</AdminButton>
              </div>
            </>
          ) : null}
        </div>
      </div>
    </div>
  );
}
