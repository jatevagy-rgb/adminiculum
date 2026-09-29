"use client";

import { useState } from "react";
import type {
  CustomerIntake,
  CustomerIntakeAttachment,
  CustomerIntakeInformationRequest,
} from "@/lib/clientIntakeApi";
import { attachmentStateLabel, INTAKE_URGENCIES } from "@/lib/clientIntakeShared";

export function formatIntakeDate(value: string | null | undefined): string | null {
  if (!value) return null;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  return new Intl.DateTimeFormat("hu-HU", { year: "numeric", month: "2-digit", day: "2-digit" }).format(date);
}

export function intakeStatusStyle(code: string): { bg: string; text: string; border: string } {
  const normalized = code.toLowerCase().replace(/_/g, "-");
  switch (normalized) {
    case "draft":
      return {
        bg: "bg-[var(--adm-canvas-subtle)]",
        text: "text-[var(--adm-text-secondary)]",
        border: "border-[var(--adm-border-canonical)]",
      };
    case "submitted":
      return {
        bg: "bg-[var(--adm-canvas-subtle)]",
        text: "text-[var(--adm-text-primary)]",
        border: "border-[var(--adm-border-canonical)]",
      };
    case "triage-in-progress":
      return {
        bg: "bg-[var(--adm-brand-green)]/10",
        text: "text-[var(--adm-brand-green)]",
        border: "border-[var(--adm-brand-green)]/30",
      };
    case "more-information-required":
      return {
        bg: "bg-[var(--adm-brand-terracotta)]/10",
        text: "text-[var(--adm-brand-terracotta)]",
        border: "border-[var(--adm-brand-terracotta)]/30",
      };
    case "linked":
    case "converted":
    case "linked-to-existing-case":
    case "converted-to-case":
      return {
        bg: "bg-[var(--adm-brand-green)]/10",
        text: "text-[var(--adm-brand-green)]",
        border: "border-[var(--adm-brand-green)]/30",
      };
    case "declined":
    case "withdrawn":
    case "closed":
    default:
      return {
        bg: "bg-[var(--adm-canvas-subtle)]",
        text: "text-[var(--adm-text-secondary)]",
        border: "border-[var(--adm-border-canonical)]",
      };
  }
}

export function PortalIntakeStatusBadge({
  status,
}: {
  status: { code: string; label: string };
}) {
  const style = intakeStatusStyle(status.code);
  return (
    <span
      data-testid="portal-intake-status-badge"
      data-status-code={status.code}
      className={`inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-semibold ${style.bg} ${style.text} ${style.border}`}
    >
      {status.label}
    </span>
  );
}

export function PortalIntakeAttachments({
  attachments,
}: {
  attachments: CustomerIntakeAttachment[];
}) {
  if (!attachments.length) return null;

  return (
    <section
      data-testid="portal-intake-attachments"
      className="rounded-[8px] border border-[var(--adm-border-canonical)] bg-[var(--adm-canvas-white)] p-5"
    >
      <div className="flex items-baseline justify-between border-b border-[var(--adm-border-canonical)] pb-3">
        <h2 className="font-serif text-lg font-semibold text-[var(--adm-text-primary)]">
          Csatolmányok
        </h2>
        <span className="text-xs text-[var(--adm-text-secondary)]">
          {attachments.length} fájl
        </span>
      </div>
      <ul className="mt-4 divide-y divide-[var(--adm-border-canonical)]">
        {attachments.map((att) => (
          <li
            key={att.reference}
            data-testid="portal-intake-attachment-row"
            className="flex flex-wrap items-center justify-between gap-3 py-3 first:pt-0 last:pb-0 text-sm"
          >
            <div className="min-w-0">
              <p className="truncate font-medium text-[var(--adm-text-primary)]">
                {att.fileName}
              </p>
              {att.uploadedAt ? (
                <p className="mt-0.5 text-xs text-[var(--adm-text-secondary)]">
                  Feltöltve: {formatIntakeDate(att.uploadedAt)}
                </p>
              ) : null}
            </div>
            <span className="inline-flex rounded-full border border-[var(--adm-border-canonical)] bg-[var(--adm-canvas-subtle)] px-2.5 py-0.5 text-xs text-[var(--adm-text-secondary)]">
              {attachmentStateLabel(att.state)}
            </span>
          </li>
        ))}
      </ul>
      <p className="mt-3 text-xs text-[var(--adm-text-secondary)]">
        A fájlok csak sikeres biztonsági ellenőrzést követően kerülhetnek felhasználásra az ügyben.
      </p>
    </section>
  );
}

