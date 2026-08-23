"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import { useSearchParams } from "next/navigation";
import { AuthenticatedApp } from "@/components/AuthenticatedApp";
import { CompactState, OperationalPageHeader } from "@/components/adminiculum/OperationalPrimitives";
import { AdminButton, AdminStatusPill } from "@/components/adminiculum/ui";
import { TaskReviewWorkspace } from "@/components/tasks/TaskReviewWorkspace";
import { listTaskReviewQueue, type TaskReviewQueueItem } from "@/lib/taskLifecycleApi";
import { ClientAccent } from "@/components/clients/ClientAccent";
import {
  REVIEW_QUEUE_COPY,
  deriveReviewQueueView,
  reviewQueueCountLabel,
  type ReviewQueueStatus,
} from "@/lib/reviewQueueState";
import {
  ATTENTION_LABELS,
  URGENCY_LABELS,
  formatDate,
  formatDateTime,
  formatMinutes,
  reviewUrgency,
  sortReviewQueue,
  submissionStatusLabel,
  type ReviewUrgency,
} from "@/lib/taskWorkflowPresentation";

const ATTENTION_ORDER = ["QUICK_SCAN", "APPROVAL", "SIGNATURE", "EDITING", "DETAILED_REVIEW"] as const;

const ATTENTION_MARKS: Record<string, { mark: string; tone: "gold" | "blue" | "violet" | "sage" | "burgundy" }> = {
  QUICK_SCAN: { mark: "↗", tone: "gold" },
  APPROVAL: { mark: "✓", tone: "sage" },
  SIGNATURE: { mark: "✎", tone: "violet" },
  EDITING: { mark: "▤", tone: "blue" },
  DETAILED_REVIEW: { mark: "◎", tone: "burgundy" },
};

function urgencyTone(urgency: ReviewUrgency): "burgundy" | "amber" | "gold" | "neutral" {
  if (urgency === "CRITICAL") return "burgundy";
  if (urgency === "URGENT") return "amber";
  if (urgency === "SOON") return "gold";
  return "neutral";
}

export default function ReviewsPage() {
  return (
    <AuthenticatedApp section="reviews">
      <ReviewsPageContent />
    </AuthenticatedApp>
  );
}

function ReviewQueueSkeleton({ title }: { title: string }) {
  return (
    <div className="mt-3 space-y-2" aria-busy="true">
      <p className="text-[11px] text-[var(--adm-text-muted)]">{title}</p>
      {[0, 1, 2].map((row) => (
        <div key={row} className="h-[104px] animate-pulse rounded border border-[var(--adm-border)] bg-[var(--adm-surface)]" />
      ))}
    </div>
  );
}

