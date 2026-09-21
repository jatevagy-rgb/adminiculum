"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { AuthenticatedApp } from "@/components/AuthenticatedApp";
import { CompactState, OperationalPageHeader, SafePanelError } from "@/components/adminiculum/OperationalPrimitives";
import { AdminButton, AdminStatusPill } from "@/components/adminiculum/ui";
import { ClientAccent } from "@/components/clients/ClientAccent";
import {
  getNotifications,
  getUnreadNotificationsCount,
  markAllNotificationsRead,
  markNotificationRead,
  type NotificationItem,
} from "@/lib/api";
import {
  NOTIFICATION_PAGE_SIZE,
  NOTIFICATIONS_CHANGED_EVENT,
  notificationHrefLabel,
  notificationTypePresentation,
  resolveNotificationHref,
} from "@/lib/notificationPresentation";
import { formatDateTime } from "@/lib/taskWorkflowPresentation";

const LOAD_ERROR_DETAIL = "Az értesítések jelenleg nem érhetők el. Az adatok változatlanul a szerveren maradnak.";
const MARK_ONE_ERROR_DETAIL = "Az értesítés olvasottként jelölése nem sikerült. Próbálja újra.";
const MARK_ALL_ERROR_DETAIL = "Az összes értesítés olvasottként jelölése nem sikerült. Próbálja újra.";

function announceNotificationsChanged(): void {
  if (typeof window === "undefined") {
    return;
  }

  window.dispatchEvent(new Event(NOTIFICATIONS_CHANGED_EVENT));
}

function mergeNotificationPages(current: NotificationItem[], incoming: NotificationItem[]): NotificationItem[] {
  const seen = new Set(current.map((item) => item.id));
  const merged = [...current];
  for (const item of incoming) {
    if (!seen.has(item.id)) {
      seen.add(item.id);
      merged.push(item);
    }
  }
  return merged;
}

