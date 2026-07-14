"use client";

/**
 * Left-side document outline generated from the pure content model: title,
 * headings and clauses with generated numbers. Click navigates, the current
 * clause is highlighted, entries collapse, and a filter narrows the list.
 * Clause structure actions (insert/move/promote/demote/duplicate/delete) run
 * the pure JSON transforms and refocus the affected clause.
 */

import { useMemo, useState } from "react";
import type { OutlineItem } from "@/lib/editor/clauseNumbering";

type OutlineProps = {
  outline: OutlineItem[];
  activeClauseId: string | null;
  readOnly: boolean;
  onNavigate: (item: OutlineItem) => void;
  onClauseAction: (
    action: "insert-before" | "insert-after" | "add-sub" | "move-up" | "move-down" | "promote" | "demote" | "duplicate" | "delete",
    clauseId: string
  ) => void;
  onScrollTop: () => void;
  onScrollBottom: () => void;
};

export function DocumentOutline({ outline, activeClauseId, readOnly, onNavigate, onClauseAction, onScrollTop, onScrollBottom }: OutlineProps) {
  const [filter, setFilter] = useState("");
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set());
  const [actionTarget, setActionTarget] = useState<string | null>(null);

  const visible = useMemo(() => {
    const query = filter.trim().toLowerCase();
    let items = outline;
    if (query) {
      items = items.filter(
        (item) => item.title.toLowerCase().includes(query) || (item.number || "").toLowerCase().includes(query)
      );
    }
    if (collapsed.size === 0 || query) return items;
    // Hide descendants of collapsed clauses (by numbering prefix).
    const collapsedNumbers = outline
      .filter((item) => item.clauseId && collapsed.has(item.clauseId) && item.number)
      .map((item) => item.number as string);
    return items.filter(
      (item) =>
        !item.number ||
        !collapsedNumbers.some((prefix) => item.number !== prefix && item.number!.startsWith(prefix))
    );
  }, [outline, filter, collapsed]);

  return (
    <div className="flex h-full flex-col" data-editor-chrome>
      <div className="border-b border-[rgba(22,32,26,0.12)] p-2">
        <p className="text-[10px] font-bold uppercase tracking-[0.14em] text-[#7A8479]">Vázlat</p>
        <input
          className="mt-1 w-full rounded-[4px] border border-[rgba(22,32,26,0.18)] bg-white px-2 py-1 text-[11.5px] text-[#16201A] focus:border-[#082817] focus:outline-none"
          placeholder="Szűrés a vázlatban…"
          value={filter}
          onChange={(event) => setFilter(event.target.value)}
          aria-label="Vázlat szűrése"
        />
        <div className="mt-1 flex gap-1">
          <button type="button" className="rounded-[4px] border border-[rgba(22,32,26,0.15)] px-1.5 py-0.5 text-[10px] text-[#3D4842] hover:bg-[#FBF6E7]" onClick={onScrollTop}>
            Dokumentum teteje
          </button>
          <button type="button" className="rounded-[4px] border border-[rgba(22,32,26,0.15)] px-1.5 py-0.5 text-[10px] text-[#3D4842] hover:bg-[#FBF6E7]" onClick={onScrollBottom}>
            Aláírások / vége
          </button>
        </div>
      </div>

      <nav className="min-h-0 flex-1 overflow-y-auto p-1" aria-label="Dokumentum vázlat">
        {visible.length === 0 ? (
          <p className="p-2 text-[11px] italic text-[#7A8479]">Nincs megjeleníthető vázlatelem.</p>
        ) : (
          <ul>
            {visible.map((item) => {
              const isClause = item.kind === "CLAUSE";
              const isActive = isClause && item.clauseId === activeClauseId;
              const hasActions = isClause && item.clauseId && actionTarget === item.clauseId;
              return (
                <li key={item.key}>
                  <div
                    className={`group flex items-center gap-1 rounded-[4px] px-1 py-0.5 ${isActive ? "bg-[#E2E8DA]" : "hover:bg-[#FBF6E7]"}`}
                    style={{ paddingLeft: `${(item.level - 1) * 12 + 4}px` }}
                  >
                    {isClause && item.clauseId ? (
                      <button
                        type="button"
                        aria-label="Alpontok összecsukása"
                        className="w-3 shrink-0 text-[9px] text-[#7A8479]"
                        onClick={() =>
                          setCollapsed((previous) => {
                            const next = new Set(previous);
                            if (next.has(item.clauseId!)) next.delete(item.clauseId!);
                            else next.add(item.clauseId!);
                            return next;
                          })
                        }
                      >
                        {collapsed.has(item.clauseId) ? "▸" : "▾"}
                      </button>
                    ) : (
                      <span className="w-3 shrink-0" />
                    )}
                    <button
                      type="button"
                      className={`min-w-0 flex-1 truncate text-left text-[11.5px] ${item.kind === "HEADING" ? "font-bold text-[#123B27]" : "text-[#16201A]"}`}
                      title={`${item.number || ""} ${item.title}`.trim()}
                      onClick={() => onNavigate(item)}
                    >
                      {item.number ? <span className="mr-1 font-semibold text-[#7A6014]">{item.number}</span> : null}
                      {item.title}
                    </button>
                    {isClause && item.clauseId && !readOnly ? (
                      <button
                        type="button"
                        aria-label="Pont műveletei"
                        className="invisible shrink-0 rounded px-1 text-[11px] text-[#7A8479] hover:bg-white group-hover:visible"
                        onClick={() => setActionTarget((current) => (current === item.clauseId ? null : item.clauseId!))}
                      >
                        ⋯
                      </button>
                    ) : null}
                  </div>
                  {hasActions && item.clauseId ? (
                    <div className="mb-1 ml-6 flex flex-wrap gap-1 rounded-[4px] border border-[rgba(22,32,26,0.12)] bg-white p-1">
                      {(
                        [
                          ["insert-before", "Beszúrás elé"],
                          ["insert-after", "Beszúrás utána"],
                          ["add-sub", "Alpont"],
                          ["move-up", "Fel"],
                          ["move-down", "Le"],
                          ["promote", "Szint fel"],
                          ["demote", "Szint le"],
                          ["duplicate", "Másolat"],
                          ["delete", "Törlés"],
                        ] as const
                      ).map(([action, label]) => (
                        <button
                          key={action}
                          type="button"
                          className={`rounded-[3px] border px-1.5 py-0.5 text-[10px] ${
                            action === "delete"
                              ? "border-[#F2DAD6] text-[#8B2A2A] hover:bg-[#F2DAD6]"
                              : "border-[rgba(22,32,26,0.15)] text-[#3D4842] hover:bg-[#FBF6E7]"
                          }`}
                          onClick={() => {
                            onClauseAction(action, item.clauseId!);
                            if (action === "delete") setActionTarget(null);
                          }}
                        >
                          {label}
                        </button>
                      ))}
                    </div>
                  ) : null}
                </li>
              );
            })}
          </ul>
        )}
      </nav>
    </div>
  );
}
