"use client";

/**
 * Inline action modals for the Case Workspace (CASE-WORKSPACE-INLINE-ACTIONS-1).
 *
 * Every action here is scoped to the current caseId (auto-set — the user never
 * re-selects the case). Uses the central API client (no ad-hoc fetch), guards
 * against double-submit, disables while pending, surfaces validation + server
 * errors, and never mutates on cancel/escape. On success the caller refetches
 * the workspace projection (no full page reload).
 */
import { useCallback, useEffect, useRef, useState } from "react";
import {
  createTask,
  updateTask,
  uploadCaseDocument,
  createCaseComment,
  getDocumentComments,
  createDocumentComment,
  getUsers,
  safeUploadErrorMessage,
  type CaseWorkspace,
  type User,
} from "@/lib/api";
import { ATTENTION_CATEGORY_ORDER, attentionPresentation } from "@/lib/attentionCategory";
import { AdminButton } from "@/components/adminiculum/ui";

// Accepted upload types — the current safe allowlist (unchanged in this slice).
export const WORKSPACE_UPLOAD_ACCEPT = ".pdf,.doc,.docx,.txt";
export const WORKSPACE_UPLOAD_LABEL = "PDF, DOC, DOCX vagy TXT";
const MAX_UPLOAD_BYTES = 25 * 1024 * 1024; // 25 MB
const PRIORITIES = ["LOW", "MEDIUM", "HIGH", "URGENT"] as const;

type WorkspaceTask = CaseWorkspace["tasks"][number];

function useUsers(open: boolean): User[] {
  const [users, setUsers] = useState<User[]>([]);
  useEffect(() => {
    if (!open) return;
    let active = true;
    getUsers().then((list) => { if (active) setUsers(list); }).catch(() => { if (active) setUsers([]); });
    return () => { active = false; };
  }, [open]);
  return users;
}

async function fileToBase64(file: File): Promise<string> {
  const buffer = await file.arrayBuffer();
  let binary = "";
  const bytes = new Uint8Array(buffer);
  const chunk = 0x8000;
  for (let i = 0; i < bytes.length; i += chunk) {
    binary += String.fromCharCode.apply(null, Array.from(bytes.subarray(i, i + chunk)) as number[]);
  }
  return btoa(binary);
}

/** Accessible modal shell: escape + backdrop close (blocked while busy), focus on open. */
export function WorkspaceModal({ title, onClose, busy, children }: { title: string; onClose: () => void; busy?: boolean; children: React.ReactNode }) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape" && !busy) onClose(); };
    document.addEventListener("keydown", onKey);
    ref.current?.focus();
    return () => document.removeEventListener("keydown", onKey);
  }, [onClose, busy]);
  return (
    <div className="fixed inset-0 z-[120] flex items-start justify-center overflow-y-auto bg-[rgba(17,24,20,0.45)] p-4 sm:p-8" role="presentation" onMouseDown={() => { if (!busy) onClose(); }}>
      <div
        ref={ref}
        tabIndex={-1}
        role="dialog"
        aria-modal="true"
        aria-label={title}
        className="mt-6 w-full max-w-lg overflow-hidden rounded-xl border border-[var(--adm-border)] bg-white shadow-[0_30px_80px_rgba(0,42,35,0.25)] focus:outline-none"
        onMouseDown={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between border-b border-[var(--adm-border)] px-4 py-3">
          <h3 className="font-serif text-[18px] font-medium text-[var(--adm-text)]">{title}</h3>
          <button type="button" onClick={() => { if (!busy) onClose(); }} disabled={busy} className="text-[12px] font-semibold text-[var(--adm-text-muted)] hover:text-[var(--adm-text)] disabled:opacity-50" aria-label="Bezárás">✕</button>
        </div>
        {children}
      </div>
    </div>
  );
}

function FieldError({ message }: { message?: string | null }) {
  if (!message) return null;
  return <p className="mt-1 text-[11px] font-semibold text-[var(--adm-terracotta-700)]">{message}</p>;
}

const inputCls = "mt-1 w-full rounded-md border border-[var(--adm-border)] bg-white px-3 py-2 text-[13px] text-[var(--adm-text)] focus:border-[var(--adm-green-800)] focus:outline-none disabled:opacity-60";
const labelCls = "text-[11px] font-bold uppercase tracking-[0.1em] text-[var(--adm-text-muted)]";

