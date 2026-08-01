"use client";

import { useState } from "react";
import { AdminBadge, AdminButton } from "@/components/adminiculum/ui";
import {
  isFileAcceptable,
  localizedInteractionStatus,
  workforceInteractionApi,
  type InternalInteractionRow,
  type InternalQuestionThreadDTO,
  type InternalSubmissionDTO,
} from "@/lib/clientInteractionApi";

type Feedback = { tone: "ok" | "err"; text: string } | null;

function errText(e: unknown): string {
  const msg = e instanceof Error ? e.message : "Ismeretlen hiba";
  return `Művelet sikertelen: ${msg.slice(0, 200)}`;
}

// --- Question: draft (hidden) then explicit send ------------------------------
function QuestionAction({ row, onDone }: { row: InternalInteractionRow; onDone: () => Promise<void> }) {
  const [open, setOpen] = useState(false);
  const [detail, setDetail] = useState<InternalQuestionThreadDTO | null>(null);
  const [draft, setDraft] = useState("");
  const [notify, setNotify] = useState(true);
  const [busy, setBusy] = useState(false);
  const [fb, setFb] = useState<Feedback>(null);

  const load = async () => setDetail(await workforceInteractionApi.getQuestion(row.id));
  const toggle = async () => {
    const next = !open;
    setOpen(next);
    if (next && !detail) {
      try { await load(); } catch (e) { setFb({ tone: "err", text: errText(e) }); }
    }
  };
  const run = async (fn: () => Promise<void>, ok: string) => {
    setBusy(true); setFb(null);
    try { await fn(); setFb({ tone: "ok", text: ok }); } catch (e) { setFb({ tone: "err", text: errText(e) }); } finally { setBusy(false); }
  };

  const draftMsg = detail?.messages.find((m) => m.authorType === "INTERNAL" && m.visibility === "DRAFT");
  const closed = detail?.thread.status === "CLOSED";

  return (
    <div className="rounded-lg bg-[var(--adm-bg,#faf8f3)] p-2 text-xs" data-testid="internal-question-row">
      <button className="flex w-full items-center justify-between gap-2 text-left" aria-expanded={open} onClick={toggle}>
        <span className="font-semibold text-[var(--adm-text)]">{row.subject || "Kérdés"}</span>
        <AdminBadge tone="neutral">{localizedInteractionStatus(row.status)}</AdminBadge>
      </button>
      {open ? (
        <div className="mt-2 space-y-2">
          {!detail ? <p className="text-[var(--adm-text-muted)]">Betöltés…</p> : null}
          {detail?.messages.map((m) => (
            <div key={m.id} className={`rounded p-2 ${m.authorType === "INTERNAL" ? "bg-[#f3ead2]" : "bg-white"}`}>
              <p className="font-semibold">
                {m.authorType === "INTERNAL" ? "Iroda" : "Ügyfél"}
                {m.authorType === "INTERNAL" && m.visibility === "DRAFT" ? " · piszkozat (az ügyfél nem látja)" : ""}
              </p>
              <p className="mt-1 whitespace-pre-wrap break-words">{m.bodySafe}</p>
            </div>
          ))}
          {!closed ? (
            <div className="space-y-2 border-t border-[var(--adm-border)] pt-2">
              <textarea value={draft} onChange={(e) => setDraft(e.target.value)} maxLength={4000} className="min-h-16 w-full rounded border border-[var(--adm-border)] p-2" placeholder="Válasz piszkozat" />
              <div className="flex flex-wrap items-center gap-2">
                <AdminButton size="sm" variant="neutral" disabled={busy || !draft.trim()} onClick={() => run(async () => { await workforceInteractionApi.draftAnswer(row.id, draft.trim()); setDraft(""); await load(); }, "Piszkozat mentve. Az ügyfél még nem látja.")}>Piszkozat mentése</AdminButton>
                <label className="flex items-center gap-1"><input type="checkbox" checked={notify} onChange={(e) => setNotify(e.target.checked)} />Értesítés</label>
                <AdminButton size="sm" variant="gold" disabled={busy || !draftMsg} onClick={() => run(async () => { await workforceInteractionApi.sendAnswer(row.id, draftMsg!.id, notify); await load(); await onDone(); }, "Válasz elküldve az ügyfélnek.")}>Válasz elküldése</AdminButton>
                <AdminButton size="sm" variant="muted" disabled={busy} onClick={() => run(async () => { await workforceInteractionApi.closeQuestion(row.id); await onDone(); }, "Kérdés lezárva.")}>Lezárás</AdminButton>
              </div>
            </div>
          ) : null}
          {fb ? <p className={fb.tone === "ok" ? "text-green-700" : "text-red-700"}>{fb.text}</p> : null}
        </div>
      ) : null}
    </div>
  );
}

