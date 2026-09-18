"use client";

import React, { useCallback, useEffect, useRef, useState } from "react";
import {
  complianceDocumentApi,
  type ComplianceCaseOption,
  type ComplianceDocumentAudience,
  type ComplianceDocumentLink,
  type ComplianceDocumentsReadModel,
} from "@/lib/complianceDocumentApi";
import { ApiError, searchDocuments, type DocumentSearchItem } from "@/lib/api";
import { ComplianceClauseAnchorPanel } from "@/components/clients/compliance/ComplianceClauseAnchorPanel";

function formatDate(value: string | null): string {
  if (!value) return "—";
  try {
    return new Date(value).toLocaleDateString("hu-HU");
  } catch {
    return value;
  }
}

function readFileAsBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(new Error("read-failed"));
    reader.onload = () => {
      const result = String(reader.result || "");
      const comma = result.indexOf(",");
      resolve(comma >= 0 ? result.slice(comma + 1) : result);
    };
    reader.readAsDataURL(file);
  });
}

type PendingUpload = {
  /** Frozen at upload start: the retry must resend the SAME prepared payload. */
  requirementKey: string;
  intent: ComplianceDocumentAudience;
  fileName: string;
  mimeType: string;
  fileContent: string;
};

/**
 * Bounded explicit-case failures that leave the chooser recoverable: the frozen
 * upload stays pending and the user may refresh the option list instead of
 * re-selecting the file. The backend remains authoritative.
 */
const RECOVERABLE_CASE_SELECTION_CODES = new Set([
  "COMPLIANCE_UPLOAD_CASE_NOT_FOUND",
  "COMPLIANCE_UPLOAD_CASE_CLIENT_MISMATCH",
  "COMPLIANCE_UPLOAD_CASE_NOT_REUSABLE",
  "COMPLIANCE_UPLOAD_CASE_NOT_ELIGIBLE",
  "CASE_ACCESS_FORBIDDEN",
]);

/**
 * A linked internal document renders its legal matrix automatically: the anchor
 * provenance is persisted at ingestion and never depends on the panel being
 * open, so there is no activation button and no click-controlled monitoring.
 */
function LinkRow({ link, audience, onUnlink, busy, clientId, autoRefreshWhileEmpty = false }: { link: ComplianceDocumentLink; audience: ComplianceDocumentAudience; onUnlink: (id: string) => void; busy: boolean; clientId: string; autoRefreshWhileEmpty?: boolean }) {
  return (
    <li className="rounded border border-[var(--adm-border)] bg-white p-3">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-sm font-medium text-[var(--adm-text)]">{link.title}</p>
          <p className="mt-0.5 text-xs text-[var(--adm-text-muted)]">
            Legfrissebb verzió: {link.latestVersion ? `v${link.latestVersion.version} · ${formatDate(link.latestVersion.createdAt)}` : "—"}
          </p>
          {audience === "CLIENT_POLICY" ? (
            <p className="mt-0.5 text-xs text-[var(--adm-text-muted)]">
              {link.published
                ? `Ügyfélnek közzétéve: ${formatDate(link.published.publishedAt)}`
                : "Ügyfélnek még nincs közzétéve"}
            </p>
          ) : (
            <p className="mt-0.5 text-xs font-semibold uppercase tracking-[0.14em] text-[var(--adm-ochre-500)]">Csak az iroda számára</p>
          )}
        </div>
        <div className="flex shrink-0 items-center gap-2">
          <button
            type="button"
            disabled={busy}
            onClick={() => onUnlink(link.id)}
            className="rounded border border-[var(--adm-border)] bg-white px-2 py-1 text-xs text-[var(--adm-text-muted)] hover:text-red-700 disabled:opacity-50"
          >
            Eltávolítás
          </button>
        </div>
      </div>
      {audience === "INTERNAL_ANALYSIS" ? (
        <div className="mt-3 border-t border-[var(--adm-border)] pt-3">
          <ComplianceClauseAnchorPanel clientId={clientId} documentId={link.documentId} autoRefreshWhileEmpty={autoRefreshWhileEmpty} />
        </div>
      ) : null}
    </li>
  );
}

