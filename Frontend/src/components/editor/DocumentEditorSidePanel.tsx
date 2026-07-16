"use client";

/**
 * Right-side workbench panel: truthful persistence status, safe variables,
 * task-backed review integration, and export. Unavailable capabilities are
 * explained in an informative section instead of dead placeholder buttons.
 */

import { useMemo, useState } from "react";
import Link from "next/link";
import type { CaseWorkItem, DocumentCommentDto, EditorTemplateCapabilitiesDto } from "@/lib/api";
import type { EditorNode } from "@/lib/editor/editorModel";
import { EDITOR_FIELDS, FieldResolutionContext, listTokenOccurrences } from "@/lib/editor/fieldTokens";
import {
  documentCommentUnavailableMessage,
  compareSavedSourcesLabel,
} from "@/lib/editor/reviewQuality";

export type ReviewPanelState = {
  items: CaseWorkItem[];
  busy: boolean;
  error: string | null;
  onCreateReviewTask: () => void;
  onTaskTransition: (taskId: string, action: "start" | "submit" | "approve" | "return") => void;
  canCreateReviewTask: boolean;
};

export type DocumentCommentsPanelState = {
  items: DocumentCommentDto[];
  busy: boolean;
  error: string | null;
  draft: string;
  maxLength: number;
  availability: {
    comments: boolean;
    anchoredComments: false;
    delete: false;
  };
  onDraftChange: (value: string) => void;
  onCreate: () => void;
  onResolve: (commentId: string) => void;
  onReopen: (commentId: string) => void;
  onRetry: () => void;
};

export type TemplatePanelState = {
  capabilities: EditorTemplateCapabilitiesDto | null;
  error: string | null;
  onLocalDocxImport: () => void;
};

type SidePanelProps = {
  docJson: EditorNode | null;
  context: FieldResolutionContext;
  documentMeta: { id: string; caseId: string; name: string; version?: string | null } | null;
  review: ReviewPanelState;
  comments: DocumentCommentsPanelState;
  template: TemplatePanelState;
  readOnly: boolean;
  onInsertField: (fieldId: string) => void;
  onConvertResolvedTokens: () => void;
  onExportHtml: () => void;
  onExportText: () => void;
  onExportDocx: () => void;
  onPrint: () => void;
};

type PanelTab = "status" | "fields" | "review" | "comments" | "template" | "export";

