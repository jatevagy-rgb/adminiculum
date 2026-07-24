"use client";

/**
 * Communication picker drawer (CASE-INTAKE-VISUAL-CORRECTION-1).
 *
 * The communication list used to sit inline in the intake form, where it took a
 * large share of the modal and introduced a second, nested scrollbar. It now
 * lives here: a dedicated surface opened from a compact summary row, so the
 * intake form keeps exactly one scroll surface.
 *
 * Selectable threads are primary. Threads already bound to another matter are
 * collapsed behind a disclosure rather than shown as a wall of faded rows.
 * Selection is staged locally and only committed on confirm, so cancelling
 * genuinely changes nothing.
 */
import { useEffect, useMemo, useState } from "react";
import { getCommunications, type CommunicationItem } from "@/lib/api";
import { intake, ACCENT_BG, ACCENT_TEXT } from "./intakeStyles";

export function CaseCommunicationPickerDrawer({
  open, clientId, selectedIds, primaryId, onCancel, onConfirm,
}: {
  open: boolean;
  clientId: string;
  selectedIds: string[];
  primaryId: string;
  onCancel: () => void;
  onConfirm: (ids: string[], primary: string) => void;
}) {
  const [items, setItems] = useState<CommunicationItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [query, setQuery] = useState("");
  const [showAssigned, setShowAssigned] = useState(false);
  // Staged selection: cancelling must leave the form untouched.
  const [staged, setStaged] = useState<string[]>(selectedIds);
  const [stagedPrimary, setStagedPrimary] = useState(primaryId);

  useEffect(() => {
    if (!open) return;
    setStaged(selectedIds);
    setStagedPrimary(primaryId);
  }, [open, selectedIds, primaryId]);

  useEffect(() => {
    if (!open) return;
    let active = true;
    setLoading(true);
    getCommunications({ limit: 50, clientId: clientId || undefined })
      .then((r) => { if (active) setItems(r.communications || []); })
      .catch(() => { if (active) setItems([]); })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [open, clientId]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") onCancel(); };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open, onCancel]);

  const { available, assigned } = useMemo(() => {
    const q = query.trim().toLowerCase();
    const match = (c: CommunicationItem) =>
      !q || `${c.subject || ""} ${c.senderName || ""}`.toLowerCase().includes(q);
    const list = items.filter(match);
    return {
      available: list.filter((c) => !c.caseId),
      assigned: list.filter((c) => Boolean(c.caseId)),
    };
  }, [items, query]);

  if (!open) return null;

  const toggle = (id: string) => {
    setStaged((prev) => {
      const next = prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id];
      setStagedPrimary((p) => (next.includes(p) ? p : next[0] || ""));
      return next;
    });
  };

  return (
    <div className={intake.overlay} role="presentation" onMouseDown={onCancel}>
      <div className="flex h-full items-end justify-center p-0 sm:items-center sm:p-6">
        <div
          role="dialog"
          aria-modal="true"
          aria-label="Kommunikáció kiválasztása"
          data-testid="comm-picker-drawer"
          onMouseDown={(e) => e.stopPropagation()}
          className="flex h-[92vh] w-full max-w-[760px] flex-col overflow-hidden rounded-t-xl bg-white shadow-[0_24px_70px_rgba(16,22,19,0.34)] sm:h-[80vh] sm:rounded-xl"
        >
          <header className="flex items-center justify-between gap-3 border-b border-[rgba(16,22,19,0.14)] px-4 py-3">
            <div className="min-w-0">
              <h3 className="font-serif text-[19px] font-semibold text-[#16201A]">Kommunikáció kiválasztása</h3>
              <p data-testid="comm-picker-count" className={`text-[12px] font-semibold ${ACCENT_TEXT.terracotta}`}>
                {staged.length === 0 ? "Nincs kiválasztva" : `${staged.length} beszélgetés kiválasztva`}
              </p>
            </div>
            <button type="button" onClick={onCancel} aria-label="Bezárás" className="text-[13px] font-semibold text-[#7A8479] hover:text-[#16201A]">✕</button>
          </header>

          <div className="border-b border-[rgba(16,22,19,0.10)] px-4 py-2.5">
            <input
              data-testid="comm-picker-search"
              className={`${intake.field} mt-0`}
              placeholder="Keresés tárgy vagy feladó szerint…"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
            />
          </div>

          {/* The only scroll surface in this drawer. */}
          <div className="min-h-0 flex-1 overflow-y-auto px-4 py-3">
            {loading ? (
              <p className="text-[12.5px] text-[#7A8479]">Levelezés betöltése…</p>
            ) : (
              <>
                {available.length === 0 ? (
                  <p className="text-[12.5px] text-[#7A8479]">Nincs szabadon hozzárendelhető levelezés.</p>
                ) : (
                  <ul data-testid="comm-picker-available" className="space-y-1.5">
                    {available.map((c) => {
                      const sel = staged.includes(c.id);
                      const isPrimary = stagedPrimary === c.id;
                      return (
                        <li
                          key={c.id}
                          className={`rounded-md border px-3 py-2 transition-colors ${
                            sel ? "border-[#1F5A66] bg-[#EDF2F3]" : "border-[rgba(16,22,19,0.16)] bg-white hover:bg-[#F4F6F4]"
                          }`}
                        >
                          <div className="flex items-start gap-2.5">
                            <input
                              type="checkbox"
                              data-testid="comm-picker-item"
                              className="mt-1"
                              checked={sel}
                              onChange={() => toggle(c.id)}
                              aria-label={c.subject || "Kommunikáció"}
                            />
                            <div className="min-w-0 flex-1">
                              <p className="truncate text-[13px] font-semibold text-[#16201A]">{c.subject || "Nincs tárgy"}</p>
                              <p className="mt-0.5 truncate text-[11.5px] text-[#5C6660]">
                                {c.senderName || "Ismeretlen feladó"} · {c.type}
                                {c.createdAt ? ` · ${new Date(c.createdAt).toLocaleDateString("hu-HU")}` : ""}
                              </p>
                            </div>
                            {sel ? (
                              <button
                                type="button"
                                data-testid="comm-picker-primary"
                                onClick={() => setStagedPrimary(c.id)}
                                className={`shrink-0 rounded px-2 py-1 text-[10px] font-bold uppercase tracking-wide ${
                                  isPrimary ? `${ACCENT_BG.petrol} text-white` : "bg-white text-[#1F5A66] ring-1 ring-[#1F5A66]"
                                }`}
                              >
                                {isPrimary ? "★ Elsődleges" : "Elsődleges"}
                              </button>
                            ) : null}
                          </div>
                        </li>
                      );
                    })}
                  </ul>
                )}

                {/* Already-assigned threads are collapsed, never the first screen. */}
                {assigned.length > 0 ? (
                  <div className="mt-3 border-t border-[rgba(16,22,19,0.10)] pt-2.5">
                    <button
                      type="button"
                      data-testid="comm-picker-assigned-toggle"
                      onClick={() => setShowAssigned((v) => !v)}
                      className="text-[12px] font-semibold text-[#5C6660] hover:text-[#16201A]"
                    >
                      Más ügyhöz már hozzárendelve ({assigned.length}) {showAssigned ? "▲" : "▼"}
                    </button>
                    {showAssigned ? (
                      <ul data-testid="comm-picker-assigned" className="mt-1.5 space-y-1">
                        {assigned.map((c) => (
                          <li key={c.id} className="rounded-md border border-[rgba(16,22,19,0.10)] bg-[#F4F6F4] px-3 py-1.5 opacity-70">
                            <p className="truncate text-[12.5px] text-[#5C6660]">{c.subject || "Nincs tárgy"}</p>
                          </li>
                        ))}
                      </ul>
                    ) : null}
                  </div>
                ) : null}
              </>
            )}
          </div>

          <footer className="flex flex-wrap items-center justify-between gap-2 border-t border-[rgba(16,22,19,0.14)] px-4 py-3">
            {/* One compact line, not a paragraph: linking is not document import. */}
            <p data-testid="comm-disclosure" className="text-[11px] leading-[15px] text-[#5C6660]">
              A hozzárendelt levelezés csatolmányaiból nem jön létre automatikusan dokumentum.
            </p>
            <div className="ml-auto flex items-center gap-2">
            <button type="button" data-testid="comm-picker-cancel" className={intake.secondaryAction} onClick={onCancel}>Mégse</button>
            <button
              type="button"
              data-testid="comm-picker-confirm"
              className={intake.primaryAction}
              onClick={() => onConfirm(staged, stagedPrimary)}
            >
              Kiválasztás megerősítése
            </button>
            </div>
          </footer>
        </div>
      </div>
    </div>
  );
}
