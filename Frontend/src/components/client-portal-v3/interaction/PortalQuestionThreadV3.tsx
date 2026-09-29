"use client";

import { useState } from "react";
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
export function PortalQuestionThreadV3({
  caseId,
  thread,
}: {
  caseId: string;
  thread: CustomerQuestionThreadDTO;
}) {
  const [open, setOpen] = useState(false);
  const [detail, setDetail] = useState<CustomerQuestionThreadDTO | null>(null);
  const [error, setError] = useState<string | null>(null);

  const toggle = async () => {
    const next = !open;
    setOpen(next);
    if (next && !detail) {
      try {
        setDetail(await customerInteractionApi.getThread(caseId, thread.id));
      } catch (err) {
        setError(clientSafeError(err));
      }
    }
  };

  const messages = detail?.messages || [];

  return (
    <div
      className="rounded-[8px] border border-[var(--adm-border-canonical)] bg-[var(--adm-canvas-subtle)] p-3 text-sm"
      data-testid="portal-question-thread"
    >
      <button
        type="button"
        className="flex w-full items-center justify-between gap-2 text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--adm-brand-green)]"
        aria-expanded={open}
        onClick={() => void toggle()}
      >
        <span className="font-medium text-[var(--adm-text-primary)]">{thread.subject}</span>
        <span className="text-xs text-[var(--adm-text-secondary)]">{localizedInteractionStatus(thread.status)}</span>
      </button>
      {open ? (
        <div className="mt-3 space-y-2">
          {error ? <p className="text-[var(--adm-text-secondary)]">{error}</p> : null}
          {!error && !detail ? <p className="text-[var(--adm-text-secondary)]">Betöltés…</p> : null}
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
                  <p className="mt-1 break-words">{msg.body}</p>
                </div>
              ))
            : !error && detail ? (
                <p className="text-[var(--adm-text-secondary)]">Erre a kérdésre még nem érkezett elküldött válasz.</p>
              ) : null}
        </div>
      ) : null}
    </div>
  );
}
