"use client";

import { useCallback, useEffect, useReducer, useRef, useState } from 'react';
import {
  clientSafeError,
  customerInteractionApi,
  localizedInteractionStatus,
  type ClientRequestFieldDTO,
  type CustomerQuestionThreadDTO,
  type CustomerRequestDTO,
  type CustomerSubmissionDTO,
} from '@/lib/clientInteractionApi';
import { humanFileSize, makeUploadItem, PAGE_SIDE_LABELS, uploadReducer, uploadStateMessage, uploadSummary, type UploadItem } from '@/lib/customerUpload';
import { Card, formatDate } from './MatterWorkspace';

function fileToBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result || '').split(',')[1] || '');
    reader.onerror = () => reject(reader.error || new Error('A fájl nem olvasható.'));
    reader.readAsDataURL(file);
  });
}

function fieldOptions(raw: unknown): string[] {
  if (!Array.isArray(raw)) return [];
  return raw
    .map((option) => (typeof option === 'string' ? option : option && typeof option === 'object' ? String((option as { label?: unknown; value?: unknown }).label ?? (option as { value?: unknown }).value ?? '') : ''))
    .filter((option) => option.length > 0);
}

export function requestAllowsDocumentUpload(type: CustomerRequestDTO['type']): boolean {
  return type === 'DOCUMENT_UPLOAD' || type === 'MISSING_DOCUMENT_REQUEST' || type === 'CORRECTION_REQUEST';
}

function FieldInput({ field, value, onChange }: { field: ClientRequestFieldDTO; value: string; onChange: (value: string) => void }) {
  const common = 'mt-1 w-full rounded-xl border border-[var(--adm-border-strong)] bg-white px-3 py-2 text-[var(--adm-text)] focus:outline-none focus:ring-2 focus:ring-[#d7c48a]/40';
  if (field.type === 'LONG_TEXT' || field.type === 'ADDRESS') return <textarea value={value} onChange={(event) => onChange(event.target.value)} maxLength={field.maxLength || 2000} className={`${common} min-h-24`} />;
  if (field.type === 'YES_NO') {
    return (
      <select value={value} onChange={(event) => onChange(event.target.value)} className={common}>
        <option value="">Válasszon</option>
        <option value="igen">Igen</option>
        <option value="nem">Nem</option>
      </select>
    );
  }
  if (field.type === 'SINGLE_CHOICE') {
    const options = fieldOptions(field.options);
    return (
      <select value={value} onChange={(event) => onChange(event.target.value)} className={common}>
        <option value="">Válasszon</option>
        {options.map((option) => <option key={option} value={option}>{option}</option>)}
      </select>
    );
  }
  if (field.type === 'MULTIPLE_CHOICE') {
    const options = fieldOptions(field.options);
    const selected = new Set(value.split('|').map((entry) => entry.trim()).filter(Boolean));
    const toggle = (option: string) => {
      const next = new Set(selected);
      if (next.has(option)) next.delete(option); else next.add(option);
      onChange(Array.from(next).join(' | '));
    };
    return (
      <div className="mt-1 space-y-1">
        {options.map((option) => (
          <label key={option} className="flex items-center gap-2 text-sm text-[var(--adm-text)]">
            <input type="checkbox" checked={selected.has(option)} onChange={() => toggle(option)} />
            {option}
          </label>
        ))}
      </div>
    );
  }
  if (field.type === 'DATE') return <input type="date" value={value} onChange={(event) => onChange(event.target.value)} className={common} />;
  if (field.type === 'NUMBER') return <input type="number" value={value} onChange={(event) => onChange(event.target.value)} className={common} />;
  if (field.type === 'EMAIL') return <input type="email" value={value} onChange={(event) => onChange(event.target.value)} maxLength={field.maxLength || 320} className={common} />;
  if (field.type === 'PHONE') return <input type="tel" value={value} onChange={(event) => onChange(event.target.value)} maxLength={field.maxLength || 80} className={common} />;
  return <input value={value} onChange={(event) => onChange(event.target.value)} maxLength={field.maxLength || 500} className={common} />;
}

