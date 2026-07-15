"use client";

/**
 * Grouped professional toolbar for the legal-document editor
 * (layout overhaul: DOCUMENT-EDITOR-WORKBENCH-UX-LAYOUT-OVERHAUL-1).
 *
 * The toolbar lives in the non-scrolling workbench chrome, so it stays visible
 * while the document viewport scrolls. Primary controls are always present;
 * low-frequency actions live in the "Továbbiak" overflow menu so the bar fits
 * common laptop widths in a single row (plus a deliberate contextual table row
 * while the caret is inside a table). Menus close on Escape and return focus
 * to their trigger.
 */

import { useCallback, useEffect, useRef, useState } from "react";
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

/**
 * Dropdown menu anchored to a toolbar trigger. Renders above every panel
 * (z-50, chrome is non-scrolling so no clipping), closes on Escape and on
 * outside click, and returns focus to the trigger on close.
 */
export function ToolbarMenu({
  label,
  title,
  disabled = false,
  children,
  widthClass = "w-64",
}: {
  label: string;
  title: string;
  disabled?: boolean;
  children: (close: () => void) => React.ReactNode;
  widthClass?: string;
}) {
  const [open, setOpen] = useState(false);
  const triggerRef = useRef<HTMLButtonElement | null>(null);
  const containerRef = useRef<HTMLDivElement | null>(null);

  const close = useCallback((restoreFocus = true) => {
    setOpen(false);
    if (restoreFocus) triggerRef.current?.focus();
  }, []);

  useEffect(() => {
    if (!open) return;
    const onPointerDown = (event: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(event.target as Node)) close(false);
    };
    document.addEventListener("mousedown", onPointerDown);
    return () => document.removeEventListener("mousedown", onPointerDown);
  }, [open, close]);

  return (
    <div
      ref={containerRef}
      className="relative"
      onKeyDown={(event) => {
        if (event.key === "Escape" && open) {
          event.stopPropagation();
          close();
        }
      }}
    >
      <button
        ref={triggerRef}
        type="button"
        title={title}
        aria-label={title}
        aria-haspopup="menu"
        aria-expanded={open}
        disabled={disabled}
        onClick={() => setOpen((current) => !current)}
        className={`rounded-[4px] border px-2 py-1 text-[11.5px] font-semibold leading-none transition-colors disabled:cursor-not-allowed disabled:opacity-45 ${
          open
            ? "border-[#082817] bg-[#082817] text-[#F4EFDB]"
            : "border-[rgba(22,32,26,0.18)] bg-white text-[#16201A] hover:bg-[#FBF6E7]"
        }`}
      >
        {label}
      </button>
      {open ? (
        <div className={`absolute left-0 top-8 z-50 max-h-80 overflow-y-auto rounded-[6px] border border-[rgba(22,32,26,0.18)] bg-white p-1 shadow-lg ${widthClass}`} role="menu">
          {children(() => close())}
        </div>
      ) : null}
    </div>
  );
}

export function MenuItem({ label, description, onSelect }: { label: string; description?: string; onSelect: () => void }) {
  return (
    <button
      type="button"
      role="menuitem"
      className="block w-full rounded-[4px] px-2 py-1.5 text-left text-[12px] text-[#16201A] hover:bg-[#FBF6E7]"
      onClick={onSelect}
    >
      <span className="font-semibold">{label}</span>
      {description ? <span className="block text-[10.5px] text-[#7A8479]">{description}</span> : null}
    </button>
  );
}

