"use client";

import { useEffect, useId, useRef, useState } from "react";
import { AdminButton, CompactState, SafePanelError } from "@/components/ui";
import {
  clientSafeError,
  customerInteractionApi,
  localizedInteractionStatus,
  type CustomerQuestionThreadDTO,
} from "@/lib/clientInteractionApi";

function formatDate(value?: string | null): string {
  if (!value) return "Nincs megadva";
  return new Intl.DateTimeFormat("hu-HU", { year: "numeric", month: "short", day: "numeric" }).format(new Date(value));
}

/**
 * Client Portal 3.0 question thread row — the ORGANIZATION replacement of the
 * legacy QuestionThreadRow. Read-only thread viewer: customer-visible messages
 * only, chronological backend order, sender labels ('Ön' / 'Ügyvédi iroda').
 * No unread counters, no internal participants, no mailbox metadata.
 */
type QuestionThreadProps = {
  caseId: string;
  thread: CustomerQuestionThreadDTO;
};

export function PortalQuestionThreadV3(props: QuestionThreadProps) {
  return <QuestionThread key={`${props.caseId}:${props.thread.id}`} {...props} />;
}

function QuestionThread({ caseId, thread }: QuestionThreadProps) {
  const [open, setOpen] = useState(false);
  const [detail, setDetail] = useState<CustomerQuestionThreadDTO | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const inFlight = useRef(false);
  const sequence = useRef(0);
  const panelId = useId();
  const triggerId = useId();

  useEffect(() => () => { sequence.current += 1; }, []);

  const load = async () => {
    if (inFlight.current) return;
    inFlight.current = true;
    const current = ++sequence.current;
    setLoading(true);
    setError(null);
    setDetail(null);
    try {
      const result = await customerInteractionApi.getThread(caseId, thread.id);
      if (current === sequence.current) setDetail(result);
    } catch (err) {
      if (current === sequence.current) setError(clientSafeError(err));
    } finally {
      if (current === sequence.current) {
        inFlight.current = false;
        setLoading(false);
      }
    }
  };

  const toggle = () => {
    setOpen(!open);
    if (!open) void load();
  };

  const messages = detail?.messages || [];

  return (
    <div
      className="min-w-0 rounded-[8px] border border-[var(--adm-border-canonical)] bg-[var(--adm-canvas-subtle)] p-3 text-sm"
      data-testid="portal-question-thread"
    >
      <AdminButton
        variant="ghost"
        id={triggerId}
        type="button"
        className="min-h-10 w-full !justify-between gap-2 !px-0 text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--adm-brand-green)]"
        aria-expanded={open}
        aria-controls={panelId}
        onClick={toggle}
      >
        <span className="min-w-0 break-words font-medium leading-5 text-[var(--adm-text-primary)]">{thread.subject}</span>
        <span className="shrink-0 text-xs text-[var(--adm-text-secondary)]">{localizedInteractionStatus(detail?.status ?? thread.status)}</span>
      </AdminButton>
        <div id={panelId} hidden={!open} aria-labelledby={triggerId} aria-busy={loading} className="mt-3 min-w-0 space-y-2">
          {error ? <div role="status" className="[&_button]:min-h-10 [&_button]:min-w-10"><SafePanelError detail={error} onRetry={() => void load()} /></div> : null}
          {loading ? <div role="status"><CompactState title="Betöltés…" /></div> : null}
          {messages.length
            ? messages.map((msg) => (
                <div
                  key={msg.id}
                  className={`rounded-[8px] px-3 py-2 ${
                    msg.authorType === "INTERNAL"
                      ? "border border-[var(--adm-border-canonical)] bg-[var(--adm-canvas-white)] text-[var(--adm-text-primary)]"
                      : "bg-[var(--adm-canvas-white)] text-[var(--adm-text-primary)]"
                  }`}
                >
                  <p className="text-[11px] font-semibold uppercase tracking-wide text-[var(--adm-text-secondary)]">
                    {msg.authorType === "INTERNAL" ? "Ügyvédi iroda" : "Ön"} · {formatDate(msg.sentAt)}
                  </p>
                  <p className="mt-1 whitespace-pre-wrap break-words">{msg.body}</p>
                </div>
              ))
            : !error && detail ? (
                <p className="text-[var(--adm-text-secondary)]">Erre a kérdésre még nem érkezett elküldött válasz.</p>
              ) : null}
        </div>
    </div>
  );
}
