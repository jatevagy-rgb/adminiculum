"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useSearchParams } from "next/navigation";
import { AuthenticatedApp } from "@/components/AuthenticatedApp";
import { CompactState } from "@/components/adminiculum/OperationalPrimitives";
import { AdminButton } from "@/components/adminiculum/ui";
import { TaskReviewWorkspace } from "@/components/tasks/TaskReviewWorkspace";
import { listTaskReviewQueue, type TaskReviewQueueItem } from "@/lib/taskLifecycleApi";
import { ClientAccent } from "@/components/clients/ClientAccent";
import { Badge, Button, PageHeader, QuietLink } from "@/components/ui";
import {
  ATTENTION_LABELS,
  URGENCY_LABELS,
  formatDate,
  formatDateTime,
  formatMinutes,
  reviewUrgency,
  sortReviewQueue,
  submissionStatusLabel,
  taskWorkflowErrorMessage,
  type ReviewUrgency,
} from "@/lib/taskWorkflowPresentation";

const ATTENTION_ORDER = ["QUICK_SCAN", "APPROVAL", "SIGNATURE", "EDITING", "DETAILED_REVIEW"] as const;

function urgencyTone(urgency: ReviewUrgency): "danger" | "warning" | "gold" | "neutral" {
  if (urgency === "CRITICAL") return "danger";
  if (urgency === "URGENT") return "warning";
  if (urgency === "SOON") return "gold";
  return "neutral";
}

function attentionTone(attention: string): "neutral" | "teal" {
  return attention === "APPROVAL" || attention === "DETAILED_REVIEW" ? "teal" : "neutral";
}