// --- Submission: review files, accept CLEAN, request correction / reject ------
function SubmissionAction({ row, onDone }: { row: InternalInteractionRow; onDone: () => Promise<void> }) {
  const [open, setOpen] = useState(false);
  const [detail, setDetail] = useState<InternalSubmissionDTO | null>(null);
  const [docNames, setDocNames] = useState<Record<string, string>>({});
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);
  const [fb, setFb] = useState<Feedback>(null);

  const load = async () => setDetail(await workforceInteractionApi.getSubmission(row.id));
  const toggle = async () => {
    const next = !open;
    setOpen(next);
    if (next && !detail) {
      try { await load(); } catch (e) { setFb({ tone: "err", text: errText(e) }); }
    }
  };
  const run = async (fn: () => Promise<void>, ok: string) => {
    setBusy(true); setFb(null);
    try { await fn(); setFb({ tone: "ok", text: ok }); } catch (e) { setFb({ tone: "err", text: errText(e) }); } finally { setBusy(false); }
  };

  return (
    <div className="rounded-lg bg-[var(--adm-bg,#faf8f3)] p-2 text-xs" data-testid="internal-submission-row">
      <button className="flex w-full items-center justify-between gap-2 text-left" aria-expanded={open} onClick={toggle}>
        <span className="font-semibold text-[var(--adm-text)]">{row.clientSafeTitle || "Beküldés"}</span>
        <AdminBadge tone="neutral">{localizedInteractionStatus(row.status)}</AdminBadge>
      </button>
      {open ? (
        <div className="mt-2 space-y-2">
          {!detail ? <p className="text-[var(--adm-text-muted)]">Betöltés…</p> : null}
          {detail?.files.map((f) => {
            const acceptable = isFileAcceptable(f.status);
            return (
              <div key={f.id} className="rounded border border-[var(--adm-border)] bg-white p-2" data-testid="internal-file">
                <p className="font-semibold break-words">{f.originalFileNameSafe} {f.pageOrSideLabel ? `· ${f.pageOrSideLabel}` : ""}</p>
                <p className="mt-1 text-[var(--adm-text-muted)]">
                  {f.declaredMimeType || "?"}{f.detectedMimeType && f.detectedMimeType !== f.declaredMimeType ? ` (észlelt: ${f.detectedMimeType})` : ""} · ellenőrzés: {f.status}{f.scanCodeSafe ? ` (${f.scanCodeSafe})` : ""}
                </p>
                {f.checksum ? <p className="text-[var(--adm-text-muted)]">SHA-256: {f.checksum.slice(0, 16)}…</p> : null}
                {!acceptable ? <p className="mt-1 text-amber-700">A fájl nem emelhető az ügy iratai közé, amíg a biztonsági ellenőrzés nem fejeződött be sikeresen.</p> : null}
                <div className="mt-2 flex flex-wrap items-center gap-2">
                  <input value={docNames[f.id] || ""} onChange={(e) => setDocNames((c) => ({ ...c, [f.id]: e.target.value }))} className="rounded border border-[var(--adm-border)] px-2 py-1" placeholder="Dokumentum neve (opcionális)" />
                  <AdminButton size="sm" variant="gold" data-testid="accept-file-btn" disabled={busy || !acceptable} onClick={() => run(async () => { await workforceInteractionApi.acceptFile(row.id, f.id, { documentName: docNames[f.id] || undefined }); await load(); await onDone(); }, "A fájl bekerült az ügy iratai közé.")}>Elfogadás az ügybe</AdminButton>
                </div>
              </div>
            );
          })}
          {detail?.acceptedDocumentVersionId ? <p className="text-green-700">Elfogadott dokumentumverzió: {detail.acceptedDocumentVersionId.slice(0, 8)}…</p> : null}
          <div className="space-y-2 border-t border-[var(--adm-border)] pt-2">
            <input value={reason} onChange={(e) => setReason(e.target.value)} maxLength={1000} className="w-full rounded border border-[var(--adm-border)] px-2 py-1" placeholder="Indok (javításhoz / elutasításhoz)" />
            <div className="flex flex-wrap gap-2">
              <AdminButton size="sm" variant="neutral" disabled={busy || !reason.trim()} onClick={() => run(async () => { await workforceInteractionApi.requestCorrection(row.id, reason.trim()); setReason(""); await onDone(); }, "Javítási kérés elküldve.")}>Javítás kérése</AdminButton>
              <AdminButton size="sm" variant="muted" disabled={busy || !reason.trim()} onClick={() => run(async () => { await workforceInteractionApi.rejectSubmission(row.id, reason.trim()); setReason(""); await onDone(); }, "Beküldés elutasítva.")}>Elutasítás</AdminButton>
            </div>
          </div>
          {fb ? <p className={fb.tone === "ok" ? "text-green-700" : "text-red-700"}>{fb.text}</p> : null}
        </div>
      ) : null}
    </div>
  );
}