function RequestResponseCard({
  caseId,
  request,
  submission,
  answers,
  note,
  onAnswer,
  onNote,
  onReload,
}: {
  caseId: string;
  request: CustomerRequestDTO;
  submission?: CustomerSubmissionDTO;
  answers: Record<string, string>;
  note: string;
  onAnswer: (fieldId: string, value: string) => void;
  onNote: (value: string) => void;
  onReload: () => Promise<void>;
}) {
  const [items, dispatch] = useReducer(uploadReducer, [] as UploadItem[]);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const filesRef = useRef<Map<string, { file: File; url?: string }>>(new Map());
  const submissionRef = useRef<{ id: string; answersSent: boolean } | null>(null);
  const canRespond = !['COMPLETED', 'CANCELLED', 'EXPIRED'].includes(request.status);
  const allowsDocumentUpload = requestAllowsDocumentUpload(request.type);

  const addFiles = (fileList: FileList | null) => {
    const chosen = Array.from(fileList || []);
    const created: UploadItem[] = [];
    for (const file of chosen) {
      const item = makeUploadItem({ fileName: file.name, sizeBytes: file.size, mimeType: file.type || 'application/octet-stream' });
      filesRef.current.set(item.id, { file, url: item.isImage ? URL.createObjectURL(file) : undefined });
      created.push(item);
    }
    if (created.length) dispatch({ type: 'add', items: created });
  };

  const removeItem = (id: string) => {
    const entry = filesRef.current.get(id);
    if (entry?.url) URL.revokeObjectURL(entry.url);
    filesRef.current.delete(id);
    dispatch({ type: 'remove', id });
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
          .map((field) => ({ label: field.label, value: (answers[field.id] || '').trim() }))
          .filter((answer) => answer.value);
        if (filled.length) await customerInteractionApi.submitAnswers(caseId, submissionId, filled);
        submissionRef.current.answersSent = true;
      }
      let failedThisPass = 0;
      for (const item of items) {
        if (item.status === 'done' || item.status === 'uploading') continue;
        const entry = filesRef.current.get(item.id);
        if (!entry) continue;
        dispatch({ type: 'status', id: item.id, status: 'uploading' });
        try {
          const result = await customerInteractionApi.uploadFile(caseId, submissionId, {
            originalFileName: entry.file.name,
            declaredMimeType: entry.file.type || 'application/octet-stream',
            base64: await fileToBase64(entry.file),
            pageOrSideLabel: item.label || undefined,
          });
          dispatch({ type: 'status', id: item.id, status: 'done', serverState: result.state });
        } catch {
          failedThisPass += 1;
          dispatch({ type: 'status', id: item.id, status: 'error' });
        }
      }
      if (failedThisPass > 0) {
        setMessage('Néhány fájl feltöltése nem sikerült. Kérjük, küldje újra a sikertelen fájlokat.');
        return;
      }
      await customerInteractionApi.submitSubmission(caseId, submissionId, note);
      submissionRef.current = null;
      for (const entry of filesRef.current.values()) if (entry.url) URL.revokeObjectURL(entry.url);
      filesRef.current.clear();
      dispatch({ type: 'reset' });
      setMessage('A válasz beküldve. Az iroda ellenőrzés után frissíti az ügy állapotát.');
      await onReload();
    } catch (error) {
      setMessage(clientSafeError(error));
    } finally {
      setBusy(false);
    }
  };

  const canSubmit = canRespond && !busy && (summary.total > 0 || request.fields.some((field) => (answers[field.id] || '').trim()));

  return (
    <div className="rounded-xl bg-[var(--adm-surface)] p-3">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <p className="font-semibold text-[var(--adm-text)]">{request.title}</p>
          <p className="mt-1 text-sm text-[var(--adm-text-muted)]">{localizedInteractionStatus(request.status)} · Határidő: {formatDate(request.dueAt)}</p>
        </div>
        {submission ? <span className="rounded-full bg-white px-3 py-1 text-xs text-[var(--adm-text-muted)]">{localizedInteractionStatus(submission.status)}</span> : null}
      </div>
      {request.instructions ? <p className="mt-2 break-words text-sm text-[var(--adm-text)]">{request.instructions}</p> : null}
      {submission?.correctionReason ? <p className="mt-2 rounded-lg bg-[#fff4da] p-2 text-sm text-[#8a5a06]">Javítás szükséges: {submission.correctionReason}</p> : null}
      {request.fields.length ? (
        <div className="mt-3 space-y-3">
          {request.fields.map((field) => (
            <label key={field.id} className="block text-sm text-[var(--adm-text)]">
              <span className="font-medium">{field.label}{field.required ? ' *' : ''}</span>
              {field.helpText ? <span className="block text-xs text-[var(--adm-text-muted)]">{field.helpText}</span> : null}
              <FieldInput field={field} value={answers[field.id] || ''} onChange={(value) => onAnswer(field.id, value)} />
            </label>
          ))}
        </div>
      ) : null}
      {allowsDocumentUpload ? (
        <label className="mt-3 block text-sm text-[var(--adm-text)]">
          <span className="font-medium">Dokumentum feltöltése</span>
          <span className="block text-xs text-[var(--adm-text-muted)]">PDF, JPEG vagy PNG; telefonon kamerából vagy a galériából is választható.</span>
          <input
            type="file"
            multiple
            accept="application/pdf,image/jpeg,image/png"
            capture="environment"
            className="mt-1 block w-full text-sm"
            onChange={(event) => { addFiles(event.target.files); event.target.value = ''; }}
          />
        </label>
      ) : null}
      {allowsDocumentUpload && items.length ? (
        <ul className="mt-3 space-y-2" aria-label="Kiválasztott fájlok">
          {items.map((item) => {
            const entry = filesRef.current.get(item.id);
            return (
              <li key={item.id} data-testid="upload-item" className="flex items-start gap-3 rounded-xl border border-[var(--adm-border)] bg-white p-2">
                {item.isImage && entry?.url ? <img src={entry.url} alt="" className="h-14 w-14 flex-none rounded-lg object-cover" /> : <span className="flex h-14 w-14 flex-none items-center justify-center rounded-lg bg-[var(--adm-ivory-100)] text-xs text-[var(--adm-text-muted)]">PDF</span>}
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium text-[var(--adm-text)]">{item.fileName}</p>
                  <p className="text-xs text-[var(--adm-text-muted)]">{humanFileSize(item.sizeBytes)} · <span aria-live="polite">{uploadStateMessage(item)}</span></p>
                  <select
                    value={item.label}
                    onChange={(event) => dispatch({ type: 'relabel', id: item.id, label: event.target.value })}
                    className="mt-1 rounded-lg border border-[var(--adm-border)] bg-white px-2 py-1 text-xs"
                    aria-label="Oldal megjelölése"
                  >
                    <option value="">Megjelölés (opcionális)</option>
                    {PAGE_SIDE_LABELS.map((label) => <option key={label} value={label}>{label}</option>)}
                  </select>
                </div>
                <button type="button" className="flex-none text-xs text-[var(--adm-text-muted)] underline disabled:opacity-40" disabled={busy || item.status === 'done'} onClick={() => removeItem(item.id)}>Eltávolítás</button>
              </li>
            );
          })}
          {summary.total ? <li className="text-xs text-[var(--adm-text-muted)]" aria-live="polite">Feltöltve: {summary.done}/{summary.total}{summary.failed ? ` · sikertelen: ${summary.failed}` : ''}</li> : null}
        </ul>
      ) : null}
      <textarea value={note} onChange={(event) => onNote(event.target.value)} maxLength={1000} className="mt-3 min-h-20 w-full rounded-xl border border-[var(--adm-border-strong)] bg-white px-3 py-2 text-sm text-[var(--adm-text)]" placeholder="Megjegyzés az irodának (opcionális)" />
      {message ? <p className="mt-2 rounded-lg bg-[var(--adm-ivory-100)] p-2 text-sm text-[var(--adm-text-muted)]" role="status">{message}</p> : null}
      <div className="mt-3 flex flex-wrap gap-2">
        <button
          className="rounded-full bg-[var(--adm-blue-950)] px-4 py-2 text-sm text-white disabled:opacity-50"
          disabled={!canSubmit}
          onClick={() => void submit()}
        >
          {items.some((i) => i.status === 'error') ? 'Sikertelen fájlok újraküldése' : 'Válasz beküldése'}
        </button>
      </div>
      <p className="mt-2 text-xs text-[var(--adm-text-muted)]">A fájl csak sikeres biztonsági ellenőrzés után kerülhet be az ügy iratai közé.</p>
    </div>
  );
}