export default function ReviewsPage() {
  return (
    <AuthenticatedApp section="reviews">
      <ReviewsPageContent />
    </AuthenticatedApp>
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
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const keyFor = (item: TaskReviewQueueItem) => `${item.taskId}:${item.submissionId || "legacy"}`;

  const loadQueue = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    try {
      const items = await listTaskReviewQueue();
      setQueue(sortReviewQueue(items));
      if (deepLinkedTaskId) {
        const deepLinked = items.find((item) => item.taskId === deepLinkedTaskId && (!deepLinkedSubmissionId || item.submissionId === deepLinkedSubmissionId));
        if (deepLinked) setSelectedKey(keyFor(deepLinked));
      }
    } catch (loadError) {
      setError(taskWorkflowErrorMessage(loadError));
    } finally {
      setIsLoading(false);
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

  return (
    <div className="min-h-screen bg-white text-[#1F2937]">
      <main className="mx-auto flex w-full max-w-7xl flex-col gap-4 px-4 py-5 sm:px-6">
        <PageHeader
          title="Review"
          badge={<Badge tone="neutral">{activeSubmittedCount} beküldés</Badge>}
          subtitle="A figyelmi kategória és a határidő szerinti sürgősség külön jelzés."
          actions={<QuietLink href="/tasks">Feladatok</QuietLink>}
        />

        <section className="rounded-[12px] border border-[#E5E7E6] bg-white p-3">
          <div className="flex flex-wrap gap-2" aria-label="Review figyelmi kategóriák">
            <Button size="sm" variant={attentionFilter === "all" ? "primary" : "neutral"} aria-pressed={attentionFilter === "all"} onClick={() => setAttentionFilter("all")}>Összes <span className="ml-1 opacity-70">{activeSubmittedCount}</span></Button>
            {ATTENTION_ORDER.map((attention) => <Button key={attention} size="sm" variant={attentionFilter === attention ? "primary" : "neutral"} aria-pressed={attentionFilter === attention} onClick={() => setAttentionFilter(attention)}>{ATTENTION_LABELS[attention]} <span className="ml-1 opacity-60">{categoryCounts[attention]}</span></Button>)}
          </div>
          <div className="mt-3 grid gap-2 md:grid-cols-[minmax(240px,2fr)_minmax(170px,1fr)_minmax(170px,1fr)]">
            <input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Keresés ügy, ügyfél, feladat vagy beküldő szerint" aria-label="Review sor keresése" className="h-10 rounded-[8px] border border-[#E5E7E6] bg-white px-3 py-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#0F3D32]" />
            <select value={urgencyFilter} onChange={(event) => setUrgencyFilter(event.target.value as ReviewUrgency | "all")} aria-label="Sürgősség szűrő" className="h-10 rounded-[8px] border border-[#E5E7E6] bg-white px-3 py-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#0F3D32]"><option value="all">Minden sürgősség</option>{Object.entries(URGENCY_LABELS).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select>
            <select value={submitterFilter} onChange={(event) => setSubmitterFilter(event.target.value)} aria-label="Beküldő szűrő" className="h-10 rounded-[8px] border border-[#E5E7E6] bg-white px-3 py-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#0F3D32]"><option value="all">Minden beküldő</option>{submitters.map((submitter) => <option key={submitter} value={submitter}>{submitter}</option>)}</select>
          </div>
          <details className="mt-2 rounded-[8px] border border-[#E5E7E6] bg-[#F8FAF9] px-3 py-2"><summary className="cursor-pointer text-sm font-semibold text-[#1F2937]">További szűrők</summary><div className="mt-2 max-w-xs"><select value={priorityFilter} onChange={(event) => setPriorityFilter(event.target.value)} aria-label="Prioritás szűrő" className="h-10 w-full rounded-[8px] border border-[#E5E7E6] bg-white px-3 py-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#0F3D32]"><option value="all">Minden prioritás</option><option value="URGENT">Magas</option><option value="HIGH">Magas</option><option value="MEDIUM">Közepes</option><option value="LOW">Alacsony</option></select></div></details>
        </section>

        {error ? <div role="alert"><CompactState tone="error" title="A review sor nem tölthető be." detail={error} action={<AdminButton size="sm" variant="neutral" onClick={() => void loadQueue()}>Újratöltés</AdminButton>} /></div> : null}

        <div className={`grid min-h-0 gap-4 ${selected?.source === "TASK_SUBMISSION" ? "xl:grid-cols-[minmax(330px,0.72fr)_minmax(580px,1.35fr)]" : ""}`}>
          <section className="min-w-0 rounded-[12px] border border-[#E5E7E6] bg-white p-3" aria-labelledby="review-queue-title">
            <div className="flex items-center justify-between gap-3 border-b border-[#E5E7E6] pb-3"><div><h2 id="review-queue-title" className="text-base font-semibold text-[#1F2937]">Review sor</h2><p className="mt-1 text-xs text-[#6B7280]">Lejárt határidő, majd legkorábbi határidő és régebbi beküldés szerint.</p></div><span className="text-xs font-semibold text-[#6B7280]">{filtered.length} tétel</span></div>
            {isLoading ? <div className="mt-3"><CompactState title="Review tételek betöltése…" /></div> : filtered.length === 0 ? <div className="mt-3"><CompactState title={queue.length === 0 ? "Nincs review-ra váró beküldés." : "Nincs találat a szűrőkkel."} detail={queue.length === 0 ? "A review-ra beküldött munkák itt jelennek meg." : "Módosítsa a keresést vagy a szűrőket."} /></div> : <div className="mt-3 space-y-2">{filtered.map((item) => { const attention = item.requestedAttention || ""; const urgency = reviewUrgency(item); const active = keyFor(item) === selectedKey; const content = <><ClientAccent colorKey={item.case.clientColorKey} className="absolute inset-y-0 left-0 w-1" /><div className="flex flex-wrap items-center gap-1.5"><Badge tone={attentionTone(attention)}>{ATTENTION_LABELS[attention] || "Nincs review típus"}</Badge><Badge tone={urgencyTone(urgency)}>{URGENCY_LABELS[urgency]}</Badge></div><h3 className="mt-2 text-sm font-semibold text-[#1F2937]">{item.title}</h3><p className="mt-1 text-xs text-[#6B7280]">{item.case.caseNumber} · {item.case.clientName} · {item.case.matterType}</p><div className="mt-2 flex flex-wrap gap-x-3 gap-y-1 text-xs text-[#6B7280]"><span>Beküldő: {item.submittedBy?.displayName || "Nincs adat"}</span><span>{formatDateTime(item.submittedAt)}</span><span>{item.submissionDocumentCount || 0} dokumentum</span><span>{formatMinutes(item.linkedTimeMinutes)}</span></div>{item.workSummaryPreview ? <p className="mt-2 line-clamp-2 text-xs leading-4 text-[#6B7280]">{item.workSummaryPreview}</p> : null}</>; return item.source === "TASK_SUBMISSION" && item.submissionId ? <button key={keyFor(item)} type="button" onClick={() => setSelectedKey(keyFor(item))} className={`relative w-full rounded-[8px] border p-3 pl-4 text-left focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 ${active ? "border-[#0F3D32] bg-[#F8FAF9]" : "border-[#E5E7E6] bg-white hover:bg-[#F8FAF9]"}`}>{content}</button> : <div key={keyFor(item)} className="relative rounded-[8px] border border-dashed border-[#E5E7E6] bg-[#F8FAF9] p-3 pl-4">{content}<QuietLink href={`/tasks?taskId=${encodeURIComponent(item.taskId)}`} size="sm" className="mt-3">Korábbi feladat megnyitása</QuietLink></div>; })}</div>}
            {legacyCount > 0 ? <p className="mt-3 border-t border-[#E5E7E6] pt-3 text-xs text-[#6B7280]">{legacyCount} korábbi, beküldés nélküli korábbi review tétel csak feladatként nyitható meg; döntési gombot nem kap.</p> : null}
          </section>

          {selected?.source === "TASK_SUBMISSION" && selected.submissionId ? <TaskReviewWorkspace item={selected} onClose={() => setSelectedKey(null)} onQueueChanged={loadQueue} /> : null}
        </div>
      </main>
    </div>
  );
}
