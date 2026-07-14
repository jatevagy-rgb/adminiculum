"use client";

/**
 * Grouped professional toolbar for the legal-document editor. Every control is
 * keyboard-accessible, labeled in Hungarian, exposes disabled/active states,
 * and only supported actions are rendered (no decorative placeholders).
 */

import { useCallback, useState } from "react";
import type { Editor } from "@tiptap/core";
import { INSERTION_PRESETS } from "@/lib/editor/insertionPresets";
import { EDITOR_FIELDS } from "@/lib/editor/fieldTokens";
import { insertPresetContent } from "./editorSetup";

type ToolbarProps = {
  editor: Editor | null;
  readOnly: boolean;
  onToggleSearch: () => void;
  onPrint: () => void;
};

function ToolbarButton({
  label,
  title,
  onClick,
  active = false,
  disabled = false,
}: {
  label: string;
  title: string;
  onClick: () => void;
  active?: boolean;
  disabled?: boolean;
}) {
  return (
    <button
      type="button"
      title={title}
      aria-label={title}
      aria-pressed={active}
      disabled={disabled}
      onClick={onClick}
      className={`rounded-[4px] border px-2 py-1 text-[11.5px] font-semibold leading-none transition-colors disabled:cursor-not-allowed disabled:opacity-45 ${
        active
          ? "border-[#082817] bg-[#082817] text-[#F4EFDB]"
          : "border-[rgba(22,32,26,0.18)] bg-white text-[#16201A] hover:bg-[#FBF6E7]"
      }`}
    >
      {label}
    </button>
  );
}

function ToolbarGroup({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex items-center gap-1 border-r border-[rgba(22,32,26,0.12)] pr-2 last:border-r-0" role="group" aria-label={label}>
      {children}
    </div>
  );
}