/** Create or edit a task. Deadline mode presents the same form with due date required. */
export function TaskFormModal({
  caseId, mode, task, deadlineMode, onClose, onSaved,
}: {
  caseId: string;
  mode: "create" | "edit";
  task?: WorkspaceTask | null;
  deadlineMode?: boolean;
  onClose: () => void;
  onSaved: () => void;
}) {
  const users = useUsers(true);
  const [title, setTitle] = useState(task?.title ?? "");
  const [description, setDescription] = useState("");
  const [priority, setPriority] = useState<string>(task?.priority ?? "MEDIUM");
  const [assignedToId, setAssignedToId] = useState<string>(task?.assignee?.id ?? "");
  const [attentionCategory, setAttentionCategory] = useState<string>(task?.attentionCategory ?? "");
  const [estimatedMinutes, setEstimatedMinutes] = useState<string>(task?.estimatedMinutes != null ? String(task.estimatedMinutes) : "");
  const [dueDate, setDueDate] = useState<string>(task?.dueDate ? task.dueDate.slice(0, 10) : "");
  const [busy, setBusy] = useState(false);
  const [fieldErr, setFieldErr] = useState<Record<string, string>>({});
  const [serverErr, setServerErr] = useState<string | null>(null);

  const submit = useCallback(async () => {
    if (busy) return; // double-submit guard
    const errs: Record<string, string> = {};
    if (!title.trim()) errs.title = "A cím megadása kötelező.";
    if (deadlineMode && !dueDate) errs.dueDate = "A feladathatáridő megadása kötelező.";
    setFieldErr(errs);
    if (Object.keys(errs).length > 0) return;
    setBusy(true);
    setServerErr(null);
    try {
      const est = estimatedMinutes.trim() === "" ? null : Number(estimatedMinutes);
      if (mode === "create") {
        await createTask({
          caseId,
          title: title.trim(),
          type: "OTHER",
          description: description.trim() || undefined,
          priority,
          dueDate: dueDate || undefined,
          assignedTo: assignedToId || undefined,
          attentionCategory: (attentionCategory || null) as never,
          estimatedMinutes: est ?? undefined,
        });
      } else if (task) {
        await updateTask(task.id, {
          title: title.trim(),
          description: description.trim() || null,
          priority,
          dueDate: dueDate || null,
          assignedToId: assignedToId || null,
          attentionCategory: attentionCategory || null,
          estimatedMinutes: est,
        });
      }
      onSaved();
      onClose();
    } catch (e) {
      setServerErr(e instanceof Error ? e.message : "A mentés nem sikerült.");
      setBusy(false);
    }
  }, [busy, title, description, priority, assignedToId, attentionCategory, estimatedMinutes, dueDate, deadlineMode, mode, task, caseId, onSaved, onClose]);

  const heading = deadlineMode ? (mode === "create" ? "Határidős feladat" : "Feladathatáridő szerkesztése") : (mode === "create" ? "Új feladat" : "Feladat szerkesztése");

  return (
    <WorkspaceModal title={heading} onClose={onClose} busy={busy}>
      <form className="space-y-3 px-4 py-4" onSubmit={(e) => { e.preventDefault(); void submit(); }}>
        <div>
          <label className={labelCls} htmlFor="cw-task-title">Cím</label>
          <input id="cw-task-title" className={inputCls} value={title} onChange={(e) => setTitle(e.target.value)} disabled={busy} autoFocus />
          <FieldError message={fieldErr.title} />
        </div>
        <div>
          <label className={labelCls} htmlFor="cw-task-desc">Leírás</label>
          <textarea id="cw-task-desc" className={inputCls} rows={3} value={description} onChange={(e) => setDescription(e.target.value)} disabled={busy} placeholder="Opcionális" />
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className={labelCls} htmlFor="cw-task-priority">Prioritás</label>
            <select id="cw-task-priority" className={inputCls} value={priority} onChange={(e) => setPriority(e.target.value)} disabled={busy}>
              {PRIORITIES.map((p) => <option key={p} value={p}>{p}</option>)}
            </select>
          </div>
          <div>
            <label className={labelCls} htmlFor="cw-task-due">{deadlineMode ? "Feladathatáridő" : "Határidő"}{deadlineMode ? " *" : ""}</label>
            <input id="cw-task-due" type="date" className={inputCls} value={dueDate} onChange={(e) => setDueDate(e.target.value)} disabled={busy} />
            <FieldError message={fieldErr.dueDate} />
          </div>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className={labelCls} htmlFor="cw-task-assignee">Felelős</label>
            <select id="cw-task-assignee" className={inputCls} value={assignedToId} onChange={(e) => setAssignedToId(e.target.value)} disabled={busy}>
              <option value="">Nincs kijelölve</option>
              {users.map((u) => <option key={u.id} value={u.id}>{u.name}</option>)}
            </select>
          </div>
          <div>
            <label className={labelCls} htmlFor="cw-task-est">Becsült idő (perc)</label>
            <input id="cw-task-est" type="number" min={0} className={inputCls} value={estimatedMinutes} onChange={(e) => setEstimatedMinutes(e.target.value)} disabled={busy} placeholder="Opcionális" />
          </div>
        </div>
        <div>
          <label className={labelCls} htmlFor="cw-task-attention">Figyelmi kategória</label>
          <select id="cw-task-attention" className={inputCls} value={attentionCategory} onChange={(e) => setAttentionCategory(e.target.value)} disabled={busy}>
            <option value="">Nincs besorolva</option>
            {ATTENTION_CATEGORY_ORDER.map((c) => <option key={c} value={c}>{attentionPresentation(c).label}</option>)}
          </select>
        </div>
        {serverErr ? <p role="alert" className="text-[12px] font-semibold text-[var(--adm-terracotta-700)]">{serverErr}</p> : null}
        <div className="flex justify-end gap-2 pt-1">
          <AdminButton variant="neutral" onClick={onClose} disabled={busy}>Mégse</AdminButton>
          <AdminButton variant="primary" type="submit" disabled={busy}>{busy ? "Mentés…" : "Mentés"}</AdminButton>
        </div>
      </form>
    </WorkspaceModal>
  );
}

