"use client";

import Link from "next/link";
import { useReducer, useRef, useState } from "react";
import {
  clientSafeError,
  customerInteractionApi,
  localizedInteractionStatus,
  type ClientRequestFieldDTO,
  type CustomerRequestDTO,
  type CustomerSubmissionDTO,
} from "@/lib/clientInteractionApi";
import {
  humanFileSize,
  makeUploadItem,
  PAGE_SIDE_LABELS,
  uploadReducer,
  uploadStateMessage,
  uploadSummary,
  type UploadItem,
} from "@/lib/customerUpload";

function fileToBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result || "").split(",")[1] || "");
    reader.onerror = () => reject(reader.error || new Error("A fájl nem olvasható."));
    reader.readAsDataURL(file);
  });
}

function fieldOptions(raw: unknown): string[] {
  if (!Array.isArray(raw)) return [];
  return raw
    .map((option) =>
      typeof option === "string"
        ? option
        : option && typeof option === "object"
          ? String((option as { label?: unknown; value?: unknown }).label ?? (option as { value?: unknown }).value ?? "")
          : "",
    )
    .filter((option) => option.length > 0);
}

export function requestAllowsDocumentUpload(type: CustomerRequestDTO["type"]): boolean {
  return type === "DOCUMENT_UPLOAD" || type === "MISSING_DOCUMENT_REQUEST" || type === "CORRECTION_REQUEST";
}

const INPUT_CLASS =
  "mt-1 w-full rounded-[8px] border border-[var(--adm-border-canonical)] bg-[var(--adm-canvas-white)] px-3 py-2 text-sm text-[var(--adm-text-primary)] focus:border-[var(--adm-brand-green)] focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--adm-brand-green)]";

function FieldInputV3({
  field,
  value,
  onChange,
}: {
  field: ClientRequestFieldDTO;
  value: string;
  onChange: (value: string) => void;
}) {
  if (field.type === "LONG_TEXT" || field.type === "ADDRESS") {
    return (
      <textarea
        value={value}
        onChange={(event) => onChange(event.target.value)}
        maxLength={field.maxLength || 2000}
        className={`${INPUT_CLASS} min-h-24`}
      />
    );
  }
  if (field.type === "YES_NO") {
    return (
      <select value={value} onChange={(event) => onChange(event.target.value)} className={INPUT_CLASS}>
        <option value="">Válasszon</option>
        <option value="igen">Igen</option>
        <option value="nem">Nem</option>
      </select>
    );
  }
  if (field.type === "SINGLE_CHOICE") {
    const options = fieldOptions(field.options);
    return (
      <select value={value} onChange={(event) => onChange(event.target.value)} className={INPUT_CLASS}>
        <option value="">Válasszon</option>
        {options.map((option) => (
          <option key={option} value={option}>
            {option}
          </option>
        ))}
      </select>
    );
  }
  if (field.type === "MULTIPLE_CHOICE") {
    const options = fieldOptions(field.options);
    const selected = new Set(value.split("|").map((entry) => entry.trim()).filter(Boolean));
    const toggle = (option: string) => {
      const next = new Set(selected);
      if (next.has(option)) next.delete(option);
      else next.add(option);
      onChange(Array.from(next).join(" | "));
    };
    return (
      <div className="mt-1 space-y-1">
        {options.map((option) => (
          <label key={option} className="flex items-center gap-2 text-sm text-[var(--adm-text-primary)]">
            <input type="checkbox" checked={selected.has(option)} onChange={() => toggle(option)} />
            {option}
          </label>
        ))}
      </div>
    );
  }
  if (field.type === "DATE") {
    return <input type="date" value={value} onChange={(event) => onChange(event.target.value)} className={INPUT_CLASS} />;
  }
  if (field.type === "NUMBER") {
    return <input type="number" value={value} onChange={(event) => onChange(event.target.value)} className={INPUT_CLASS} />;
  }
  if (field.type === "EMAIL") {
    return (
      <input
        type="email"
        value={value}
        onChange={(event) => onChange(event.target.value)}
        maxLength={field.maxLength || 320}
        className={INPUT_CLASS}
      />
    );
  }
  if (field.type === "PHONE") {
    return (
      <input
        type="tel"
        value={value}
        onChange={(event) => onChange(event.target.value)}
        maxLength={field.maxLength || 80}
        className={INPUT_CLASS}
      />
    );
  }
  return (
    <input
      value={value}
      onChange={(event) => onChange(event.target.value)}
      maxLength={field.maxLength || 500}
      className={INPUT_CLASS}
    />
  );
}

