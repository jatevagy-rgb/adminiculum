"use client";

import { useState } from "react";
import { DocumentEditorShell } from "@/components/documents/DocumentEditorShell";
import {
  DocumentRichEditorExperimental,
  type ExperimentalEditorCommand,
  type ExperimentalEditorCommandRequest,
} from "@/components/documents/editor/DocumentRichEditorExperimental";
import {
  type TipTapEditorActiveState,
  type TipTapEditorFocusRequest,
  type TipTapEditorMutationRequest,
  type TipTapEditorMutationResult,
  TipTapEditorExperimental,
  type TipTapEditorCommand,
  type TipTapEditorCommandRequest,
  type TipTapEditorSelectionState,
} from "@/components/documents/editor/TipTapEditorExperimental";
import {
  createReviewSuggestion as buildReviewSuggestion,
  markSuggestionAccepted,
  markSuggestionHelperText,
  markSuggestionRejected,
  type EditorReviewSuggestion,
  type EditorReviewSuggestionStatus,
  type EditorReviewSuggestionType,
} from "@/components/documents/editor/reviewModel";

const sampleLegalText = `Tisztelt Bíróság!

Alulírott jogi képviselő útján előterjesztett beadványban az alábbi tényállási és jogi körülményekre hivatkozom.

A felek között létrejött szerződés teljesítése körében vita alakult ki a szolgáltatás határidejéről, valamint az elszámolás alapjául szolgáló dokumentumok tartalmáról.

Kérem a tisztelt bíróságot, hogy a rendelkezésre álló iratok és bizonyítékok alapján a kérelmet érdemben bírálja el.`;

const toolbarActions: Array<{
  label: string;
  command: TipTapEditorCommand;
  plainCommand?: ExperimentalEditorCommand;
  group: "text-style" | "structure" | "list" | "insert";
}> = [
  { label: "Normál", command: "paragraph", plainCommand: "paragraph", group: "text-style" },
  { label: "Félkövér", command: "bold", plainCommand: "bold", group: "text-style" },
  { label: "Dőlt", command: "italic", plainCommand: "italic", group: "text-style" },
  { label: "Aláhúzás", command: "underline", plainCommand: "underline", group: "text-style" },
  { label: "Címsor", command: "heading", group: "structure" },
  { label: "Alcím", command: "subheading", group: "structure" },
  { label: "Idézet", command: "blockquote", group: "structure" },
  { label: "Felsorolás", command: "unordered-list", plainCommand: "unordered-list", group: "list" },
  { label: "Számozás", command: "ordered-list", plainCommand: "ordered-list", group: "list" },
  { label: "Szerződéses pont", command: "contract-clause", group: "insert" },
];

type EditorAdapterKind = "tiptap" | "plain-contenteditable";

const initialTipTapActiveState: TipTapEditorActiveState = {
  paragraph: false,
  heading: false,
  subheading: false,
  bold: false,
  italic: false,
  underline: false,
  bulletList: false,
  orderedList: false,
  blockquote: false,
};

function isToolbarActionActive(command: TipTapEditorCommand, activeState: TipTapEditorActiveState) {
  if (command === "paragraph") return activeState.paragraph;
  if (command === "heading") return activeState.heading;
  if (command === "subheading") return activeState.subheading;
  if (command === "blockquote") return activeState.blockquote;
  if (command === "bold") return activeState.bold;
  if (command === "italic") return activeState.italic;
  if (command === "underline") return activeState.underline;
  if (command === "unordered-list") return activeState.bulletList;
  if (command === "ordered-list") return activeState.orderedList;
  return false;
}

