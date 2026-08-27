"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import { AuthenticatedApp } from "@/components/AuthenticatedApp";
import {
  getCases,
  getClient,
  getCommunicationById,
  getCommunications,
  type CaseListItem,
  type Client,
  type CommunicationDetail,
  type CommunicationItem,
} from "@/lib/api";
import {
  buildCommunicationContextDetail,
  buildCommunicationContextRow,
  canOpenCase,
  COMMUNICATION_CONTEXT_STATE_LABEL,
} from "@/lib/communicationContext";

function formatDateTime(value: string | null | undefined): string {
  if (!value) return "—";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "—";
  return new Intl.DateTimeFormat("hu-HU", { year: "numeric", month: "short", day: "numeric" }).format(date);
}

export default function ClientCommunicationsPage() {
  const params = useParams();
  const clientId = String(params?.clientId || "");

  const [client, setClient] = useState<Client | null>(null);
  const [communications, setCommunications] = useState<CommunicationItem[]>([]);
  const [cases, setCases] = useState<CaseListItem[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [detail, setDetail] = useState<CommunicationDetail | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [detailError, setDetailError] = useState(false);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(false);

  useEffect(() => {
    if (!clientId) return;
    let mounted = true;
    setLoading(true);
    setLoadError(false);

    void (async () => {
      try {
        const [clientResult, casesResult, directResult] = await Promise.all([
          getClient(clientId),
          getCases(1, 200, undefined, clientId),
          getCommunications({ clientId, limit: 100 }).catch(() => ({ communications: [] as CommunicationItem[], pagination: { total: 0, limit: 0, offset: 0 } })),
        ]);

        const relatedCases = casesResult.data || [];
        const perCase = await Promise.all(
          relatedCases.map(async (caseItem) => {
            const result = await getCommunications({ caseId: caseItem.id, limit: 20 }).catch(() => ({ communications: [] as CommunicationItem[], pagination: { total: 0, limit: 0, offset: 0 } }));
            return result.communications;
          }),
        );

        const merged = new Map<string, CommunicationItem>();
        for (const item of directResult.communications) merged.set(item.id, item);
        for (const item of perCase.flat()) if (!merged.has(item.id)) merged.set(item.id, item);

        const rows = Array.from(merged.values()).sort(
          (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime(),
        );

        if (!mounted) return;
        setClient(clientResult);
        setCases(relatedCases);
        setCommunications(rows);
        setSelectedId((current) => (current && rows.some((r) => r.id === current) ? current : rows[0]?.id ?? null));
      } catch (error) {
        console.error("Failed to load client communications:", error);
        if (mounted) setLoadError(true);
      } finally {
        if (mounted) setLoading(false);
      }
    })();

    return () => {
      mounted = false;
    };
  }, [clientId]);

  const caseById = new Map(cases.map((caseItem) => [caseItem.id, caseItem]));

  useEffect(() => {
    let mounted = true;
    if (!selectedId) {
      setDetail(null);
      setDetailLoading(false);
      setDetailError(false);
      return;
    }
    setDetailLoading(true);
    setDetailError(false);
    getCommunicationById(selectedId)
      .then((payload) => {
        if (mounted) setDetail(payload);
      })
      .catch((error) => {
        console.error("Failed to load communication detail:", error);
        if (mounted) setDetailError(true);
      })
      .finally(() => {
        if (mounted) setDetailLoading(false);
      });
    return () => {
      mounted = false;
    };
  }, [selectedId]);

  const selected = communications.find((item) => item.id === selectedId) ?? null;
  const detailView = detail ? buildCommunicationContextDetail(detail, {
    client,
    caseRecord: detail.caseId ? caseById.get(detail.caseId) : null,
  }) : null;

  return (
    <AuthenticatedApp section="clients">
      <div className="flex-1 min-h-0 overflow-y-auto adm-board-page">
        <div className="adm-board-container space-y-5">
          {client ? (
            <header className="adm-board-panel p-5">
              <Link href={`/clients/${encodeURIComponent(clientId)}`} className="text-[10px] font-semibold uppercase tracking-[0.2em] text-[var(--adm-text-muted)] hover:text-[var(--adm-text)]">← Vissza az ügyfél áttekintéshez</Link>
              <h1 className="mt-1 font-serif text-3xl text-[var(--adm-text)]">Kommunikáció · {client.name}</h1>
              <p className="mt-2 text-sm text-[var(--adm-text-muted)]">A kapcsolt kommunikációk ügyfélkontextusban jelennek meg.</p>
            </header>
          ) : null}

          {loadError ? (
            <div className="adm-board-panel p-5 text-sm text-[var(--adm-text-muted)]">A kommunikáció jelenleg nem érhető el.</div>
          ) : loading ? (
            <div className="adm-board-panel p-5 text-sm text-[var(--adm-text-muted)]">Kommunikáció betöltése…</div>
          ) : communications.length === 0 ? (
            <div className="adm-board-panel p-5 text-sm text-[var(--adm-text-muted)]">Ehhez az ügyfélhez még nincs kapcsolt kommunikáció.</div>
          ) : (
            <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_360px]">
              <section className="adm-board-panel p-5">
                <h2 className="font-serif text-xl text-[var(--adm-text)]">Kommunikáció</h2>
                <ul className="mt-4 space-y-2">
                  {communications.map((item) => {
                    const row = buildCommunicationContextRow(item, {
                      clientName: client?.name,
                      caseNumber: item.caseId ? caseById.get(item.caseId)?.caseNumber : null,
                      caseTitle: item.caseId ? caseById.get(item.caseId)?.title : null,
                    });
                    return (
                      <li key={item.id}>
                        <button
                          type="button"
                          onClick={() => setSelectedId(item.id)}
                          className={`adm-board-list-row block w-full p-3 text-left ${selectedId === item.id ? "border-[var(--adm-ochre-500)]" : ""}`}
                        >
                          <div className="flex flex-wrap items-center justify-between gap-2">
                            <p className="text-xs font-semibold text-[var(--adm-text)] truncate">{row.sender}</p>
                            <span className="text-[10px] font-semibold text-[var(--adm-text-muted)]">{COMMUNICATION_CONTEXT_STATE_LABEL[row.state]}</span>
                          </div>
                          <p className="mt-1 truncate text-sm text-[var(--adm-blue-950)]">{row.subject || "Nincs tárgy"}</p>
                          {row.preview ? <p className="mt-1 truncate text-[10px] text-[var(--adm-text-muted)]">{row.preview}</p> : null}
                          <div className="mt-1 flex flex-wrap items-center gap-2 text-[10px] text-[var(--adm-text-muted)]">
                            <span>{formatDateTime(row.receivedAt)}</span>
                            {row.caseNumber ? <span>{row.caseNumber} · {row.caseTitle}</span> : null}
                            {row.attachmentCount > 0 ? <span>{row.attachmentCount} melléklet</span> : null}
                            {row.taskCount > 0 ? <span>{row.taskCount} feladat</span> : null}
                          </div>
                        </button>
                      </li>
                    );
                  })}
                </ul>
              </section>

              <aside className="adm-board-panel self-start p-5">
                {!selected ? <p className="text-sm text-[var(--adm-text-muted)]">Válassz kommunikációt.</p> : (
                  <div>
                    <p className="text-[10px] font-semibold uppercase tracking-[0.2em] text-[var(--adm-text-muted)]">Kommunikáció</p>
                    <h3 className="mt-1 font-serif text-xl text-[var(--adm-text)]">{detailView?.subject || selected.subject || "Nincs tárgy"}</h3>
                    <p className="mt-2 text-xs font-semibold text-[var(--adm-text)]">{detailView?.sender || selected.senderName || selected.senderEmail || "Ismeretlen feladó"}</p>
                    <p className="mt-1 text-[10px] text-[var(--adm-text-muted)]">{formatDateTime(detailView?.receivedAt || selected.receivedAt || selected.createdAt)}</p>

                    {detailLoading ? <p className="mt-3 text-sm text-[var(--adm-text-muted)]">Tartalom betöltése…</p>
                      : detailError ? <p className="mt-3 text-sm text-[var(--adm-text-muted)]">A tartalom jelenleg nem érhető el.</p>
                      : detailView?.content ? <p className="mt-3 whitespace-pre-wrap text-xs leading-5 text-[var(--adm-text)]">{detailView.content}</p>
                      : selected.summary || selected.contentPreview ? <p className="mt-3 text-xs leading-5 text-[var(--adm-text-muted)]">{selected.summary || selected.contentPreview}</p>
                      : null}

                    {detailView && detailView.attachments.length > 0 ? (
                      <div className="mt-4">
                        <p className="text-[10px] font-semibold uppercase tracking-[0.2em] text-[var(--adm-text-muted)]">Mellékletek</p>
                        <ul className="mt-2 space-y-1">
                          {detailView.attachments.map((attachment) => (
                            <li key={`${attachment.fileName}-${attachment.fileType ?? ""}`} className="text-xs text-[var(--adm-text)]">
                              <span className="font-semibold">{attachment.fileName}</span>
                              {attachment.description ? <span className="text-[var(--adm-text-muted)]"> · {attachment.description}</span> : null}
                            </li>
                          ))}
                        </ul>
                      </div>
                    ) : null}

                    {detailView?.relatedTaskTitle ? (
                      <div className="mt-4">
                        <p className="text-[10px] font-semibold uppercase tracking-[0.2em] text-[var(--adm-text-muted)]">Kapcsolt feladat</p>
                        <p className="mt-1 text-xs font-semibold text-[var(--adm-blue-700)]">{detailView.relatedTaskTitle}</p>
                      </div>
                    ) : null}

                    <div className="mt-4 flex flex-wrap gap-2">
                      {canOpenCase(selected) ? (
                        <Link href={`/cases/${encodeURIComponent(selected.caseId!)}/communications`} className="rounded-lg bg-[var(--adm-blue-700)] px-3 py-2 text-[11px] font-semibold text-white hover:opacity-90">Ügykontextus megnyitása</Link>
                      ) : null}
                      <Link href={`/clients/${encodeURIComponent(clientId)}`} className="rounded-lg border border-[var(--adm-border)] bg-white px-3 py-2 text-[11px] font-semibold text-[var(--adm-text-muted)] hover:text-[var(--adm-text)]">Ügyfél áttekintés</Link>
                    </div>
                  </div>
                )}
              </aside>
            </div>
          )}
        </div>
      </div>
    </AuthenticatedApp>
  );
}
