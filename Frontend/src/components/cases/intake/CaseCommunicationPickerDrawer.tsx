"use client";
import { ViewportDialog } from "@/components/ui/ViewportDialog";


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
import { useEffect, useMemo, useRef, useState } from "react";
import { getCaseById, getCommunications, type CommunicationItem } from "@/lib/api";
import { businessDateKey } from "@/lib/businessDateTime";
import { intake, ACCENT_BG, ACCENT_TEXT } from "./intakeStyles";

export function CaseCommunicationPickerDrawer({
  open, clientId, currentCaseId, selectedIds, primaryId, singleSelect = false, busy = false, error = null, onCancel, onConfirm,
}: {
  open: boolean;
  clientId: string;
  currentCaseId?: string;
  selectedIds: string[];
  primaryId: string;
  /** Single-thread mode: exactly one thread is selected and linked. */
  singleSelect?: boolean;
  /** Link-in-progress flag: disables confirm and labels it accordingly. */
  busy?: boolean;
  /** Link failure surfaced truthfully inside the drawer. */
  error?: string | null;
  onCancel: () => void;
  onConfirm: (ids: string[], primary: string) => void;
}) {
  const [items, setItems] = useState<CommunicationItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [loadError, setLoadError] = useState(false);
  const [query, setQuery] = useState("");
  const [direction, setDirection] = useState<"ALL" | "INBOUND" | "OUTBOUND">("ALL");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [sort, setSort] = useState<"NEWEST" | "OLDEST">("NEWEST");
  const [total, setTotal] = useState(0);
  const [caseLabels, setCaseLabels] = useState<Record<string, string>>({});
  const [pendingCaseIds, setPendingCaseIds] = useState<string[]>([]);
  const [loadedClientId, setLoadedClientId] = useState<string | null>(null);
  const [loadingMore, setLoadingMore] = useState(false);
  const [moreError, setMoreError] = useState(false);
  const [reloadKey, setReloadKey] = useState(0);
  const loadGeneration = useRef(0);
  const previousClientId = useRef(clientId);

  const resolveAssignedCases = async (communications: CommunicationItem[], generation: number, scopeClientId: string) => {
    const caseIds = [...new Set(communications.map((item) => item.caseId).filter((id): id is string => Boolean(id)))];
    if (caseIds.length === 0) return;
    setPendingCaseIds((current) => [...new Set([...current, ...caseIds])]);
    const results = await Promise.allSettled(caseIds.map((id) => getCaseById(id)));
    if (generation !== loadGeneration.current) return;
    const labels: Record<string, string> = {};
    results.forEach((result, index) => {
      const item = result.status === "fulfilled" ? result.value : null;
      if (item?.id === caseIds[index] && item.clientId === scopeClientId) labels[item.id] = `${item.caseNumber}${item.title ? ` · ${item.title}` : ""}`;
    });
    setCaseLabels((current) => ({ ...current, ...labels }));
    setPendingCaseIds((current) => current.filter((id) => !caseIds.includes(id)));
  };
  const [showAssigned, setShowAssigned] = useState(false);
  // Staged selection: cancelling must leave the form untouched.
  const [staged, setStaged] = useState<string[]>(selectedIds);
  const [stagedPrimary, setStagedPrimary] = useState(primaryId);

  useEffect(() => {
    if (!open) return;
    const changedClient = previousClientId.current !== clientId;
    previousClientId.current = clientId;
    setStaged(changedClient ? [] : selectedIds);
    setStagedPrimary(changedClient ? "" : primaryId);
  }, [open, selectedIds, primaryId, clientId]);

  useEffect(() => {
    if (!open) return;
    const generation = ++loadGeneration.current;
    setLoading(true);
    setLoadError(false);
    setMoreError(false);
    setItems([]);
    setTotal(0);
    setCaseLabels({});
    setPendingCaseIds([]);
    setLoadedClientId(null);
    if (!clientId) { setLoading(false); setLoadError(true); return () => { ++loadGeneration.current; }; }
    getCommunications({ limit: 50, clientId: clientId || undefined })
      .then((r) => { if (generation === loadGeneration.current) { setItems(r.communications || []); setTotal(r.pagination?.total ?? r.communications.length); setLoadedClientId(clientId); void resolveAssignedCases(r.communications || [], generation, clientId); } })
      .catch(() => { if (generation === loadGeneration.current) { setItems([]); setLoadError(true); } })
      .finally(() => { if (generation === loadGeneration.current) setLoading(false); });
    return () => { ++loadGeneration.current; };
  }, [open, clientId, reloadKey]);

  const loadMore = async () => {
    if (loadingMore || loading || !clientId || loadedClientId !== clientId || items.length >= total) return;
    const generation = loadGeneration.current;
    setLoadingMore(true);
    setMoreError(false);
    try {
      const response = await getCommunications({ limit: 50, offset: items.length, clientId });
      if (generation !== loadGeneration.current) return;
      setItems((current) => [...current, ...response.communications.filter((item) => !current.some((row) => row.id === item.id))]);
      setTotal(response.pagination?.total ?? total);
      void resolveAssignedCases(response.communications, generation, clientId);
    } catch {
      if (generation === loadGeneration.current) setMoreError(true);
    } finally {
      if (generation === loadGeneration.current) setLoadingMore(false);
    }
  };

  useEffect(() => { setQuery(""); setDirection("ALL"); setFrom(""); setTo(""); setSort("NEWEST"); }, [clientId]);

  const { available, assigned } = useMemo(() => {
    const q = query.trim().toLocaleLowerCase("hu-HU");
    const match = (c: CommunicationItem) => {
      const date = c.effectiveMessageAt ? businessDateKey(c.effectiveMessageAt) : "";
      return (!q || `${c.subject || ""} ${c.senderName || ""} ${c.senderEmail || ""} ${c.recipientName || ""} ${c.recipientEmail || ""}`.toLocaleLowerCase("hu-HU").includes(q))
        && (direction === "ALL" || c.direction === direction)
        && (!from || date >= from) && (!to || date <= to);
    };
    const list = (loadedClientId === clientId ? items : []).filter(match).sort((a, b) =>
      (sort === "NEWEST" ? -1 : 1) * ((a.effectiveMessageAt || a.createdAt || "").localeCompare(b.effectiveMessageAt || b.createdAt || "") || a.id.localeCompare(b.id)));
    return {
      available: list.filter((c) => !c.caseId),
      assigned: list.filter((c) => Boolean(c.caseId)),
    };
  }, [items, loadedClientId, clientId, query, direction, from, to, sort]);
  const hasUnassigned = loadedClientId === clientId && items.some((item) => !item.caseId);

  if (!open) return null;

  const toggle = (id: string) => {
    if (singleSelect) {
      setStaged([id]);
      setStagedPrimary(id);
      return;
    }
    setStaged((prev) => {
      const next = prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id];
      setStagedPrimary((p) => (next.includes(p) ? p : next[0] || ""));
      return next;
    });
  };

  return (
    <ViewportDialog open={open} title="Kommunikáció kiválasztása" onClose={onCancel} busy={busy} testId="comm-picker-drawer" maxWidth="max-w-3xl">


           <div className="space-y-2 border-b border-[rgba(16,22,19,0.10)] px-4 py-2.5">
             <p data-testid="comm-picker-count" role="status" className="mb-2 text-sm text-[var(--adm-text-muted)]">{`${staged.length} beszélgetés kiválasztva`}</p>
             <input
               data-testid="comm-picker-search"
               className={`${intake.field} mt-0`}
               placeholder="Keresés tárgy, feladó vagy címzett szerint…"
               aria-label="Keresés a betöltött levelezésben"
               value={query}
               onChange={(e) => setQuery(e.target.value)}
             />
             <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-4">
               <label className="text-xs">Irány<select aria-label="Irány szűrése" value={direction} onChange={(event) => setDirection(event.target.value as typeof direction)} className={intake.field}>
                 <option value="ALL">Minden irány</option><option value="INBOUND">Bejövő</option><option value="OUTBOUND">Kimenő</option>
               </select></label>
               <label className="text-xs">Ettől<input type="date" aria-label="Kezdő dátum" value={from} onChange={(event) => setFrom(event.target.value)} className={intake.field} /></label>
               <label className="text-xs">Eddig<input type="date" aria-label="Záró dátum" value={to} onChange={(event) => setTo(event.target.value)} className={intake.field} /></label>
               <label className="text-xs">Sorrend<select aria-label="Időrend" value={sort} onChange={(event) => setSort(event.target.value as typeof sort)} className={intake.field}>
                 <option value="NEWEST">Legújabb előre</option><option value="OLDEST">Legrégebbi előre</option>
               </select></label>
             </div>
             {!loading && !loadError && loadedClientId === clientId ? <p className="text-[11px] text-[var(--adm-text-muted)]">{items.length} / {total} beszélgetés betöltve. A keresés és a szűrők a betöltött tételekre vonatkoznak.</p> : null}
           </div>

          {/* The only scroll surface in this drawer. */}
          <div className="min-h-0 flex-1 overflow-y-auto px-4 py-3">
            {loading ? (
              <p className="text-[12.5px] text-[#7A8479]">Levelezés betöltése…</p>
            ) : loadError ? (
              <p role="alert" data-testid="comm-picker-load-error" className={`text-[12.5px] font-semibold ${ACCENT_TEXT.terracotta}`}>
                 {clientId ? "A levelezés betöltése nem sikerült." : "Ehhez az ügyhöz nincs rögzített ügyfél; levelezés nem rendelhető hozzá."}
                 {clientId ? <button type="button" onClick={() => setReloadKey((value) => value + 1)} className="ml-2 underline">Újrapróbálás</button> : null}
              </p>
            ) : (
              <>
                {available.length === 0 ? (
                   <p className="text-[12.5px] text-[#7A8479]">{hasUnassigned ? "Nincs a szűrésnek megfelelő szabad levelezés." : "Nincs szabadon hozzárendelhető levelezés a betöltött tételek között."}</p>
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
                               disabled={busy}
                               onChange={() => toggle(c.id)}
                              aria-label={c.subject || "Kommunikáció"}
                            />
                            <div className="min-w-0 flex-1">
                               <p className="break-words text-[13px] font-semibold text-[#16201A]">{c.subject || "Nincs tárgy"}</p>
                               <p className="mt-0.5 break-words text-[11.5px] text-[#5C6660]">{c.direction === "INBOUND" ? "Bejövő" : c.direction === "OUTBOUND" ? "Kimenő" : "Irány nem ismert"} · {c.senderName || c.senderEmail || "Ismeretlen feladó"} → {c.recipientName || c.recipientEmail || "Ismeretlen címzett"}</p>
                               <p className="text-[11px] text-[#5C6660]">{c.effectiveMessageAt || c.createdAt ? new Date(c.effectiveMessageAt || c.createdAt).toLocaleString("hu-HU", { timeZone: "Europe/Budapest", dateStyle: "short", timeStyle: "short" }) : "Időpont nem ismert"}{c.attachmentCount > 0 ? ` · ${c.attachmentCount} melléklet` : ""}</p>
                            </div>
                            {sel && !singleSelect && !currentCaseId ? (
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
                      Már ügyhöz kapcsolt beszélgetések ({assigned.length}) {showAssigned ? "▲" : "▼"}
                    </button>
                    {showAssigned ? (
                      <ul data-testid="comm-picker-assigned" className="mt-1.5 space-y-1">
                        {assigned.map((c) => (
                           <li key={c.id} className="rounded-md border border-[rgba(16,22,19,0.10)] bg-[#F4F6F4] px-3 py-1.5 text-[#5C6660]">
                             <p className="break-words text-[12.5px] font-semibold">{c.subject || "Nincs tárgy"}</p>
                             <p className="break-words text-[11px]">{c.caseId === currentCaseId ? "Ehhez az ügyhöz kapcsolva" : "Kapcsolt ügy"}: {c.caseId && caseLabels[c.caseId] ? caseLabels[c.caseId] : c.caseId && pendingCaseIds.includes(c.caseId) ? "Ügyadatok ellenőrzése…" : "Az ügy adatai nem érhetők el"}</p>
                             <p className="break-words text-[11px]">{c.direction === "INBOUND" ? "Bejövő" : c.direction === "OUTBOUND" ? "Kimenő" : "Irány nem ismert"} · {c.senderName || c.senderEmail || "Ismeretlen feladó"} → {c.recipientName || c.recipientEmail || "Ismeretlen címzett"}</p>
                             <p className="text-[11px]">{c.effectiveMessageAt || c.createdAt ? new Date(c.effectiveMessageAt || c.createdAt).toLocaleString("hu-HU", { timeZone: "Europe/Budapest", dateStyle: "short", timeStyle: "short" }) : "Időpont nem ismert"}{c.attachmentCount > 0 ? ` · ${c.attachmentCount} melléklet` : ""}</p>
                          </li>
                        ))}
                      </ul>
                    ) : null}
                  </div>
                ) : null}
                {loadedClientId === clientId && items.length < total ? (
                  <div className="mt-3 text-center">
                    {moreError ? <p role="alert" className="text-xs text-[var(--adm-terracotta-700)]">A következő oldal nem tölthető be; az eddigi tételek megmaradtak.</p> : null}
                    <button type="button" disabled={loadingMore} onClick={() => void loadMore()} className="min-h-10 text-xs font-semibold text-[var(--adm-green-800)] underline">{loadingMore ? "Betöltés…" : "További beszélgetések betöltése"}</button>
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
            {error ? (
              <p role="alert" data-testid="comm-picker-link-error" className={`w-full text-[11.5px] font-semibold ${ACCENT_TEXT.terracotta}`}>{error}</p>
            ) : null}
            <div className="ml-auto flex items-center gap-2">
            <button type="button" data-testid="comm-picker-cancel" className={intake.secondaryAction} onClick={onCancel} disabled={busy}>Mégse</button>
            <button
              type="button"
              data-testid="comm-picker-confirm"
              className={intake.primaryAction}
               disabled={busy || (singleSelect && staged.length !== 1) || Boolean(currentCaseId && staged.length === 0)}
              onClick={() => onConfirm(staged, stagedPrimary)}
            >
              {busy ? "Kapcsolás…" : "Kiválasztás megerősítése"}
            </button>
            </div>
          </footer>
    </ViewportDialog>
  );
}
