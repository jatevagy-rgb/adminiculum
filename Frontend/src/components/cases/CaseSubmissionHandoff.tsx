"use client";
import { ViewportDialog } from "@/components/ui/ViewportDialog";


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
  const generation = useRef(0);
  const load = useCallback(async () => {
    const request = ++generation.current;
    setIsLoading(true);
    setError(null);
    try {
      const next = await readTaskSubmissionWorkflow(item.id);
      if (request === generation.current && next.task.id === item.id) setWorkflow(next);
    } catch (cause) {
      if (request === generation.current) setError(taskWorkflowErrorMessage(cause));
    } finally {
      if (request === generation.current) setIsLoading(false);
    }
  }, [item.id]);

  useEffect(() => { setWorkflow(null); void load(); return () => { ++generation.current; }; }, [load]);

  const skipTime = async () => {
    if (!workflow || skipping) return;
    const request = generation.current;
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
      if (request === generation.current) onContinue();
    } catch (cause) {
      if (request === generation.current) setError(taskWorkflowErrorMessage(cause));
    } finally {
      if (request === generation.current) setSkipping(false);
    }
  };

  const mode = leadasHandoffMode(workflow);

  return (
    <ViewportDialog title={"Leadás · " + item.title} onClose={onClose} busy={skipping} maxWidth="max-w-md">
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
              {error ? <CompactState tone="error" title={error} /> : null}
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
              {error ? <CompactState tone="error" title={error} /> : null}
              <div className="flex flex-wrap justify-end gap-2 pt-1">
                <AdminButton variant="neutral" onClick={onClose}>Mégse</AdminButton>
                <AdminButton variant="primary" onClick={onContinue} data-testid="case-submission-continue">Leadás folytatása</AdminButton>
              </div>
            </>
          ) : null}
        </div>
    </ViewportDialog>
  );
}
