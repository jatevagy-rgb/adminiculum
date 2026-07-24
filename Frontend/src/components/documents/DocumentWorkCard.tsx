"use client";

/**
 * Operational document work card (DOCUMENT-WORK-CONTEXT-1 frontend).
 *
 * A filename is not a work instruction. The card leads with the human title and
 * what must be done, and keeps technical values (original filename, category,
 * MIME-ish type, version internals) in a secondary expandable area so they never
 * dominate. Storage identifiers are absent from the contract entirely.
 */
import { useCallback, useEffect, useState } from "react";
import {
  getDocumentWorkContext, updateDocumentWorkContext,
  linkDocumentToTask, unlinkDocumentFromTask,
  DOCUMENT_WORK_STATUS_LABELS, DOCUMENT_WORK_STATUS_ORDER,
  type DocumentWorkCard as WorkCard, type CaseWorkspace,
} from "@/lib/api";
import { AdminButton } from "@/components/adminiculum/ui";
import { ACCENT, type Accent } from "@/components/cases/CaseCockpitPanels";

/** Status → accent, so a colour carries one consistent meaning across the app. */
export function statusAccent(status: string): Accent {
  switch (status) {
    case "CHANGES_REQUESTED": return "terracotta";
    case "INTERNAL_REVIEW": return "navy";
    case "IN_PROGRESS": case "WAITING_FOR_PROCESSING": return "ochre";
    case "APPROVED": case "READY_FOR_CLIENT": case "SENT": return "green";
    case "ARCHIVED": return "neutral";
    default: return "petrol";
  }
}
export const statusLabel = (s: string) => DOCUMENT_WORK_STATUS_LABELS[s] || s;

function fmtDate(v?: string | null): string {
  if (!v) return "—";
  const d = new Date(v);
  return Number.isNaN(d.getTime()) ? "—" : d.toLocaleDateString("hu-HU");
}

export function DocumentWorkStatusBadge({ status }: { status: string }) {
  const a = ACCENT[statusAccent(status)];
  return (
    <span data-testid="doc-work-status" className={`rounded px-1.5 py-0.5 text-[9.5px] font-bold uppercase tracking-wide ${a.soft} ${a.text}`}>
      {statusLabel(status)}
    </span>
  );
}

/**
 * The work card. `onOpen`, `onReview` and `onNewVersion` are supplied by the host
 * surface so the card itself owns no navigation policy.
 */
