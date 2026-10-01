"use client";

import { useCallback, useEffect, useId, useRef, useState } from "react";
import { AdminButton, CompactState, FormField, SafePanelError } from "@/components/ui";
import {
  clientSafeError,
  customerInteractionApi,
  type CustomerQuestionThreadDTO,
  type CustomerRequestDTO,
  type CustomerSubmissionDTO,
} from "@/lib/clientInteractionApi";
import { PortalQuestionThreadV3 } from "./PortalQuestionThreadV3";
import { PortalRequestResponseV3 } from "./PortalRequestResponseV3";

const INPUT_CLASS =
  "w-full rounded-[8px] border border-[var(--adm-border-canonical)] bg-[var(--adm-canvas-white)] px-3 py-2 text-sm text-[var(--adm-text-primary)] placeholder:text-[var(--adm-text-secondary)] focus:border-[var(--adm-brand-green)] focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--adm-brand-green)]";

/**
 * Client Portal 3.0 interaction card — the ORGANIZATION replacement of the
 * legacy CustomerInteractionCard. Same scopes (all / requests / questions),
 * same canonical API contracts, same write semantics. Customer-visible
 * content only: no unread counters, internal participants or mailbox
 * metadata.
 */
type InteractionCardProps = {
  caseId: string;
  allowAsk?: boolean;
  scope?: "all" | "requests" | "questions";
  matterPublicationId?: string;
  heading?: string;
};

export function PortalInteractionCardV3(props: InteractionCardProps) {
  // Drafts, cached lists and pending reads belong to one exact case and scope.
  return <InteractionCard key={`${props.caseId}:${props.scope ?? "all"}`} {...props} />;
}

