"use client";

import { useCallback, useEffect, useRef } from "react";
import { paragraphsToPlainText, plainTextToParagraphs } from "./plainTextAdapter";

export type ExperimentalEditorCommand =
  | "bold"
  | "italic"
  | "underline"
  | "unordered-list"
  | "ordered-list"
  | "paragraph";

export type ExperimentalEditorCommandRequest = {
  id: number;
  command: ExperimentalEditorCommand;
};

type DocumentRichEditorExperimentalProps = {
  value: string;
  onChange: (value: string) => void;
  readOnly?: boolean;
  placeholder?: string;
  commandRequest?: ExperimentalEditorCommandRequest | null;
};

export function DocumentRichEditorExperimental({
  value,
  onChange,
  readOnly = false,
  placeholder,
  commandRequest,
}: DocumentRichEditorExperimentalProps) {
  const editorRef = useRef<HTMLDivElement | null>(null);
  const lastRenderedValueRef = useRef<string | null>(null);
  const lastCommandIdRef = useRef<number | null>(null);

  const handleInput = useCallback(() => {
    const editor = editorRef.current;
    if (!editor) return;
    const nextValue = paragraphsToPlainText(plainTextToParagraphs(editor.innerText));
    lastRenderedValueRef.current = nextValue;
    onChange(nextValue);
  }, [onChange]);

  useEffect(() => {
    const editor = editorRef.current;
    if (!editor || document.activeElement === editor || lastRenderedValueRef.current === value) return;
    editor.innerText = value;
    lastRenderedValueRef.current = value;
  }, [value]);

  useEffect(() => {
    if (!commandRequest || readOnly || lastCommandIdRef.current === commandRequest.id) return;

    const editor = editorRef.current;
    if (!editor) return;

    lastCommandIdRef.current = commandRequest.id;
    editor.focus();

    // Experimental lab only: native browser editing commands help test toolbar direction before a real editor engine.
    if (commandRequest.command === "unordered-list") {
      document.execCommand("insertUnorderedList");
    } else if (commandRequest.command === "ordered-list") {
      document.execCommand("insertOrderedList");
    } else if (commandRequest.command === "paragraph") {
      document.execCommand("formatBlock", false, "p");
    } else {
      document.execCommand(commandRequest.command);
    }

    handleInput();
  }, [commandRequest, handleInput, readOnly]);

  return (
    <div className="min-h-[640px] rounded-[2px] bg-[#FFFDF8] font-serif text-[16.5px] leading-8 text-[#1F2821]">
      {/* Experimental only: reserved for validating a future TipTap/ProseMirror adapter shape. Not wired into production editors. */}
      <div
        ref={editorRef}
        contentEditable={!readOnly}
        suppressContentEditableWarning
        role="textbox"
        aria-multiline="true"
        aria-readonly={readOnly}
        data-placeholder={placeholder}
        onInput={handleInput}
        className="min-h-[640px] whitespace-pre-wrap outline-none empty:before:text-[#A6AEA3] empty:before:content-[attr(data-placeholder)]"
      />
    </div>
  );
}