export function PortalIntakeInfoRequest({
  infoRequest,
  busy,
  onRespond,
}: {
  infoRequest: CustomerIntakeInformationRequest;
  busy: boolean;
  onRespond: (answers: Array<{ label: string; value: string }>) => Promise<void>;
}) {
  const [answers, setAnswers] = useState<Record<string, string>>({});
  const [localError, setLocalError] = useState<string | null>(null);

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    setLocalError(null);

    const missingRequired = infoRequest.fields.filter(
      (field) => field.required && !(answers[field.reference] || "").trim()
    );
    if (missingRequired.length > 0) {
      setLocalError(`Kérjük, töltse ki a kötelező mezőt: ${missingRequired[0].label}`);
      return;
    }

    const payloadAnswers = infoRequest.fields
      .map((field) => ({
        label: field.label,
        value: (answers[field.reference] || "").trim(),
      }))
      .filter((item) => item.value.length > 0);

    await onRespond(payloadAnswers);
  };

  return (
    <section
      data-testid="portal-intake-info-request"
      className="rounded-[8px] border border-[var(--adm-brand-terracotta)]/40 bg-[var(--adm-canvas-white)] p-5"
    >
      <div className="border-b border-[var(--adm-border-canonical)] pb-3">
        <span className="inline-flex items-center rounded-full border border-[var(--adm-brand-terracotta)]/30 bg-[var(--adm-brand-terracotta)]/10 px-2.5 py-0.5 text-xs font-semibold text-[var(--adm-brand-terracotta)]">
          Válaszát várjuk
        </span>
        <h2 className="mt-2 font-serif text-lg font-semibold text-[var(--adm-text-primary)]">
          {infoRequest.title}
        </h2>
        {infoRequest.instructions ? (
          <p className="mt-1 text-sm text-[var(--adm-text-secondary)]">
            {infoRequest.instructions}
          </p>
        ) : null}
      </div>

      <form onSubmit={handleSubmit} className="mt-4 space-y-4">
        {infoRequest.fields.map((field) => (
          <label key={field.reference} className="block text-sm">
            <span className="font-medium text-[var(--adm-text-primary)]">
              {field.label}
              {field.required ? " *" : ""}
            </span>
            {field.helpText ? (
              <span className="mt-0.5 block text-xs text-[var(--adm-text-secondary)]">
                {field.helpText}
              </span>
            ) : null}
            <input
              type="text"
              value={answers[field.reference] || ""}
              onChange={(e) =>
                setAnswers((prev) => ({ ...prev, [field.reference]: e.target.value }))
              }
              maxLength={field.maxLength || 2000}
              disabled={busy}
              className="mt-1.5 h-10 w-full rounded-[8px] border border-[var(--adm-border-canonical)] bg-[var(--adm-canvas-white)] px-3 text-sm text-[var(--adm-text-primary)] placeholder:text-[var(--adm-text-secondary)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--adm-brand-green)] disabled:opacity-50"
            />
          </label>
        ))}

        {localError ? (
          <p role="alert" className="text-xs font-medium text-[var(--adm-brand-terracotta)]">
            {localError}
          </p>
        ) : null}

        <button
          type="submit"
          disabled={busy}
          data-testid="portal-intake-respond-btn"
          className="inline-flex h-10 items-center justify-center rounded-[8px] border border-[var(--adm-brand-green)] bg-[var(--adm-brand-green)] px-4 text-sm font-medium text-[var(--adm-canvas-white)] transition-colors hover:border-[var(--adm-brand-deep)] hover:bg-[var(--adm-brand-deep)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--adm-brand-green)] focus-visible:ring-offset-2 disabled:opacity-50 motion-reduce:transition-none"
        >
          {busy ? "Küldés folyamatban…" : "Válasz beküldése"}
        </button>
      </form>
    </section>
  );
}