function QuestionThreadRow({ caseId, thread }: { caseId: string; thread: CustomerQuestionThreadDTO }) {
  const [open, setOpen] = useState(false);
  const [detail, setDetail] = useState<CustomerQuestionThreadDTO | null>(null);
  const [error, setError] = useState<string | null>(null);
  const toggle = async () => {
    const next = !open;
    setOpen(next);
    if (next && !detail) {
      try { setDetail(await customerInteractionApi.getThread(caseId, thread.id)); }
      catch (err) { setError(clientSafeError(err)); }
    }
  };
  const messages = detail?.messages || [];
  return (
    <div className="rounded-xl bg-[var(--adm-surface)] p-3 text-sm">
      <button className="flex w-full items-center justify-between gap-2 text-left" aria-expanded={open} onClick={toggle}>
        <span className="font-medium text-[var(--adm-text)]">{thread.subject}</span>
        <span className="text-xs text-[var(--adm-text-muted)]">{localizedInteractionStatus(thread.status)}</span>
      </button>
      {open ? (
        <div className="mt-3 space-y-2">
          {error ? <p className="text-[var(--adm-text-muted)]">{error}</p> : null}
          {!error && !detail ? <p className="text-[var(--adm-text-muted)]">Betöltés…</p> : null}
          {messages.length ? messages.map((msg) => (
            <div key={msg.id} className={`rounded-xl px-3 py-2 ${msg.authorType === 'INTERNAL' ? 'bg-[#e7f3f8] text-[var(--adm-blue-950)]' : 'bg-white text-[var(--adm-text)]'}`}>
              <p className="text-[11px] font-semibold uppercase tracking-wide text-[var(--adm-text-muted)]">{msg.authorType === 'INTERNAL' ? 'Ügyvédi iroda' : 'Ön'} · {formatDate(msg.sentAt)}</p>
              <p className="mt-1 break-words">{msg.body}</p>
            </div>
          )) : (!error && detail ? <p className="text-[var(--adm-text-muted)]">Erre a kérdésre még nem érkezett elküldött válasz.</p> : null)}
        </div>
      ) : null}
    </div>
  );
}