/** Upload a document to the current case (caseId auto). */
export function DocumentUploadModal({ caseId, onClose, onSaved }: { caseId: string; onClose: () => void; onSaved: () => void }) {
  const [file, setFile] = useState<File | null>(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const submit = useCallback(async () => {
    if (busy) return;
    if (!file) { setErr("Válassz ki egy fájlt a feltöltéshez."); return; }
    if (file.size > MAX_UPLOAD_BYTES) { setErr("A fájl mérete meghaladja a 25 MB-os korlátot."); return; }
    const ext = "." + (file.name.split(".").pop() || "").toLowerCase();
    if (!WORKSPACE_UPLOAD_ACCEPT.split(",").includes(ext)) { setErr(`Nem támogatott fájltípus. Elfogadott: ${WORKSPACE_UPLOAD_LABEL}.`); return; }
    setBusy(true);
    setErr(null);
    try {
      const base64 = await fileToBase64(file);
      await uploadCaseDocument({ caseId, fileName: file.name, fileContentBase64: base64, mimeType: file.type || undefined });
      onSaved();
      onClose();
    } catch (e) {
      console.error("Case document upload failed:", e);
      setErr(safeUploadErrorMessage(e));
      setBusy(false);
    }
  }, [busy, file, caseId, onSaved, onClose]);

  return (
    <WorkspaceModal title="Dokumentum feltöltése" onClose={onClose} busy={busy}>
      <div className="space-y-3 px-4 py-4">
        <p className="text-[11px] text-[var(--adm-text-muted)]">Elfogadott típusok: {WORKSPACE_UPLOAD_LABEL} · max. 25 MB. A dokumentum az aktuális ügyhöz kerül.</p>
        <input type="file" accept={WORKSPACE_UPLOAD_ACCEPT} onChange={(e) => { setFile(e.target.files?.[0] ?? null); setErr(null); }} disabled={busy} className="block w-full text-[12px]" />
        {err ? <p role="alert" className="text-[12px] font-semibold text-[var(--adm-terracotta-700)]">{err}</p> : null}
        <div className="flex justify-end gap-2">
          <AdminButton variant="neutral" onClick={onClose} disabled={busy}>Mégse</AdminButton>
          <AdminButton variant="primary" onClick={() => void submit()} disabled={busy || !file}>{busy ? "Feltöltés…" : "Feltöltés"}</AdminButton>
        </div>
      </div>
    </WorkspaceModal>
  );
}

/** Add an internal case note (Comment, caseId set). */
export function CaseCommentModal({ caseId, onClose, onSaved }: { caseId: string; onClose: () => void; onSaved: () => void }) {
  const [content, setContent] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const submit = useCallback(async () => {
    if (busy) return;
    if (!content.trim()) { setErr("A megjegyzés nem lehet üres."); return; }
    setBusy(true);
    setErr(null);
    try {
      await createCaseComment(caseId, content.trim());
      onSaved();
      onClose();
    } catch (e) {
      setErr(e instanceof Error ? e.message : "A megjegyzés mentése nem sikerült.");
      setBusy(false);
    }
  }, [busy, content, caseId, onSaved, onClose]);
  return (
    <WorkspaceModal title="Belső megjegyzés az ügyhöz" onClose={onClose} busy={busy}>
      <div className="space-y-3 px-4 py-4">
        <textarea className={inputCls} rows={4} value={content} onChange={(e) => setContent(e.target.value)} disabled={busy} placeholder="Írd ide a belső jegyzetet…" autoFocus />
        {err ? <p role="alert" className="text-[12px] font-semibold text-[var(--adm-terracotta-700)]">{err}</p> : null}
        <div className="flex justify-end gap-2">
          <AdminButton variant="neutral" onClick={onClose} disabled={busy}>Mégse</AdminButton>
          <AdminButton variant="primary" onClick={() => void submit()} disabled={busy}>{busy ? "Mentés…" : "Megjegyzés hozzáadása"}</AdminButton>
        </div>
      </div>
    </WorkspaceModal>
  );
}

/** View + add plain-text comments on a specific document. */
export function DocumentCommentsModal({ documentId, documentName, onClose, onSaved }: { documentId: string; documentName: string; onClose: () => void; onSaved: () => void }) {
  const [comments, setComments] = useState<Array<{ id: string; content: string; author: { displayName: string }; createdAt: string }>>([]);
  const [content, setContent] = useState("");
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const reload = useCallback(async () => {
    setLoading(true);
    try {
      const res = await getDocumentComments(documentId, { limit: 25 });
      setComments(res.comments as never);
    } catch {
      setErr("A kommentek betöltése nem sikerült.");
    } finally {
      setLoading(false);
    }
  }, [documentId]);
  useEffect(() => { void reload(); }, [reload]);

  const submit = useCallback(async () => {
    if (busy) return;
    if (!content.trim()) { setErr("A komment nem lehet üres."); return; }
    setBusy(true);
    setErr(null);
    try {
      await createDocumentComment(documentId, content.trim());
      setContent("");
      await reload();
      onSaved();
    } catch (e) {
      setErr(e instanceof Error ? e.message : "A komment mentése nem sikerült.");
    } finally {
      setBusy(false);
    }
  }, [busy, content, documentId, reload, onSaved]);

  return (
    <WorkspaceModal title={`Kommentek — ${documentName}`} onClose={onClose} busy={busy}>
      <div className="space-y-3 px-4 py-4">
        <div className="max-h-56 space-y-2 overflow-y-auto">
          {loading ? <p className="text-[12px] text-[var(--adm-text-muted)]">Betöltés…</p> : comments.length === 0 ? <p className="text-[12px] text-[var(--adm-text-muted)]">Ehhez a dokumentumhoz még nincs komment.</p> : comments.map((c) => (
            <div key={c.id} className="rounded-md border border-[var(--adm-border)] bg-[var(--adm-ivory-100)] px-3 py-2">
              <p className="text-[12px] text-[var(--adm-text)]">{c.content}</p>
              <p className="mt-1 text-[10px] text-[var(--adm-text-muted)]">{c.author.displayName}</p>
            </div>
          ))}
        </div>
        <textarea className={inputCls} rows={3} value={content} onChange={(e) => setContent(e.target.value)} disabled={busy} placeholder="Új komment…" />
        {err ? <p role="alert" className="text-[12px] font-semibold text-[var(--adm-terracotta-700)]">{err}</p> : null}
        <div className="flex justify-end gap-2">
          <AdminButton variant="neutral" onClick={onClose} disabled={busy}>Bezárás</AdminButton>
          <AdminButton variant="primary" onClick={() => void submit()} disabled={busy}>{busy ? "Mentés…" : "Komment hozzáadása"}</AdminButton>
        </div>
      </div>
    </WorkspaceModal>
  );
}
