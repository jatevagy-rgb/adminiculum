"use client";

import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import { AdminButton } from "@/components/adminiculum/ui";
import { getCaseLifecycle, closeCaseLifecycle, type CaseLifecycleResponse } from "@/lib/api";
import { listTaskLifecycleItems, readTaskSubmissionWorkflow, type TaskLifecycleListItem, type TaskSubmissionWorkflow } from "@/lib/taskLifecycleApi";
import { TaskSubmissionWorkspace } from "@/components/tasks/TaskSubmissionWorkspace";
import { taskWorkflowErrorMessage, ATTENTION_LABELS } from "@/lib/taskWorkflowPresentation";
import { getCaseStatusLabel } from "@/lib/caseLabels";
import { prepareExactVersionSubmission } from "./submissionEntry";

export function DocumentWorkspaceHeader({ caseId, documentId, versionId, versionNumber }: {
  caseId: string; documentId: string | null; versionId: string | null; versionNumber: number | null;
}) {
  const [tasks, setTasks] = useState<TaskLifecycleListItem[]>([]);
  const [taskId, setTaskId] = useState("");
  const [workflow, setWorkflow] = useState<TaskSubmissionWorkflow | null>(null);
  const [openedTask, setOpenedTask] = useState<TaskLifecycleListItem | null>(null);
  const [lifecycle, setLifecycle] = useState<CaseLifecycleResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [supportError, setSupportError] = useState(false);
  const [busy, setBusy] = useState(false);
  const [loading, setLoading] = useState(true);
  const alive = useRef(true);
  const busyRef = useRef(false);
  const returnFocus = useRef<HTMLButtonElement | null>(null);
  useEffect(() => { alive.current = true; return () => { alive.current = false; }; }, []);

  const load = useCallback(async () => {
    setLoading(true);
    const [taskList] = await Promise.allSettled([listTaskLifecycleItems()]);
    if (!alive.current) return;
    setTasks(taskList.status === "fulfilled" ? taskList.value.filter((task) => task.case.id === caseId) : []);
    setSupportError(taskList.status === "rejected");
    setLoading(false);
  }, [caseId]);
  useEffect(() => { void load(); }, [load]);
  useEffect(() => {
    let current = true;
    setWorkflow(null);
    setError(null);
    if (taskId) void readTaskSubmissionWorkflow(taskId).then((value) => {
      if (current && value.task.caseId === caseId && value.task.id === taskId) setWorkflow(value);
    }).catch((cause) => { if (current) setError(taskWorkflowErrorMessage(cause)); });
    return () => { current = false; };
  }, [caseId, taskId]);

  const run = async (action: () => Promise<void>) => {
    if (busyRef.current) return;
    busyRef.current = true;
    setBusy(true); setError(null);
    try { await action(); } catch (cause) { if (alive.current) setError(taskWorkflowErrorMessage(cause)); }
    finally { busyRef.current = false; if (alive.current) setBusy(false); }
  };
  const task = tasks.find((item) => item.id === taskId);
  const draft = workflow?.activeDraft;
  const submission = draft || workflow?.latestSubmittedRevision;
  const canPrepare = Boolean(workflow && (draft ? workflow.permittedActions.attachDocument : workflow.permittedActions.createDraft));

  return <header data-testid="word-document-header" className="min-w-0 space-y-3 [overflow-wrap:anywhere]">
    <div className="flex flex-wrap items-center justify-between gap-2 rounded-lg bg-white p-2">
      <Link href={`/cases/${encodeURIComponent(caseId)}`} className="inline-flex min-h-10 items-center font-semibold text-[var(--adm-green-800)]">← Ügy</Link>
      <AdminButton variant="neutral" className="min-h-10" disabled={busy} onClick={() => void run(async () => {
        const value = await getCaseLifecycle(caseId);
        if (alive.current) setLifecycle(value);
      })}>Lezárás ellenőrzése</AdminButton>
      <div className="flex w-full min-w-0 flex-wrap items-end gap-2 sm:w-auto sm:flex-1">
        <label className="w-full min-w-0 text-xs font-semibold sm:flex-1">Leadáshoz tartozó feladat
          <select data-testid="document-submission-task" value={taskId} disabled={busy || loading} onChange={(event) => setTaskId(event.target.value)} className="mt-1 block min-h-10 w-full min-w-0 max-w-full rounded border border-[var(--adm-border)] bg-[var(--card-bg)] p-2 text-sm">
            <option value="">{loading ? "Feladatok betöltése…" : "Válasszon feladatot…"}</option>
            {tasks.map((item) => <option key={item.id} value={item.id}>{item.title}</option>)}
          </select>
          {task ? <span data-testid="document-submission-task-identity" className="mt-1 block break-words font-normal">{task.title}</span> : null}
        </label>
        <AdminButton data-testid="document-top-submission" variant="primary" className="min-h-10" disabled={busy || !task || !documentId || !versionId || !canPrepare} onClick={(event) => { returnFocus.current = event.currentTarget; void run(async () => {
          if (!task || !documentId || !versionId) return;
          await prepareExactVersionSubmission({ caseId, taskId: task.id, documentId, versionId });
          if (alive.current) setOpenedTask(task);
        }); }}>{busy ? "Ellenőrzés…" : "Leadás"}</AdminButton>
        {task && workflow?.permittedActions.read ? <AdminButton variant="neutral" className="min-h-10" disabled={busy} onClick={(event) => { returnFocus.current = event.currentTarget; setOpenedTask(task); }}>Meglévő leadás / review</AdminButton> : null}
      </div>
      <span className="text-xs text-[var(--adm-text-muted)]" data-testid="submission-version-context" title={versionId || undefined}>{versionId ? 'Leadandó pontos verzió: v' + versionNumber : 'A Leadáshoz válassz dokumentumverziót.'}</span>
      {submission?.requestedAttention ? <span className="text-xs">{ATTENTION_LABELS[submission.requestedAttention] || 'Figyelemigény nincs megadva'}{submission.attentionEstimate ? ' · ' + submission.attentionEstimate.minMinutes + '–' + submission.attentionEstimate.maxMinutes + ' perc' : ''}</span> : null}
      {workflow && !canPrepare ? <p className="text-xs">Ehhez a feladathoz most nem csatolható új leadási verzió. A meglévő leadás jogosultságai a szerver szerint érvényesek.</p> : null}
      {supportError ? <div role="alert" className="text-sm">A feladatlista nem tölthető be. <AdminButton variant="neutral" className="min-h-10" onClick={() => void load()}>Újratöltés</AdminButton></div> : null}
      {error ? <p role="alert" className="w-full text-sm text-[var(--adm-terracotta-700)]">{error}</p> : null}
    </div>
    {lifecycle ? <section aria-label="Lezárási feltételek" className="rounded-lg bg-[var(--card-bg)] p-4 text-sm">
      <h2 className="font-semibold">Lezárási feltételek</h2>
      <p>Állapot: {getCaseStatusLabel(lifecycle.status)}</p>
      {lifecycle.closureReadiness.reasons.map((reason) => <p key={reason}>{reason}</p>)}
      {lifecycle.blockers.map((blocker, index) => <p key={index}>{blocker.label}: {blocker.count}</p>)}
      <AdminButton className="mt-3 min-h-10" variant="neutral" disabled={busy || !lifecycle.capabilities.canClose || !lifecycle.closureReadiness.ready} onClick={() => void run(async () => {
        const value = await closeCaseLifecycle(caseId, false);
        if (alive.current) setLifecycle(value);
      })}>Ügy lezárása</AdminButton>
    </section> : null}
    {openedTask ? <TaskSubmissionWorkspace item={openedTask} onClose={() => {
      setOpenedTask(null);
      // The opener was temporarily disabled while the exact-version write ran.
      // Restore it after the existing drawer's own focus cleanup has completed.
      window.requestAnimationFrame(() => returnFocus.current?.focus());
    }} onWorkflowChanged={async () => {
      const value = await readTaskSubmissionWorkflow(openedTask.id);
      if (alive.current) setWorkflow(value);
    }} /> : null}
  </header>;
}
