"use client";

import { useEffect } from "react";
import { EditorContent, useEditor } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import Underline from "@tiptap/extension-underline";
import { paragraphsToPlainText, plainTextToParagraphs } from "./plainTextAdapter";

export type TipTapEditorCommand =
  | "paragraph"
  | "heading"
  | "subheading"
  | "bold"
  | "italic"
  | "underline"
  | "unordered-list"
  | "ordered-list"
  | "blockquote"
  | "contract-clause";

export type TipTapEditorCommandRequest = {
  id: number;
  command: TipTapEditorCommand;
};

export type TipTapEditorSelectionState = {
  text: string;
  from: number;
  to: number;
  empty: boolean;
};

export type TipTapEditorFocusRequest = {
  id: number;
  from: number;
  to: number;
};

export type TipTapEditorMutationRequest = {
  id: number;
  type: "replace" | "delete";
  from: number;
  to: number;
  replacementText?: string;
};

export type TipTapEditorMutationResult = {
  requestId: number;
  ok: boolean;
  error?: string;
};

export type TipTapEditorActiveState = {
  paragraph: boolean;
  heading: boolean;
  subheading: boolean;
  bold: boolean;
  italic: boolean;
  underline: boolean;
  bulletList: boolean;
  orderedList: boolean;
  blockquote: boolean;
};

type TipTapEditorExperimentalProps = {
  value: string;
  onChange: (value: string) => void;
  readOnly?: boolean;
  placeholder?: string;
  commandRequest?: TipTapEditorCommandRequest | null;
  focusRequest?: TipTapEditorFocusRequest | null;
  mutationRequest?: TipTapEditorMutationRequest | null;
  onActiveStateChange?: (state: TipTapEditorActiveState) => void;
  onDocumentJsonChange?: (documentJson: unknown) => void;
  onSelectionChange?: (selection: TipTapEditorSelectionState) => void;
  onMutationResult?: (result: TipTapEditorMutationResult) => void;
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
    paragraph: Boolean(editor?.isActive("paragraph")),
    heading: Boolean(editor?.isActive("heading", { level: 2 })),
    subheading: Boolean(editor?.isActive("heading", { level: 3 })),
    bold: Boolean(editor?.isActive("bold")),
    italic: Boolean(editor?.isActive("italic")),
    underline: Boolean(editor?.isActive("underline")),
    bulletList: Boolean(editor?.isActive("bulletList")),
    orderedList: Boolean(editor?.isActive("orderedList")),
    blockquote: Boolean(editor?.isActive("blockquote")),
  };
}

function getSelectionState(editor: NonNullable<ReturnType<typeof useEditor>>): TipTapEditorSelectionState {
  const { from, to, empty } = editor.state.selection;

  return {
    text: editor.state.doc.textBetween(from, to, "\n").trim(),
    from,
    to,
    empty,
  };
}