export function PortalIntakeDraftEditor({
  intake,
  busy,
  onSave,
}: {
  intake: CustomerIntake;
  busy: boolean;
  onSave: (payload: {
    subject: string;
    description: string;
    urgency?: string;
    requestedDeadline?: string | null;
  }) => Promise<void>;
}) {
  const [subject, setSubject] = useState(intake.subject);
  const [description, setDescription] = useState(intake.description);
  const [urgency, setUrgency] = useState(intake.urgency || "NORMAL");
  const [deadline, setDeadline] = useState(intake.requestedDeadline || "");

  const dirty =
    subject !== intake.subject ||
    description !== intake.description ||
    urgency !== (intake.urgency || "NORMAL") ||
    deadline !== (intake.requestedDeadline || "");

  const canSave = subject.trim().length > 0 && description.trim().length > 0 && dirty && !busy;

  const handleSave = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!canSave) return;
    await onSave({
      subject: subject.trim(),
      description: description.trim(),
      urgency,
      requestedDeadline: deadline || null,
    });
  };

  return (
    <section
      data-testid="portal-intake-draft-editor"
      className="rounded-[8px] border border-[var(--adm-border-canonical)] bg-[var(--adm-canvas-white)] p-5"
    >
      <div className="border-b border-[var(--adm-border-canonical)] pb-3">
        <h2 className="font-serif text-lg font-semibold text-[var(--adm-text-primary)]">
          Piszkozat szerkesztése
        </h2>
        <p className="mt-1 text-sm text-[var(--adm-text-secondary)]">
          A megkeresés piszkozat állapotban van, a beküldés előtt módosítható.
        </p>
      </div>

      <form onSubmit={handleSave} className="mt-4 space-y-4">
        <label className="block text-sm">
          <span className="font-medium text-[var(--adm-text-primary)]">Tárgy *</span>
          <input
            type="text"
            value={subject}
            onChange={(e) => setSubject(e.target.value)}
            maxLength={240}
            disabled={busy}
            className="mt-1.5 h-10 w-full rounded-[8px] border border-[var(--adm-border-canonical)] bg-[var(--adm-canvas-white)] px-3 text-sm text-[var(--adm-text-primary)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--adm-brand-green)] disabled:opacity-50"
          />
        </label>

        <label className="block text-sm">
          <span className="font-medium text-[var(--adm-text-primary)]">Leírás *</span>
          <textarea
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            maxLength={6000}
            rows={5}
            disabled={busy}
            className="mt-1.5 w-full rounded-[8px] border border-[var(--adm-border-canonical)] bg-[var(--adm-canvas-white)] p-3 text-sm text-[var(--adm-text-primary)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--adm-brand-green)] disabled:opacity-50"
          />
        </label>

        <div className="grid gap-4 sm:grid-cols-2">
          <label className="block text-sm">
            <span className="font-medium text-[var(--adm-text-primary)]">Sürgősség</span>
            <select
              value={urgency}
              onChange={(e) => setUrgency(e.target.value)}
              disabled={busy}
              className="mt-1.5 h-10 w-full rounded-[8px] border border-[var(--adm-border-canonical)] bg-[var(--adm-canvas-white)] px-3 text-sm text-[var(--adm-text-primary)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--adm-brand-green)] disabled:opacity-50"
            >
              {INTAKE_URGENCIES.map((u) => (
                <option key={u.value} value={u.value}>
                  {u.label}
                </option>
              ))}
            </select>
          </label>

          <label className="block text-sm">
            <span className="font-medium text-[var(--adm-text-primary)]">Kért határidő</span>
            <input
              type="date"
              value={deadline}
              onChange={(e) => setDeadline(e.target.value)}
              disabled={busy}
              className="mt-1.5 h-10 w-full rounded-[8px] border border-[var(--adm-border-canonical)] bg-[var(--adm-canvas-white)] px-3 text-sm text-[var(--adm-text-primary)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--adm-brand-green)] disabled:opacity-50"
            />
          </label>
        </div>

        <button
          type="submit"
          disabled={!canSave}
          data-testid="portal-intake-save-draft-btn"
          className="inline-flex h-10 items-center justify-center rounded-[8px] border border-[var(--adm-brand-green)] bg-[var(--adm-brand-green)] px-4 text-sm font-medium text-[var(--adm-canvas-white)] transition-colors hover:border-[var(--adm-brand-deep)] hover:bg-[var(--adm-brand-deep)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--adm-brand-green)] focus-visible:ring-offset-2 disabled:opacity-50 motion-reduce:transition-none"
        >
          {busy ? "Mentés folyamatban…" : "Módosítások mentése"}
        </button>
      </form>
    </section>
  );
}