export function DocumentWorkCard({
  documentId, caseTasks, onOpen, onNewVersion, onReview, onChanged, compact,
}: {
  documentId: string;
  caseTasks?: CaseWorkspace["tasks"];
  onOpen?: () => void;
  onNewVersion?: () => void;
  onReview?: () => void;
  onChanged?: () => void;
  compact?: boolean;
}) {
  const [card, setCard] = useState<WorkCard | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [editing, setEditing] = useState(false);
  const [showTechnical, setShowTechnical] = useState(false);
  const [linking, setLinking] = useState(false);

  const load = useCallback(async () => {
    setLoading(true); setError(null);
    try { setCard(await getDocumentWorkContext(documentId)); }
    catch { setError("A dokumentum munkakontextusa nem tölthető be."); }
    finally { setLoading(false); }
  }, [documentId]);

  useEffect(() => { void load(); }, [load]);

  const afterChange = useCallback((next: WorkCard) => {
    setCard(next);
    onChanged?.();
  }, [onChanged]);

  if (loading) {
    return <div data-testid="doc-card-loading" className="px-3 py-3 text-[12px] text-[var(--adm-text-muted)]">Munkakontextus betöltése…</div>;
  }
  if (error || !card) {
    return (
      <div role="alert" data-testid="doc-card-error" className="flex items-center justify-between gap-2 px-3 py-3">
        <span className="text-[12px] text-[var(--adm-terracotta-700)]">{error}</span>
        <AdminButton variant="neutral" size="xs" onClick={() => void load()}>Újratöltés</AdminButton>
      </div>
    );
  }

  const a = ACCENT[statusAccent(card.workStatus)];

  return (
    <article data-testid="document-work-card" className="overflow-hidden rounded-lg bg-white shadow-[0_1px_2px_rgba(22,32,26,0.06)]">
      <div className={`border-l-4 ${a.bar.replace("bg-", "border-")} px-3 py-2.5`}>
        {/* Human title leads; the original filename is secondary metadata. */}
        <div className="flex flex-wrap items-start justify-between gap-2">
          <div className="min-w-0">
            <h4 data-testid="doc-card-title" className="truncate font-serif text-[15px] font-semibold text-[var(--adm-text)]">{card.title}</h4>
            <p data-testid="doc-card-filename" className="mt-0.5 truncate text-[10.5px] text-[var(--adm-text-muted)]">
              {card.fileName || "Nincs eredeti fájlnév"}
              {card.currentVersion ? ` · v${card.currentVersion}` : ""}
              {card.documentRole ? ` · ${card.documentRole}` : ""}
            </p>
          </div>
          <DocumentWorkStatusBadge status={card.workStatus} />
        </div>

        {/* The work instruction is the point of the card. */}
        <div data-testid="doc-card-instruction" className={`mt-2 rounded-md px-2.5 py-1.5 ${a.soft}`}>
          <p className="text-[9.5px] font-bold uppercase tracking-[0.12em] text-[var(--adm-text-muted)]">Munkautasítás</p>
          <p className={`mt-0.5 whitespace-pre-line text-[12.5px] leading-5 ${card.workInstruction ? "text-[var(--adm-text)]" : "text-[var(--adm-text-muted)]"}`}>
            {card.workInstruction || "Nincs rögzített munkautasítás."}
          </p>
          {card.workInstructionUpdatedBy ? (
            <p className="mt-1 text-[10px] text-[var(--adm-text-muted)]">
              {card.workInstructionUpdatedBy.name} · {fmtDate(card.workInstructionUpdatedAt)}
            </p>
          ) : null}
        </div>

        {!compact ? (
          <dl className="mt-2 grid grid-cols-2 gap-x-4 gap-y-1 sm:grid-cols-4">
            <Field label="Felelős" value={card.responsible?.name || "Nincs"} testid="doc-card-owner" />
            <Field label="Review" value={card.reviewer?.name || "Nincs"} testid="doc-card-reviewer" />
            <Field label="Határidő" value={fmtDate(card.dueDate)} testid="doc-card-due" />
            <Field label="Következő lépés" value={card.nextStep || "Nincs"} testid="doc-card-next-step" />
          </dl>
        ) : null}

        {/* Linked tasks — the document half of the two-way relationship. */}
        <div data-testid="doc-card-tasks" className="mt-2">
          <p className="text-[9.5px] font-bold uppercase tracking-[0.12em] text-[var(--adm-text-muted)]">Kapcsolt feladat</p>
          {card.linkedTasks.length === 0 ? (
            <p className="mt-0.5 text-[11.5px] text-[var(--adm-text-muted)]">Nincs kapcsolt feladat.</p>
          ) : (
            <ul className="mt-0.5 space-y-1">
              {card.linkedTasks.map((t) => (
                <li key={t.linkId} className="flex flex-wrap items-center justify-between gap-2">
                  <span className="min-w-0 truncate text-[11.5px] text-[var(--adm-text)]">
                    {t.title} <span className="text-[var(--adm-text-muted)]">· {t.status}{t.assignee ? ` · ${t.assignee.name}` : ""}</span>
                  </span>
                  <button
                    type="button"
                    data-testid="doc-card-unlink"
                    disabled={linking}
                    onClick={async () => {
                      if (!window.confirm(`Biztosan leválasztod a(z) "${t.title}" feladatot?`)) return;
                      setLinking(true);
                      try { afterChange(await unlinkDocumentFromTask(documentId, t.taskId)); }
                      catch { setError("A leválasztás nem sikerült."); }
                      finally { setLinking(false); }
                    }}
                    className="shrink-0 text-[10.5px] font-semibold text-[var(--adm-terracotta-700)] hover:underline disabled:opacity-50"
                  >
                    Leválasztás
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>

        {card.source ? (
          <p data-testid="doc-card-source" className="mt-2 text-[10.5px] text-[var(--adm-text-muted)]">
            Forrás: {card.source.subject || "kommunikáció"}{card.source.sender ? ` · ${card.source.sender}` : ""}
          </p>
        ) : null}

        {/* Primary actions */}
        <div className="mt-2.5 flex flex-wrap gap-2">
          {onOpen ? <AdminButton variant="primary" size="xs" onClick={onOpen}>Megnyitás</AdminButton> : null}
          <AdminButton variant="neutral" size="xs" onClick={() => setLinking((v) => !v)}>Feladat</AdminButton>
          {onReview ? <AdminButton variant="neutral" size="xs" onClick={onReview}>Review</AdminButton> : null}
          {onNewVersion ? <AdminButton variant="neutral" size="xs" onClick={onNewVersion}>Új verzió</AdminButton> : null}
          <AdminButton variant="neutral" size="xs" onClick={() => setEditing(true)}>Munkakontextus</AdminButton>
        </div>

        {/* Link an existing case task */}
        {linking && caseTasks && caseTasks.length > 0 ? (
          <div data-testid="doc-card-link-picker" className="mt-2 rounded-md border border-[var(--adm-border)] p-2">
            <p className="text-[10px] font-bold uppercase tracking-[0.1em] text-[var(--adm-text-muted)]">Feladathoz kapcsolás</p>
            <ul className="mt-1 space-y-1">
              {caseTasks
                .filter((t) => !card.linkedTasks.some((l) => l.taskId === t.id))
                .map((t) => (
                  <li key={t.id}>
                    <button
                      type="button"
                      onClick={async () => {
                        setError(null);
                        try { afterChange(await linkDocumentToTask(documentId, t.id)); setLinking(false); }
                        catch (e) {
                          // A duplicate link is refused by the server with 409.
                          setError(e instanceof Error && /409|already/i.test(e.message)
                            ? "Ez a dokumentum már kapcsolva van ehhez a feladathoz."
                            : "A kapcsolás nem sikerült.");
                        }
                      }}
                      className="w-full truncate rounded px-1.5 py-1 text-left text-[11.5px] text-[var(--adm-text)] hover:bg-[var(--adm-ivory-100)]"
                    >
                      {t.title}
                    </button>
                  </li>
                ))}
            </ul>
          </div>
        ) : null}

        {/* Technical values stay secondary and collapsed. */}
        <button
          type="button"
          data-testid="doc-card-technical-toggle"
          onClick={() => setShowTechnical((v) => !v)}
          className="mt-2 text-[10.5px] font-semibold text-[var(--adm-text-muted)] hover:underline"
        >
          {showTechnical ? "Technikai részletek elrejtése" : "Technikai részletek"}
        </button>
        {showTechnical ? (
          <dl data-testid="doc-card-technical" className="mt-1 grid grid-cols-2 gap-x-4 gap-y-0.5 text-[10.5px] text-[var(--adm-text-muted)]">
            <Field label="Eredeti fájlnév" value={card.fileName || "—"} small />
            <Field label="Kategória" value={card.category || "—"} small />
            <Field label="Típus" value={card.documentType || "—"} small />
            <Field label="Verzió" value={card.currentVersion != null ? `v${card.currentVersion}` : "—"} small />
            <Field label="Módosítva" value={fmtDate(card.updatedAt)} small />
          </dl>
        ) : null}
      </div>

      {editing ? (
        <DocumentWorkContextEditor
          card={card}
          onClose={() => setEditing(false)}
          onSaved={(next) => { afterChange(next); setEditing(false); }}
        />
      ) : null}
    </article>
  );
}

function Field({ label, value, testid, small }: { label: string; value: string; testid?: string; small?: boolean }) {
  return (
    <div className="min-w-0" data-testid={testid}>
      <dt className={`${small ? "text-[9px]" : "text-[9.5px]"} font-bold uppercase tracking-[0.1em] text-[var(--adm-text-muted)]`}>{label}</dt>
      <dd className={`${small ? "text-[10.5px]" : "mt-0.5 text-[12px]"} truncate text-[var(--adm-text)]`}>{value}</dd>
    </div>
  );
}

/** Authorized editor for the work context, with human labels for enum states. */
export function DocumentWorkContextEditor({
  card, onClose, onSaved,
}: { card: WorkCard; onClose: () => void; onSaved: (next: WorkCard) => void }) {
  const [title, setTitle] = useState(card.title);
  const [role, setRole] = useState(card.documentRole || "");
  const [status, setStatus] = useState(card.workStatus);
  const [instruction, setInstruction] = useState(card.workInstruction || "");
  const [nextStep, setNextStep] = useState(card.nextStep || "");
  const [dueDate, setDueDate] = useState(card.dueDate ? card.dueDate.slice(0, 10) : "");
  const [priority, setPriority] = useState(card.workPriority || "");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [fieldErr, setFieldErr] = useState<string | null>(null);

  const submit = useCallback(async () => {
    if (busy) return; // double-submit guard
    if (!title.trim()) { setFieldErr("A cím megadása kötelező."); return; }
    setFieldErr(null); setBusy(true); setErr(null);
    try {
      const next = await updateDocumentWorkContext(card.id, {
        title: title.trim(),
        documentRole: role.trim() || null,
        workStatus: status,
        workInstruction: instruction.trim() || null,
        nextStep: nextStep.trim() || null,
        dueDate: dueDate || null,
        workPriority: priority || null,
      });
      onSaved(next);
    } catch (e) {
      setErr(e instanceof Error ? e.message : "A mentés nem sikerült.");
      setBusy(false);
    }
  }, [busy, title, role, status, instruction, nextStep, dueDate, priority, card.id, onSaved]);

  const input = "mt-1 w-full rounded-md border border-[var(--adm-border)] bg-white px-2.5 py-1.5 text-[12.5px] disabled:opacity-60";
  const label = "text-[9.5px] font-bold uppercase tracking-[0.12em] text-[var(--adm-text-muted)]";

  return (
    <div data-testid="doc-work-context-editor" className="border-t border-[var(--adm-border)] bg-[var(--adm-ivory-100)] px-3 py-3">
      <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-2">
        <div className="sm:col-span-2">
          <label className={label} htmlFor="dwc-title">Cím</label>
          <input id="dwc-title" className={input} value={title} onChange={(e) => setTitle(e.target.value)} disabled={busy} />
          {fieldErr ? <p className="mt-1 text-[11px] font-semibold text-[var(--adm-terracotta-700)]">{fieldErr}</p> : null}
        </div>
        <div>
          <label className={label} htmlFor="dwc-role">Szerep az ügyben</label>
          <input id="dwc-role" className={input} value={role} onChange={(e) => setRole(e.target.value)} disabled={busy} />
        </div>
        <div>
          <label className={label} htmlFor="dwc-status">Állapot</label>
          <select id="dwc-status" className={input} value={status} onChange={(e) => setStatus(e.target.value)} disabled={busy}>
            {DOCUMENT_WORK_STATUS_ORDER.map((s) => <option key={s} value={s}>{statusLabel(s)}</option>)}
          </select>
        </div>
        <div className="sm:col-span-2">
          <label className={label} htmlFor="dwc-instruction">Munkautasítás — mit kell ezzel csinálni?</label>
          <textarea id="dwc-instruction" rows={3} className={input} value={instruction} onChange={(e) => setInstruction(e.target.value)} disabled={busy} />
        </div>
        <div>
          <label className={label} htmlFor="dwc-due">Határidő</label>
          <input id="dwc-due" type="date" className={input} value={dueDate} onChange={(e) => setDueDate(e.target.value)} disabled={busy} />
        </div>
        <div>
          <label className={label} htmlFor="dwc-priority">Prioritás</label>
          <select id="dwc-priority" className={input} value={priority} onChange={(e) => setPriority(e.target.value)} disabled={busy}>
            <option value="">Nincs</option>
            {["LOW", "MEDIUM", "HIGH", "URGENT"].map((p) => <option key={p} value={p}>{p}</option>)}
          </select>
        </div>
        <div className="sm:col-span-2">
          <label className={label} htmlFor="dwc-next">Következő lépés</label>
          <input id="dwc-next" className={input} value={nextStep} onChange={(e) => setNextStep(e.target.value)} disabled={busy} />
        </div>
      </div>
      {err ? <p role="alert" className="mt-2 text-[11.5px] font-semibold text-[var(--adm-terracotta-700)]">{err}</p> : null}
      <div className="mt-2.5 flex justify-end gap-2">
        <AdminButton variant="neutral" size="xs" onClick={onClose} disabled={busy}>Mégse</AdminButton>
        <AdminButton variant="primary" size="xs" onClick={() => void submit()} disabled={busy}>
          {busy ? "Mentés…" : "Mentés"}
        </AdminButton>
      </div>
    </div>
  );
}