export function ComplianceDocumentsSection({
  clientId,
  requirements,
}: {
  clientId: string;
  requirements: Array<{ key: string; title: string }>;
}) {
  const [data, setData] = useState<ComplianceDocumentsReadModel | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [requirementKey, setRequirementKey] = useState("");
  const [busyIntent, setBusyIntent] = useState<ComplianceDocumentAudience | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [freshDocumentId, setFreshDocumentId] = useState<string | null>(null);
  // Exceptional ambiguity retry: the prepared upload is preserved so the user
  // never has to pick the file again.
  const [pendingUpload, setPendingUpload] = useState<PendingUpload | null>(null);
  const [caseOptions, setCaseOptions] = useState<ComplianceCaseOption[]>([]);
  const [selectedCaseId, setSelectedCaseId] = useState("");
  const [ambiguityLoading, setAmbiguityLoading] = useState(false);
  const [ambiguityMessage, setAmbiguityMessage] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const clientPolicyInputRef = useRef<HTMLInputElement | null>(null);
  const internalAnalysisInputRef = useRef<HTMLInputElement | null>(null);

  // Secondary, advanced manual operation — preserved unchanged.
  const [manualOpen, setManualOpen] = useState(false);
  const [audience, setAudience] = useState<ComplianceDocumentAudience>("CLIENT_POLICY");
  const [docQuery, setDocQuery] = useState("");
  const [docResults, setDocResults] = useState<DocumentSearchItem[]>([]);
  const [selectedDoc, setSelectedDoc] = useState<DocumentSearchItem | null>(null);
  const [linking, setLinking] = useState(false);
  const [removingId, setRemovingId] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      setData(await complianceDocumentApi.list(clientId));
    } catch {
      setError("A megfelelőségi dokumentumok jelenleg nem tölthetők be.");
    } finally {
      setLoading(false);
    }
  }, [clientId]);

  useEffect(() => { void load(); }, [load]);

  const applyUploadResult = async (
    intent: ComplianceDocumentAudience,
    result: { documentId: string; publication?: { status: string; publicationId: string | null; code?: string } | null },
  ) => {
    if (intent === "INTERNAL_ANALYSIS") {
      setFreshDocumentId(result.documentId);
      setNotice("Feltöltve – a jogi mátrix feldolgozása folyamatban.");
    } else if (result.publication?.status === "PUBLISHED") {
      setNotice("Ügyfélnek közzétéve.");
    } else if (result.publication?.status === "DRAFT" && result.publication?.publicationId) {
      setNotice("Feltöltve – jóváhagyásra vár.");
    } else {
      // The document + linkage exist, but no canonical publication draft does.
      // Never claim "approval pending", and never suggest re-uploading.
      setNotice(
        result.publication?.code === "NO_ACTIVE_AUDIENCE_GRANT"
          ? "Dokumentum feltöltve és összekapcsolva, de az ügyfélközzétételi tervezet nem jött létre: ehhez aktív ügyfél-hozzáférés szükséges."
          : "Dokumentum feltöltve és összekapcsolva, de az ügyfélközzétételi tervezet nem jött létre.",
      );
    }
    await load();
  };

  const loadAmbiguityCaseOptions = useCallback(async () => {
    // Refresh path: replaces the option list and clears only the SELECTED case.
    // It never touches the frozen prepared upload.
    setAmbiguityLoading(true);
    setAmbiguityMessage(null);
    setSelectedCaseId("");
    try {
      const options = await complianceDocumentApi.caseOptions(clientId);
      const items = options.items ?? [];
      setCaseOptions(items);
      if (items.length === 0) {
        setAmbiguityMessage("Több compliance ügy létezik, de egyikhez sincs megfelelő hozzáférése.");
      }
    } catch {
      setCaseOptions([]);
      setAmbiguityMessage("A választható compliance ügyek jelenleg nem tölthetők be.");
    } finally {
      setAmbiguityLoading(false);
    }
  }, [clientId]);

  const runUpload = (payload: PendingUpload, caseId?: string) =>
    complianceDocumentApi.upload(clientId, {
      // Frozen prepared payload: never the live selector state.
      requirementKey: payload.requirementKey,
      intent: payload.intent,
      fileName: payload.fileName,
      mimeType: payload.mimeType,
      fileContent: payload.fileContent,
      ...(caseId ? { caseId } : {}),
    });

  const handleUpload = async (intent: ComplianceDocumentAudience, file: File | null) => {
    if (!file) return;
    if (!requirementKey) {
      setActionError("Először válasszon megfelelőségi területet.");
      return;
    }
    setBusyIntent(intent);
    setActionError(null);
    setNotice(null);
    setPendingUpload(null);
    setCaseOptions([]);
    setSelectedCaseId("");
    setAmbiguityMessage(null);

    let payload: PendingUpload;
    try {
      payload = {
        requirementKey,
        intent,
        fileName: file.name,
        mimeType: file.type || "application/octet-stream",
        fileContent: await readFileAsBase64(file),
      };
    } catch {
      setBusyIntent(null);
      setActionError("A fájl beolvasása nem sikerült.");
      return;
    }

    try {
      const result = await runUpload(payload);
      await applyUploadResult(intent, result);
    } catch (error) {
      if (error instanceof ApiError && error.status === 409 && error.code === "COMPLIANCE_CASE_AMBIGUOUS") {
        // Bounded conflict: preserve the prepared payload and offer the exceptional chooser.
        setPendingUpload(payload);
        await loadAmbiguityCaseOptions();
      } else {
        setActionError("A dokumentum feltöltése jelenleg nem sikerült.");
      }
    } finally {
      setBusyIntent(null);
    }
  };

  const confirmAmbiguousUpload = async () => {
    if (!pendingUpload || !selectedCaseId) return;
    const payload = pendingUpload;
    setBusyIntent(payload.intent);
    setActionError(null);
    try {
      const result = await runUpload(payload, selectedCaseId);
      setPendingUpload(null);
      setCaseOptions([]);
      setSelectedCaseId("");
      setAmbiguityMessage(null);
      await applyUploadResult(payload.intent, result);
    } catch (error) {
      // Stale selection / lost access / eligibility change: keep the frozen upload
      // pending and let the user refresh the option list. Never re-choose silently.
      const code = error instanceof ApiError ? error.code : undefined;
      if (code && RECOVERABLE_CASE_SELECTION_CODES.has(code)) {
        setAmbiguityMessage("A kiválasztott ügy már nem alkalmas. Frissítse az ügylistát, és válasszon másikat.");
      } else {
        setActionError(
          code ? `A feltöltés a kiválasztott üggyel nem sikerült (${code}).` : "A feltöltés a kiválasztott üggyel nem sikerült.",
        );
      }
    } finally {
      setBusyIntent(null);
    }
  };

  const cancelAmbiguousUpload = () => {
    setPendingUpload(null);
    setCaseOptions([]);
    setSelectedCaseId("");
    setAmbiguityMessage(null);
    setActionError(null);
  };

  const handleSearch = async (value: string) => {
    setDocQuery(value);
    setSelectedDoc(null);
    if (!value.trim()) {
      setDocResults([]);
      return;
    }
    try {
      const results = await searchDocuments(value);
      setDocResults(results.filter((item) => item.clientId === clientId));
    } catch {
      setDocResults([]);
    }
  };

  const handleLink = async () => {
    if (!requirementKey || !selectedDoc) {
      setActionError("Válasszon megfelelőségi területet és dokumentumot.");
      return;
    }
    setLinking(true);
    setActionError(null);
    try {
      await complianceDocumentApi.link(clientId, { requirementKey, documentId: selectedDoc.id, audience });
      setSelectedDoc(null);
      setDocQuery("");
      setDocResults([]);
      await load();
    } catch {
      setActionError("A dokumentum összekapcsolása jelenleg nem sikerült.");
    } finally {
      setLinking(false);
    }
  };

  const handleUnlink = async (id: string) => {
    if (removingId) return;
    setRemovingId(id);
    setActionError(null);
    try {
      await complianceDocumentApi.unlink(clientId, id);
      await load();
    } catch {
      setActionError("A dokumentum eltávolítása jelenleg nem sikerült.");
    } finally {
      setRemovingId(null);
    }
  };

  const topics = data?.topics ?? [];
  const topicTitles = new Map(requirements.map((requirement) => [requirement.key, requirement.title]));
  const uploadBusy = busyIntent !== null;

  return (
    <div className="space-y-4">
      <div className="rounded-[var(--adm-radius-md)] border border-[var(--adm-border)] bg-white p-5">
        <p className="text-[10px] uppercase tracking-[0.2em] text-[var(--adm-green-800)]">Dokumentum feltöltése</p>
        <div className="mt-3">
          <label className="block">
            <span className="text-xs text-[var(--adm-text-muted)]">Megfelelőségi terület</span>
            <select
              className="mt-1 w-full rounded border border-[var(--adm-border)] bg-white px-3 py-2 text-sm text-[var(--adm-text)]"
              value={requirementKey}
              // Correctness does NOT depend on this guard: the retry always uses the
              // frozen payload.requirementKey; disabling only avoids user confusion.
              disabled={pendingUpload !== null}
              onChange={(event) => setRequirementKey(event.target.value)}
            >
              <option value="">Válasszon területet…</option>
              {requirements.map((requirement) => (
                <option key={requirement.key} value={requirement.key}>{requirement.title}</option>
              ))}
            </select>
          </label>
        </div>
        <div className="mt-3 flex flex-wrap gap-3">
          <button
            type="button"
            disabled={uploadBusy || pendingUpload !== null || !requirementKey}
            onClick={() => clientPolicyInputRef.current?.click()}
            className="rounded border border-[var(--adm-green-800)] bg-white px-4 py-2 text-xs font-medium text-[var(--adm-green-800)] disabled:opacity-50"
          >
            {busyIntent === "CLIENT_POLICY" ? "Feltöltés…" : "Feltöltés ügyfélnek"}
          </button>
          <button
            type="button"
            disabled={uploadBusy || pendingUpload !== null || !requirementKey}
            onClick={() => internalAnalysisInputRef.current?.click()}
            className="rounded border border-[var(--adm-green-800)] bg-white px-4 py-2 text-xs font-medium text-[var(--adm-green-800)] disabled:opacity-50"
          >
            {busyIntent === "INTERNAL_ANALYSIS" ? "Feltöltés…" : "Feltöltés jogi mátrixszal"}
          </button>
        </div>
        <input
          ref={clientPolicyInputRef}
          type="file"
          className="hidden"
          onChange={(event) => {
            const file = event.target.files?.[0] ?? null;
            event.target.value = "";
            void handleUpload("CLIENT_POLICY", file);
          }}
        />
        <input
          ref={internalAnalysisInputRef}
          type="file"
          className="hidden"
          onChange={(event) => {
            const file = event.target.files?.[0] ?? null;
            event.target.value = "";
            void handleUpload("INTERNAL_ANALYSIS", file);
          }}
        />
        {notice ? <p role="status" className="mt-3 text-xs text-[var(--adm-green-800)]">{notice}</p> : null}
        {actionError ? <p role="alert" className="mt-3 text-xs text-red-800">{actionError}</p> : null}
        {pendingUpload ? (
          <div
            data-testid="compliance-case-chooser"
            className="mt-3 rounded border border-[var(--adm-border)] bg-[var(--adm-surface)] p-3"
          >
            <p className="text-xs text-[var(--adm-text)]">
              Több alkalmas compliance ügy található. Válassza ki, melyik ügyhöz kerüljön a dokumentum.
            </p>
            {ambiguityLoading ? <p className="mt-2 text-xs text-[var(--adm-text-muted)]">Betöltés…</p> : null}
            {ambiguityMessage ? <p role="alert" className="mt-2 text-xs text-amber-800">{ambiguityMessage}</p> : null}
            {caseOptions.length ? (
              <ul className="mt-2 space-y-1">
                {caseOptions.map((option) => (
                  <li key={option.id}>
                    <label className="flex items-center gap-2 text-sm text-[var(--adm-text)]">
                      <input
                        type="radio"
                        name="compliance-case-option"
                        checked={selectedCaseId === option.id}
                        onChange={() => setSelectedCaseId(option.id)}
                      />
                      <span>{option.caseNumber} · {option.title}</span>
                    </label>
                  </li>
                ))}
              </ul>
            ) : null}
            <div className="mt-3 flex flex-wrap gap-2">
              <button
                type="button"
                disabled={!selectedCaseId || busyIntent !== null}
                onClick={() => void confirmAmbiguousUpload()}
                className="rounded border border-[var(--adm-green-800)] bg-white px-3 py-1.5 text-xs font-medium text-[var(--adm-green-800)] disabled:opacity-50"
              >
                Feltöltés a kiválasztott ügyhöz
              </button>
              <button
                type="button"
                disabled={ambiguityLoading}
                onClick={() => void loadAmbiguityCaseOptions()}
                className="rounded border border-[var(--adm-border)] bg-white px-3 py-1.5 text-xs text-[var(--adm-text)] disabled:opacity-50"
              >
                Ügylista frissítése
              </button>
              <button
                type="button"
                onClick={cancelAmbiguousUpload}
                className="rounded border border-[var(--adm-border)] bg-white px-3 py-1.5 text-xs text-[var(--adm-text-muted)]"
              >
                Mégse
              </button>
            </div>
          </div>
        ) : null}
      </div>

      <div className="rounded-[var(--adm-radius-md)] border border-[var(--adm-border)] bg-white p-5">
        <p className="text-[10px] uppercase tracking-[0.2em] text-[var(--adm-green-800)]">Összekapcsolt dokumentumok</p>
        {loading ? <p className="mt-3 text-sm text-[var(--adm-text-muted)]">Betöltés…</p> : null}
        {!loading && error ? (
          <div role="alert" className="mt-3 rounded border border-red-200 bg-red-50 p-3 text-sm text-red-800">
            {error}
            <button type="button" onClick={() => void load()} className="ml-3 rounded border border-[var(--adm-border)] bg-white px-3 py-1 text-xs text-[var(--adm-text)]">Újrapróbálás</button>
          </div>
        ) : null}
        {!loading && !error && topics.length === 0 ? (
          <p className="mt-3 text-sm text-[var(--adm-text-muted)]">Ehhez az ügyfélhez még nincs megfelelőségi dokumentum összekapcsolva.</p>
        ) : null}
        {!loading && !error ? (
          <div className="mt-3 space-y-4">
            {topics.map((topic) => (
              <div key={topic.requirementKey} className="rounded border border-[var(--adm-border)] bg-[var(--adm-surface)] p-3">
                <p className="text-sm font-semibold text-[var(--adm-text)]">
                  {topicTitles.get(topic.requirementKey) || topic.requirementKey}
                </p>
                {topic.internalAnalysis.length ? (
                  <div className="mt-2">
                    <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-[var(--adm-ochre-500)]">Belső megfelelőségi elemzés</p>
                    <ul className="mt-1 space-y-1">
                      {topic.internalAnalysis.map((link) => <LinkRow key={link.id} link={link} audience="INTERNAL_ANALYSIS" clientId={clientId} autoRefreshWhileEmpty={freshDocumentId === link.documentId} onUnlink={(id) => void handleUnlink(id)} busy={removingId === link.id} />)}
                    </ul>
                  </div>
                ) : null}
                {topic.clientPolicy.length ? (
                  <div className="mt-2">
                    <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-[var(--adm-text-muted)]">Ügyfélnek szánt szabályzat</p>
                    <ul className="mt-1 space-y-1">
                      {topic.clientPolicy.map((link) => <LinkRow key={link.id} link={link} audience="CLIENT_POLICY" clientId={clientId} onUnlink={(id) => void handleUnlink(id)} busy={removingId === link.id} />)}
                    </ul>
                  </div>
                ) : null}
              </div>
            ))}
          </div>
        ) : null}
      </div>

      <div className="rounded-[var(--adm-radius-md)] border border-[var(--adm-border)] bg-white p-5">
        <button
          type="button"
          aria-expanded={manualOpen}
          onClick={() => setManualOpen((value) => !value)}
          className="text-[10px] uppercase tracking-[0.2em] text-[var(--adm-green-800)]"
        >
          {manualOpen ? "Meglévő dokumentum kapcsolása – elrejtése" : "Meglévő dokumentum kapcsolása"}
        </button>
        {manualOpen ? (
          <div className="mt-3">
            <div className="grid gap-3 sm:grid-cols-2">
              <label className="block">
                <span className="text-xs text-[var(--adm-text-muted)]">Dokumentum célja</span>
                <select
                  className="mt-1 w-full rounded border border-[var(--adm-border)] bg-white px-3 py-2 text-sm text-[var(--adm-text)]"
                  value={audience}
                  onChange={(event) => setAudience(event.target.value as ComplianceDocumentAudience)}
                >
                  <option value="CLIENT_POLICY">Ügyfélnek szánt szabályzat</option>
                  <option value="INTERNAL_ANALYSIS">Belső megfelelőségi elemzés</option>
                </select>
              </label>
            </div>
            <div className="mt-3">
              <label className="block">
                <span className="text-xs text-[var(--adm-text-muted)]">Meglévő dokumentum keresése</span>
                <input
                  type="text"
                  className="mt-1 w-full rounded border border-[var(--adm-border)] bg-white px-3 py-2 text-sm text-[var(--adm-text)]"
                  placeholder="Kezdje el beírni a dokumentum nevét…"
                  value={docQuery}
                  onChange={(event) => void handleSearch(event.target.value)}
                />
              </label>
              {docResults.length ? (
                <ul className="mt-2 max-h-48 overflow-auto rounded border border-[var(--adm-border)]">
                  {docResults.map((doc) => (
                    <li key={doc.id}>
                      <button
                        type="button"
                        onClick={() => setSelectedDoc(doc)}
                        className={`w-full px-3 py-2 text-left text-sm ${selectedDoc?.id === doc.id ? "bg-[var(--adm-sand-100)]" : "hover:bg-[var(--adm-surface)]"}`}
                      >
                        <span className="font-medium text-[var(--adm-text)]">{doc.fileName}</span>
                        <span className="ml-2 text-xs text-[var(--adm-text-muted)]">{doc.caseTitle}</span>
                      </button>
                    </li>
                  ))}
                </ul>
              ) : docQuery.trim() ? (
                <p className="mt-2 text-xs text-[var(--adm-text-muted)]">Nincs találat ehhez az ügyfélhez.</p>
              ) : null}
            </div>
            <div className="mt-3">
              <button
                type="button"
                disabled={linking || !requirementKey || !selectedDoc}
                onClick={() => void handleLink()}
                className="rounded border border-[var(--adm-green-800)] bg-white px-4 py-2 text-xs font-medium text-[var(--adm-green-800)] disabled:opacity-50"
              >
                {linking ? "Összekapcsolás…" : "Dokumentum összekapcsolása"}
              </button>
            </div>
          </div>
        ) : null}
      </div>
    </div>
  );
}