export function DocumentEditorSidePanel({
  docJson,
  context,
  documentMeta,
  review,
  comments,
  template,
  readOnly,
  onInsertField,
  onConvertResolvedTokens,
  onExportHtml,
  onExportText,
  onExportDocx,
  onPrint,
}: SidePanelProps) {
  const [tab, setTab] = useState<PanelTab>("status");
  const [fieldFilter, setFieldFilter] = useState("");

  const occurrences = useMemo(() => (docJson ? listTokenOccurrences(docJson, context) : []), [docJson, context]);
  const unresolvedCount = occurrences.filter((occurrence) => occurrence.resolved === null).length;

  const filteredFields = useMemo(() => {
    const query = fieldFilter.trim().toLowerCase();
    if (!query) return EDITOR_FIELDS;
    return EDITOR_FIELDS.filter((field) => field.label.toLowerCase().includes(query) || field.id.toLowerCase().includes(query));
  }, [fieldFilter]);

  const openCommentCount = comments.items.filter((item) => item.status === "OPEN").length;
  const tabs: Array<{ id: PanelTab; label: string }> = [
    { id: "status", label: "Állapot" },
    { id: "fields", label: `Változók${unresolvedCount > 0 ? ` (${unresolvedCount}!)` : ""}` },
    { id: "review", label: `Review${review.items.length > 0 ? ` (${review.items.length})` : ""}` },
    { id: "comments", label: `Megjegyz.${openCommentCount > 0 ? ` (${openCommentCount})` : ""}` },
    { id: "template", label: "Sablon" },
    { id: "export", label: "Export" },
  ];

  return (
    <div className="flex h-full flex-col" data-editor-chrome>
      <div className="flex border-b border-[rgba(22,32,26,0.12)]" role="tablist">
        {tabs.map((entry) => (
          <button
            key={entry.id}
            type="button"
            role="tab"
            aria-selected={tab === entry.id}
            className={`flex-1 px-1 py-1.5 text-[10.5px] font-semibold ${
              tab === entry.id ? "border-b-2 border-[#082817] text-[#082817]" : "text-[#7A8479] hover:text-[#16201A]"
            }`}
            onClick={() => setTab(entry.id)}
          >
            {entry.label}
          </button>
        ))}
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto p-2.5 text-[12px] text-[#16201A]">
        {tab === "status" ? (
          <div className="space-y-3">
            <div className="rounded-[6px] border border-[rgba(185,122,15,0.35)] bg-[#FAEFCF] p-2.5">
              <p className="text-[11px] font-bold text-[#7d530a]">Export szükséges</p>
              <p className="mt-1 text-[11px] leading-relaxed text-[#7d530a]">A módosítások megőrzéséhez válassz exportformátumot.</p>
            </div>
            {documentMeta ? (
              <div className="space-y-1">
                <p className="text-[10px] font-bold uppercase tracking-[0.13em] text-[#7A8479]">Dokumentum</p>
                <p>{documentMeta.name}</p>
                <p className="text-[11px] text-[#7A8479]">
                  Verzió: {documentMeta.version || "n/a"}
                </p>
              </div>
            ) : (
              <p className="text-[11px] text-[#7A8479]">Önálló munkapéldány.</p>
            )}
            <button type="button" className="w-full rounded-[4px] border border-[#082817] bg-[#082817] px-2 py-1.5 text-[11px] font-semibold text-[#F4EFDB]" onClick={onExportDocx}>
              DOCX export
            </button>
          </div>
        ) : null}

        {tab === "fields" ? (
          <div className="space-y-3">
            <div>
              <p className="text-[10px] font-bold uppercase tracking-[0.13em] text-[#7A8479]">Mező beszúrása</p>
              <input
                className="mt-1 w-full rounded-[4px] border border-[rgba(22,32,26,0.18)] px-2 py-1 text-[11.5px] focus:border-[#082817] focus:outline-none"
                placeholder="Mező keresése…"
                value={fieldFilter}
                onChange={(event) => setFieldFilter(event.target.value)}
                aria-label="Mező keresése"
              />
              <ul className="mt-1 space-y-0.5">
                {filteredFields.map((field) => (
                  <li key={field.id}>
                    <button
                      type="button"
                      disabled={readOnly}
                      className="w-full rounded-[4px] px-1.5 py-1 text-left hover:bg-[#FBF6E7] disabled:opacity-50"
                      onClick={() => onInsertField(field.id)}
                    >
                      <span className="font-semibold">{field.label}</span>
                      <span className="ml-1 text-[10px] text-[#7A8479]">({field.source})</span>
                    </button>
                  </li>
                ))}
              </ul>
            </div>
            <div>
              <p className="text-[10px] font-bold uppercase tracking-[0.13em] text-[#7A8479]">
                Mezők a dokumentumban ({occurrences.length})
              </p>
              {occurrences.length === 0 ? (
                <p className="mt-1 text-[11px] italic text-[#7A8479]">Nincs beszúrt mező.</p>
              ) : (
                <ul className="mt-1 space-y-0.5">
                  {occurrences.map((occurrence, index) => (
                    <li key={index} className="flex items-center justify-between gap-2 rounded-[4px] px-1.5 py-0.5">
                      <span className="truncate">{occurrence.label}</span>
                      {occurrence.resolved ? (
                        <span className="truncate text-[10.5px] text-[#123B27]" title={occurrence.resolved}>
                          → {occurrence.resolved}
                        </span>
                      ) : (
                        <span className="shrink-0 rounded-[3px] bg-[#FAEFCF] px-1 text-[10px] font-semibold text-[#7d530a]">
                          feloldatlan
                        </span>
                      )}
                    </li>
                  ))}
                </ul>
              )}
              {occurrences.some((occurrence) => occurrence.resolved) && !readOnly ? (
                <button
                  type="button"
                  className="mt-2 rounded-[4px] border border-[rgba(22,32,26,0.2)] px-2 py-1 text-[11px] font-semibold hover:bg-[#FBF6E7]"
                  onClick={() => {
                    if (window.confirm("A feloldott mezők végleges statikus szöveggé alakulnak. Folytatja?")) {
                      onConvertResolvedTokens();
                    }
                  }}
                >
                  Feloldott mezők statikus szöveggé alakítása
                </button>
              ) : null}
              <p className="mt-2 text-[10px] italic text-[#7A8479]">
                A mezők kizárólag engedélyezett, biztonságos adatforrásokból oldódnak fel. Az átalakítás nem ír vissza
                ügy- vagy ügyféladatot.
              </p>
            </div>
          </div>
        ) : null}

        {tab === "comments" ? (
          <div className="space-y-2">
            <div>
              <p className="text-[10px] font-bold uppercase tracking-[0.13em] text-[#7A8479]">Dokumentumszintű megjegyzések</p>
              <p className="mt-1 text-[10.5px] leading-relaxed text-[#7A8479]">A dokumentumhoz kapcsolt általános megjegyzések.</p>
            </div>
            {!documentMeta || !comments.availability.comments ? (
              <p className="rounded-[4px] border border-[rgba(22,32,26,0.12)] bg-white p-1.5 text-[11px] text-[#7A8479]">
                {documentCommentUnavailableMessage()}
              </p>
            ) : (
              <>
                <label className="block text-[10.5px] font-semibold text-[#3D4842]" htmlFor="document-comment-draft">
                  Új dokumentumszintű megjegyzés
                </label>
                <textarea
                  id="document-comment-draft"
                  value={comments.draft}
                  maxLength={comments.maxLength}
                  onChange={(event) => comments.onDraftChange(event.target.value)}
                  onKeyDown={(event) => {
                    if ((event.ctrlKey || event.metaKey) && event.key === "Enter") {
                      event.preventDefault();
                      comments.onCreate();
                    }
                    if (event.key === "Escape") {
                      comments.onDraftChange("");
                    }
                  }}
                  className="min-h-20 w-full rounded-[5px] border border-[rgba(22,32,26,0.18)] bg-white px-2 py-1 text-[11.5px] focus:border-[#082817] focus:outline-none"
                  placeholder="Plain-text megjegyzés…"
                  aria-describedby="document-comment-counter"
                />
                <div className="flex items-center justify-between gap-2">
                  <span id="document-comment-counter" className="text-[10px] text-[#7A8479]">
                    {comments.draft.trim().length}/{comments.maxLength} karakter · Ctrl/Cmd+Enter beküldés
                  </span>
                  <button
                    type="button"
                    disabled={comments.busy || comments.draft.trim().length === 0}
                    className="rounded-[4px] border border-[#082817] bg-[#082817] px-2 py-1 text-[10.5px] font-semibold text-[#F4EFDB] disabled:opacity-50"
                    onClick={comments.onCreate}
                  >
                    Megjegyzés rögzítése
                  </button>
                </div>
                {comments.error ? (
                  <div className="rounded-[4px] border border-[#F2DAD6] bg-white p-1.5 text-[11px] text-[#8B2A2A]">
                    <p>{comments.error}</p>
                    <button type="button" className="mt-1 underline" onClick={comments.onRetry}>
                      Újrapróbálás
                    </button>
                  </div>
                ) : null}
                {comments.busy ? <p className="text-[11px] text-[#7A8479]">Megjegyzések frissítése…</p> : null}
                {comments.items.length === 0 ? (
                  <p className="rounded-[4px] border border-[rgba(22,32,26,0.12)] bg-white p-1.5 text-[11px] italic text-[#7A8479]">
                    Még nincs dokumentumszintű megjegyzés.
                  </p>
                ) : (
                  <ul className="space-y-1.5">
                    {comments.items.map((comment) => (
                      <li key={comment.id} className="rounded-[5px] border border-[rgba(22,32,26,0.12)] bg-white p-1.5">
                        <div className="flex items-start justify-between gap-2">
                          <div className="min-w-0">
                            <p className="truncate text-[11px] font-semibold text-[#16201A]">{comment.author.displayName}</p>
                            <p className="text-[10px] text-[#7A8479]">
                              {new Date(comment.createdAt).toLocaleString("hu-HU")} · {comment.status === "RESOLVED" ? "lezárva" : "nyitott"}
                            </p>
                          </div>
                          <span className={`shrink-0 rounded-[3px] px-1.5 py-0.5 text-[9.5px] font-bold ${comment.status === "RESOLVED" ? "bg-[#E2E8DA] text-[#123B27]" : "bg-[#FAEFCF] text-[#7d530a]"}`}>
                            {comment.status === "RESOLVED" ? "Lezárva" : "Nyitott"}
                          </span>
                        </div>
                        <p className="mt-1 whitespace-pre-wrap break-words text-[11.5px] leading-relaxed text-[#3D4842]">{comment.content}</p>
                        <div className="mt-1 flex gap-1">
                          {comment.capabilities.canResolve ? (
                            <button type="button" disabled={comments.busy} className="rounded-[3px] border border-[rgba(8,40,23,0.3)] px-1.5 py-0.5 text-[10px] text-[#123B27]" onClick={() => comments.onResolve(comment.id)}>
                              Lezárás
                            </button>
                          ) : null}
                          {comment.capabilities.canReopen ? (
                            <button type="button" disabled={comments.busy} className="rounded-[3px] border border-[rgba(22,32,26,0.15)] px-1.5 py-0.5 text-[10px]" onClick={() => comments.onReopen(comment.id)}>
                              Újranyitás
                            </button>
                          ) : null}
                        </div>
                      </li>
                    ))}
                  </ul>
                )}
              </>
            )}
          </div>
        ) : null}

        {tab === "review" ? (
          <div className="space-y-2">
            {!documentMeta ? (
              <p className="text-[11px] italic text-[#7A8479]">
                A review-folyamat kapcsolt dokumentumot igényel. Önálló munkapéldányhoz nem hozható létre review-feladat.
              </p>
            ) : (
              <>
                {review.canCreateReviewTask ? (
                  <button
                    type="button"
                    disabled={review.busy}
                    className="w-full rounded-[4px] border border-[#062416] bg-[#082817] px-2 py-1.5 text-[11.5px] font-semibold text-[#F4EFDB] hover:bg-[#062416] disabled:opacity-50"
                    onClick={review.onCreateReviewTask}
                  >
                    Review-feladat létrehozása ehhez a dokumentumhoz
                  </button>
                ) : null}
                {review.error ? <p className="text-[11px] text-[#8B2A2A]">{review.error}</p> : null}
                {review.items.length === 0 ? (
                  <p className="text-[11px] italic text-[#7A8479]">Nincs ehhez a dokumentumhoz kapcsolt feladat.</p>
                ) : (
                  <ul className="space-y-1.5">
                    {review.items.map((item) => (
                      <li key={item.id} className="rounded-[5px] border border-[rgba(22,32,26,0.12)] p-1.5">
                        <p className="truncate text-[11.5px] font-semibold" title={item.title}>
                          {item.title}
                        </p>
                        <p className="text-[10.5px] text-[#7A8479]">
                          {item.status} · {item.assignee?.displayName || "nincs felelős"}
                        </p>
                        <div className="mt-1 flex flex-wrap gap-1">
                          {item.capabilities.canStart ? (
                            <button type="button" disabled={review.busy} className="rounded-[3px] border border-[rgba(22,32,26,0.15)] px-1.5 py-0.5 text-[10px] hover:bg-[#FBF6E7]" onClick={() => review.onTaskTransition(item.id, "start")}>
                              Elkezdés
                            </button>
                          ) : null}
                          {item.capabilities.canSubmitForReview ? (
                            <button type="button" disabled={review.busy} className="rounded-[3px] border border-[rgba(22,32,26,0.15)] px-1.5 py-0.5 text-[10px] hover:bg-[#FBF6E7]" onClick={() => review.onTaskTransition(item.id, "submit")}>
                              Review-ra küldés
                            </button>
                          ) : null}
                          {item.capabilities.canApprove ? (
                            <button type="button" disabled={review.busy} className="rounded-[3px] border border-[rgba(8,40,23,0.3)] bg-[#E2E8DA] px-1.5 py-0.5 text-[10px] font-semibold text-[#123B27]" onClick={() => review.onTaskTransition(item.id, "approve")}>
                              Jóváhagyás
                            </button>
                          ) : null}
                          {item.capabilities.canReturnForCorrection ? (
                            <button type="button" disabled={review.busy} className="rounded-[3px] border border-[#F2DAD6] px-1.5 py-0.5 text-[10px] text-[#8B2A2A] hover:bg-[#F2DAD6]" onClick={() => review.onTaskTransition(item.id, "return")}>
                              Visszaküldés javításra
                            </button>
                          ) : null}
                          <Link href={`/tasks?taskId=${encodeURIComponent(item.id)}`} className="rounded-[3px] border border-[rgba(22,32,26,0.15)] px-1.5 py-0.5 text-[10px] text-[#2D4A7C] hover:bg-[#EAEFF6]">
                            Feladat megnyitása
                          </Link>
                        </div>
                      </li>
                    ))}
                  </ul>
                )}
                <p className="text-[10px] italic text-[#7A8479]">
                  A jóváhagyás belső munkafolyamat-jóváhagyás — nem elektronikus aláírás, nem benyújtás és nem az irat
                  jogi érvényességének igazolása. A jogosultságokat a szerver határozza meg.
                </p>
                {documentMeta ? (
                  <Link
                    href={`/documents/compare?caseId=${encodeURIComponent(documentMeta.caseId)}&documentId=${encodeURIComponent(documentMeta.id)}`}
                    className="block rounded-[4px] border border-[rgba(22,32,26,0.15)] px-2 py-1 text-center text-[11px] font-semibold text-[#2D4A7C] hover:bg-[#EAEFF6]"
                  >
                    {compareSavedSourcesLabel()}
                  </Link>
                ) : null}
              </>
            )}
          </div>
        ) : null}

        {tab === "template" ? (
          <div className="space-y-2">
            <p className="text-[10px] font-bold uppercase tracking-[0.13em] text-[#7A8479]">Sablonból munkapéldány</p>
            <p className="text-[11.5px] leading-relaxed text-[#3D4842]">
              {template.capabilities?.availability.generation ? "A sablonos dokumentumkészítés elérhető." : "A sablonkatalógus jelenleg nem érhető el."}
            </p>
            {template.error ? <p className="text-[10.5px] text-[#7A8479]">A sablonadat nem tölthető be.</p> : null}
            <button
              type="button"
              className="w-full rounded-[4px] border border-[rgba(22,32,26,0.2)] bg-white px-2 py-1.5 text-[11px] font-semibold text-[#3D4842] hover:bg-[#FBF6E7]"
              onClick={template.onLocalDocxImport}
            >
              Helyi DOCX import
            </button>
          </div>
        ) : null}

        {tab === "export" ? (
          <div className="space-y-2">
            <button type="button" className="w-full rounded-[4px] border border-[#062416] bg-[#082817] px-2 py-1.5 text-[11.5px] font-semibold text-[#F4EFDB] hover:bg-[#062416]" onClick={onPrint}>
              Nyomtatás / PDF (böngészőből)
            </button>
            <button type="button" className="w-full rounded-[4px] border border-[rgba(22,32,26,0.2)] px-2 py-1.5 text-[11.5px] font-semibold hover:bg-[#FBF6E7]" onClick={onExportDocx}>
              DOCX export (helyi fájl)
            </button>
            <button type="button" className="w-full rounded-[4px] border border-[rgba(22,32,26,0.2)] px-2 py-1.5 text-[11.5px] font-semibold hover:bg-[#FBF6E7]" onClick={onExportHtml}>
              HTML letöltése (önálló, tisztított)
            </button>
            <button type="button" className="w-full rounded-[4px] border border-[rgba(22,32,26,0.2)] px-2 py-1.5 text-[11.5px] font-semibold hover:bg-[#FBF6E7]" onClick={onExportText}>
              Szöveges export (.txt, számozással)
            </button>
            <p className="text-[10px] italic leading-relaxed text-[#7A8479]">Export előtt ellenőrizd a dokumentum tartalmát és a feloldatlan mezőket.</p>
          </div>
        ) : null}
      </div>
    </div>
  );
}
