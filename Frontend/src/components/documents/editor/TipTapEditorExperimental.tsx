"use client";

import { useEffect } from "react";
import { EditorContent, useEditor } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import Underline from "@tiptap/extension-underline";
import { paragraphsToPlainText, plainTextToParagraphs } from "./plainTextAdapter";

export type TipTapEditorCommand =
  | "bold"
  | "italic"
  | "underline"
  | "unordered-list"
  | "ordered-list"
  | "paragraph";

export type TipTapEditorCommandRequest = {
  id: number;
  command: TipTapEditorCommand;
};

export type TipTapEditorActiveState = {
  bold: boolean;
  italic: boolean;
  underline: boolean;
  bulletList: boolean;
  orderedList: boolean;
  paragraph: boolean;
};

type TipTapEditorExperimentalProps = {
  value: string;
  onChange: (value: string) => void;
  readOnly?: boolean;
  placeholder?: string;
  commandRequest?: TipTapEditorCommandRequest | null;
  onActiveStateChange?: (state: TipTapEditorActiveState) => void;
  onDocumentJsonChange?: (documentJson: unknown) => void;
};

function escapeHtml(value: string) {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

function plainTextToSimpleHtml(value: string) {
  const paragraphs = plainTextToParagraphs(value);

  if (!paragraphs.length) return "<p></p>";

  return paragraphs
    .map((paragraph) => {
      const lines = paragraph.split("\n").map((line) => escapeHtml(line));
      return `<p>${lines.join("<br />")}</p>`;
    })
    .join("");
}

function getActiveState(editor: ReturnType<typeof useEditor>): TipTapEditorActiveState {
  return {
    bold: Boolean(editor?.isActive("bold")),
    italic: Boolean(editor?.isActive("italic")),
    underline: Boolean(editor?.isActive("underline")),
    bulletList: Boolean(editor?.isActive("bulletList")),
    orderedList: Boolean(editor?.isActive("orderedList")),
    paragraph: Boolean(editor?.isActive("paragraph")),
  };
}

export function TipTapEditorExperimental({
  value,
  onChange,
  readOnly = false,
  placeholder,
  commandRequest,
  onActiveStateChange,
  onDocumentJsonChange,
}: TipTapEditorExperimentalProps) {
  const editor = useEditor({
    extensions: [StarterKit, Underline],
    content: plainTextToSimpleHtml(value),
    editable: !readOnly,
    immediatelyRender: false,
    editorProps: {
      attributes: {
        "aria-label": "TipTap kísérleti szerkesztő",
        "data-placeholder": placeholder ?? "",
        class:
          "min-h-[640px] font-serif text-[16.5px] leading-8 text-[#1F2821] outline-none empty:before:text-[#A6AEA3] empty:before:content-[attr(data-placeholder)] [&_ol]:list-decimal [&_ol]:pl-6 [&_p]:my-3 [&_ul]:list-disc [&_ul]:pl-6",
      },
    },
    onCreate: ({ editor: createdEditor }) => {
      onActiveStateChange?.(getActiveState(createdEditor));
      onDocumentJsonChange?.(createdEditor.getJSON());
    },
    onUpdate: ({ editor: updatedEditor }) => {
      onChange(paragraphsToPlainText(plainTextToParagraphs(updatedEditor.getText())));
      onActiveStateChange?.(getActiveState(updatedEditor));
      onDocumentJsonChange?.(updatedEditor.getJSON());
    },
    onSelectionUpdate: ({ editor: updatedEditor }) => {
      onActiveStateChange?.(getActiveState(updatedEditor));
    },
  });

  useEffect(() => {
    if (!editor) return;
    editor.setEditable(!readOnly);
  }, [editor, readOnly]);

  useEffect(() => {
    if (!editor || editor.isFocused) return;

    const nextText = paragraphsToPlainText(plainTextToParagraphs(editor.getText()));
    const currentText = paragraphsToPlainText(plainTextToParagraphs(value));

    if (nextText !== currentText) {
      editor.commands.setContent(plainTextToSimpleHtml(value), { emitUpdate: false });
    }
  }, [editor, value]);

  useEffect(() => {
    if (!editor || !commandRequest || readOnly) return;

    const chain = editor.chain().focus();

    if (commandRequest.command === "bold") {
      chain.toggleBold().run();
    } else if (commandRequest.command === "italic") {
      chain.toggleItalic().run();
    } else if (commandRequest.command === "underline") {
      chain.toggleUnderline().run();
    } else if (commandRequest.command === "unordered-list") {
      chain.toggleBulletList().run();
    } else if (commandRequest.command === "ordered-list") {
      chain.toggleOrderedList().run();
    } else {
      chain.setParagraph().run();
    }

    onActiveStateChange?.(getActiveState(editor));
    onDocumentJsonChange?.(editor.getJSON());
  }, [commandRequest, editor, onActiveStateChange, onDocumentJsonChange, readOnly]);

  return (
    <div className="min-h-[640px] rounded-[2px] bg-[#FFFDF8]">
      {/* Experimental lab only: TipTap/ProseMirror pilot for future editor architecture. Not wired into production editors. */}
      <EditorContent editor={editor} />
    </div>
  );
}