function InteractionCard({
  caseId,
  allowAsk = true,
  scope = "all",
  matterPublicationId,
  heading,
}: InteractionCardProps) {
  const [requests, setRequests] = useState<CustomerRequestDTO[]>([]);
  const [questions, setQuestions] = useState<CustomerQuestionThreadDTO[]>([]);
  const [submissions, setSubmissions] = useState<CustomerSubmissionDTO[]>([]);
  const [answersByRequest, setAnswersByRequest] = useState<Record<string, Record<string, string>>>({});
  const [notesByRequest, setNotesByRequest] = useState<Record<string, string>>({});
  const [subject, setSubject] = useState("");
  const [body, setBody] = useState("");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [loadError, setLoadError] = useState({ requests: false, questions: false });
  const [loading, setLoading] = useState(true);
  const loadSequence = useRef(0);
  const sending = useRef(false);
  const subjectId = useId();
  const bodyId = useId();

  const load = useCallback(async () => {
    const sequence = ++loadSequence.current;
    setLoading(true);
    setLoadError({ requests: false, questions: false });
    const [requestResult, questionResult] = await Promise.allSettled([
      scope === "questions" ? Promise.resolve(null) : Promise.all([
        customerInteractionApi.listRequests(caseId),
        customerInteractionApi.listSubmissions(caseId),
      ]),
      scope === "requests" ? Promise.resolve(null) : customerInteractionApi.listQuestions(caseId),
    ]);
    if (sequence !== loadSequence.current) return;
    if (requestResult.status === "fulfilled" && requestResult.value) {
      setRequests(requestResult.value[0].items || []);
      setSubmissions(requestResult.value[1].items || []);
    }
    if (questionResult.status === "fulfilled" && questionResult.value) {
      setQuestions(questionResult.value.items || []);
    }
    setLoadError({ requests: requestResult.status === "rejected", questions: questionResult.status === "rejected" });
    setLoading(false);
  }, [caseId, scope]);

  useEffect(() => {
    void load();
    return () => { loadSequence.current += 1; };
  }, [load]);

  const sendQuestion = async () => {
    if (!allowAsk || sending.current || !subject.trim() || !body.trim()) return;
    sending.current = true;
    setBusy(true);
    setMessage(null);
    try {
      await customerInteractionApi.createQuestion(caseId, { subject, bodySafe: body });
      setSubject("");
      setBody("");
      setMessage("A kérdés beküldve. Az iroda válasza itt fog megjelenni.");
    } catch (error) {
      setMessage(clientSafeError(error));
      return;
    } finally {
      sending.current = false;
      setBusy(false);
    }
    // A failed refresh must not turn a confirmed POST into a failed send.
    await load();
  };

  const listState = (failed: boolean) => loading ? (
    <div role="status"><CompactState title="Betöltés…" /></div>
  ) : failed ? (
    <div role="status" className="[&_button]:min-h-10 [&_button]:min-w-10">
      <SafePanelError detail="Az interakciók jelenleg nem érhetők el. A lista újratöltése nem ismétli meg a beküldést." onRetry={() => void load()} />
    </div>
  ) : null;

  const questionList = (
    <div className="min-w-0 space-y-2" data-testid="portal-question-list" aria-busy={loading}>
      {listState(loadError.questions)}
      <div hidden={loading || loadError.questions} className="space-y-2">
      {questions.length ? (
        questions.map((thread) => <PortalQuestionThreadV3 key={thread.id} caseId={caseId} thread={thread} />)
      ) : !loading && !loadError.questions ? (
        <p className="text-sm text-[var(--adm-text-secondary)]">Még nincs kérdésszál.</p>
      ) : null}
      </div>
    </div>
  );

  const questionsPanel = allowAsk ? (
    <div className="space-y-3" data-testid="portal-questions-panel">
      <div className="min-w-0 rounded-[8px] border border-[var(--adm-border-canonical)] bg-[var(--adm-canvas-white)] p-3">
        <h3 className="text-sm font-semibold text-[var(--adm-text-primary)]">Kérdés küldése</h3>
        <FormField label="Tárgy" controlId={subjectId} required className="mt-3">
        <input
          id={subjectId}
          name="subject"
          required
          disabled={busy}
          value={subject}
          onChange={(event) => setSubject(event.target.value)}
          maxLength={200}
          className={`${INPUT_CLASS} min-h-10`}
          placeholder="Tárgy"
        />
        </FormField>
        <FormField label="Kérdés szövege" controlId={bodyId} required className="mt-3">
        <textarea
          id={bodyId}
          name="body"
          required
          disabled={busy}
          value={body}
          onChange={(event) => setBody(event.target.value)}
          maxLength={4000}
          className={`${INPUT_CLASS} min-h-28`}
          placeholder="Kérdés szövege"
        />
        </FormField>
        <AdminButton
          variant="primary"
          className="mt-3 min-h-10"
          disabled={busy || !subject.trim() || !body.trim()}
          onClick={() => void sendQuestion()}
          data-testid="portal-question-send"
        >
          {busy ? "Beküldés…" : "Kérdés beküldése"}
        </AdminButton>
      </div>
      {questionList}
    </div>
  ) : (
    <div className="space-y-2" data-testid="portal-questions-panel">
      {questionList}
    </div>
  );

  const requestsPanel = (
    <div className="min-w-0 space-y-3" data-testid="portal-requests-panel" aria-busy={loading}>
      {listState(loadError.requests)}
      {/* Keep response composers mounted across refreshes: selected files and
          partial-success submission references must survive a list retry. */}
      <div hidden={loading || loadError.requests} className="space-y-3">
      {requests.length ? (
        requests.map((request) => (
          <PortalRequestResponseV3
            key={request.id}
            caseId={caseId}
            request={request}
            submission={submissions.find((submission) => submission.requestId === request.id)}
            answers={answersByRequest[request.id] || {}}
            note={notesByRequest[request.id] || ""}
            onAnswer={(fieldId, value) =>
              setAnswersByRequest((current) => ({ ...current, [request.id]: { ...(current[request.id] || {}), [fieldId]: value } }))
            }
            onNote={(value) => setNotesByRequest((current) => ({ ...current, [request.id]: value }))}
            onReload={load}
            detailHref={
              matterPublicationId
                ? `/portal/matters/${encodeURIComponent(matterPublicationId)}/requests/${encodeURIComponent(request.id)}`
                : undefined
            }
          />
        ))
      ) : !loading && !loadError.requests ? (
        <p className="text-sm text-[var(--adm-text-secondary)]">Nincs aktív dokumentum- vagy adatbekérés.</p>
      ) : null}
      </div>
    </div>
  );

  const status = message ? (
    <p className="mb-3 rounded-[8px] border border-[var(--adm-border-canonical)] bg-[var(--adm-canvas-subtle)] p-3 text-sm text-[var(--adm-text-secondary)]" role="status">
      {message}
    </p>
  ) : null;

  if (scope === "requests") {
    return (
      <div data-testid="portal-interaction-card" data-scope="requests">
        {status}
        {requestsPanel}
      </div>
    );
  }

  if (scope === "questions") {
    return (
      <div data-testid="portal-interaction-card" data-scope="questions">
        <p className="mb-3 text-sm text-[var(--adm-text-secondary)]">Itt kérdezhet az irodától, és itt jelennek meg az iroda elküldött válaszai.</p>
        {status}
        {questionsPanel}
      </div>
    );
  }

  return (
    <div data-testid="portal-interaction-card" data-scope="all">
      <p className="mb-3 text-sm text-[var(--adm-text-secondary)]">Itt jelennek meg az ehhez az ügyhöz tartozó kérdések és az iroda válaszai.</p>
      {status}
      <div className="grid gap-4 lg:grid-cols-2">
        {requestsPanel}
        {questionsPanel}
      </div>
    </div>
  );
}
