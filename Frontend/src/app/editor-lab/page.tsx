"use client";

import { useState } from "react";
import { DocumentEditorShell } from "@/components/documents/DocumentEditorShell";
import {
  DocumentRichEditorExperimental,
  type ExperimentalEditorCommand,
  type ExperimentalEditorCommandRequest,
} from "@/components/documents/editor/DocumentRichEditorExperimental";

const sampleLegalText = `Tisztelt Bíróság!

Alulírott jogi képviselő útján előterjesztett beadványban az alábbi tényállási és jogi körülményekre hivatkozom.

A felek között létrejött szerződés teljesítése körében vita alakult ki a szolgáltatás határidejéről, valamint az elszámolás alapjául szolgáló dokumentumok tartalmáról.

Kérem a tisztelt bíróságot, hogy a rendelkezésre álló iratok és bizonyítékok alapján a kérelmet érdemben bírálja el.`;

const toolbarActions: Array<{ label: string; command: ExperimentalEditorCommand }> = [
  { label: "Félkövér", command: "bold" },
  { label: "Dőlt", command: "italic" },
  { label: "Aláhúzás", command: "underline" },
  { label: "Felsorolás", command: "unordered-list" },
  { label: "Számozás", command: "ordered-list" },
  { label: "Bekezdés", command: "paragraph" },
];

export default function EditorLabPage() {
  const [editorValue, setEditorValue] = useState(sampleLegalText);
  const [commandRequest, setCommandRequest] = useState<ExperimentalEditorCommandRequest | null>(null);

  const runToolbarCommand = (command: ExperimentalEditorCommand) => {
    setCommandRequest({ id: Date.now(), command });
  };

  return (
    <main className="min-h-screen bg-[#F7F2E6] px-4 py-6 text-[#1F2821] sm:px-6 lg:px-8">
      <div className="mx-auto flex max-w-7xl flex-col gap-5">
        <div className="rounded-[12px] border border-[#D8CFB6] bg-white px-4 py-3 shadow-sm">
          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-[#7A5A1F]">
            Belső szerkesztő tesztfelület
          </p>
          <p className="mt-2 text-sm text-[#5F675F]">
            Rejtett fejlesztői oldal az experimental rich editor kézi próbájához. Nem része a fő navigációnak.
          </p>
        </div>

        <div className="grid gap-5 xl:grid-cols-[minmax(0,1.5fr)_minmax(340px,0.8fr)]">
          <DocumentEditorShell
            title="Kísérleti beadványszerkesztő"
            subtitle="DocumentEditorShell editorSlot-tal, produkciós szerkesztők módosítása nélkül."
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
                <div className="flex flex-wrap gap-2">
                  {toolbarActions.map((action) => (
                    <button
                      key={action.command}
                      type="button"
                      onMouseDown={(event) => event.preventDefault()}
                      onClick={() => runToolbarCommand(action.command)}
                      className="rounded-[999px] border border-[#D8CFB6] bg-[#FFFDF8] px-3 py-1.5 text-xs font-semibold text-[#2F3A31] transition hover:border-[#B28B2E] hover:bg-[#FAEFCF] focus:outline-none focus:ring-2 focus:ring-[#D8B45A]"
                    >
                      {action.label}
                    </button>
                  ))}
                </div>
                <p className="text-[11px] leading-5 text-[#7B776D]">
                  Kísérleti, helyi eszköztár: nem ígér Word-kompatibilitást, változáskövetést vagy szervermentést.
                </p>
              </div>
            }
            editorMode="rich-text-ready"
            editorSlot={
              <DocumentRichEditorExperimental
                value={editorValue}
                onChange={setEditorValue}
                commandRequest={commandRequest}
                placeholder="Írj vagy illessz be jogi szöveget a teszteléshez."
              />
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
          </aside>
        </div>
      </div>
    </main>
  );
}