/**
 * Client Portal 3.0 request response composer — the ORGANIZATION replacement
 * of the legacy RequestResponseCard. Identical write semantics:
 *   createSubmission once → submitAnswers once → uploadFile per file →
 *   submitSubmission → reload. A failed file upload keeps the persisted
 *   submission reference and the failed items, so retry continues the SAME
 *   submission and never duplicates persisted records. Scanner/quarantine
 *   remains fully server-side (uploadFile returns the server state).
 */
export function PortalRequestResponseV3({
  caseId,
  request,
  submission,
  answers,
  note,
  onAnswer,
  onNote,
  onReload,
  detailHref,
}: {
  caseId: string;
  request: CustomerRequestDTO;
  submission?: CustomerSubmissionDTO;
  answers: Record<string, string>;
  note: string;
  onAnswer: (fieldId: string, value: string) => void;
  onNote: (value: string) => void;
  onReload: () => Promise<void>;
  detailHref?: string;
}) {
  const [items, dispatch] = useReducer(uploadReducer, [] as UploadItem[]);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const filesRef = useRef<Map<string, { file: File; url?: string }>>(new Map());
  const submissionRef = useRef<{ id: string; answersSent: boolean } | null>(null);
  const canRespond = !["COMPLETED", "CANCELLED", "EXPIRED"].includes(request.status);
  const allowsDocumentUpload = requestAllowsDocumentUpload(request.type);

  const addFiles = (fileList: FileList | null) => {
    const chosen = Array.from(fileList || []);
    const created: UploadItem[] = [];
    for (const file of chosen) {
      const item = makeUploadItem({ fileName: file.name, sizeBytes: file.size, mimeType: file.type || "application/octet-stream" });
      filesRef.current.set(item.id, { file, url: item.isImage ? URL.createObjectURL(file) : undefined });
      created.push(item);
    }
    if (created.length) dispatch({ type: "add", items: created });
  };

  const removeItem = (id: string) => {
    const entry = filesRef.current.get(id);
    if (entry?.url) URL.revokeObjectURL(entry.url);
    filesRef.current.delete(id);
    dispatch({ type: "remove", id });
  };

  const summary = uploadSummary(items);

  const submit = async () => {
    setBusy(true);
    setMessage(null);
    try {
      if (!submissionRef.current) {
        const created = await customerInteractionApi.createSubmission(caseId, request.id);
        submissionRef.current = { id: created.id, answersSent: false };
      }
      const submissionId = submissionRef.current.id;
      if (!submissionRef.current.answersSent) {
        const filled = request.fields
          .map((field) => ({ label: field.label, value: (answers[field.id] || "").trim() }))
          .filter((answer) => answer.value);
        if (filled.length) await customerInteractionApi.submitAnswers(caseId, submissionId, filled);
        submissionRef.current.answersSent = true;
      }
      let failedThisPass = 0;
      for (const item of items) {
        if (item.status === "done" || item.status === "uploading") continue;
        const entry = filesRef.current.get(item.id);
        if (!entry) continue;
        dispatch({ type: "status", id: item.id, status: "uploading" });
        try {
          const result = await customerInteractionApi.uploadFile(caseId, submissionId, {
            originalFileName: entry.file.name,
            declaredMimeType: entry.file.type || "application/octet-stream",
            base64: await fileToBase64(entry.file),
            pageOrSideLabel: item.label || undefined,
          });
          dispatch({ type: "status", id: item.id, status: "done", serverState: result.state });
        } catch {
          failedThisPass += 1;
          dispatch({ type: "status", id: item.id, status: "error" });
        }
      }
      if (failedThisPass > 0) {
        setMessage("Néhány fájl feltöltése nem sikerült. Kérjük, küldje újra a sikertelen fájlokat.");
        return;
      }
      await customerInteractionApi.submitSubmission(caseId, submissionId, note);
      submissionRef.current = null;
      for (const entry of filesRef.current.values()) if (entry.url) URL.revokeObjectURL(entry.url);
      filesRef.current.clear();
      dispatch({ type: "reset" });
      setMessage("A válasz beküldve. Az iroda ellenőrzés után frissíti az ügy állapotát.");
      await onReload();
    } catch (error) {
      setMessage(clientSafeError(error));
    } finally {
      setBusy(false);
    }
  };

  const canSubmit = canRespond && !busy && (summary.total > 0 || request.fields.some((field) => (answers[field.id] || "").trim()));

  return (
    <div className="rounded-[8px] border border-[var(--adm-border-canonical)] bg-[var(--adm-canvas-subtle)] p-3" data-testid="portal-request-response">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <p className="font-semibold text-[var(--adm-text-primary)]">{request.title}</p>
          <p className="mt-1 text-sm text-[var(--adm-text-secondary)]">
            {localizedInteractionStatus(request.status)}
            {request.dueAt ? ` · Határidő: ${new Intl.DateTimeFormat("hu-HU", { year: "numeric", month: "short", day: "numeric" }).format(new Date(request.dueAt))}` : ""}
          </p>
          {detailHref ? (
            <Link
              className="mt-1 inline-flex text-sm font-semibold text-[var(--adm-brand-green)] hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--adm-brand-green)]"
              href={detailHref}
            >
              Bekérés részletei →
            </Link>
          ) : null}
        </div>
        {submission ? (
          <span className="rounded-[6px] border border-[var(--adm-border-canonical)] bg-[var(--adm-canvas-white)] px-2.5 py-0.5 text-xs text-[var(--adm-text-secondary)]">
            {localizedInteractionStatus(submission.status)}
          </span>
        ) : null}
      </div>
      {request.instructions ? <p className="mt-2 break-words text-sm text-[var(--adm-text-primary)]">{request.instructions}</p> : null}
      {submission?.correctionReason ? (
        <p className="mt-2 rounded-[8px] border border-[var(--adm-brand-terracotta)]/30 bg-[var(--adm-brand-terracotta)]/10 p-2 text-sm text-[var(--adm-brand-terracotta)]" data-testid="portal-request-correction">
          Javítás szükséges: {submission.correctionReason}
        </p>
      ) : null}
      {request.fields.length ? (
        <div className="mt-3 space-y-3">
          {request.fields.map((field) => (
            <label key={field.id} className="block text-sm text-[var(--adm-text-primary)]">
              <span className="font-medium">
                {field.label}
                {field.required ? " *" : ""}
              </span>
              {field.helpText ? <span className="block text-xs text-[var(--adm-text-secondary)]">{field.helpText}</span> : null}
              <FieldInputV3 field={field} value={answers[field.id] || ""} onChange={(value) => onAnswer(field.id, value)} />
            </label>
          ))}
        </div>
      ) : null}
      {allowsDocumentUpload ? (
        <label className="mt-3 block text-sm text-[var(--adm-text-primary)]">
          <span className="font-medium">Dokumentum feltöltése</span>
          <span className="block text-xs text-[var(--adm-text-secondary)]">PDF, JPEG vagy PNG; telefonon kamerából vagy a galériából is választható.</span>
          <input
            type="file"
            multiple
            accept="application/pdf,image/jpeg,image/png"
            capture="environment"
            className="mt-1 block w-full text-sm"
            onChange={(event) => {
              addFiles(event.target.files);
              event.target.value = "";
            }}
          />
        </label>
      ) : null}
      {allowsDocumentUpload && items.length ? (
        <ul className="mt-3 space-y-2" aria-label="Kiválasztott fájlok">
          {items.map((item) => {
            const entry = filesRef.current.get(item.id);
            return (
              <li
                key={item.id}
                data-testid="upload-item"
                className="flex items-start gap-3 rounded-[8px] border border-[var(--adm-border-canonical)] bg-[var(--adm-canvas-white)] p-2"
              >
                {item.isImage && entry?.url ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={entry.url} alt="" className="h-14 w-14 flex-none rounded-[8px] object-cover" />
                ) : (
                  <span className="flex h-14 w-14 flex-none items-center justify-center rounded-[8px] bg-[var(--adm-canvas-subtle)] text-xs text-[var(--adm-text-secondary)]">
                    PDF
                  </span>
                )}
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium text-[var(--adm-text-primary)]">{item.fileName}</p>
                  <p className="text-xs text-[var(--adm-text-secondary)]">
                    {humanFileSize(item.sizeBytes)} · <span aria-live="polite">{uploadStateMessage(item)}</span>
                  </p>
                  <select
                    value={item.label}
                    onChange={(event) => dispatch({ type: "relabel", id: item.id, label: event.target.value })}
                    className="mt-1 rounded-[8px] border border-[var(--adm-border-canonical)] bg-[var(--adm-canvas-white)] px-2 py-1 text-xs"
                    aria-label="Oldal megjelölése"
                  >
                    <option value="">Megjelölés (opcionális)</option>
                    {PAGE_SIDE_LABELS.map((label) => (
                      <option key={label} value={label}>
                        {label}
                      </option>
                    ))}
                  </select>
                </div>
                <button
                  type="button"
                  className="flex-none text-xs text-[var(--adm-text-secondary)] underline disabled:opacity-40"
                  disabled={busy || item.status === "done"}
                  onClick={() => removeItem(item.id)}
                >
                  Eltávolítás
                </button>
              </li>
            );
          })}
          {summary.total ? (
            <li className="text-xs text-[var(--adm-text-secondary)]" aria-live="polite">
              Feltöltve: {summary.done}/{summary.total}
              {summary.failed ? ` · sikertelen: ${summary.failed}` : ""}
            </li>
          ) : null}
        </ul>
      ) : null}
      <textarea
        value={note}
        onChange={(event) => onNote(event.target.value)}
        maxLength={1000}
        className={`${INPUT_CLASS} mt-3 min-h-20`}
        placeholder="Megjegyzés az irodának (opcionális)"
      />
      {message ? (
        <p className="mt-2 rounded-[8px] border border-[var(--adm-border-canonical)] bg-[var(--adm-canvas-white)] p-2 text-sm text-[var(--adm-text-secondary)]" role="status">
          {message}
        </p>
      ) : null}
      <div className="mt-3 flex flex-wrap gap-2">
        <button
          className="inline-flex h-10 items-center justify-center rounded-[8px] border border-[var(--adm-brand-green)] bg-[var(--adm-brand-green)] px-4 text-sm font-medium text-[var(--adm-canvas-white)] transition-colors hover:border-[var(--adm-brand-deep)] hover:bg-[var(--adm-brand-deep)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--adm-brand-green)] focus-visible:ring-offset-2 disabled:opacity-50"
          disabled={!canSubmit}
          onClick={() => void submit()}
          data-testid="portal-request-response-submit"
        >
          {items.some((i) => i.status === "error") ? "Sikertelen fájlok újraküldése" : "Válasz beküldése"}
        </button>
      </div>
      <p className="mt-2 text-xs text-[var(--adm-text-secondary)]">
        A fájl csak sikeres biztonsági ellenőrzés után kerülhet be az ügy iratai közé.
      </p>
    </div>
  );
}
