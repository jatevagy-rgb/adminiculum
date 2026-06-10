"use client";

import type { EditorReviewSuggestion, EditorReviewSuggestionType } from "./reviewModel";
import type { TipTapEditorSelectionState } from "./TipTapEditorExperimental";

type TipTapReviewPilotPanelProps = {
  selection: TipTapEditorSelectionState;
  selectedText: string;
  syncTargetLabel?: "munkapéldányba" | "beadványvázlatba";
  canCreateSuggestion: boolean;
  canCreateReplacement: boolean;
  replacementText: string;
  suggestions: EditorReviewSuggestion[];
  getSelectionExcerpt: (text: string, maxLength?: number) => string;
  onReplacementTextChange: (value: string) => void;
  onCreateSuggestion: (type: EditorReviewSuggestionType) => void;
  onFocusSuggestion: (suggestion: EditorReviewSuggestion) => void;
  onAcceptSuggestion: (suggestion: EditorReviewSuggestion) => void;
  onRejectSuggestion: (suggestion: EditorReviewSuggestion) => void;
};

function getSuggestionTypeLabel(type: EditorReviewSuggestion["type"]) {
  if (type === "comment") return "Megjegyzés";
  if (type === "replacement") return "Cserejavaslat";
  return "Törlési javaslat";
}

function getSuggestionStatusLabel(status: EditorReviewSuggestion["status"]) {
  if (status === "accepted") return "Elfogadva";
  if (status === "rejected") return "Elutasítva";
  return "Függőben";
}

function getSuggestionStatusClass(status: EditorReviewSuggestion["status"]) {
  if (status === "accepted") return "border-[#BFDDBF] bg-[#EEF8ED] text-[#1E6A34]";
  if (status === "rejected") return "border-[#E5C3C3] bg-[#FFF1F1] text-[#8B2A2A]";
  return "border-[#E6C987] bg-[#FAEFCF] text-[#7A5A1F]";
}

