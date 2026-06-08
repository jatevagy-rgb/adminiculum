"use client";

import { useEffect, useRef } from "react";
import { paragraphsToPlainText, plainTextToParagraphs } from "./plainTextAdapter";

type DocumentRichEditorExperimentalProps = {
  value: string;
  onChange: (value: string) => void;
  readOnly?: boolean;
  placeholder?: string;
};

export function DocumentRichEditorExperimental({
  value,
  onChange,
  readOnly = false,
  placeholder,
}: DocumentRichEditorExperimentalProps) {
  const editorRef = useRef<HTMLDivElement | null>(null);
  const lastRenderedValueRef = useRef(value);

  useEffect(() => {
    const editor = editorRef.current;
    if (!editor || document.activeElement === editor || lastRenderedValueRef.current === value) return;
    editor.innerText = value;
    lastRenderedValueRef.current = value;
  }, [value]);

  const handleInput = () => {
    const editor = editorRef.current;
    if (!editor) return;
    const nextValue = paragraphsToPlainText(plainTextToParagraphs(editor.innerText));
    lastRenderedValueRef.current = nextValue;
    onChange(nextValue);
  };

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
      >
        {value}
      </div>
    </div>
  );
}
