"use client";

/**
 * DocumentEditorWorkbench — the canonical professional legal-document editor
 * (DOCUMENT-EDITOR-PRO-CONTRACT-WORKBENCH-1).
 *
 * PERSISTENCE MODE: C — explicit export-only working session. This environment
 * has no enabled server-side document-content persistence route, so content
 * lives only in the current React/editor memory. The UI states this honestly
 * ("Nincs szerverre mentve"), warns before unload, and offers truthful exports
 * (browser print/PDF, sanitized HTML, plain text). There is no fake save, no
 * fake background saving, and no hidden browser-storage copy of the content.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { EditorContent, useEditor } from "@tiptap/react";
import type { Editor } from "@tiptap/core";
import {
  completeTask,
  createDocumentComment,
  createDocumentSourceTask,
  getCaseSummary,
  getCaseWorkItems,
  getCaseWorkflowSummary,
  getDocumentComments,
  getDocumentEditorMetadata,
  getEditorTemplateCapabilities,
  reopenDocumentComment,
  resolveDocumentComment,
  startTask,
  submitTask,
  type CaseWorkItem,
  type DocumentCommentDto,
  type DocumentEditorDto,
  type EditorTemplateCapabilitiesDto,
} from "@/lib/api";
import { EditorNode, emptyEditorDocument } from "@/lib/editor/editorModel";
import {
  addSubclause,
  deleteClause,
  demoteClause,
  duplicateClause,
  extractOutline,
  insertClauseAfter,
  insertClauseBefore,
  moveClauseDown,
  moveClauseUp,
  type OutlineItem,
  promoteClause,
} from "@/lib/editor/clauseNumbering";
import { convertResolvedTokensToStaticText, type FieldResolutionContext } from "@/lib/editor/fieldTokens";
import { computeDocumentStats, editorDocToPlainText } from "@/lib/editor/plainTextExport";
import { editorDocToStandaloneHtml } from "@/lib/editor/htmlExport";
import { validateEditorDocument } from "@/lib/editor/editorSchemaValidator";
import { exportEditorDocumentToDocx, importDocxFileToEditorDocument, summarizeDocxWarnings } from "@/lib/editor/docxInterop";
import {
  buildModeCReviewConfirmation,
  compareSavedSourcesLabel,
  isNearTextLimit,
  shouldWarnBeforeReviewAction,
} from "@/lib/editor/reviewQuality";
import {
  A4_PAGE_WIDTH_PX,
  computeEffectiveZoom,
  defaultWorkbenchLayout,
  EDITOR_ZOOM_OPTIONS,
  exitFocusMode,
  SIDE_PANEL_WIDTH_PX,
  toggleFocusMode,
  toggleOutline,
  toggleSidePanel,
  type WorkbenchLayoutState,
} from "@/lib/editor/workbenchLayout";
import { findSearchMatches, getSearchStorage, SEARCH_PLUGIN_KEY, type SearchMatch } from "./extensions";
import {
  applyClauseOperation,
  buildEditorExtensions,
  currentClauseId,
  findClausePosition,
  transformPastedExternalHtml,
} from "./editorSetup";
import { DocumentEditorToolbar, MenuItem, ToolbarMenu } from "./DocumentEditorToolbar";
import { DocumentOutline } from "./DocumentOutline";
import { DocumentEditorSidePanel, type DocumentCommentsPanelState, type ReviewPanelState } from "./DocumentEditorSidePanel";

const DOCUMENT_COMMENT_MAX_LENGTH = 2000;

type DocumentMeta = {
  id: string;
  caseId: string;
  name: string;
  version?: string | null;
  persistenceMode: DocumentEditorDto["persistence"]["mode"];
  serverPersistence: boolean;
};

export function DocumentEditorWorkbench({ documentId }: { documentId: string | null }) {
  const router = useRouter();

  const [meta, setMeta] = useState<DocumentMeta | null>(null);
  const [editorContract, setEditorContract] = useState<DocumentEditorDto | null>(null);
  const [metaError, setMetaError] = useState<string | null>(null);
  const [metaLoading, setMetaLoading] = useState(Boolean(documentId));
  const [context, setContext] = useState<FieldResolutionContext>({});
  const [docJson, setDocJson] = useState<EditorNode>(emptyEditorDocument());
  const [dirty, setDirty] = useState(false);
  const [templateCapabilities, setTemplateCapabilities] = useState<EditorTemplateCapabilitiesDto | null>(null);
  const [templateCapabilitiesError, setTemplateCapabilitiesError] = useState<string | null>(null);
  const [activeClauseId, setActiveClauseId] = useState<string | null>(null);
  const [zoom, setZoom] = useState(1);
  const [fitWidth, setFitWidth] = useState(false);
  // Workbench chrome layout (outline / side panel / focus mode) — session
  // memory only, responsive defaults applied once from the real viewport.
  const [layout, setLayout] = useState<WorkbenchLayoutState>(() => defaultWorkbenchLayout(1440));
  const layoutInitializedRef = useRef(false);
  const [notice, setNotice] = useState<string | null>(null);

  // Search / replace state
  const [searchOpen, setSearchOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [replaceValue, setReplaceValue] = useState("");
  const [caseSensitive, setCaseSensitive] = useState(false);
  const [wholeWord, setWholeWord] = useState(false);
  const [matches, setMatches] = useState<SearchMatch[]>([]);
  const [activeMatch, setActiveMatch] = useState(0);

  // Review integration
  const [workItems, setWorkItems] = useState<CaseWorkItem[]>([]);
  const [reviewBusy, setReviewBusy] = useState(false);
  const [reviewError, setReviewError] = useState<string | null>(null);
  const [documentComments, setDocumentComments] = useState<DocumentCommentDto[]>([]);
  const [commentsBusy, setCommentsBusy] = useState(false);
  const [commentsError, setCommentsError] = useState<string | null>(null);
  const [commentDraft, setCommentDraft] = useState("");

  const canvasContainerRef = useRef<HTMLDivElement | null>(null);
  const docxInputRef = useRef<HTMLInputElement | null>(null);
  const [containerWidth, setContainerWidth] = useState(0);

  const editor = useEditor({
    extensions: buildEditorExtensions(),
    content: emptyEditorDocument() as never,
    immediatelyRender: false,
    editorProps: {
      attributes: {
        class: "legal-editor-content",
        "aria-label": "Jogi dokumentum szerkesztő",
        role: "textbox",
        "aria-multiline": "true",
      },
      transformPastedHTML: transformPastedExternalHtml,
    },
    onUpdate: ({ editor: updated }) => {
      setDocJson(updated.getJSON() as EditorNode);
      setDirty(true);
    },
    onSelectionUpdate: ({ editor: updated }) => {
      setActiveClauseId(currentClauseId(updated as Editor));
    },
  });

  // --- metadata + safe token context -------------------------------------
  useEffect(() => {
    if (!documentId) {
      setMetaLoading(false);
      return;
    }
    let cancelled = false;
    (async () => {
      try {
        const editorMetadata = await getDocumentEditorMetadata(documentId);
        if (cancelled) return;
        setEditorContract(editorMetadata);
        const document = editorMetadata.document;
        setMeta({
          id: document.id,
          caseId: document.caseId,
          name: document.name,
          version: document.currentVersion ? String(document.currentVersion) : null,
          persistenceMode: editorMetadata.persistence.mode,
          serverPersistence: editorMetadata.availability.serverPersistence,
        });
        const [summary, workflow] = await Promise.all([
          getCaseSummary(document.caseId).catch(() => null),
          getCaseWorkflowSummary(document.caseId).catch(() => null),
        ]);
        if (cancelled) return;
        setContext({
          caseDisplayName: workflow?.case?.displayName || summary?.case?.title || null,
          caseReference: workflow?.case?.reference || summary?.case?.caseNumber || null,
          clientDisplayName: summary?.case?.clientName || null,
          clientRole: workflow?.case?.clientRole || null,
          lawyerDisplayName: workflow?.responsibility?.responsibleLawyer?.displayName || null,
          documentTitle: document.name || null,
        });
      } catch {
        if (!cancelled) setMetaError("A dokumentum-metaadat nem tölthető be.");
      } finally {
        if (!cancelled) setMetaLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [documentId]);

  useEffect(() => {
    let cancelled = false;
    getEditorTemplateCapabilities()
      .then((capabilities) => {
        if (!cancelled) {
          setTemplateCapabilities(capabilities);
          setTemplateCapabilitiesError(null);
        }
      })
      .catch(() => {
        if (!cancelled) setTemplateCapabilitiesError("A sablonképességek nem tölthetők be.");
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const refreshWorkItems = useCallback(async () => {
    if (!meta) return;
    try {
      const response = await getCaseWorkItems(meta.caseId);
      setWorkItems(
        response.items.filter(
          (item) => item.type === "TASK" && item.source?.type === "DOCUMENT" && item.source.id === meta.id
        )
      );
      setReviewError(null);
    } catch {
      setReviewError("A kapcsolt feladatok nem tölthetők be.");
    }
  }, [meta]);

  useEffect(() => {
    void refreshWorkItems();
  }, [refreshWorkItems]);

  const refreshDocumentComments = useCallback(async () => {
    if (!meta || !editorContract?.availability.comments) {
      setDocumentComments([]);
      return;
    }
    setCommentsBusy(true);
    try {
      const response = await getDocumentComments(meta.id, { limit: 50 });
      setDocumentComments(response.comments);
      setCommentsError(null);
    } catch {
      setCommentsError("A dokumentumszintű megjegyzések nem tölthetők be.");
    } finally {
      setCommentsBusy(false);
    }
  }, [meta, editorContract]);

  useEffect(() => {
    void refreshDocumentComments();
  }, [refreshDocumentComments]);

  // --- unsaved-content protection (export-only mode) ----------------------
  useEffect(() => {
    const handler = (event: BeforeUnloadEvent) => {
      if (dirty) {
        event.preventDefault();
        event.returnValue = "";
      }
    };
    window.addEventListener("beforeunload", handler);
    return () => window.removeEventListener("beforeunload", handler);
  }, [dirty]);

  // --- responsive layout defaults (one-time, from the real viewport) --------
  useEffect(() => {
    if (layoutInitializedRef.current) return;
    layoutInitializedRef.current = true;
    setLayout(defaultWorkbenchLayout(window.innerWidth));
  }, []);

  // --- fit-width zoom ------------------------------------------------------
  useEffect(() => {
    const element = canvasContainerRef.current;
    if (!element) return;
    const observer = new ResizeObserver((entries) => {
      for (const entry of entries) setContainerWidth(entry.contentRect.width);
    });
    observer.observe(element);
    return () => observer.disconnect();
  }, []);

  const effectiveZoom = computeEffectiveZoom({ zoom, fitWidth, containerWidth });

  // --- outline + stats -----------------------------------------------------
  const outline = useMemo(() => extractOutline(docJson), [docJson]);
  const stats = useMemo(() => computeDocumentStats(docJson), [docJson]);
  const nearTextLimit = isNearTextLimit(stats.characters);
  const activeClauseNumber = useMemo(() => {
    if (!activeClauseId) return null;
    return outline.find((item) => item.clauseId === activeClauseId)?.number || null;
  }, [outline, activeClauseId]);

  // --- clause operations ----------------------------------------------------
  const runClauseAction = useCallback(
    (action: string, clauseId: string) => {
      if (!editor) return;
      if (action === "delete" && !window.confirm("Biztosan törli a pontot (az alpontjaival együtt)?")) return;
      const doc = editor.getJSON() as EditorNode;
      const operations: Record<string, (input: EditorNode, cid: string) => ReturnType<typeof insertClauseBefore>> = {
        "insert-before": insertClauseBefore,
        "insert-after": insertClauseAfter,
        "add-sub": addSubclause,
        "move-up": moveClauseUp,
        "move-down": moveClauseDown,
        promote: promoteClause,
        demote: demoteClause,
        duplicate: duplicateClause,
        delete: deleteClause,
      };
      const operation = operations[action];
      if (!operation) return;
      const applied = applyClauseOperation(editor, operation(doc, clauseId));
      if (!applied.ok) {
        setNotice(applied.error || "A művelet nem hajtható végre.");
        window.setTimeout(() => setNotice(null), 4000);
      } else {
        setDocJson(editor.getJSON() as EditorNode);
        setDirty(true);
      }
    },
    [editor]
  );

  const navigateOutline = useCallback(
    (item: OutlineItem) => {
      if (!editor) return;
      if (item.clauseId) {
        const location = findClausePosition(editor, item.clauseId);
        if (location) {
          editor.chain().focus().setTextSelection(Math.min(location.pos + 2, editor.state.doc.content.size)).scrollIntoView().run();
        }
        return;
      }
      // Headings: find nth heading occurrence by outline order.
      const headingOrdinal = Number(item.key.replace("h-", ""));
      let seen = 0;
      editor.state.doc.descendants((node, pos) => {
        if (node.type.name === "heading") {
          seen += 1;
          if (seen === headingOrdinal) {
            editor.chain().focus().setTextSelection(pos + 1).scrollIntoView().run();
            return false;
          }
        }
        return true;
      });
    },
    [editor]
  );

  // --- search / replace -----------------------------------------------------
  const applySearch = useCallback(
    (query: string, options?: { caseSensitive?: boolean; wholeWord?: boolean }) => {
      if (!editor) return;
      const nextCase = options?.caseSensitive ?? caseSensitive;
      const nextWhole = options?.wholeWord ?? wholeWord;
      const found = query ? findSearchMatches(editor.state.doc, { query, caseSensitive: nextCase, wholeWord: nextWhole }) : [];
      setMatches(found);
      setActiveMatch(0);
      getSearchStorage(editor).current = {
        query,
        caseSensitive: nextCase,
        wholeWord: nextWhole,
        activeIndex: 0,
      };
      editor.view.dispatch(editor.state.tr.setMeta(SEARCH_PLUGIN_KEY, true));
      if (found.length > 0) {
        editor.chain().setTextSelection({ from: found[0].from, to: found[0].to }).scrollIntoView().run();
      }
    },
    [editor, caseSensitive, wholeWord]
  );

  const gotoMatch = useCallback(
    (direction: 1 | -1) => {
      if (!editor || matches.length === 0) return;
      const next = (activeMatch + direction + matches.length) % matches.length;
      setActiveMatch(next);
      getSearchStorage(editor).current = { query: searchQuery, caseSensitive, wholeWord, activeIndex: next };
      editor.view.dispatch(editor.state.tr.setMeta(SEARCH_PLUGIN_KEY, true));
      editor.chain().setTextSelection({ from: matches[next].from, to: matches[next].to }).scrollIntoView().run();
    },
    [editor, matches, activeMatch, searchQuery, caseSensitive, wholeWord]
  );

  const replaceCurrent = useCallback(() => {
    if (!editor || matches.length === 0) return;
    const match = matches[activeMatch];
    editor.chain().focus().insertContentAt({ from: match.from, to: match.to }, replaceValue).run();
    applySearch(searchQuery);
  }, [editor, matches, activeMatch, replaceValue, applySearch, searchQuery]);

  const replaceAll = useCallback(() => {
    if (!editor || matches.length === 0) return;
    if (!window.confirm(`Mind a(z) ${matches.length} találat cseréje?`)) return;
    const chain = editor.chain().focus();
    for (const match of [...matches].reverse()) {
      chain.insertContentAt({ from: match.from, to: match.to }, replaceValue);
    }
    chain.run();
    applySearch(searchQuery);
  }, [editor, matches, replaceValue, applySearch, searchQuery]);

  useEffect(() => {
    if (!searchOpen && editor) {
      getSearchStorage(editor).current = { query: "", caseSensitive: false, wholeWord: false, activeIndex: 0 };
      editor.view.dispatch(editor.state.tr.setMeta(SEARCH_PLUGIN_KEY, true));
      setMatches([]);
    }
  }, [searchOpen, editor]);

  // Ctrl+F opens the in-editor search; Escape leaves focus mode (menus and the
  // search bar handle their own Escape first and stop propagation).
  useEffect(() => {
    const handler = (event: KeyboardEvent) => {
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "f") {
        event.preventDefault();
        setSearchOpen(true);
        return;
      }
      if (event.key === "Escape" && !searchOpen) {
        setLayout((current) => exitFocusMode(current));
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [searchOpen]);

  // --- exports (truthful: browser print, sanitized HTML, plain text) --------
  const exportBaseName = (meta?.name || "munkapeldany").replace(/\.[a-z0-9]+$/i, "").replace(/[^\p{L}\p{N}_-]+/gu, "_");

  const downloadBlob = useCallback((fileName: string, blob: Blob) => {
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = fileName;
    anchor.click();
    URL.revokeObjectURL(url);
  }, []);

  const download = useCallback((fileName: string, mimeType: string, content: string) => {
    const blob = new Blob([content], { type: mimeType });
    downloadBlob(fileName, blob);
  }, [downloadBlob]);

  const guardedExport = useCallback(
    (exporter: () => void) => {
      const validation = validateEditorDocument(docJson);
      if (!validation.ok) {
        setNotice(`Az export nem futtatható: a dokumentum érvénytelen szerkezetet tartalmaz (${validation.errors[0]}).`);
        window.setTimeout(() => setNotice(null), 6000);
        return;
      }
      exporter();
    },
    [docJson]
  );

  const exportHtml = useCallback(() => {
    guardedExport(() =>
      download(`${exportBaseName}.html`, "text/html;charset=utf-8", editorDocToStandaloneHtml(docJson, { title: meta?.name || "Munkapéldány", context }))
    );
  }, [guardedExport, download, exportBaseName, docJson, meta, context]);

  const exportText = useCallback(() => {
    guardedExport(() => download(`${exportBaseName}.txt`, "text/plain;charset=utf-8", editorDocToPlainText(docJson, context)));
  }, [guardedExport, download, exportBaseName, docJson, context]);

  const exportDocx = useCallback(() => {
    guardedExport(() => {
      exportEditorDocumentToDocx(docJson, { filename: meta?.name || exportBaseName, context })
        .then((result) => {
          if (result.warnings.length > 0) {
            setNotice(`DOCX export elkészült figyelmeztetéssel: ${result.warnings[0].message}`);
            window.setTimeout(() => setNotice(null), 8000);
          }
          downloadBlob(result.filename, result.blob);
        })
        .catch(() => {
          setNotice("A DOCX export nem futtatható a jelenlegi dokumentumszerkezettel.");
          window.setTimeout(() => setNotice(null), 8000);
        });
    });
  }, [guardedExport, docJson, meta, exportBaseName, context, downloadBlob]);

  const printDocument = useCallback(() => {
    guardedExport(() => window.print());
  }, [guardedExport]);

  const importDocx = useCallback(
    async (file: File) => {
      setNotice("DOCX ellenőrzése és helyi átalakítása…");
      try {
        const result = await importDocxFileToEditorDocument(file);
        if (!result.inspection.accepted) {
          const firstError = result.inspection.blockingErrors[0]?.message || "A DOCX nem importálható biztonságosan.";
          setNotice(firstError);
          window.setTimeout(() => setNotice(null), 9000);
          return;
        }
        const warningText = summarizeDocxWarnings(result.warnings);
        const confirmed = window.confirm(
          [
            dirty ? "A jelenlegi szerkesztői munkamenet nincs szerverre mentve." : null,
            result.warnings.length > 0 ? warningText : null,
            "A DOCX import helyben fut, és nem menti a tartalmat szerverre. Lecseréli a jelenlegi tartalmat?",
          ]
            .filter(Boolean)
            .join("\n\n")
        );
        if (!confirmed) {
          setNotice("DOCX import megszakítva; a jelenlegi tartalom változatlan maradt.");
          window.setTimeout(() => setNotice(null), 5000);
          return;
        }
        editor?.commands.setContent(result.document as never, { emitUpdate: true });
        setDocJson(result.document);
        setDirty(true);
        setNotice(
          result.warnings.length > 0
            ? `DOCX import kész figyelmeztetéssel: ${result.warnings[0].message}`
            : "DOCX import kész. A munkamenet nincs szerverre mentve."
        );
        window.setTimeout(() => setNotice(null), 9000);
      } catch {
        setNotice("A DOCX import sikertelen volt.");
        window.setTimeout(() => setNotice(null), 8000);
      }
    },
    [dirty, editor]
  );

  // --- review actions --------------------------------------------------------
  const reviewPanel: ReviewPanelState = {
    items: workItems,
    busy: reviewBusy,
    error: reviewError,
    canCreateReviewTask: Boolean(meta),
    onCreateReviewTask: () => {
      if (!meta) return;
      if (shouldWarnBeforeReviewAction(dirty) && !window.confirm(buildModeCReviewConfirmation(true))) return;
      setReviewBusy(true);
      createDocumentSourceTask(meta.id, { kind: "REVIEW" })
        .then(() => refreshWorkItems())
        .catch(() => setReviewError("A review-feladat létrehozása sikertelen."))
        .finally(() => setReviewBusy(false));
    },
    onTaskTransition: (taskId, action) => {
      if (action === "submit" && shouldWarnBeforeReviewAction(dirty) && !window.confirm(buildModeCReviewConfirmation(true))) return;
      setReviewBusy(true);
      const transition =
        action === "start"
          ? startTask(taskId)
          : action === "submit"
            ? submitTask(taskId)
            : action === "approve"
              ? completeTask(taskId, true)
              : completeTask(taskId, false);
      transition
        .then(() => refreshWorkItems())
        .catch(() => setReviewError("A feladatátmenet nem hajtható végre (a jogosultságokat a szerver ellenőrzi)."))
        .finally(() => setReviewBusy(false));
    },
  };

  const commentsPanel: DocumentCommentsPanelState = {
    items: documentComments,
    busy: commentsBusy,
    error: commentsError,
    draft: commentDraft,
    maxLength: DOCUMENT_COMMENT_MAX_LENGTH,
    availability: {
      comments: Boolean(meta && editorContract?.availability.comments),
      anchoredComments: false,
      delete: false,
    },
    onDraftChange: setCommentDraft,
    onCreate: () => {
      const content = commentDraft.trim();
      if (!meta || !content) return;
      setCommentsBusy(true);
      createDocumentComment(meta.id, content)
        .then(() => {
          setCommentDraft("");
          return refreshDocumentComments();
        })
        .catch(() => setCommentsError("A megjegyzés rögzítése sikertelen. Csak plain-text, legfeljebb 2000 karakteres tartalom küldhető."))
        .finally(() => setCommentsBusy(false));
    },
    onResolve: (commentId) => {
      if (!meta) return;
      setCommentsBusy(true);
      resolveDocumentComment(meta.id, commentId)
        .then(() => refreshDocumentComments())
        .catch(() => setCommentsError("A megjegyzés lezárása sikertelen."))
        .finally(() => setCommentsBusy(false));
    },
    onReopen: (commentId) => {
      if (!meta) return;
      setCommentsBusy(true);
      reopenDocumentComment(meta.id, commentId)
        .then(() => refreshDocumentComments())
        .catch(() => setCommentsError("A megjegyzés újranyitása sikertelen."))
        .finally(() => setCommentsBusy(false));
    },
    onRetry: () => {
      void refreshDocumentComments();
    },
  };

  const insertField = useCallback(
    (fieldId: string) => {
      editor?.chain().focus().insertContent({ type: "fieldToken", attrs: { fieldId } }).run();
    },
    [editor]
  );

  const convertTokens = useCallback(() => {
    if (!editor) return;
    const converted = convertResolvedTokensToStaticText(editor.getJSON() as EditorNode, context);
    editor.commands.setContent(converted as never, { emitUpdate: true });
    setDocJson(editor.getJSON() as EditorNode);
    setDirty(true);
  }, [editor, context]);

  const goBack = useCallback(() => {
    if (dirty && !window.confirm("A tartalom nincs szerverre mentve, és az oldal elhagyásával elvész. Elhagyja az oldalt?")) {
      return;
    }
    if (meta) router.push(`/cases/${encodeURIComponent(meta.caseId)}`);
    else router.push("/cases");
  }, [dirty, meta, router]);

  // --- render ----------------------------------------------------------------
  if (metaLoading) {
    return (
      <div className="flex h-full min-h-0 items-center justify-center bg-[#E7E3D4]">
        <p className="text-[12px] text-[#7A8479]">Szerkesztő betöltése…</p>
      </div>
    );
  }
  if (metaError) {
    return (
      <div className="flex h-full min-h-0 items-start justify-center bg-[#E7E3D4] p-6">
        <p className="max-w-lg rounded-[6px] border border-[#F2DAD6] bg-white p-4 text-[13px] text-[#8B2A2A]">{metaError}</p>
      </div>
    );
  }

  const openCommentCount = documentComments.filter((item) => item.status === "OPEN").length;
  const activeReviewItem = workItems.find((item) => item.workflowCategory !== "COMPLETED") || null;

  return (
    <div className="editor-print-root flex h-full min-h-0 flex-col overflow-hidden bg-[#E7E3D4]">
      {/* Workbench header — compact, always visible */}
      <header className="flex flex-wrap items-center justify-between gap-x-2 gap-y-1 border-b border-[rgba(22,32,26,0.15)] bg-[#FDFBF3] px-3 py-1.5 print:hidden" data-editor-chrome>
        <div className="flex min-w-0 items-center gap-2">
          <button type="button" className="shrink-0 rounded-[4px] border border-[rgba(22,32,26,0.2)] px-2 py-1 text-[11.5px] font-semibold text-[#3D4842] hover:bg-[#FBF6E7]" onClick={goBack}>
            ← Ügy
          </button>
          <div className="min-w-0">
            <p className="truncate text-[13px] font-bold leading-tight text-[#16201A]" title={meta?.name || "Új munkapéldány"}>
              {meta?.name || "Új munkapéldány (szerződéstervezet)"}
            </p>
            <p className="truncate text-[10px] leading-tight text-[#7A8479]">
              {[context.caseReference, context.clientDisplayName, meta?.version ? `v${meta.version} (metaadat)` : null]
                .filter(Boolean)
                .join(" · ") || "Önálló munkapéldány"}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-1.5">
          {activeReviewItem ? (
            <span
              className="hidden rounded-[4px] border border-[rgba(45,74,124,0.25)] bg-[#EAEFF6] px-2 py-1 text-[10.5px] font-semibold text-[#2D4A7C] md:inline-block"
              title={`Kapcsolódó feladat: ${activeReviewItem.title}`}
            >
              Review: {activeReviewItem.status}
            </span>
          ) : null}
          <span
            className={`rounded-[4px] border px-2 py-1 text-[10.5px] font-bold ${
              dirty ? "border-[rgba(185,122,15,0.4)] bg-[#FAEFCF] text-[#7d530a]" : "border-[rgba(22,32,26,0.15)] bg-white text-[#3D4842]"
            }`}
            title="Ebben a környezetben nincs engedélyezett szerveroldali tartalommentés; a tartalom csak ebben a böngészőlapon él."
          >
            {dirty ? "Nem mentett — nincs szerverre mentve" : "Munkamenet — nincs szerverre mentve"}
          </span>
          <input
            ref={docxInputRef}
            type="file"
            accept=".docx,application/vnd.openxmlformats-officedocument.wordprocessingml.document"
            className="hidden"
            aria-hidden="true"
            onChange={(event) => {
              const file = event.target.files?.[0] || null;
              event.currentTarget.value = "";
              if (file) void importDocx(file);
            }}
          />
          <ToolbarMenu label="Export / Import ▾" title="Helyi export- és importműveletek (nem szerveroldali mentés)" widthClass="w-72">
            {(close) => (
              <>
                <MenuItem
                  label="Nyomtatás / PDF (böngészőből)"
                  description="A PDF a böngésző nyomtatási funkciójával készül."
                  onSelect={() => {
                    printDocument();
                    close();
                  }}
                />
                <MenuItem
                  label="DOCX export (helyi fájl)"
                  description="Új DOCX készül helyben; ez nem szerveroldali mentés."
                  onSelect={() => {
                    exportDocx();
                    close();
                  }}
                />
                <MenuItem
                  label="HTML letöltése"
                  description="Önálló, tisztított HTML."
                  onSelect={() => {
                    exportHtml();
                    close();
                  }}
                />
                <MenuItem
                  label="Szöveges export (.txt)"
                  description="Számozással, helyi fájlként."
                  onSelect={() => {
                    exportText();
                    close();
                  }}
                />
                <MenuItem
                  label="DOCX import (helyi fájl)"
                  description="A fájl nem kerül feltöltésre; a jelenlegi tartalmat lecseréli."
                  onSelect={() => {
                    docxInputRef.current?.click();
                    close();
                  }}
                />
              </>
            )}
          </ToolbarMenu>
          <button
            type="button"
            aria-pressed={layout.outlineOpen}
            title={layout.outlineOpen ? "Vázlat elrejtése" : "Vázlat megjelenítése"}
            className={`rounded-[4px] border px-2 py-1 text-[11px] font-semibold ${layout.outlineOpen ? "border-[#082817] bg-[#082817] text-[#F4EFDB]" : "border-[rgba(22,32,26,0.2)] text-[#3D4842] hover:bg-[#FBF6E7]"}`}
            onClick={() => setLayout((current) => toggleOutline(current))}
          >
            Vázlat
          </button>
          <button
            type="button"
            aria-pressed={layout.sidePanelOpen}
            title={layout.sidePanelOpen ? "Oldalpanel elrejtése" : "Oldalpanel megjelenítése"}
            className={`rounded-[4px] border px-2 py-1 text-[11px] font-semibold ${layout.sidePanelOpen ? "border-[#082817] bg-[#082817] text-[#F4EFDB]" : "border-[rgba(22,32,26,0.2)] text-[#3D4842] hover:bg-[#FBF6E7]"}`}
            onClick={() => setLayout((current) => toggleSidePanel(current))}
          >
            Panel
          </button>
          <button
            type="button"
            aria-pressed={layout.focusMode}
            title={layout.focusMode ? "Panelek visszaállítása (Esc)" : "Fókusz mód: csak a dokumentum"}
            className={`rounded-[4px] border px-2 py-1 text-[11px] font-semibold ${layout.focusMode ? "border-[#082817] bg-[#082817] text-[#F4EFDB]" : "border-[rgba(22,32,26,0.2)] text-[#3D4842] hover:bg-[#FBF6E7]"}`}
            onClick={() => setLayout((current) => toggleFocusMode(current))}
          >
            {layout.focusMode ? "Panelek visszaállítása" : "Fókusz mód"}
          </button>
        </div>
      </header>

      <DocumentEditorToolbar editor={editor} readOnly={false} onToggleSearch={() => setSearchOpen((open) => !open)} onPrint={printDocument} />

      {searchOpen ? (
        <div className="flex flex-wrap items-center gap-2 border-b border-[rgba(22,32,26,0.12)] bg-white px-3 py-1.5 print:hidden" data-editor-chrome>
          <input
            autoFocus
            className="w-48 rounded-[4px] border border-[rgba(22,32,26,0.2)] px-2 py-1 text-[12px]"
            placeholder="Keresés…"
            value={searchQuery}
            aria-label="Keresés a dokumentumban"
            onChange={(event) => {
              setSearchQuery(event.target.value);
              applySearch(event.target.value);
            }}
            onKeyDown={(event) => {
              if (event.key === "Enter") gotoMatch(event.shiftKey ? -1 : 1);
              if (event.key === "Escape") setSearchOpen(false);
            }}
          />
          <span className="text-[11px] text-[#7A8479]">
            {matches.length > 0 ? `${activeMatch + 1}/${matches.length} találat` : searchQuery ? "Nincs találat" : ""}
          </span>
          <button type="button" className="rounded border border-[rgba(22,32,26,0.15)] px-1.5 py-0.5 text-[11px]" onClick={() => gotoMatch(-1)} aria-label="Előző találat">↑</button>
          <button type="button" className="rounded border border-[rgba(22,32,26,0.15)] px-1.5 py-0.5 text-[11px]" onClick={() => gotoMatch(1)} aria-label="Következő találat">↓</button>
          <label className="flex items-center gap-1 text-[11px] text-[#3D4842]">
            <input type="checkbox" checked={caseSensitive} onChange={(event) => { setCaseSensitive(event.target.checked); applySearch(searchQuery, { caseSensitive: event.target.checked }); }} />
            Kis/nagybetű
          </label>
          <label className="flex items-center gap-1 text-[11px] text-[#3D4842]">
            <input type="checkbox" checked={wholeWord} onChange={(event) => { setWholeWord(event.target.checked); applySearch(searchQuery, { wholeWord: event.target.checked }); }} />
            Teljes szó
          </label>
          <input
            className="w-40 rounded-[4px] border border-[rgba(22,32,26,0.2)] px-2 py-1 text-[12px]"
            placeholder="Csere erre…"
            value={replaceValue}
            aria-label="Csere értéke"
            onChange={(event) => setReplaceValue(event.target.value)}
          />
          <button type="button" className="rounded border border-[rgba(22,32,26,0.15)] px-2 py-0.5 text-[11px] hover:bg-[#FBF6E7]" onClick={replaceCurrent} disabled={matches.length === 0}>Csere</button>
          <button type="button" className="rounded border border-[rgba(22,32,26,0.15)] px-2 py-0.5 text-[11px] hover:bg-[#FBF6E7]" onClick={replaceAll} disabled={matches.length === 0}>Összes cseréje</button>
          <button type="button" className="ml-auto rounded px-1.5 text-[13px] text-[#7A8479]" onClick={() => setSearchOpen(false)} aria-label="Keresés bezárása">×</button>
        </div>
      ) : null}

      {notice ? (
        <p className="border-b border-[rgba(185,122,15,0.3)] bg-[#FAEFCF] px-3 py-1 text-[11.5px] text-[#7d530a] print:hidden" data-editor-chrome role="status">
          {notice}
        </p>
      ) : null}

      {nearTextLimit ? (
        <p className="border-b border-[rgba(185,122,15,0.3)] bg-[#FAEFCF] px-3 py-1 text-[11.5px] text-[#7d530a] print:hidden" data-editor-chrome role="status">
          A munkapéldány közelít a helyi szerkesztési karakterkorláthoz. Exportáljon gyakran, és nagy DOCX import előtt őrizze meg a jelenlegi példányt külön fájlban.
        </p>
      ) : null}

      {/* Workbench body: the ONLY vertical scroll surfaces live inside here —
          the document viewport and (independently) the two support rails. */}
      <div className="flex min-h-0 flex-1 overflow-hidden">
        {layout.outlineOpen ? (
          <aside className="w-60 shrink-0 overflow-hidden border-r border-[rgba(22,32,26,0.12)] bg-[#FDFBF3] print:hidden" aria-label="Dokumentum vázlat sáv">
            <DocumentOutline
              outline={outline}
              activeClauseId={activeClauseId}
              readOnly={false}
              onNavigate={navigateOutline}
              onClauseAction={runClauseAction}
              onScrollTop={() => editor?.chain().focus().setTextSelection(1).scrollIntoView().run()}
              onScrollBottom={() => editor?.chain().focus().setTextSelection(editor.state.doc.content.size - 1).scrollIntoView().run()}
            />
          </aside>
        ) : null}

        <div ref={canvasContainerRef} className="editor-canvas-scroll min-w-0 flex-1 overflow-auto px-4 py-6" data-editor-viewport>
          <div
            className="editor-a4-page mx-auto bg-white"
            style={{
              width: A4_PAGE_WIDTH_PX,
              // CSS zoom (not transform) so the layout box and the viewport's
              // scrollHeight track the visual size at every zoom level.
              zoom: effectiveZoom,
            }}
          >
            <EditorContent editor={editor} />
          </div>
        </div>

        {layout.sidePanelOpen ? (
          <aside
            className="shrink-0 overflow-hidden border-l border-[rgba(22,32,26,0.12)] bg-[#FDFBF3] print:hidden"
            style={{ width: SIDE_PANEL_WIDTH_PX }}
            aria-label="Szerkesztői oldalpanel"
          >
            <DocumentEditorSidePanel
              docJson={docJson}
              context={context}
              documentMeta={meta}
              review={reviewPanel}
              comments={commentsPanel}
              template={{
                capabilities: templateCapabilities,
                error: templateCapabilitiesError,
                onLocalDocxImport: () => docxInputRef.current?.click(),
              }}
              readOnly={false}
              onInsertField={insertField}
              onConvertResolvedTokens={convertTokens}
              onExportHtml={exportHtml}
              onExportText={exportText}
              onExportDocx={exportDocx}
              onPrint={printDocument}
            />
          </aside>
        ) : null}
      </div>

      {/* Status bar — compact, always visible */}
      <footer className="flex flex-wrap items-center justify-between gap-x-2 gap-y-0.5 border-t border-[rgba(22,32,26,0.15)] bg-[#FDFBF3] px-3 py-1 text-[10.5px] text-[#7A8479] print:hidden" data-editor-chrome>
        <div className="flex min-w-0 flex-wrap items-center gap-x-3 gap-y-0.5">
          <span>{stats.words} szó</span>
          <span className="hidden sm:inline">{stats.characters} karakter</span>
          <span className="hidden md:inline">{stats.paragraphs} bekezdés</span>
          <span>{stats.clauses} pont</span>
          <span title="Karakterszámból becsült érték — nem valós oldaltördelés">~{stats.approximatePages} oldal (becslés)</span>
          {openCommentCount > 0 ? <span title="Nyitott dokumentumszintű megjegyzések">{openCommentCount} nyitott megjegyzés</span> : null}
          {activeClauseNumber ? <span className="font-semibold text-[#7A6014]">Aktuális pont: {activeClauseNumber}</span> : null}
        </div>
        <div className="flex items-center gap-2">
          <span className={dirty ? "font-semibold text-[#7d530a]" : ""} title={compareSavedSourcesLabel()}>
            {dirty ? "Nem mentett — nincs szerverre mentve" : "Nincs szerverre mentve"}
          </span>
          <label className="flex items-center gap-1">
            <span className="sr-only">Nagyítás</span>
            <select
              className="rounded-[4px] border border-[rgba(22,32,26,0.2)] bg-white px-1 py-0.5 text-[10.5px]"
              aria-label="Nagyítás"
              value={fitWidth ? -1 : zoom}
              onChange={(event) => {
                const value = Number(event.target.value);
                if (value === -1) setFitWidth(true);
                else {
                  setFitWidth(false);
                  setZoom(value);
                }
              }}
            >
              {EDITOR_ZOOM_OPTIONS.map((option) => (
                <option key={option.label} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
          </label>
        </div>
      </footer>
    </div>
  );
}