export function TipTapEditorExperimental({
  value,
  onChange,
  readOnly = false,
  placeholder,
  commandRequest,
  focusRequest,
  mutationRequest,
  onActiveStateChange,
  onDocumentJsonChange,
  onSelectionChange,
  onMutationResult,
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
          "min-h-[640px] font-serif text-[16.5px] leading-8 text-[#1F2821] outline-none empty:before:text-[#A6AEA3] empty:before:content-[attr(data-placeholder)] [&_blockquote]:my-4 [&_blockquote]:border-l-4 [&_blockquote]:border-[#B28B2E] [&_blockquote]:bg-[#FBF6E7] [&_blockquote]:py-2 [&_blockquote]:pl-4 [&_blockquote]:pr-3 [&_blockquote]:italic [&_h2]:mb-3 [&_h2]:mt-6 [&_h2]:font-serif [&_h2]:text-2xl [&_h2]:font-semibold [&_h2]:leading-9 [&_h2]:text-[#1F4A33] [&_h3]:mb-2 [&_h3]:mt-5 [&_h3]:font-serif [&_h3]:text-xl [&_h3]:font-semibold [&_h3]:leading-8 [&_h3]:text-[#315A40] [&_ol]:list-decimal [&_ol]:pl-6 [&_p]:my-3 [&_ul]:list-disc [&_ul]:pl-6",
      },
    },
    onCreate: ({ editor: createdEditor }) => {
      onActiveStateChange?.(getActiveState(createdEditor));
      onDocumentJsonChange?.(createdEditor.getJSON());
      onSelectionChange?.(getSelectionState(createdEditor));
    },
    onUpdate: ({ editor: updatedEditor }) => {
      onChange(paragraphsToPlainText(plainTextToParagraphs(updatedEditor.getText())));
      onActiveStateChange?.(getActiveState(updatedEditor));
      onDocumentJsonChange?.(updatedEditor.getJSON());
      onSelectionChange?.(getSelectionState(updatedEditor));
    },
    onSelectionUpdate: ({ editor: updatedEditor }) => {
      onActiveStateChange?.(getActiveState(updatedEditor));
      onSelectionChange?.(getSelectionState(updatedEditor));
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

    if (commandRequest.command === "paragraph") {
      chain.setParagraph().run();
    } else if (commandRequest.command === "heading") {
      chain.toggleHeading({ level: 2 }).run();
    } else if (commandRequest.command === "subheading") {
      chain.toggleHeading({ level: 3 }).run();
    } else if (commandRequest.command === "bold") {
      chain.toggleBold().run();
    } else if (commandRequest.command === "italic") {
      chain.toggleItalic().run();
    } else if (commandRequest.command === "underline") {
      chain.toggleUnderline().run();
    } else if (commandRequest.command === "unordered-list") {
      chain.toggleBulletList().run();
    } else if (commandRequest.command === "ordered-list") {
      chain.toggleOrderedList().run();
    } else if (commandRequest.command === "blockquote") {
      chain.toggleBlockquote().run();
    } else {
      chain.insertContent("<ol><li><p>[Szerződéses pont címe]</p><p>[A szerződéses pont szövege.]</p></li></ol><p></p>").run();
    }

    onActiveStateChange?.(getActiveState(editor));
    onDocumentJsonChange?.(editor.getJSON());
  }, [commandRequest, editor, onActiveStateChange, onDocumentJsonChange, readOnly]);

  useEffect(() => {
    if (!editor || !focusRequest) return;

    const docSize = editor.state.doc.content.size;
    const from = Math.max(0, Math.min(focusRequest.from, docSize));
    const to = Math.max(from, Math.min(focusRequest.to, docSize));

    editor.chain().focus().setTextSelection({ from, to }).run();
    onSelectionChange?.(getSelectionState(editor));
    onActiveStateChange?.(getActiveState(editor));
  }, [editor, focusRequest, onActiveStateChange, onSelectionChange]);

  useEffect(() => {
    if (!editor || !mutationRequest || readOnly) return;

    const docSize = editor.state.doc.content.size;
    const rangeIsValid =
      mutationRequest.from >= 0 &&
      mutationRequest.to > mutationRequest.from &&
      mutationRequest.to <= docSize;

    if (!rangeIsValid) {
      onMutationResult?.({
        requestId: mutationRequest.id,
        ok: false,
        error: "A tárolt kijelölési tartomány már nem érvényes ebben a dokumentumállapotban.",
      });
      return;
    }

    try {
      const chain = editor.chain().focus();

      if (mutationRequest.type === "replace") {
        chain.insertContentAt(
          { from: mutationRequest.from, to: mutationRequest.to },
          mutationRequest.replacementText ?? "",
        ).run();
      } else {
        chain.deleteRange({ from: mutationRequest.from, to: mutationRequest.to }).run();
      }

      onActiveStateChange?.(getActiveState(editor));
      onDocumentJsonChange?.(editor.getJSON());
      onSelectionChange?.(getSelectionState(editor));
      onMutationResult?.({ requestId: mutationRequest.id, ok: true });
    } catch {
      onMutationResult?.({
        requestId: mutationRequest.id,
        ok: false,
        error: "A helyi dokumentummódosítás nem sikerült a kísérleti szerkesztőben.",
      });
    }
  }, [
    editor,
    mutationRequest,
    onActiveStateChange,
    onDocumentJsonChange,
    onMutationResult,
    onSelectionChange,
    readOnly,
  ]);

  return (
    <div className="min-h-[640px] rounded-[2px] bg-[#FFFDF8]">
      {/* Experimental TipTap/ProseMirror pilot for future editor architecture; persistence remains owned by each workspace. */}
      <EditorContent editor={editor} />
    </div>
  );
}
