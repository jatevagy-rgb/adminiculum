"use client";

import { useCallback, useEffect, useState } from "react";
import {
  clientSafeError,
  customerInteractionApi,
  type CustomerQuestionThreadDTO,
  type CustomerRequestDTO,
  type CustomerSubmissionDTO,
} from "@/lib/clientInteractionApi";
import { PortalQuestionThreadV3 } from "./PortalQuestionThreadV3";
import { PortalRequestResponseV3 } from "./PortalRequestResponseV3";
import { PortalEmptyInline } from "../shared/PortalEmptyInline";

const INPUT_CLASS =
  "w-full rounded-[8px] border border-[var(--adm-border-canonical)] bg-[var(--adm-canvas-white)] px-3 py-2 text-sm text-[var(--adm-text-primary)] placeholder:text-[var(--adm-text-secondary)] focus:border-[var(--adm-brand-green)] focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--adm-brand-green)]";

/**
 * Client Portal 3.0 interaction card — the ORGANIZATION replacement of the
 * legacy CustomerInteractionCard. Same scopes (all / requests / questions),
 * same canonical API contracts, same write semantics. Customer-visible
 * content only: no unread counters, internal participants or mailbox
 * metadata.
 */
export function PortalInteractionCardV3({
  caseId,
  allowAsk = true,
  scope = "all",
  matterPublicationId,
  heading,
}: {
  caseId: string;
  allowAsk?: boolean;
  scope?: "all" | "requests" | "questions";
  matterPublicationId?: string;
  heading?: string;
}) {
  const [requests, setRequests] = useState<CustomerRequestDTO[]>([]);
  const [questions, setQuestions] = useState<CustomerQuestionThreadDTO[]>([]);
  const [submissions, setSubmissions] = useState<CustomerSubmissionDTO[]>([]);
  const [answersByRequest, setAnswersByRequest] = useState<Record<string, Record<string, string>>>({});
  const [notesByRequest, setNotesByRequest] = useState<Record<string, string>>({});
  const [subject, setSubject] = useState("");
  const [body, setBody] = useState("");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [loadError, setLoadError] = useState(false);

  const load = useCallback(async () => {
    const [requestPage, questionPage, submissionPage] = await Promise.all([
      customerInteractionApi.listRequests(caseId),
      customerInteractionApi.listQuestions(caseId),
      customerInteractionApi.listSubmissions(caseId),
    ]);
    setRequests(requestPage.items || []);
    setQuestions(questionPage.items || []);
    setSubmissions(submissionPage.items || []);
  }, [caseId]);

  useEffect(() => {
    void load().catch(() => setLoadError(true));
  }, [load]);

  const sendQuestion = async () => {
    setBusy(true);
    setMessage(null);
    try {
      await customerInteractionApi.createQuestion(caseId, { subject, bodySafe: body });
      setSubject("");
      setBody("");
      setMessage("A kérdés beküldve. Az iroda válasza itt fog megjelenni.");
      await load();
    } catch (error) {
      setMessage(clientSafeError(error));
    } finally {
      setBusy(false);
    }
  };

  const questionsPanel = allowAsk ? (
    <div className="space-y-3" data-testid="portal-questions-panel">
      <div className="rounded-[8px] border border-[var(--adm-border-canonical)] bg-[var(--adm-canvas-white)] p-3">
        <h3 className="text-sm font-semibold text-[var(--adm-text-primary)]">Kérdés küldése</h3>
        <input
          value={subject}
          onChange={(event) => setSubject(event.target.value)}
          maxLength={200}
          className={`${INPUT_CLASS} mt-3`}
          placeholder="Tárgy"
        />
        <textarea
          value={body}
          onChange={(event) => setBody(event.target.value)}
          maxLength={4000}
          className={`${INPUT_CLASS} mt-2 min-h-28`}
          placeholder="Kérdés szövege"
        />
        <button
          className="mt-2 inline-flex h-10 items-center justify-center rounded-[8px] border border-[var(--adm-brand-green)] bg-[var(--adm-brand-green)] px-4 text-sm font-medium text-[var(--adm-canvas-white)] transition-colors hover:border-[var(--adm-brand-deep)] hover:bg-[var(--adm-brand-deep)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--adm-brand-green)] focus-visible:ring-offset-2 disabled:opacity-50"
          disabled={busy || !subject.trim() || !body.trim()}
          onClick={() => void sendQuestion()}
          data-testid="portal-question-send"
        >
          Kérdés beküldése
        </button>
      </div>
      <div className="space-y-2">
        {questions.length ? (
          questions.map((thread) => <PortalQuestionThreadV3 key={thread.id} caseId={caseId} thread={thread} />)
        ) : (
          <p className="text-sm text-[var(--adm-text-secondary)]">Még nincs kérdésszál.</p>
        )}
      </div>
    </div>
  ) : (
    <div className="space-y-2" data-testid="portal-questions-panel">
      {questions.length ? (
        questions.map((thread) => <PortalQuestionThreadV3 key={thread.id} caseId={caseId} thread={thread} />)
      ) : (
        <p className="text-sm text-[var(--adm-text-secondary)]">Még nincs kérdésszál.</p>
      )}
    </div>
  );

  const requestsPanel = (
    <div className="space-y-3" data-testid="portal-requests-panel">
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
      ) : (
        <p className="text-sm text-[var(--adm-text-secondary)]">Nincs aktív dokumentum- vagy adatbekérés.</p>
      )}
    </div>
  );

  const status = message ? (
    <p className="mb-3 rounded-[8px] border border-[var(--adm-border-canonical)] bg-[var(--adm-canvas-subtle)] p-3 text-sm text-[var(--adm-text-secondary)]" role="status">
      {message}
    </p>
  ) : null;

  const loadErrorNote = loadError ? (
    <p className="mb-3 rounded-[8px] border border-[var(--adm-brand-terracotta)]/30 bg-[var(--adm-brand-terracotta)]/10 p-3 text-sm text-[var(--adm-brand-terracotta)]" role="status">
      Az interakciók jelenleg nem érhetők el.
    </p>
  ) : null;

  if (scope === "requests") {
    return (
      <div data-testid="portal-interaction-card" data-scope="requests">
        {status}
        {loadErrorNote}
        {requestsPanel}
      </div>
    );
  }

  if (scope === "questions") {
    return (
      <div data-testid="portal-interaction-card" data-scope="questions">
        <p className="mb-3 text-sm text-[var(--adm-text-secondary)]">Itt kérdezhet az irodától, és itt jelennek meg az iroda elküldött válaszai.</p>
        {status}
        {loadErrorNote}
        {questionsPanel}
      </div>
    );
  }

  return (
    <div data-testid="portal-interaction-card" data-scope="all">
      <p className="mb-3 text-sm text-[var(--adm-text-secondary)]">Itt jelennek meg az ehhez az ügyhöz tartozó kérdések és az iroda válaszai.</p>
      {status}
      {loadErrorNote}
      <div className="grid gap-4 lg:grid-cols-2">
        {requestsPanel}
        {questionsPanel}
      </div>
    </div>
  );
}