export default function NotificationsPage() {
  return (
    <AuthenticatedApp section="notifications">
      <NotificationsInbox />
    </AuthenticatedApp>
  );
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
      if (announce) {
        announceNotificationsChanged();
      }
    } catch {
      // A canonical count is never invented: on failure the last known value stays.
    }
  }, []);

  const loadNotifications = useCallback(async (targetOffset: number, append: boolean) => {
    const sequence = requestSequence.current + 1;
    requestSequence.current = sequence;

    if (append) {
      setIsLoadingMore(true);
    } else {
      setIsLoading(true);
    }
    setLoadError(null);

    try {
      const response = await getNotifications(NOTIFICATION_PAGE_SIZE, targetOffset);
      if (requestSequence.current !== sequence) {
        return;
      }

      setItems((current) => (append ? mergeNotificationPages(current, response.notifications) : response.notifications));
      setTotal(response.pagination.total);
      setOffset(response.pagination.offset);
    } catch {
      if (requestSequence.current !== sequence) {
        return;
      }
      setLoadError(LOAD_ERROR_DETAIL);
    } finally {
      if (requestSequence.current === sequence) {
        setIsLoading(false);
        setIsLoadingMore(false);
      }
    }
  }, []);

  const reload = useCallback(async () => {
    await Promise.all([loadNotifications(0, false), refreshUnreadCount(false)]);
  }, [loadNotifications, refreshUnreadCount]);

  useEffect(() => {
    void reload();
  }, [reload]);

  const handleMarkRead = useCallback(
    async (notificationId: string) => {
      setMutationError(null);
      setPendingIds((current) => (current.includes(notificationId) ? current : [...current, notificationId]));

      try {
        await markNotificationRead(notificationId);
        setItems((current) => current.map((item) => (item.id === notificationId ? { ...item, isRead: true } : item)));
        await refreshUnreadCount(true);
      } catch {
        setMutationError(MARK_ONE_ERROR_DETAIL);
      } finally {
        setPendingIds((current) => current.filter((id) => id !== notificationId));
      }
    },
    [refreshUnreadCount],
  );

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

  const openNotification = useCallback(
    (item: NotificationItem, href: string) => {
      if (!item.isRead) {
        void handleMarkRead(item.id);
      }
      router.push(href);
    },
    [handleMarkRead, router],
  );

  const hasMore = items.length < total;
  const showInitialLoading = isLoading && items.length === 0 && !loadError;
  const showEmptyState = !isLoading && !loadError && items.length === 0;

  return (
    <div className="adm-board-page flex-1 overflow-y-auto">
      <div className="adm-board-container space-y-4">
        <OperationalPageHeader
          title="Értesítések"
          count={total > 0 ? `${total} értesítés` : null}
          subtitle="Rendszer- és munkafolyamat-események az Ön számára. A kommunikációs üzenetek külön munkatéren érhetők el."
          secondaryActions={
            unreadCount > 0 ? (
              <AdminStatusPill tone="amber" data-testid="notification-unread-count">
                {unreadCount} olvasatlan
              </AdminStatusPill>
            ) : (
              <AdminStatusPill tone="sage" data-testid="notification-unread-count">
                Nincs olvasatlan
              </AdminStatusPill>
            )
          }
          primaryAction={
            <AdminButton
              variant="neutral"
              size="sm"
              onClick={() => void handleMarkAllRead()}
              disabled={unreadCount === 0 || isMarkingAll}
              data-testid="notification-mark-all-read"
            >
              {isMarkingAll ? "Megjelölés…" : "Összes olvasottként"}
            </AdminButton>
          }
        />

        {loadError ? (
          <div role="alert" data-testid="notification-error-state">
            <SafePanelError detail={loadError} onRetry={() => void reload()} />
          </div>
        ) : null}

        {mutationError ? (
          <div role="alert" data-testid="notification-mutation-error">
            <CompactState tone="error" title="A művelet nem sikerült." detail={mutationError} />
          </div>
        ) : null}

        {showInitialLoading ? (
          <div data-testid="notification-loading-state">
            <CompactState title="Értesítések betöltése…" />
          </div>
        ) : null}

        {showEmptyState ? (
          <div data-testid="notification-empty-state">
            <CompactState
              title="Nincs új értesítés."
              detail="A rendszer- és munkafolyamat-értesítések automatikusan ide érkeznek."
            />
          </div>
        ) : null}

        {!loadError && items.length > 0 ? (
          <section
            className="rounded-[var(--adm-radius-lg)] border border-[var(--adm-border)] bg-white p-3"
            aria-labelledby="notification-list-title"
          >
            <div className="flex items-center justify-between gap-3 border-b border-[var(--adm-border)] pb-3">
              <div>
                <h2 id="notification-list-title" className="font-serif text-[20px] text-[var(--adm-text)]">
                  Beérkezett értesítések
                </h2>
                <p className="mt-1 text-[10px] text-[var(--adm-text-muted)]">
                  Legutóbbi elöl. Az olvasatlan tételek kiemelten jelennek meg.
                </p>
              </div>
              <span className="text-[11px] font-semibold text-[var(--adm-text-muted)]">
                {items.length} / {total} tétel
              </span>
            </div>

            <ul className="mt-3 space-y-2" data-testid="notification-list">
              {items.map((item) => {
                const typePresentation = notificationTypePresentation(item.type);
                const href = resolveNotificationHref(item.link);
                const isPending = pendingIds.includes(item.id);

                return (
                  <li
                    key={item.id}
                    data-testid="notification-row"
                    data-notification-id={item.id}
                    data-read-state={item.isRead ? "read" : "unread"}
                    className={`relative overflow-hidden rounded border p-3 pl-4 ${
                      item.isRead ? "border-[var(--adm-border)] bg-white" : "border-[var(--adm-border)] bg-[var(--adm-surface)]"
                    }`}
                  >
                    {item.clientColorKey ? (
                      <ClientAccent colorKey={item.clientColorKey} className="absolute inset-y-0 left-0 w-1" />
                    ) : null}

                    <div className="flex flex-wrap items-center gap-1.5">
                      <AdminStatusPill tone={typePresentation.tone}>{typePresentation.label}</AdminStatusPill>
                      {item.isRead ? (
                        <span
                          data-testid="notification-read-state"
                          className="text-[10px] uppercase tracking-[0.14em] text-[var(--adm-text-soft)]"
                        >
                          Olvasott
                        </span>
                      ) : (
                        <span
                          data-testid="notification-read-state"
                          className="inline-flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-[0.14em] text-[var(--adm-ochre-500)]"
                        >
                          <span aria-hidden="true" className="h-1.5 w-1.5 rounded-full bg-current" />
                          Olvasatlan
                        </span>
                      )}
                      <span className="ml-auto text-[10px] text-[var(--adm-text-muted)]">{formatDateTime(item.createdAt)}</span>
                    </div>

                    <h3 className={`mt-2 text-[13px] text-[var(--adm-text)] ${item.isRead ? "font-semibold" : "font-bold"}`}>
                      {item.title}
                    </h3>
                    <p className="mt-1 text-[11px] leading-5 text-[var(--adm-text-muted)]">{item.message}</p>

                    <div className="mt-2 flex flex-wrap items-center gap-2">
                      {href ? (
                        <>
                          <AdminButton
                            size="xs"
                            variant="neutral"
                            onClick={() => openNotification(item, href)}
                            disabled={isPending}
                            data-testid="notification-open"
                          >
                            Megnyitás
                          </AdminButton>
                          <span className="max-w-[260px] truncate text-[10px] text-[var(--adm-text-soft)]" title={href}>
                            {notificationHrefLabel(href)}
                          </span>
                        </>
                      ) : null}
                      {!item.isRead ? (
                        <AdminButton
                          size="xs"
                          variant="ghost"
                          onClick={() => void handleMarkRead(item.id)}
                          disabled={isPending}
                          data-testid="notification-mark-read"
                        >
                          {isPending ? "Megjelölés…" : "Olvasottként"}
                        </AdminButton>
                      ) : null}
                    </div>
                  </li>
                );
              })}
            </ul>

            {hasMore ? (
              <div className="mt-3 border-t border-[var(--adm-border)] pt-3">
                <AdminButton
                  variant="neutral"
                  size="sm"
                  onClick={() => void loadNotifications(offset + NOTIFICATION_PAGE_SIZE, true)}
                  disabled={isLoadingMore}
                  data-testid="notification-load-more"
                >
                  {isLoadingMore ? "Betöltés…" : "Több értesítés betöltése"}
                </AdminButton>
              </div>
            ) : null}
          </section>
        ) : null}
      </div>
    </div>
  );
}