export function DocumentEditorToolbar({ editor, readOnly, onToggleSearch, onPrint }: ToolbarProps) {
  const run = useCallback(
    (command: (chain: ReturnType<Editor["chain"]>) => { run: () => boolean }) => {
      if (!editor || readOnly) return;
      command(editor.chain().focus());
    },
    [editor, readOnly]
  );

  if (!editor) return null;
  const disabled = readOnly;
  const inTable = editor.isActive("table");

  return (
    <div className="border-b border-[rgba(22,32,26,0.12)] bg-[#FDFBF3] print:hidden" data-editor-chrome>
      <div className="flex flex-wrap items-center gap-2 px-3 py-1.5" role="toolbar" aria-label="Formázási eszköztár">
        <ToolbarGroup label="Előzmények">
          <ToolbarButton label="↺" title="Visszavonás (Ctrl+Z)" disabled={disabled || !editor.can().undo()} onClick={() => run((chain) => chain.undo())} />
          <ToolbarButton label="↻" title="Újra (Ctrl+Y)" disabled={disabled || !editor.can().redo()} onClick={() => run((chain) => chain.redo())} />
        </ToolbarGroup>

        <ToolbarGroup label="Bekezdés">
          <ToolbarButton label="¶" title="Normál bekezdés" active={editor.isActive("paragraph")} disabled={disabled} onClick={() => run((chain) => chain.setParagraph())} />
          <ToolbarButton label="C1" title="Dokumentumcím (1. szint)" active={editor.isActive("heading", { level: 1 })} disabled={disabled} onClick={() => run((chain) => chain.toggleHeading({ level: 1 }))} />
          <ToolbarButton label="C2" title="Címsor (2. szint)" active={editor.isActive("heading", { level: 2 })} disabled={disabled} onClick={() => run((chain) => chain.toggleHeading({ level: 2 }))} />
          <ToolbarButton label="C3" title="Alcím (3. szint)" active={editor.isActive("heading", { level: 3 })} disabled={disabled} onClick={() => run((chain) => chain.toggleHeading({ level: 3 }))} />
        </ToolbarGroup>

        <ToolbarGroup label="Karakterformázás">
          <ToolbarButton label="F" title="Félkövér (Ctrl+B)" active={editor.isActive("bold")} disabled={disabled} onClick={() => run((chain) => chain.toggleBold())} />
          <ToolbarButton label="D" title="Dőlt (Ctrl+I)" active={editor.isActive("italic")} disabled={disabled} onClick={() => run((chain) => chain.toggleItalic())} />
          <ToolbarButton label="A" title="Aláhúzott (Ctrl+U)" active={editor.isActive("underline")} disabled={disabled} onClick={() => run((chain) => chain.toggleUnderline())} />
        </ToolbarGroup>

        <ToolbarGroup label="Listák és pontok">
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
        </ToolbarGroup>

        <ToolbarGroup label="Szerkezet">
          <ToolbarButton
            label="Tábla"
            title="Táblázat beszúrása (3×3)"
            disabled={disabled}
            onClick={() => run((chain) => chain.insertTable({ rows: 3, cols: 3, withHeaderRow: true }))}
          />
          <ToolbarButton label="⤓" title="Oldaltörés beszúrása" disabled={disabled} onClick={() => run((chain) => chain.insertContent({ type: "pageBreak" }))} />
          <ToolbarMenu label="Jogi blokk ▾" title="Szerződéses blokk beszúrása" disabled={disabled}>
            {(close) => (
              <>
                {INSERTION_PRESETS.map((preset) => (
                  <MenuItem
                    key={preset.id}
                    label={preset.label}
                    description={preset.description}
                    onSelect={() => {
                      insertPresetContent(editor, preset.build());
                      close();
                    }}
                  />
                ))}
              </>
            )}
          </ToolbarMenu>
          <ToolbarMenu label="Mező ▾" title="Ügy/ügyfél változó beszúrása" disabled={disabled}>
            {(close) => (
              <>
                {EDITOR_FIELDS.map((field) => (
                  <MenuItem
                    key={field.id}
                    label={field.label}
                    description={`Forrás: ${field.source}`}
                    onSelect={() => {
                      editor.chain().focus().insertContent({ type: "fieldToken", attrs: { fieldId: field.id } }).run();
                      close();
                    }}
                  />
                ))}
              </>
            )}
          </ToolbarMenu>
        </ToolbarGroup>

        <ToolbarGroup label="Eszközök">
          <ToolbarButton label="Keresés" title="Keresés és csere (Ctrl+F)" onClick={onToggleSearch} />
          <ToolbarMenu label="Továbbiak ▾" title="További, ritkábban használt műveletek" widthClass="w-60">
            {(close) => (
              <>
                <MenuItem
                  label="Áthúzott szöveg"
                  description={editor.isActive("strike") ? "Aktív a kijelölésen" : undefined}
                  onSelect={() => {
                    run((chain) => chain.toggleStrike());
                    close();
                  }}
                />
                <MenuItem
                  label="Idézetblokk"
                  description={editor.isActive("blockquote") ? "Aktív a kijelölésen" : undefined}
                  onSelect={() => {
                    run((chain) => chain.toggleBlockquote());
                    close();
                  }}
                />
                <MenuItem
                  label="Elválasztó vonal"
                  onSelect={() => {
                    run((chain) => chain.setHorizontalRule());
                    close();
                  }}
                />
                <MenuItem
                  label="Formázás törlése"
                  onSelect={() => {
                    run((chain) => chain.unsetAllMarks().clearNodes());
                    close();
                  }}
                />
                <MenuItem
                  label="Nyomtatás / PDF (böngészőből)"
                  onSelect={() => {
                    onPrint();
                    close();
                  }}
                />
              </>
            )}
          </ToolbarMenu>
        </ToolbarGroup>
      </div>

      {inTable ? (
        // Deliberate, compact contextual second row — only while the caret is
        // inside a table, so the main row stays single-line at laptop widths.
        <div className="flex flex-wrap items-center gap-1 border-t border-dashed border-[rgba(22,32,26,0.12)] bg-[#FBF8ED] px-3 py-1" role="group" aria-label="Táblázatműveletek">
          <span className="mr-1 text-[10px] font-bold uppercase tracking-[0.12em] text-[#7A8479]">Táblázat:</span>
          <ToolbarButton label="+Sor" title="Sor beszúrása alá" disabled={disabled} onClick={() => run((chain) => chain.addRowAfter())} />
          <ToolbarButton label="−Sor" title="Sor törlése" disabled={disabled} onClick={() => run((chain) => chain.deleteRow())} />
          <ToolbarButton label="+Oszl" title="Oszlop beszúrása jobbra" disabled={disabled} onClick={() => run((chain) => chain.addColumnAfter())} />
          <ToolbarButton label="−Oszl" title="Oszlop törlése" disabled={disabled} onClick={() => run((chain) => chain.deleteColumn())} />
          <ToolbarButton label="Fejléc" title="Fejlécsor be/ki" disabled={disabled} onClick={() => run((chain) => chain.toggleHeaderRow())} />
          <ToolbarButton label="Egyesít" title="Cellák egyesítése / szétválasztása" disabled={disabled} onClick={() => run((chain) => chain.mergeOrSplit())} />
          <ToolbarButton label="Tábla törlése" title="Teljes táblázat törlése" disabled={disabled} onClick={() => run((chain) => chain.deleteTable())} />
        </div>
      ) : null}
    </div>
  );
}