export function TipTapReviewPilotPanel({
  selection,
  selectedText,
  syncTargetLabel = "munkapéldányba",
  canCreateSuggestion,
  canCreateReplacement,
  replacementText,
  suggestions,
  getSelectionExcerpt,
  onReplacementTextChange,
  onCreateSuggestion,
  onFocusSuggestion,
  onAcceptSuggestion,
  onRejectSuggestion,
}: TipTapReviewPilotPanelProps) {
  return (
    <>
      <div className="rounded-[12px] border border-[#D8CFB6] bg-[#FFFDF8] p-3 shadow-sm">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0 flex-1">
            <p className="font-serif text-[15px] font-medium text-[#1F2821]">
              Kijelölt szöveg
            </p>
            {canCreateSuggestion ? (
              <>
                <p className="mt-2 max-w-2xl rounded-[8px] border border-[#E7DECB] bg-white px-3 py-2 text-sm leading-6 text-[#1F2821]">
                  „{getSelectionExcerpt(selectedText, 180)}”
                </p>
                <p className="mt-1 font-mono text-[11px] text-[#7B776D]">
                  Tartomány: {selection.from}–{selection.to}
                </p>
              </>
            ) : (
              <p className="mt-2 text-sm text-[#7B776D]">
                Jelölj ki szöveget a kísérleti szerkesztőben review-javaslat létrehozásához.
              </p>
            )}
          </div>
          <p className="max-w-xs rounded-[8px] border border-[#E6C987] bg-[#FAEFCF] px-3 py-2 text-[11px] leading-5 text-[#6C5120]">
            Helyi review-pilot · nem Word-változáskövetés · mentéshez előbb vedd át a {syncTargetLabel}.
          </p>
        </div>
        <div className="mt-3 grid gap-3 lg:grid-cols-[minmax(0,0.7fr)_minmax(320px,1fr)]">
          <label className="grid gap-1 text-[11px] font-semibold uppercase tracking-[0.12em] text-[#7A5A1F]">
            Csereszöveg
            <input
              value={replacementText}
              onChange={(event) => onReplacementTextChange(event.target.value)}
              placeholder="Cserejavaslat szövege"
              className="rounded-[8px] border border-[#D8CFB6] bg-white px-3 py-2 text-sm font-normal normal-case tracking-normal text-[#1F2821] outline-none focus:border-[#B28B2E] focus:ring-2 focus:ring-[#FAEFCF]"
            />
          </label>
          <div className="flex flex-wrap items-end gap-2 rounded-[8px] border border-[#EFE6D2] bg-white/80 p-2">
            <button
              type="button"
              onClick={() => onCreateSuggestion("comment")}
              disabled={!canCreateSuggestion}
              className="rounded-[999px] border border-[#C8D8F0] bg-[#F1F6FE] px-3 py-2 text-[11px] font-semibold text-[#244B7A] hover:bg-[#E6F0FC] disabled:cursor-not-allowed disabled:opacity-50"
            >
              Megjegyzés a kijelöléshez
            </button>
            <button
              type="button"
              onClick={() => onCreateSuggestion("replacement")}
              disabled={!canCreateReplacement}
              className="rounded-[999px] border border-[#E6C987] bg-[#FAEFCF] px-3 py-2 text-[11px] font-semibold text-[#7A5A1F] hover:bg-[#F7E5B8] disabled:cursor-not-allowed disabled:opacity-50"
            >
              Cserejavaslat a kijelöléshez
            </button>
            <button
              type="button"
              onClick={() => onCreateSuggestion("deletion")}
              disabled={!canCreateSuggestion}
              className="rounded-[999px] border border-[#E5C3C3] bg-[#FFF1F1] px-3 py-2 text-[11px] font-semibold text-[#8B2A2A] hover:bg-[#FDE5E5] disabled:cursor-not-allowed disabled:opacity-50"
            >
              Törlési javaslat a kijelöléshez
            </button>
          </div>
        </div>
      </div>

      <div className="rounded-[12px] border border-[#E7DECB] bg-white p-3 shadow-sm">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <p className="font-serif text-[15px] font-medium text-[#1F2821]">Review-javaslatok</p>
          <span className="rounded-full border border-[#D8CFB6] bg-[#FCFAF4] px-2 py-0.5 text-[10px] font-semibold text-[#7A5A1F]">
            {suggestions.length} helyi javaslat
          </span>
        </div>
        {suggestions.length ? (
          <div className="mt-3 space-y-2">
            {suggestions.map((suggestion) => (
              <div key={suggestion.id} className="rounded-[10px] border border-[#E7DECB] bg-[#FFFDF8] p-3">
                <div className="flex flex-wrap items-center gap-2">
                  <button
                    type="button"
                    onClick={() => onFocusSuggestion(suggestion)}
                    className="text-left text-sm font-semibold text-[#1F2821] hover:text-[#7A5A1F]"
                  >
                    {getSuggestionTypeLabel(suggestion.type)}
                  </button>
                  <span
                    className={`rounded-full border px-2 py-0.5 text-[10px] font-semibold uppercase tracking-[0.08em] ${getSuggestionStatusClass(
                      suggestion.status,
                    )}`}
                  >
                    {getSuggestionStatusLabel(suggestion.status)}
                  </span>
                  <span className="font-mono text-[10px] text-[#7B776D]">
                    {suggestion.range.from}–{suggestion.range.to}
                  </span>
                </div>
                <p className="mt-2 line-clamp-2 text-sm leading-6 text-[#1F2821]">„{suggestion.selectedTextPreview}”</p>
                {suggestion.replacementText ? (
                  <p className="mt-2 rounded-[6px] border border-[#BFDDBF] bg-[#EEF8ED] px-2 py-1 text-xs text-[#1E6A34]">
                    Javasolt csere: {suggestion.replacementText}
                  </p>
                ) : null}
                {suggestion.helperText ? (
                  <p className="mt-2 rounded-[6px] border border-[#D8CFB6] bg-[#FCFAF4] px-2 py-1 text-[11px] text-[#6D6A62]">
                    {suggestion.helperText}
                  </p>
                ) : null}
                <div className="mt-3 flex flex-wrap gap-2 border-t border-[#EFE6D2] pt-2">
                  <button
                    type="button"
                    onClick={() => onFocusSuggestion(suggestion)}
                    className="rounded-[999px] border border-[#D8CFB6] bg-white px-3 py-1 text-[11px] font-semibold text-[#5A4317] hover:border-[#B28B2E] hover:bg-[#FAEFCF]"
                  >
                    Kijelölés megnyitása
                  </button>
                  <button
                    type="button"
                    onClick={() => onAcceptSuggestion(suggestion)}
                    disabled={suggestion.status !== "pending"}
                    className="rounded-[999px] border border-[#BFDDBF] bg-[#EEF8ED] px-3 py-1 text-[11px] font-semibold text-[#1E6A34] hover:bg-[#E2F1E0] disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    Elfogadás
                  </button>
                  <button
                    type="button"
                    onClick={() => onRejectSuggestion(suggestion)}
                    disabled={suggestion.status !== "pending"}
                    className="rounded-[999px] border border-[#E5C3C3] bg-[#FFF1F1] px-3 py-1 text-[11px] font-semibold text-[#8B2A2A] hover:bg-[#FDE5E5] disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    Elutasítás
                  </button>
                </div>
              </div>
            ))}
          </div>
        ) : (
          <p className="mt-2 text-sm text-[#7B776D]">Még nincs helyi review-javaslat.</p>
        )}
      </div>
    </>
  );
}