function NotificationRetry({ row, onDone }: { row: InternalInteractionRow; onDone: () => Promise<void> }) {
  const [busy, setBusy] = useState(false);
  const [fb, setFb] = useState<Feedback>(null);
  return (
    <div className="rounded-lg bg-[var(--adm-bg,#faf8f3)] p-2 text-xs" data-testid="internal-notification-row">
      <div className="flex items-center justify-between gap-2">
        <div className="min-w-0">
          <p className="font-semibold break-words">{row.subject || row.type || "Értesítés"}</p>
          <p className="text-[var(--adm-text-muted)]">{localizedInteractionStatus(row.status)}{row.attemptCount ? ` · próbálkozás: ${row.attemptCount}` : ""}{row.lastErrorCodeSafe ? ` · ${row.lastErrorCodeSafe}` : ""}</p>
        </div>
        <AdminButton size="sm" variant="neutral" data-testid="retry-notification-btn" disabled={busy} onClick={async () => {
          setBusy(true); setFb(null);
          try { await workforceInteractionApi.retryNotification(row.id); await onDone(); setFb({ tone: "ok", text: "Újraküldés megkísérelve." }); }
          catch (e) { setFb({ tone: "err", text: errText(e) }); } finally { setBusy(false); }
        }}>Újraküldés</AdminButton>
      </div>
      {fb ? <p className={`mt-1 ${fb.tone === "ok" ? "text-green-700" : "text-red-700"}`}>{fb.text}</p> : null}
    </div>
  );
}

export function ClientInteractionInternalActions({
  questions,
  submissions,
  notifications,
  onDone,
}: {
  questions: InternalInteractionRow[];
  submissions: InternalInteractionRow[];
  notifications: InternalInteractionRow[];
  onDone: () => Promise<void>;
}) {
  return (
    <div className="grid gap-3 lg:grid-cols-3" data-testid="internal-interaction-actions">
      <div>
        <h3 className="font-semibold text-[var(--adm-text)]">Kérdések megválaszolása</h3>
        <div className="mt-2 space-y-2">
          {questions.length ? questions.map((q) => <QuestionAction key={q.id} row={q} onDone={onDone} />) : <p className="text-xs text-[var(--adm-text-muted)]">Nincs megválaszolatlan kérdés.</p>}
        </div>
      </div>
      <div>
        <h3 className="font-semibold text-[var(--adm-text)]">Beküldések elbírálása</h3>
        <div className="mt-2 space-y-2">
          {submissions.length ? submissions.map((s) => <SubmissionAction key={s.id} row={s} onDone={onDone} />) : <p className="text-xs text-[var(--adm-text-muted)]">Nincs elbírálandó beküldés.</p>}
        </div>
      </div>
      <div>
        <h3 className="font-semibold text-[var(--adm-text)]">Sikertelen értesítések</h3>
        <div className="mt-2 space-y-2">
          {notifications.length ? notifications.map((n) => <NotificationRetry key={n.id} row={n} onDone={onDone} />) : <p className="text-xs text-[var(--adm-text-muted)]">Nincs újrapróbálható értesítés.</p>}
        </div>
      </div>
    </div>
  );
}
