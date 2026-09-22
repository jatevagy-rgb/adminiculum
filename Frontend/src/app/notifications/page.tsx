"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { AuthenticatedApp } from "@/components/AuthenticatedApp";
import { CompactState, SafePanelError } from "@/components/adminiculum/OperationalPrimitives";
import { ClientAccent } from "@/components/clients/ClientAccent";
import { Badge, Button, PageHeader, QuietLink } from "@/components/ui";
import { getNotifications, getUnreadNotificationsCount, markAllNotificationsRead, markNotificationRead, type NotificationItem } from "@/lib/api";
import { NOTIFICATION_PAGE_SIZE, NOTIFICATIONS_CHANGED_EVENT, notificationHrefLabel, notificationTypePresentation, resolveNotificationHref } from "@/lib/notificationPresentation";
import { formatDateTime } from "@/lib/taskWorkflowPresentation";

const LOAD_ERROR_DETAIL = "Az értesítések jelenleg nem érhetők el. Az adatok változatlanul a szerveren maradnak.";
const MARK_ONE_ERROR_DETAIL = "Az értesítés olvasottként jelölése nem sikerült. Próbálja újra.";
const MARK_ALL_ERROR_DETAIL = "Az összes értesítés olvasottként jelölése nem sikerült. Próbálja újra.";
const TONE_MAP = { blue: "teal", gold: "gold", burgundy: "terracotta", violet: "navy", sage: "green", green: "green", amber: "gold", neutral: "neutral" } as const;

function announceNotificationsChanged(): void {
  if (typeof window === "undefined") return;
  window.dispatchEvent(new Event(NOTIFICATIONS_CHANGED_EVENT));
}

function mergeNotificationPages(current: NotificationItem[], incoming: NotificationItem[]): NotificationItem[] {
  const seen = new Set(current.map((item) => item.id));
  const merged = [...current];
  for (const item of incoming) {
    if (!seen.has(item.id)) { seen.add(item.id); merged.push(item); }
  }
  return merged;
}

export default function NotificationsPage() {
  return <AuthenticatedApp section="notifications"><NotificationsInbox /></AuthenticatedApp>;
}

