"use client";

import React, { useCallback, useEffect, useState } from "react";
import {
  getCommunications,
  getCommunicationById,
  type CommunicationItem,
  type CommunicationDetail,
} from "@/lib/api";
import { AdminBadge, AdminButton } from "@/components/adminiculum/ui";

export interface WordWideCommunicationLeafProps {
  caseId: string;
  clientId: string | null;
  readOnly?: boolean;
  onChanged?: () => void;
}

const typeLabels: Record<string, string> = {
  EMAIL: "E-mail",
  PHONE: "Telefon",
  MEETING: "Egyeztetés",
  LETTER: "Hivatalos levél",
  NOTE: "Belső feljegyzés",
};

function formatMessageDate(dateStr: string | null | undefined): string {
  if (!dateStr) return "—";
  const date = new Date(dateStr);
  if (Number.isNaN(date.getTime())) return dateStr;
  return date.toLocaleString("hu-HU", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
}

/**
 * Splits email body text into main message and quoted history.
 * Detects common quoted text markers:
 * - Lines starting with >
 * - -----Original Message-----
 * - Feladó: / From:
 */
function splitQuotedHistory(content: string): {
  mainText: string;
  quotedText: string | null;
} {
  const lines = content.split(/\r?\n/);
  const quoteStartIdx = lines.findIndex((line) => {
    const trimmed = line.trim();
    return (
      trimmed.startsWith(">") ||
      /^-----*Original Message-----*/i.test(trimmed) ||
      /^-----*Eredeti üzenet-----*/i.test(trimmed) ||
      /^Feladó:.*|^From:.*|^Date:.*|^Dátum:.*/i.test(trimmed)
    );
  });

  if (quoteStartIdx === -1) {
    return { mainText: content, quotedText: null };
  }

  const main = lines.slice(0, quoteStartIdx).join("\n").trim();
  const quoted = lines.slice(quoteStartIdx).join("\n").trim();

  return {
    mainText: main || content,
    quotedText: quoted || null,
  };
}

export function WordWideCommunicationLeaf({
  caseId,
  readOnly = false,
}: WordWideCommunicationLeafProps) {
  const [items, setItems] = useState<CommunicationItem[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [details, setDetails] = useState<Record<string, CommunicationDetail>>({});
  const [loading, setLoading] = useState(true);
  const [loadingDetail, setLoadingDetail] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Search & filter
  const [filterQuery, setFilterQuery] = useState("");
  // Collapsed state for quotes per message
  const [showQuotedFor, setShowQuotedFor] = useState<Record<string, boolean>>({});

  const loadCommunications = useCallback(async () => {
    if (!caseId) return;
    setLoading(true);
    setError(null);
    try {
      const result = await getCommunications({ caseId, limit: 100 });
      const commList = Array.isArray(result) ? result : (result?.communications ?? []);
      setItems(commList);
      if (commList.length > 0 && !selectedId) {
        setSelectedId(commList[0].id);
      }
    } catch {
      setError("A kommunikációs előzmények betöltése jelenleg sikertelen.");
    } finally {
      setLoading(false);
    }
  }, [caseId, selectedId]);

  useEffect(() => {
    void loadCommunications();
  }, [loadCommunications]);

  // Load details for selected message if not already cached
  useEffect(() => {
    if (!selectedId || details[selectedId]) return;

    let active = true;
    setLoadingDetail(true);
    getCommunicationById(selectedId)
      .then((detail) => {
        if (active && detail) {
          setDetails((prev) => ({ ...prev, [selectedId]: detail }));
        }
      })
      .catch(() => {
        // detail load failed; summary remains visible
      })
      .finally(() => {
        if (active) setLoadingDetail(false);
      });

    return () => {
      active = false;
    };
  }, [selectedId, details]);

  const toggleQuoted = (id: string) => {
    setShowQuotedFor((prev) => ({ ...prev, [id]: !prev[id] }));
  };

  const filteredItems = items.filter((item) => {
    if (!filterQuery.trim()) return true;
    const q = filterQuery.toLowerCase();
    return (
      (item.subject && item.subject.toLowerCase().includes(q)) ||
      (item.senderName && item.senderName.toLowerCase().includes(q)) ||
      (item.senderEmail && item.senderEmail.toLowerCase().includes(q)) ||
      (item.summary && item.summary.toLowerCase().includes(q)) ||
      (item.contentPreview && item.contentPreview.toLowerCase().includes(q))
    );
  });

  const selectedItem = items.find((i) => i.id === selectedId) || null;
  const selectedDetail = selectedId ? details[selectedId] : null;

  return (
    <div
      className="mx-auto w-full max-w-[1440px] space-y-4 rounded-lg border border-[var(--adm-border)] bg-white p-4 shadow-sm sm:p-6"
      data-testid="word-wide-communication-leaf"
    >
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-[var(--adm-border)] pb-3">
        <div>
          <span className="text-[10px] font-bold uppercase tracking-[0.14em] text-[var(--adm-text-muted)]">
            Kommunikációs lánc (W06)
          </span>
          <h3 className="text-[18px] font-bold text-[var(--adm-text)]">
            Ügyhöz kapcsolt üzenetváltások és levelezés
          </h3>
        </div>

        <div className="flex items-center gap-2">
          <input
            type="search"
            value={filterQuery}
            onChange={(e) => setFilterQuery(e.target.value)}
            placeholder="Keresés az üzenetekben..."
            className="h-10 rounded border border-[var(--adm-border)] px-3 text-[12px] text-[var(--adm-text)] focus:border-[var(--adm-green-800)] focus:outline-none"
            aria-label="Keresés az ügy üzeneteiben"
          />
          <AdminButton
            variant="neutral"
            size="sm"
            onClick={() => void loadCommunications()}
            className="min-h-[40px]"
          >
            Frissítés
          </AdminButton>
        </div>
      </div>

      {loading ? (
        <p className="py-8 text-center text-[12.5px] text-[var(--adm-text-muted)]">
          Ügykommunikáció betöltése…
        </p>
      ) : error ? (
        <div
          role="alert"
          className="rounded border border-red-200 bg-red-50 p-4 text-[12px] font-semibold text-red-800"
        >
          {error}
        </div>
      ) : items.length === 0 ? (
        <div
          className="rounded border border-dashed border-[var(--adm-border)] py-12 text-center"
          data-testid="wide-communication-empty"
        >
          <p className="text-[13px] font-medium text-[var(--adm-text-muted)]">
            Ehhez az ügyhöz még nincs rögzített kommunikáció.
          </p>
          <p className="mt-1 text-[11.5px] text-[var(--adm-text-secondary)]">
            A levelezések és egyeztetések a Kommunikációs munkatérből rendelhetők ehhez az ügyhöz.
          </p>
        </div>
      ) : (
        /* Wide readable master-detail or scrollable chain */
        <div className="grid grid-cols-1 gap-6 lg:grid-cols-[380px_1fr]">
          {/* Thread List Sidebar / Accordion */}
          <div className="space-y-2 border-r-0 lg:border-r lg:border-[var(--adm-border)] lg:pr-4">
            <span className="text-[10px] font-bold uppercase tracking-[0.1em] text-[var(--adm-text-muted)]">
              Üzenetek ({filteredItems.length})
            </span>
            <div className="max-h-[650px] space-y-2 overflow-y-auto pr-1">
              {filteredItems.map((item) => {
                const isSelected = item.id === selectedId;
                const isIncoming = item.direction === "INBOUND";
                return (
                  <button
                    key={item.id}
                    type="button"
                    onClick={() => setSelectedId(item.id)}
                    data-testid={`comm-thread-item-${item.id}`}
                    className={`w-full rounded border p-3 text-left transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--adm-green-800)] ${
                      isSelected
                        ? "border-[#2D4A7C] bg-[#EAEFF6]"
                        : "border-[var(--adm-border)] bg-[var(--adm-surface)] hover:bg-slate-100"
                    }`}
                  >
                    <div className="flex items-center justify-between gap-1">
                      <span className="text-[10.5px] font-semibold text-[var(--adm-text-muted)]">
                        {isIncoming ? "↙ Bejövő" : "↗ Kimenő"} · {typeLabels[item.type] || item.type}
                      </span>
                      <span className="text-[10px] text-[var(--adm-text-muted)]">
                        {formatMessageDate(item.effectiveMessageAt || item.createdAt)}
                      </span>
                    </div>

                    <h4 className="mt-1 text-[12.5px] font-bold text-[var(--adm-text)] line-clamp-1">
                      {item.subject || "Nincs tárgy"}
                    </h4>

                    <p className="mt-0.5 text-[11px] font-medium text-[var(--adm-text-secondary)] line-clamp-1">
                      {item.senderName || item.senderEmail || "Ismeretlen feladó"}
                    </p>

                    {item.summary || item.contentPreview ? (
                      <p className="mt-1 text-[11px] text-[var(--adm-text-muted)] line-clamp-2">
                        {item.summary || item.contentPreview}
                      </p>
                    ) : null}

                    {item.attachmentCount > 0 ? (
                      <div className="mt-1.5 flex items-center gap-1 text-[10px] font-semibold text-[var(--adm-text-muted)]">
                        📎 {item.attachmentCount} csatolmány
                      </div>
                    ) : null}
                  </button>
                );
              })}
            </div>
          </div>

          {/* Wide Message Reader Surface */}
          <div className="min-w-0" data-testid="wide-communication-reader">
            {selectedItem ? (
              <div className="space-y-4">
                {/* Message Header */}
                <div className="rounded border border-[var(--adm-border)] bg-[var(--adm-surface)] p-4">
                  <div className="flex flex-wrap items-center justify-between gap-2 border-b border-[var(--adm-border)] pb-2.5">
                    <h2 className="text-[17px] font-bold text-[var(--adm-text)]">
                      {selectedItem.subject || "Nincs megadott tárgy"}
                    </h2>
                    <div className="flex items-center gap-1.5">
                      <AdminBadge tone="blue">
                        {typeLabels[selectedItem.type] || selectedItem.type}
                      </AdminBadge>
                      <AdminBadge tone={selectedItem.direction === "INBOUND" ? "green" : "neutral"}>
                        {selectedItem.direction === "INBOUND" ? "Bejövő üzenet" : "Kimenő üzenet"}
                      </AdminBadge>
                    </div>
                  </div>

                  <dl className="mt-3 grid grid-cols-1 gap-2 text-[11.5px] sm:grid-cols-2">
                    <div>
                      <dt className="text-[10px] text-[var(--adm-text-muted)]">Feladó</dt>
                      <dd className="font-semibold text-[var(--adm-text)]">
                        {selectedItem.senderName
                          ? `${selectedItem.senderName} <${selectedItem.senderEmail || ""}>`
                          : selectedItem.senderEmail || "Nincs feladóadat"}
                      </dd>
                    </div>
                    <div>
                      <dt className="text-[10px] text-[var(--adm-text-muted)]">Időpont</dt>
                      <dd className="font-semibold text-[var(--adm-text)]">
                        {formatMessageDate(selectedItem.effectiveMessageAt || selectedItem.createdAt)}
                      </dd>
                    </div>
                  </dl>
                </div>

                {/* Message Body Content */}
                {loadingDetail ? (
                  <div className="p-8 text-center text-[12px] text-[var(--adm-text-muted)]">
                    Üzenet szövegének betöltése…
                  </div>
                ) : (
                  (() => {
                    const rawContent =
                      selectedDetail?.content ||
                      selectedItem.summary ||
                      selectedItem.contentPreview ||
                      "Nincs megjeleníthető szöveges tartalom.";
                    const { mainText, quotedText } = splitQuotedHistory(rawContent);
                    const isQuotedOpen = Boolean(showQuotedFor[selectedItem.id]);

                    return (
                      <div className="rounded border border-[var(--adm-border)] bg-white p-5 leading-relaxed">
                        {/* Main email text */}
                        <div
                          className="whitespace-pre-wrap font-sans text-[13px] leading-6 text-[var(--adm-text)]"
                          data-testid="comm-main-text"
                        >
                          {mainText}
                        </div>

                        {/* Collapsible Quoted History */}
                        {quotedText ? (
                          <div className="mt-4 border-t border-[var(--adm-border)] pt-3">
                            <button
                              type="button"
                              onClick={() => toggleQuoted(selectedItem.id)}
                              className="text-[11px] font-semibold text-[var(--adm-green-800)] hover:underline focus:outline-none"
                              data-testid="toggle-quoted-history-btn"
                            >
                              {isQuotedOpen
                                ? "▲ Idézett előzmények elrejtése"
                                : "▼ Idézett előzmények mutatása"}
                            </button>

                            {isQuotedOpen ? (
                              <div
                                className="mt-2 rounded border-l-2 border-slate-300 bg-slate-50 p-3 font-mono text-[11px] leading-5 text-[var(--adm-text-muted)] whitespace-pre-wrap"
                                data-testid="comm-quoted-text"
                              >
                                {quotedText}
                              </div>
                            ) : null}
                          </div>
                        ) : null}

                        {/* Attachments Section */}
                        {selectedDetail?.attachments && selectedDetail.attachments.length > 0 ? (
                          <div className="mt-6 border-t border-[var(--adm-border)] pt-3">
                            <span className="text-[10px] font-bold uppercase tracking-[0.1em] text-[var(--adm-text-muted)]">
                              Csatolt fájlok ({selectedDetail.attachments.length})
                            </span>
                            <ul className="mt-2 divide-y divide-[var(--adm-border)] rounded border border-[var(--adm-border)]">
                              {selectedDetail.attachments.map((att, idx) => (
                                <li
                                  key={att.id || idx}
                                  className="flex items-center justify-between p-2.5 text-[11.5px]"
                                >
                                  <div className="flex items-center gap-2">
                                    <span>📄</span>
                                    <span className="font-medium text-[var(--adm-text)]">
                                      {att.fileName}
                                    </span>
                                    {att.fileType ? (
                                      <span className="text-[10.5px] text-[var(--adm-text-muted)]">
                                        ({att.fileType})
                                      </span>
                                    ) : null}
                                  </div>
                                </li>
                              ))}
                            </ul>
                          </div>
                        ) : null}
                      </div>
                    );
                  })()
                )}
              </div>
            ) : (
              <p className="p-8 text-center text-[12px] text-[var(--adm-text-muted)]">
                Válasszon egy üzenetet a listából a tartalom megtekintéséhez.
              </p>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