function ReviewsPageContent() {
  const searchParams = useSearchParams();
  const deepLinkedTaskId = searchParams?.get("taskId") || null;
  const deepLinkedSubmissionId = searchParams?.get("submissionId") || null;
  const [queue, setQueue] = useState<TaskReviewQueueItem[]>([]);
  const [selectedKey, setSelectedKey] = useState<string | null>(null);
  const [attentionFilter, setAttentionFilter] = useState("all");
  const [urgencyFilter, setUrgencyFilter] = useState<ReviewUrgency | "all">("all");
  const [submitterFilter, setSubmitterFilter] = useState("all");
  const [priorityFilter, setPriorityFilter] = useState("all");
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState<ReviewQueueStatus>("loading");

  const keyFor = (item: TaskReviewQueueItem) => `${item.taskId}:${item.submissionId || "legacy"}`;

  const loadQueue = useCallback(async () => {
    setStatus("loading");
    try {
      const items = await listTaskReviewQueue();
      setQueue(sortReviewQueue(items));
      if (deepLinkedTaskId) {
        const deepLinked = items.find((item) => item.taskId === deepLinkedTaskId && (!deepLinkedSubmissionId || item.submissionId === deepLinkedSubmissionId));
        if (deepLinked) setSelectedKey(keyFor(deepLinked));
      }
      setStatus("ready");
    } catch {
      setQueue([]);
      setSelectedKey(null);
      setStatus("failed");
    }
  }, [deepLinkedSubmissionId, deepLinkedTaskId]);

  useEffect(() => {
    void loadQueue();
  }, [loadQueue]);

  const submitters = useMemo(() => Array.from(new Set(queue.map((item) => item.submittedBy?.displayName).filter((value): value is string => Boolean(value)))).sort((left, right) => left.localeCompare(right, "hu-HU")), [queue]);
  const categoryCounts = useMemo(() => Object.fromEntries(ATTENTION_ORDER.map((attention) => [attention, queue.filter((item) => item.requestedAttention === attention).length])), [queue]);
  const filtered = useMemo(() => {
    const normalizedSearch = search.trim().toLocaleLowerCase("hu-HU");
    return sortReviewQueue(queue.filter((item) => {
      if (attentionFilter !== "all" && item.requestedAttention !== attentionFilter) return false;
      if (urgencyFilter !== "all" && reviewUrgency(item) !== urgencyFilter) return false;
      if (submitterFilter !== "all" && item.submittedBy?.displayName !== submitterFilter) return false;
      if (priorityFilter !== "all" && item.priority !== priorityFilter) return false;
      if (!normalizedSearch) return true;
      return `${item.title} ${item.case.caseNumber} ${item.case.title || ""} ${item.case.clientName} ${item.case.matterType} ${item.submittedBy?.displayName || ""}`.toLocaleLowerCase("hu-HU").includes(normalizedSearch);
    }));
  }, [attentionFilter, priorityFilter, queue, search, submitterFilter, urgencyFilter]);

  const selected = useMemo(() => queue.find((item) => keyFor(item) === selectedKey) || null, [queue, selectedKey]);
  const activeSubmittedCount = queue.filter((item) => item.source === "TASK_SUBMISSION").length;
  const legacyCount = queue.length - activeSubmittedCount;
  const view = useMemo(() => deriveReviewQueueView({ status, totalCount: queue.length, filteredCount: filtered.length }), [filtered.length, queue.length, status]);

  return (
    <div className="adm-board-page flex-1 overflow-y-auto">
      <div className="adm-board-container space-y-4">
        <OperationalPageHeader title="Review" count={`${reviewQueueCountLabel(status, activeSubmittedCount)} Leadás`} subtitle="Beküldött revisionök operatív munkatere. A figyelmi kategória és a határidőből számított sürgősség külön jelzés." secondaryActions={<Link href="/tasks" className="adm-link-button px-3 py-2 text-[11px]">Feladatok</Link>} />

        <section className="rounded-[var(--adm-radius-lg)] border border-[var(--adm-border)] bg-white p-3">
          <div className="flex flex-wrap gap-2" aria-label="Review figyelmi kategóriák">
            <button type="button" onClick={() => setAttentionFilter("all")} className={`rounded border px-3 py-2 text-[11px] font-semibold focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 ${attentionFilter === "all" ? "border-[var(--adm-green-800)] bg-[var(--adm-green-800)] text-white" : "border-[var(--adm-border)] bg-white text-[var(--adm-text)]"}`}>Összes <span className="ml-1 opacity-70">{reviewQueueCountLabel(status, activeSubmittedCount)}</span></button>
            {ATTENTION_ORDER.map((attention) => { const config = ATTENTION_MARKS[attention]; return <button key={attention} type="button" onClick={() => setAttentionFilter(attention)} className={`inline-flex items-center gap-2 rounded border px-3 py-2 text-[11px] font-semibold focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 ${attentionFilter === attention ? "border-[var(--adm-green-800)] bg-[var(--adm-sage-100)] text-[var(--adm-green-900)]" : "border-[var(--adm-border)] bg-white text-[var(--adm-text)]"}`}><span aria-hidden="true" className="inline-flex h-5 w-5 items-center justify-center rounded-full border border-current text-[11px]">{config.mark}</span>{ATTENTION_LABELS[attention]} <span className="opacity-60">{categoryCounts[attention]}</span></button>; })}
          </div>
          <div className="mt-3 grid gap-2 md:grid-cols-[minmax(240px,2fr)_minmax(170px,1fr)_minmax(170px,1fr)]">
            <input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Keresés ügy, ügyfél, feladat vagy beküldő szerint" aria-label="Review sor keresése" className="adm-board-field px-3 py-2 text-[11px]" />
            <select value={urgencyFilter} onChange={(event) => setUrgencyFilter(event.target.value as ReviewUrgency | "all")} aria-label="Sürgősség szűrő" className="adm-board-field px-3 py-2 text-[11px]"><option value="all">Minden sürgősség</option>{Object.entries(URGENCY_LABELS).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select>
            <select value={submitterFilter} onChange={(event) => setSubmitterFilter(event.target.value)} aria-label="Beküldő szűrő" className="adm-board-field px-3 py-2 text-[11px]"><option value="all">Minden beküldő</option>{submitters.map((submitter) => <option key={submitter} value={submitter}>{submitter}</option>)}</select>
          </div>
          <details className="mt-2 rounded border border-[var(--adm-border)] bg-[var(--adm-surface)] px-3 py-2"><summary className="cursor-pointer text-[11px] font-semibold text-[var(--adm-text)]">További szűrők</summary><div className="mt-2 max-w-xs"><select value={priorityFilter} onChange={(event) => setPriorityFilter(event.target.value)} aria-label="Prioritás szűrő" className="adm-board-field w-full px-3 py-2 text-[11px]"><option value="all">Minden prioritás</option><option value="URGENT">Magas</option><option value="HIGH">Magas</option><option value="MEDIUM">Közepes</option><option value="LOW">Alacsony</option></select></div></details>
        </section>

        <div className={`grid min-h-0 gap-4 ${selected?.source === "TASK_SUBMISSION" ? "xl:grid-cols-[minmax(330px,0.72fr)_minmax(580px,1.35fr)]" : ""}`}>
          <section className="min-w-0 rounded-[var(--adm-radius-lg)] border border-[var(--adm-border)] bg-white p-3" aria-labelledby="review-queue-title">
            <div className="flex items-center justify-between gap-3 border-b border-[var(--adm-border)] pb-3"><div><h2 id="review-queue-title" className="font-serif text-[20px] text-[var(--adm-text)]">Review sor</h2><p className="mt-1 text-[10px] text-[var(--adm-text-muted)]">Lejárt határidő, majd legkorábbi határidő és régebbi beküldés szerint.</p></div><span className="text-[11px] font-semibold text-[var(--adm-text-muted)]">{reviewQueueCountLabel(status, filtered.length)} tétel</span></div>
            {view.kind === "loading" ? <ReviewQueueSkeleton title={view.title} /> : view.kind === "unavailable" ? <div className="mt-3" role="alert"><CompactState tone="error" title={view.title} detail={view.detail} action={<AdminButton size="sm" variant="neutral" onClick={() => void loadQueue()}>{REVIEW_QUEUE_COPY.retry}</AdminButton>} /></div> : view.kind !== "populated" ? <div className="mt-3"><CompactState title={view.title} detail={view.detail} /></div> : <div className="mt-3 space-y-2">{filtered.map((item) => { const attention = item.requestedAttention || ""; const urgency = reviewUrgency(item); const active = keyFor(item) === selectedKey; const content = <><ClientAccent colorKey={item.case.clientColorKey} className="absolute inset-y-0 left-0 w-1" /><div className="flex flex-wrap items-center gap-1.5"><AdminStatusPill tone={ATTENTION_MARKS[attention]?.tone || "neutral"}>{ATTENTION_LABELS[attention] || "Nincs review típus"}</AdminStatusPill><AdminStatusPill tone={urgencyTone(urgency)}>{URGENCY_LABELS[urgency]}</AdminStatusPill></div><h3 className="mt-2 text-[13px] font-semibold text-[var(--adm-text)]">{item.title}</h3><p className="mt-1 text-[11px] text-[var(--adm-text-muted)]">{item.case.caseNumber} · {item.case.clientName} · {item.case.matterType}</p><div className="mt-2 flex flex-wrap gap-x-3 gap-y-1 text-[10px] text-[var(--adm-text-muted)]"><span>Beküldő: {item.submittedBy?.displayName || "Nincs adat"}</span><span>{formatDateTime(item.submittedAt)}</span><span>{item.submissionDocumentCount || 0} dokumentum</span><span>{formatMinutes(item.linkedTimeMinutes)}</span></div>{item.workSummaryPreview ? <p className="mt-2 line-clamp-2 text-[11px] leading-4 text-[var(--adm-text-muted)]">{item.workSummaryPreview}</p> : null}</>; return item.source === "TASK_SUBMISSION" && item.submissionId ? <button key={keyFor(item)} type="button" onClick={() => setSelectedKey(keyFor(item))} className={`relative w-full rounded border p-3 pl-4 text-left focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 ${active ? "border-[var(--adm-green-800)] bg-[var(--adm-sage-100)]/30" : "border-[var(--adm-border)] bg-white hover:bg-[var(--adm-surface)]"}`}>{content}</button> : <div key={keyFor(item)} className="relative rounded border border-dashed border-[var(--adm-border)] bg-[var(--adm-surface)] p-3 pl-4">{content}<Link href={`/tasks?taskId=${encodeURIComponent(item.taskId)}`} className="mt-3 inline-flex text-[10px] font-semibold text-[var(--adm-blue-700)] hover:underline">Korábbi feladat megnyitása</Link></div>; })}</div>}
            {legacyCount > 0 ? <p className="mt-3 border-t border-[var(--adm-border)] pt-3 text-[10px] text-[var(--adm-text-muted)]">{legacyCount} korábbi, submission nélküli review tétel csak feladatként nyitható meg; döntési gombot nem kap.</p> : null}
          </section>

          {selected?.source === "TASK_SUBMISSION" && selected.submissionId ? <TaskReviewWorkspace item={selected} onClose={() => setSelectedKey(null)} onQueueChanged={loadQueue} /> : null}
        </div>
      </div>
    </div>
  );
}