export function DocumentEditorToolbar({ editor, readOnly, onToggleSearch, onPrint }: ToolbarProps) {
  const [insertMenuOpen, setInsertMenuOpen] = useState(false);
  const [fieldMenuOpen, setFieldMenuOpen] = useState(false);

  const run = useCallback(
    (command: (chain: ReturnType<Editor["chain"]>) => { run: () => boolean }) => {
      if (!editor || readOnly) return;
      command(editor.chain().focus());
    },
    [editor, readOnly]
  );

  if (!editor) return null;
  const disabled = readOnly;

  return (
    <div className="flex flex-wrap items-center gap-2 border-b border-[rgba(22,32,26,0.12)] bg-[#FDFBF3] px-3 py-1.5 print:hidden" data-editor-chrome>
      <ToolbarGroup label="Dokumentum">
        <ToolbarButton label="↺" title="Visszavonás (Ctrl+Z)" disabled={disabled || !editor.can().undo()} onClick={() => run((chain) => chain.undo())} />
        <ToolbarButton label="↻" title="Újra (Ctrl+Y)" disabled={disabled || !editor.can().redo()} onClick={() => run((chain) => chain.redo())} />
        <ToolbarButton label="Keresés" title="Keresés és csere (Ctrl+F)" onClick={onToggleSearch} />
        <ToolbarButton label="Nyomtatás" title="Nyomtatás / PDF a böngészőből" onClick={onPrint} />
      </ToolbarGroup>

      <ToolbarGroup label="Szöveg">
        <ToolbarButton label="¶" title="Normál bekezdés" active={editor.isActive("paragraph")} disabled={disabled} onClick={() => run((chain) => chain.setParagraph())} />
        <ToolbarButton label="C1" title="Dokumentumcím (1. szint)" active={editor.isActive("heading", { level: 1 })} disabled={disabled} onClick={() => run((chain) => chain.toggleHeading({ level: 1 }))} />
        <ToolbarButton label="C2" title="Címsor (2. szint)" active={editor.isActive("heading", { level: 2 })} disabled={disabled} onClick={() => run((chain) => chain.toggleHeading({ level: 2 }))} />
        <ToolbarButton label="C3" title="Alcím (3. szint)" active={editor.isActive("heading", { level: 3 })} disabled={disabled} onClick={() => run((chain) => chain.toggleHeading({ level: 3 }))} />
        <ToolbarButton label="F" title="Félkövér (Ctrl+B)" active={editor.isActive("bold")} disabled={disabled} onClick={() => run((chain) => chain.toggleBold())} />
        <ToolbarButton label="D" title="Dőlt (Ctrl+I)" active={editor.isActive("italic")} disabled={disabled} onClick={() => run((chain) => chain.toggleItalic())} />
        <ToolbarButton label="A" title="Aláhúzott (Ctrl+U)" active={editor.isActive("underline")} disabled={disabled} onClick={() => run((chain) => chain.toggleUnderline())} />
        <ToolbarButton label="Á" title="Áthúzott" active={editor.isActive("strike")} disabled={disabled} onClick={() => run((chain) => chain.toggleStrike())} />
        <ToolbarButton label="T×" title="Formázás törlése" disabled={disabled} onClick={() => run((chain) => chain.unsetAllMarks().clearNodes())} />
      </ToolbarGroup>

      <ToolbarGroup label="Szerkezet">
        <ToolbarButton label="•" title="Felsorolás" active={editor.isActive("bulletList")} disabled={disabled} onClick={() => run((chain) => chain.toggleBulletList())} />
        <ToolbarButton label="1." title="Számozott lista" active={editor.isActive("orderedList", { listStyle: "decimal" })} disabled={disabled} onClick={() => run((chain) => chain.toggleOrderedList())} />
        <ToolbarButton
          label="a)"
          title="Betűjeles lista: a) b) c)"
          active={editor.isActive("orderedList", { listStyle: "lower-alpha" })}
          disabled={disabled}
          onClick={() =>
            run((chain) =>
              editor.isActive("orderedList")
                ? chain.updateAttributes("orderedList", { listStyle: "lower-alpha" })
                : chain.toggleOrderedList().updateAttributes("orderedList", { listStyle: "lower-alpha" })
            )
          }
        />
        <ToolbarButton
          label="(i)"
          title="Római számos lista: (i) (ii) (iii)"
          active={editor.isActive("orderedList", { listStyle: "lower-roman" })}
          disabled={disabled}
          onClick={() =>
            run((chain) =>
              editor.isActive("orderedList")
                ? chain.updateAttributes("orderedList", { listStyle: "lower-roman" })
                : chain.toggleOrderedList().updateAttributes("orderedList", { listStyle: "lower-roman" })
            )
          }
        />
        <ToolbarButton label="⇥" title="Behúzás növelése (listában)" disabled={disabled || !editor.can().sinkListItem("listItem")} onClick={() => run((chain) => chain.sinkListItem("listItem"))} />
        <ToolbarButton label="⇤" title="Behúzás csökkentése (listában)" disabled={disabled || !editor.can().liftListItem("listItem")} onClick={() => run((chain) => chain.liftListItem("listItem"))} />
        <ToolbarButton label="❝" title="Idézetblokk" active={editor.isActive("blockquote")} disabled={disabled} onClick={() => run((chain) => chain.toggleBlockquote())} />
        <ToolbarButton label="―" title="Elválasztó vonal" disabled={disabled} onClick={() => run((chain) => chain.setHorizontalRule())} />
        <ToolbarButton label="⤓" title="Oldaltörés beszúrása" disabled={disabled} onClick={() => run((chain) => chain.insertContent({ type: "pageBreak" }))} />
      </ToolbarGroup>

      <ToolbarGroup label="Táblázat">
        <ToolbarButton
          label="Tábla"
          title="Táblázat beszúrása (3×3)"
          disabled={disabled}
          onClick={() => run((chain) => chain.insertTable({ rows: 3, cols: 3, withHeaderRow: true }))}
        />
        {editor.isActive("table") ? (
          <>
            <ToolbarButton label="+Sor" title="Sor beszúrása alá" disabled={disabled} onClick={() => run((chain) => chain.addRowAfter())} />
            <ToolbarButton label="−Sor" title="Sor törlése" disabled={disabled} onClick={() => run((chain) => chain.deleteRow())} />
            <ToolbarButton label="+Oszl" title="Oszlop beszúrása jobbra" disabled={disabled} onClick={() => run((chain) => chain.addColumnAfter())} />
            <ToolbarButton label="−Oszl" title="Oszlop törlése" disabled={disabled} onClick={() => run((chain) => chain.deleteColumn())} />
            <ToolbarButton label="Fejléc" title="Fejlécsor be/ki" disabled={disabled} onClick={() => run((chain) => chain.toggleHeaderRow())} />
            <ToolbarButton label="Egyesít" title="Cellák egyesítése / szétválasztása" disabled={disabled} onClick={() => run((chain) => chain.mergeOrSplit())} />
            <ToolbarButton label="Tábla×" title="Táblázat törlése" disabled={disabled} onClick={() => run((chain) => chain.deleteTable())} />
          </>
        ) : null}
      </ToolbarGroup>

      <ToolbarGroup label="Jogi beszúrás">
        <div className="relative">
          <ToolbarButton label="Jogi blokk ▾" title="Szerződéses blokk beszúrása" disabled={disabled} active={insertMenuOpen} onClick={() => setInsertMenuOpen((open) => !open)} />
          {insertMenuOpen ? (
            <div className="absolute left-0 top-8 z-30 w-64 rounded-[6px] border border-[rgba(22,32,26,0.18)] bg-white p-1 shadow-lg" role="menu">
              {INSERTION_PRESETS.map((preset) => (
                <button
                  key={preset.id}
                  type="button"
                  role="menuitem"
                  className="block w-full rounded-[4px] px-2 py-1.5 text-left text-[12px] text-[#16201A] hover:bg-[#FBF6E7]"
                  onClick={() => {
                    insertPresetContent(editor, preset.build());
                    setInsertMenuOpen(false);
                  }}
                >
                  <span className="font-semibold">{preset.label}</span>
                  <span className="block text-[10.5px] text-[#7A8479]">{preset.description}</span>
                </button>
              ))}
            </div>
          ) : null}
        </div>
        <div className="relative">
          <ToolbarButton label="Mező ▾" title="Ügy/ügyfél változó beszúrása" disabled={disabled} active={fieldMenuOpen} onClick={() => setFieldMenuOpen((open) => !open)} />
          {fieldMenuOpen ? (
            <div className="absolute left-0 top-8 z-30 max-h-72 w-64 overflow-y-auto rounded-[6px] border border-[rgba(22,32,26,0.18)] bg-white p-1 shadow-lg" role="menu">
              {EDITOR_FIELDS.map((field) => (
                <button
                  key={field.id}
                  type="button"
                  role="menuitem"
                  className="block w-full rounded-[4px] px-2 py-1.5 text-left text-[12px] text-[#16201A] hover:bg-[#FBF6E7]"
                  onClick={() => {
                    editor.chain().focus().insertContent({ type: "fieldToken", attrs: { fieldId: field.id } }).run();
                    setFieldMenuOpen(false);
                  }}
                >
                  <span className="font-semibold">{field.label}</span>
                  <span className="block text-[10.5px] text-[#7A8479]">Forrás: {field.source}</span>
                </button>
              ))}
            </div>
          ) : null}
        </div>
      </ToolbarGroup>
    </div>
  );
}