export default function EditorLabPage() {
  const [editorValue, setEditorValue] = useState(sampleLegalText);
  const [editorAdapter, setEditorAdapter] = useState<EditorAdapterKind>("tiptap");
  const [commandRequest, setCommandRequest] = useState<ExperimentalEditorCommandRequest | null>(null);
  const [tipTapCommandRequest, setTipTapCommandRequest] = useState<TipTapEditorCommandRequest | null>(null);
  const [tipTapActiveState, setTipTapActiveState] = useState<TipTapEditorActiveState>(initialTipTapActiveState);
  const [tipTapDocumentJson, setTipTapDocumentJson] = useState<unknown>(null);
  const [tipTapSelection, setTipTapSelection] = useState<TipTapEditorSelectionState | null>(null);
  const [tipTapFocusRequest, setTipTapFocusRequest] = useState<TipTapEditorFocusRequest | null>(null);
  const [tipTapMutationRequest, setTipTapMutationRequest] = useState<TipTapEditorMutationRequest | null>(null);
  const [reviewSuggestions, setReviewSuggestions] = useState<EditorReviewSuggestion[]>([]);
  const [replacementText, setReplacementText] = useState("");

  const runToolbarCommand = (command: TipTapEditorCommand, plainCommand?: ExperimentalEditorCommand) => {
    const id = Date.now();
    if (plainCommand) setCommandRequest({ id, command: plainCommand });
    setTipTapCommandRequest({ id, command });
  };

  const selectedText = tipTapSelection?.text.trim() ?? "";
  const canCreateAnchor = editorAdapter === "tiptap" && Boolean(selectedText) && !tipTapSelection?.empty;
  const canCreateReplacement = canCreateAnchor && Boolean(replacementText.trim());

  const createReviewSuggestion = (type: EditorReviewSuggestionType) => {
    if (!canCreateAnchor || !tipTapSelection) return;
    if (type === "replacement" && !replacementText.trim()) return;

    const createdAt = new Date().toISOString();
    const nextSuggestion = buildReviewSuggestion({
      id: `lab-${type}-${Date.now()}`,
      createdAt,
      type,
      selectedText,
      range: {
        from: tipTapSelection.from,
        to: tipTapSelection.to,
      },
      replacementText,
    });

    setReviewSuggestions((currentSuggestions) => [nextSuggestion, ...currentSuggestions]);
    if (type === "replacement") setReplacementText("");
  };

  const focusSuggestion = (suggestion: EditorReviewSuggestion) => {
    setTipTapFocusRequest({ id: Date.now(), from: suggestion.range.from, to: suggestion.range.to });
  };

  const markSuggestionStatus = (
    suggestionId: string,
    status: EditorReviewSuggestionStatus,
    helperText?: string,
    pendingMutationRequestId?: number,
  ) => {
    setReviewSuggestions((currentSuggestions) =>
      currentSuggestions.map((suggestion) =>
        suggestion.id === suggestionId ? markSuggestionHelperText({ ...suggestion, status }, helperText, pendingMutationRequestId) : suggestion,
      ),
    );
  };

  const acceptSuggestion = (suggestion: EditorReviewSuggestion) => {
    if (suggestion.status !== "pending") return;

    if (suggestion.type === "comment") {
      setReviewSuggestions((currentSuggestions) =>
        currentSuggestions.map((currentSuggestion) =>
          currentSuggestion.id === suggestion.id
            ? markSuggestionAccepted(currentSuggestion, "A helyi megjegyzés elfogadva; dokumentumszöveg nem módosult.")
            : currentSuggestion,
        ),
      );
      return;
    }

    const requestId = Date.now();
    markSuggestionStatus(suggestion.id, "pending", "Helyi módosítás folyamatban…", requestId);
    setTipTapMutationRequest({
      id: requestId,
      type: suggestion.type === "replacement" ? "replace" : "delete",
      from: suggestion.range.from,
      to: suggestion.range.to,
      replacementText: suggestion.replacementText,
    });
  };

  const rejectSuggestion = (suggestion: EditorReviewSuggestion) => {
    if (suggestion.status !== "pending") return;
    setReviewSuggestions((currentSuggestions) =>
      currentSuggestions.map((currentSuggestion) =>
        currentSuggestion.id === suggestion.id
          ? markSuggestionRejected(currentSuggestion, "A helyi javaslat elutasítva; dokumentumszöveg nem módosult.")
          : currentSuggestion,
      ),
    );
  };

  const handleMutationResult = (result: TipTapEditorMutationResult) => {
    setReviewSuggestions((currentSuggestions) =>
      currentSuggestions.map((suggestion) => {
        if (suggestion.pendingMutationRequestId !== result.requestId) return suggestion;

        return result.ok
          ? markSuggestionAccepted(suggestion, "A helyi javaslat elfogadva és a kísérleti dokumentumszöveg módosítva.")
          : markSuggestionHelperText(
              suggestion,
              result.error ?? "A helyi dokumentummódosítás nem sikerült.",
              undefined,
            );
      }),
    );
  };

  return (
    <main className="min-h-screen bg-[#F7F2E6] px-4 py-6 text-[#1F2821] sm:px-6 lg:px-8">
      <div className="mx-auto flex max-w-7xl flex-col gap-5">
        <div className="rounded-[12px] border border-[#D8CFB6] bg-white px-4 py-3 shadow-sm">
          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-[#7A5A1F]">
            Belső szerkesztő tesztfelület
          </p>
          <p className="mt-2 text-sm text-[#5F675F]">
            Rejtett fejlesztői oldal a TipTap/ProseMirror pilot és a korábbi no-dependency adapter kézi próbájához.
            Nem része a fő navigációnak.
          </p>
        </div>

        <div className="grid gap-5 xl:grid-cols-[minmax(0,1.5fr)_minmax(340px,0.8fr)]">
          <DocumentEditorShell
            title="Kísérleti beadványszerkesztő"
            subtitle={
              editorAdapter === "tiptap"
                ? "TipTap/ProseMirror adapter DocumentEditorShell editorSlot-tal, produkciós szerkesztők módosítása nélkül."
                : "Korábbi no-dependency contentEditable adapter DocumentEditorShell editorSlot-tal."
            }
            value={editorValue}
            onChange={setEditorValue}
            isDirty={editorValue !== sampleLegalText}
            dirtyLabel="Helyi tesztmódosítás — nincs szervermentés."
            cleanLabel="Minta szöveg betöltve."
            toolbar={
              <div className="flex flex-col gap-2">
                <p className="text-xs font-semibold uppercase tracking-[0.14em] text-[#7A5A1F]">
                  Belső formázási próba
                </p>
                <div className="flex flex-wrap gap-2 border-b border-[#E7DECB] pb-2">
                  <button
                    type="button"
                    onClick={() => setEditorAdapter("tiptap")}
                    className={`rounded-[999px] border px-3 py-1.5 text-xs font-semibold transition ${
                      editorAdapter === "tiptap"
                        ? "border-[#B28B2E] bg-[#FAEFCF] text-[#5A4317]"
                        : "border-[#D8CFB6] bg-[#FFFDF8] text-[#2F3A31] hover:border-[#B28B2E]"
                    }`}
                  >
                    TipTap pilot
                  </button>
                  <button
                    type="button"
                    onClick={() => setEditorAdapter("plain-contenteditable")}
                    className={`rounded-[999px] border px-3 py-1.5 text-xs font-semibold transition ${
                      editorAdapter === "plain-contenteditable"
                        ? "border-[#B28B2E] bg-[#FAEFCF] text-[#5A4317]"
                        : "border-[#D8CFB6] bg-[#FFFDF8] text-[#2F3A31] hover:border-[#B28B2E]"
                    }`}
                  >
                    No-dependency adapter
                  </button>
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  {(["text-style", "structure", "list", "insert"] as const).map((group) => (
                    <span key={group} className="flex items-center gap-1 rounded-[7px] border border-[#E7DECB] bg-white/80 px-1.5 py-1">
                      {toolbarActions
                        .filter((action) => action.group === group)
                        .map((action) => (
                          <button
                            key={action.command}
                            type="button"
                            onMouseDown={(event) => event.preventDefault()}
                            onClick={() => runToolbarCommand(action.command, action.plainCommand)}
                            className={`rounded-[5px] border px-2.5 py-1 text-xs font-semibold transition focus:outline-none focus:ring-2 focus:ring-[#D8B45A] ${
                              editorAdapter === "tiptap" && isToolbarActionActive(action.command, tipTapActiveState)
                                ? "border-[#B28B2E] bg-[#FAEFCF] text-[#5A4317]"
                                : "border-transparent bg-[#FFFDF8] text-[#2F3A31] hover:border-[#B28B2E] hover:bg-[#FAEFCF]"
                            }`}
                            aria-pressed={editorAdapter === "tiptap" ? isToolbarActionActive(action.command, tipTapActiveState) : undefined}
                          >
                            {action.label}
                          </button>
                        ))}
                    </span>
                  ))}
                </div>
                <p className="text-[11px] leading-5 text-[#7B776D]">
                  Kísérleti, helyi eszköztár: nem ígér Word-kompatibilitást, változáskövetést vagy szervermentést.
                </p>
              </div>
            }
            editorMode="rich-text-ready"
            editorSlot={
              editorAdapter === "tiptap" ? (
                <TipTapEditorExperimental
                  value={editorValue}
                  onChange={setEditorValue}
                  commandRequest={tipTapCommandRequest}
                  focusRequest={tipTapFocusRequest}
                  mutationRequest={tipTapMutationRequest}
                  onActiveStateChange={setTipTapActiveState}
                  onDocumentJsonChange={setTipTapDocumentJson}
                  onSelectionChange={setTipTapSelection}
                  onMutationResult={handleMutationResult}
                  placeholder="Írj vagy illessz be jogi szöveget a TipTap pilot teszteléséhez."
                />
              ) : (
                <DocumentRichEditorExperimental
                  value={editorValue}
                  onChange={setEditorValue}
                  commandRequest={commandRequest}
                  placeholder="Írj vagy illessz be jogi szöveget a no-dependency adapter teszteléséhez."
                />
              )
            }
            helperText="Ez a felület kizárólag belső tesztelésre szolgál; nem ment szerverre és nem használ mesterséges intelligenciát."
          />

          <aside className="rounded-[12px] border border-[#D8CFB6] bg-white p-4 shadow-[0_12px_34px_rgba(22,32,26,0.08)]">
            <h2 className="font-serif text-xl text-[#1F2821]">Élő plain-text kimenet</h2>
            <p className="mt-1 text-xs text-[#6D6A62]">
              Debug nézet: az experimental editor aktuális egyszerű szöveges értéke.
            </p>
            <pre className="mt-4 max-h-[720px] overflow-auto whitespace-pre-wrap rounded-[8px] border border-[#E7DECB] bg-[#FCFAF4] p-4 font-mono text-xs leading-5 text-[#1F2821]">
              {editorValue}
            </pre>
            {editorAdapter === "tiptap" ? (
              <div className="mt-4 space-y-4">
                <section className="rounded-[10px] border border-[#E7DECB] bg-[#FCFAF4] p-3">
                  <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
                    <div className="min-w-0">
                      <h3 className="text-sm font-semibold text-[#1F2821]">Kijelölés / review sandbox</h3>
                      <p className="mt-1 text-xs text-[#6D6A62]">
                        Helyi próba jövőbeli jogi megjegyzés- és változtatási javaslatokhoz; nem Word-komment és nem szervermentés.
                      </p>
                    </div>
                    <div className="flex flex-wrap gap-2">
                      <button
                        type="button"
                        onClick={() => createReviewSuggestion("comment")}
                        disabled={!canCreateAnchor}
                        className="rounded-[999px] border border-[#B28B2E] bg-[#FAEFCF] px-3 py-1.5 text-xs font-semibold text-[#5A4317] transition hover:bg-[#F4DE9D] disabled:cursor-not-allowed disabled:border-[#D8CFB6] disabled:bg-[#F7F2E6] disabled:text-[#8B887F]"
                      >
                        Megjegyzés a kijelöléshez
                      </button>
                      <button
                        type="button"
                        onClick={() => createReviewSuggestion("deletion")}
                        disabled={!canCreateAnchor}
                        className="rounded-[999px] border border-[#B28B2E] bg-[#FAEFCF] px-3 py-1.5 text-xs font-semibold text-[#5A4317] transition hover:bg-[#F4DE9D] disabled:cursor-not-allowed disabled:border-[#D8CFB6] disabled:bg-[#F7F2E6] disabled:text-[#8B887F]"
                      >
                        Törlési javaslat a kijelöléshez
                      </button>
                    </div>
                  </div>

                  <div className="mt-3 rounded-[8px] border border-dashed border-[#D8CFB6] bg-white p-3">
                    <p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-[#7A5A1F]">
                      Aktuális kijelölés
                    </p>
                    {selectedText ? (
                      <>
                        <p className="mt-2 whitespace-pre-wrap text-sm leading-6 text-[#1F2821]">{selectedText}</p>
                        <p className="mt-2 font-mono text-[11px] text-[#6D6A62]">
                          from: {tipTapSelection?.from} · to: {tipTapSelection?.to}
                        </p>
                      </>
                    ) : (
                      <p className="mt-2 text-sm text-[#6D6A62]">Nincs aktív szövegkijelölés a TipTap szerkesztőben.</p>
                    )}
                  </div>

                  <div className="mt-3 rounded-[8px] border border-[#E7DECB] bg-white p-3">
                    <label className="text-[11px] font-semibold uppercase tracking-[0.12em] text-[#7A5A1F]" htmlFor="editor-lab-replacement-text">
                      Cserejavaslat szövege
                    </label>
                    <textarea
                      id="editor-lab-replacement-text"
                      value={replacementText}
                      onChange={(event) => setReplacementText(event.target.value)}
                      rows={3}
                      placeholder="Add meg a kijelölt szöveg javasolt cseréjét."
                      className="mt-2 w-full resize-y rounded-[8px] border border-[#D8CFB6] bg-[#FFFDF8] px-3 py-2 text-sm leading-6 text-[#1F2821] outline-none focus:border-[#B28B2E] focus:ring-2 focus:ring-[#F4DE9D]"
                    />
                    <button
                      type="button"
                      onClick={() => createReviewSuggestion("replacement")}
                      disabled={!canCreateReplacement}
                      className="mt-2 rounded-[999px] border border-[#B28B2E] bg-[#FAEFCF] px-3 py-1.5 text-xs font-semibold text-[#5A4317] transition hover:bg-[#F4DE9D] disabled:cursor-not-allowed disabled:border-[#D8CFB6] disabled:bg-[#F7F2E6] disabled:text-[#8B887F]"
                    >
                      Cserejavaslat a kijelöléshez
                    </button>
                  </div>

                  <div className="mt-3">
                    <p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-[#7A5A1F]">
                      Helyi review lista
                    </p>
                    {reviewSuggestions.length ? (
                      <div className="mt-2 space-y-2">
                        {reviewSuggestions.map((suggestion) => (
                          <div
                            key={suggestion.id}
                            data-review-suggestion-id={suggestion.id}
                            data-review-suggestion-type={suggestion.type}
                            className="rounded-[8px] border border-[#E7DECB] bg-white p-3"
                          >
                            <span className="block font-mono text-[11px] text-[#7A5A1F]">{suggestion.id}</span>
                            <span className="mt-1 inline-flex rounded-[999px] border border-[#D8CFB6] bg-[#FCFAF4] px-2 py-0.5 text-[11px] font-semibold uppercase tracking-[0.08em] text-[#5A4317]">
                              {suggestion.type === "comment"
                                ? "Megjegyzés"
                                : suggestion.type === "replacement"
                                  ? "Cserejavaslat"
                                  : "Törlési javaslat"}
                            </span>
                            <span
                              className={`ml-2 mt-1 inline-flex rounded-[999px] border px-2 py-0.5 text-[11px] font-semibold uppercase tracking-[0.08em] ${
                                suggestion.status === "accepted"
                                  ? "border-[#BFD8BF] bg-[#F5FAF5] text-[#2F5A37]"
                                  : suggestion.status === "rejected"
                                    ? "border-[#E0B8B8] bg-[#FFF5F5] text-[#8A3A2A]"
                                    : "border-[#D8CFB6] bg-[#FFFDF8] text-[#6D6A62]"
                              }`}
                            >
                              {suggestion.status === "accepted"
                                ? "Elfogadva"
                                : suggestion.status === "rejected"
                                  ? "Elutasítva"
                                  : "Függőben"}
                            </span>
                            <span className="mt-2 block text-sm leading-6 text-[#1F2821]">{suggestion.selectedTextPreview}</span>
                            {suggestion.replacementText ? (
                              <span className="mt-2 block rounded-[6px] border border-[#D9E6D9] bg-[#F5FAF5] px-2 py-1 text-xs leading-5 text-[#2F5A37]">
                                Javasolt csere: {suggestion.replacementText}
                              </span>
                            ) : null}
                            {suggestion.helperText ? (
                              <span className="mt-2 block rounded-[6px] border border-[#E7DECB] bg-[#FCFAF4] px-2 py-1 text-xs leading-5 text-[#6D6A62]">
                                {suggestion.helperText}
                              </span>
                            ) : null}
                            <span className="mt-2 block font-mono text-[11px] text-[#6D6A62]">
                              {suggestion.range.from}–{suggestion.range.to} · {suggestion.createdAt}
                            </span>
                            <span className="mt-3 flex flex-wrap gap-2">
                              <button
                                type="button"
                                onClick={() => focusSuggestion(suggestion)}
                                className="rounded-[999px] border border-[#D8CFB6] bg-[#FFFDF8] px-3 py-1 text-xs font-semibold text-[#5A4317] hover:border-[#B28B2E] hover:bg-[#FAEFCF]"
                              >
                                Kijelölés megnyitása
                              </button>
                              <button
                                type="button"
                                onClick={() => acceptSuggestion(suggestion)}
                                disabled={suggestion.status !== "pending"}
                                className="rounded-[999px] border border-[#BFD8BF] bg-[#F5FAF5] px-3 py-1 text-xs font-semibold text-[#2F5A37] hover:bg-[#E6F3E6] disabled:cursor-not-allowed disabled:opacity-50"
                              >
                                Elfogadás
                              </button>
                              <button
                                type="button"
                                onClick={() => rejectSuggestion(suggestion)}
                                disabled={suggestion.status !== "pending"}
                                className="rounded-[999px] border border-[#E0B8B8] bg-[#FFF5F5] px-3 py-1 text-xs font-semibold text-[#8A3A2A] hover:bg-[#FDEBEB] disabled:cursor-not-allowed disabled:opacity-50"
                              >
                                Elutasítás
                              </button>
                            </span>
                          </div>
                        ))}
                      </div>
                    ) : (
                      <p className="mt-2 text-sm text-[#6D6A62]">Még nincs helyi review javaslat.</p>
                    )}
                  </div>
                </section>

                <h3 className="text-sm font-semibold text-[#1F2821]">TipTap JSON debug</h3>
                <p className="mt-1 text-xs text-[#6D6A62]">
                  Kísérleti ProseMirror dokumentumállapot, kizárólag fejlesztői ellenőrzéshez.
                </p>
                <pre className="mt-3 max-h-[360px] overflow-auto whitespace-pre-wrap rounded-[8px] border border-[#E7DECB] bg-[#FCFAF4] p-4 font-mono text-[11px] leading-5 text-[#1F2821]">
                  {JSON.stringify(tipTapDocumentJson, null, 2)}
                </pre>
              </div>
            ) : null}
          </aside>
        </div>
      </div>
    </main>
  );
}