export function CustomerInteractionCard({ caseId, allowAsk = true }: { caseId: string; allowAsk?: boolean }) {
  const [requests, setRequests] = useState<CustomerRequestDTO[]>([]);
  const [questions, setQuestions] = useState<CustomerQuestionThreadDTO[]>([]);
  const [submissions, setSubmissions] = useState<CustomerSubmissionDTO[]>([]);
  const [answersByRequest, setAnswersByRequest] = useState<Record<string, Record<string, string>>>({});
  const [notesByRequest, setNotesByRequest] = useState<Record<string, string>>({});
  const [subject, setSubject] = useState('');
  const [body, setBody] = useState('');
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

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

  useEffect(() => { void load().catch(() => setMessage('Az interakciók jelenleg nem érhetők el.')); }, [load]);

  const sendQuestion = async () => {
    setBusy(true);
    setMessage(null);
    try {
      await customerInteractionApi.createQuestion(caseId, { subject, bodySafe: body });
      setSubject('');
      setBody('');
      setMessage('A kérdés beküldve. Az iroda válasza itt fog megjelenni.');
      await load();
    } catch (error) {
      setMessage(clientSafeError(error));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Card>
      <h2 className="cp-card-heading">Üzenetek</h2>
      <p className="cp-subtitle mt-2 text-sm">Itt jelennek meg az ehhez az ügyhöz tartozó kérdések és az iroda válaszai.</p>
      {message ? <p className="mt-3 rounded-2xl bg-[var(--adm-ivory-100)] p-3 text-sm text-[var(--adm-text-muted)]">{message}</p> : null}
      <div className="mt-4 grid gap-4 lg:grid-cols-2">
        <div className="rounded-2xl border border-[var(--adm-border)] p-4">
          <h3 className="font-semibold text-[var(--adm-text)]">Ügyvédi bekérések</h3>
          <div className="mt-3 space-y-3">
            {requests.length ? requests.map((request) => (
              <RequestResponseCard
                key={request.id}
                caseId={caseId}
                request={request}
                submission={submissions.find((submission) => submission.requestId === request.id)}
                answers={answersByRequest[request.id] || {}}
                note={notesByRequest[request.id] || ''}
                onAnswer={(fieldId, value) => setAnswersByRequest((current) => ({ ...current, [request.id]: { ...(current[request.id] || {}), [fieldId]: value } }))}
                onNote={(value) => setNotesByRequest((current) => ({ ...current, [request.id]: value }))}
                onReload={load}
              />
            )) : <p className="text-sm text-[var(--adm-text-muted)]">Nincs aktív dokumentum- vagy adatbekérés.</p>}
          </div>
        </div>
        {allowAsk ? (
          <div className="rounded-2xl border border-[var(--adm-border)] p-4">
            <h3 className="font-semibold text-[var(--adm-text)]">Kérdés küldése</h3>
            <input value={subject} onChange={(event) => setSubject(event.target.value)} maxLength={200} className="mt-3 w-full rounded-xl border border-[var(--adm-border-strong)] bg-white px-3 py-2 text-[var(--adm-text)]" placeholder="Tárgy" />
            <textarea value={body} onChange={(event) => setBody(event.target.value)} maxLength={4000} className="mt-2 min-h-28 w-full rounded-xl border border-[var(--adm-border-strong)] bg-white px-3 py-2 text-[var(--adm-text)]" placeholder="Kérdés szövege" />
            <button className="mt-2 rounded-full bg-[var(--adm-blue-950)] px-4 py-2 text-white disabled:opacity-50" disabled={busy || !subject.trim() || !body.trim()} onClick={sendQuestion}>Kérdés beküldése</button>
            <div className="mt-4 space-y-2">
              {questions.length ? questions.map((thread) => <QuestionThreadRow key={thread.id} caseId={caseId} thread={thread} />) : <p className="text-sm text-[var(--adm-text-muted)]">Még nincs kérdésszál.</p>}
            </div>
          </div>
        ) : (
          <div className="rounded-2xl border border-[var(--adm-border)] p-4">
            <h3 className="font-semibold text-[var(--adm-text)]">Kérdések és válaszok</h3>
            <p className="mt-2 text-sm text-[var(--adm-text-muted)]">Az üzenetváltást itt megtekintheti.</p>
            <div className="mt-4 space-y-2">
              {questions.length ? questions.map((thread) => <QuestionThreadRow key={thread.id} caseId={caseId} thread={thread} />) : <p className="text-sm text-[var(--adm-text-muted)]">Még nincs kérdésszál.</p>}
            </div>
          </div>
        )}
      </div>
    </Card>
  );
}