function NotificationsInbox() {
  const router = useRouter();
  const [items, setItems] = useState<NotificationItem[]>([]);
  const [total, setTotal] = useState(0);
  const [offset, setOffset] = useState(0);
  const [unreadCount, setUnreadCount] = useState(0);
  const [isLoading, setIsLoading] = useState(true);
  const [isLoadingMore, setIsLoadingMore] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [mutationError, setMutationError] = useState<string | null>(null);
  const [pendingIds, setPendingIds] = useState<string[]>([]);
  const [isMarkingAll, setIsMarkingAll] = useState(false);
  const requestSequence = useRef(0);

  const refreshUnreadCount = useCallback(async (announce: boolean) => {
    try {
      const result = await getUnreadNotificationsCount();
      setUnreadCount(result.unreadCount);
      if (announce) announceNotificationsChanged();
    } catch {
      // Keep the last known count when the refresh cannot reach the server.
    }
  }, []);

  const loadNotifications = useCallback(async (targetOffset: number, append: boolean) => {
    const sequence = requestSequence.current + 1;
    requestSequence.current = sequence;
    if (append) setIsLoadingMore(true); else setIsLoading(true);
    setLoadError(null);
    try {
      const response = await getNotifications(NOTIFICATION_PAGE_SIZE, targetOffset);
      if (requestSequence.current !== sequence) return;
      setItems((current) => (append ? mergeNotificationPages(current, response.notifications) : response.notifications));
      setTotal(response.pagination.total);
      setOffset(response.pagination.offset);
    } catch {
      if (requestSequence.current === sequence) setLoadError(LOAD_ERROR_DETAIL);
    } finally {
      if (requestSequence.current === sequence) { setIsLoading(false); setIsLoadingMore(false); }
    }
  }, []);

  const reload = useCallback(async () => {
    await Promise.all([loadNotifications(0, false), refreshUnreadCount(false)]);
  }, [loadNotifications, refreshUnreadCount]);

  useEffect(() => { void reload(); }, [reload]);

  const handleMarkRead = useCallback(async (notificationId: string) => {
    setMutationError(null);
    setPendingIds((current) => current.includes(notificationId) ? current : [...current, notificationId]);
    try {
      await markNotificationRead(notificationId);
      setItems((current) => current.map((item) => item.id === notificationId ? { ...item, isRead: true } : item));
      await refreshUnreadCount(true);
    } catch {
      setMutationError(MARK_ONE_ERROR_DETAIL);
    } finally {
      setPendingIds((current) => current.filter((id) => id !== notificationId));
    }
  }, [refreshUnreadCount]);

  const handleMarkAllRead = useCallback(async () => {
    setMutationError(null);
    setIsMarkingAll(true);
    try {
      await markAllNotificationsRead();
      setItems((current) => current.map((item) => ({ ...item, isRead: true })));
      await refreshUnreadCount(true);
    } catch {
      setMutationError(MARK_ALL_ERROR_DETAIL);
    } finally {
      setIsMarkingAll(false);
    }
  }, [refreshUnreadCount]);

  const openNotification = useCallback((item: NotificationItem, href: string) => {
    if (!item.isRead) {
      void handleMarkRead(item.id);
    }
    router.push(href);
  }, [handleMarkRead, router]);

  const hasMore = items.length < total;
  const showInitialLoading = isLoading && items.length === 0 && !loadError;
  const showEmptyState = !isLoading && !loadError && items.length === 0;

  return (
    <div className="min-h-screen bg-white">
      <main className="mx-auto flex w-full max-w-7xl flex-col gap-4 px-4 py-5 sm:px-6">
        <PageHeader
          title="Értesítések"
          subtitle="A kommunikációs üzenetek külön munkatéren érhetők el."
          badge={<Badge tone={unreadCount > 0 ? "terracotta" : "neutral"} data-testid="notification-unread-count">{unreadCount > 0 ? `${unreadCount} olvasatlan` : "Nincs olvasatlan"}</Badge>}
          primaryAction={<Button variant="secondary" size="sm" onClick={() => void handleMarkAllRead()} disabled={unreadCount === 0 || isMarkingAll} data-testid="notification-mark-all-read">{isMarkingAll ? "Megjelölés…" : "Összes olvasottként"}</Button>}
        />

        {loadError ? <div role="alert" data-testid="notification-error-state"><SafePanelError detail={loadError} onRetry={() => void reload()} /></div> : null}
        {mutationError ? <div role="alert" data-testid="notification-mutation-error"><CompactState tone="error" title="A művelet nem sikerült." detail={mutationError} /></div> : null}
        {showInitialLoading ? <div data-testid="notification-loading-state"><CompactState title="Értesítések betöltése…" /></div> : null}
        {showEmptyState ? <div data-testid="notification-empty-state"><CompactState title="Nincs új értesítés." detail="A rendszer- és munkafolyamat-értesítések automatikusan ide érkeznek." /></div> : null}

        {!loadError && items.length > 0 ? (
          <section className="overflow-hidden rounded-[12px] border border-[#E5E7E6] bg-white" aria-labelledby="notification-list-title">
            <div className="flex items-center justify-between gap-3 border-b border-[#E5E7E6] px-3 py-3">
              <h2 id="notification-list-title" className="text-base font-semibold text-[#1F2937]">Beérkezett értesítések</h2>
              <span className="text-xs text-[#6B7280]">{items.length} / {total} tétel</span>
            </div>
            <ul data-testid="notification-list" className="divide-y divide-[#E5E7E6]">
              {items.map((item) => {
                const typePresentation = notificationTypePresentation(item.type);
                const href = resolveNotificationHref(item.link);
                const isPending = pendingIds.includes(item.id);
                return (
                  <li key={item.id} data-testid="notification-row" data-notification-id={item.id} data-read-state={item.isRead ? "read" : "unread"} className={`relative p-3 pl-5 ${item.isRead ? "bg-white" : "bg-[#F8FAF9]"}`}>
                    {item.clientColorKey ? <ClientAccent colorKey={item.clientColorKey} className="absolute inset-y-0 left-0 w-1" /> : null}
                    {!item.isRead ? <span aria-hidden="true" className="absolute inset-y-0 left-0 z-10 w-[3px] bg-[#0F3D32]" /> : null}
                    <div className="flex flex-wrap items-center gap-2">
                      <Badge tone={TONE_MAP[typePresentation.tone]}>{typePresentation.label}</Badge>
                      {item.isRead ? <Badge tone="neutral" data-testid="notification-read-state">Olvasott</Badge> : <Badge tone="green" data-testid="notification-read-state">Olvasatlan</Badge>}
                      <span className="ml-auto text-xs text-[#6B7280]">{formatDateTime(item.createdAt)}</span>
                    </div>
                    <h3 className="mt-2 text-sm font-semibold text-[#1F2937]">{item.title}</h3>
                    <p className="mt-1 text-xs leading-5 text-[#6B7280]">{item.message}</p>
                    <div className="mt-2 flex flex-wrap items-center gap-2">
                      {href ? (
                        <>
                          <QuietLink size="sm" onClick={() => openNotification(item, href)} disabled={isPending} data-testid="notification-open">Megnyitás</QuietLink>
                          <span className="text-xs text-[#6B7280]" title={href}>{notificationHrefLabel(href)}</span>
                        </>
                      ) : null}
                      {!item.isRead ? <Button size="sm" variant="tertiary" onClick={() => void handleMarkRead(item.id)} disabled={isPending} data-testid="notification-mark-read">{isPending ? "Megjelölés…" : "Olvasottként"}</Button> : null}
                    </div>
                  </li>
                );
              })}
            </ul>
            {hasMore ? <div className="border-t border-[#E5E7E6] p-3"><Button variant="neutral" size="sm" onClick={() => void loadNotifications(offset + NOTIFICATION_PAGE_SIZE, true)} disabled={isLoadingMore} data-testid="notification-load-more">{isLoadingMore ? "Betöltés…" : "Több értesítés betöltése"}</Button></div> : null}
          </section>
        ) : null}
      </main>
    </div>
  );
}
