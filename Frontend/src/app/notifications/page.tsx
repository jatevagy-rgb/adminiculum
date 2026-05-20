"use client";

import { useEffect, useMemo, useState } from "react";
import { AuthenticatedApp } from "@/components/AuthenticatedApp";
import {
  getNotifications,
  getUnreadNotificationsCount,
  markAllNotificationsRead,
  markNotificationRead,
  type NotificationItem,
  type NotificationType,
} from "@/lib/api";

const typeLabels: Record<NotificationType, string> = {
  TASK_ASSIGNED: "Feladat kiosztva",
  TASK_DUE_SOON: "Közelgő határidő",
  TASK_OVERDUE: "Lejárt feladat",
  CASE_ASSIGNED: "Ügy hozzárendelve",
  CASE_STATUS_CHANGED: "Ügyállapot változott",
  DOCUMENT_UPLOADED: "Dokumentum feltöltve",
  DOCUMENT_APPROVED: "Dokumentum jóváhagyva",
  COMMENT_ADDED: "Megjegyzés érkezett",
  REVIEW_REQUESTED: "Review kérve",
  REVIEW_COMPLETED: "Review lezárva",
  TIME_LOGGED: "Munkaóra rögzítve",
  SYSTEM: "Rendszerértesítés",
};

const formatDateTime = (iso: string) => {
  try {
    return new Date(iso).toLocaleString("hu-HU", { dateStyle: "short", timeStyle: "short" });
  } catch {
    return iso;
  }
};

export default function NotificationsPage() {
  return (
    <AuthenticatedApp section="notifications">
      <NotificationsPageContent />
    </AuthenticatedApp>
  );
}

function NotificationsPageContent() {
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [notifications, setNotifications] = useState<NotificationItem[]>([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const [isMarkingAll, setIsMarkingAll] = useState(false);
  const [markingId, setMarkingId] = useState<string | null>(null);

  const loadNotifications = async () => {
    setIsLoading(true);
    setError(null);
    try {
      const [listResult, unreadResult] = await Promise.all([
        getNotifications(100, 0),
        getUnreadNotificationsCount(),
      ]);
      setNotifications(listResult.notifications);
      setUnreadCount(unreadResult.unreadCount);
    } catch (err) {
      console.error("Notification load failed:", err);
      setError("Az értesítések betöltése sikertelen.");
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    loadNotifications();
  }, []);

  const sortedNotifications = useMemo(
    () =>
      [...notifications].sort(
        (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
      ),
    [notifications]
  );

  const handleMarkRead = async (notificationId: string) => {
    setMarkingId(notificationId);
    try {
      await markNotificationRead(notificationId);
      setNotifications((current) =>
        current.map((item) =>
          item.id === notificationId
            ? {
                ...item,
                isRead: true,
              }
            : item
        )
      );
      setUnreadCount((current) => Math.max(0, current - 1));
    } catch (err) {
      console.error("Mark notification as read failed:", err);
      setError("A művelet sikertelen.");
    } finally {
      setMarkingId(null);
    }
  };

  const handleMarkAllRead = async () => {
    setIsMarkingAll(true);
    try {
      await markAllNotificationsRead();
      setNotifications((current) => current.map((item) => ({ ...item, isRead: true })));
      setUnreadCount(0);
    } catch (err) {
      console.error("Mark all notifications as read failed:", err);
      setError("A művelet sikertelen.");
    } finally {
      setIsMarkingAll(false);
    }
  };

  return (
    <main className="min-h-screen bg-[#F4EFE5] px-6 py-8 lg:px-10">
      <section className="mx-auto w-full max-w-6xl rounded-2xl border border-[#D8CDB6] bg-[#FFFDF7] p-6 shadow-sm">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-[#E5DAC4] pb-4">
          <div>
            <h1 className="text-2xl text-[#1F3B2D]" style={{ fontFamily: "var(--font-newsreader)" }}>
              Értesítések
            </h1>
            <p className="mt-1 text-sm text-[#5D6B62]">In-app értesítési központ dedikált értesítési adatokkal.</p>
          </div>
          <div className="flex items-center gap-2">
            <span className="rounded-full border border-[#D8CDB6] bg-[#FAF5EA] px-3 py-1 text-xs font-semibold text-[#5A4A2A]">
              Olvasatlan: {unreadCount}
            </span>
            <button
              type="button"
              onClick={handleMarkAllRead}
              disabled={isMarkingAll || unreadCount === 0}
              className="rounded-lg border border-[#1F3B2D] px-3 py-2 text-xs font-semibold text-[#1F3B2D] disabled:cursor-not-allowed disabled:opacity-50"
            >
              {isMarkingAll ? "Összes jelölése..." : "Összes olvasottnak jelölése"}
            </button>
          </div>
        </div>

        {isLoading ? (
          <p className="py-8 text-sm text-[#5D6B62]">Értesítések betöltése…</p>
        ) : error ? (
          <p className="py-8 text-sm text-[#8F3D32]">{error}</p>
        ) : sortedNotifications.length === 0 ? (
          <p className="py-8 text-sm text-[#5D6B62]">Nincs új értesítés</p>
        ) : (
          <ul className="mt-4 space-y-3">
            {sortedNotifications.map((item) => (
              <li
                key={item.id}
                className={`rounded-xl border p-4 ${
                  item.isRead
                    ? "border-[#E5DAC4] bg-[#FFFCF4]"
                    : "border-[#D5B56A] bg-[#FFF7E3]"
                }`}
              >
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="space-y-1">
                    <div className="flex items-center gap-2">
                      <span className="rounded-full bg-[#EDE4D3] px-2 py-0.5 text-[11px] font-semibold text-[#4F5A50]">
                        {typeLabels[item.type] || "Értesítés"}
                      </span>
                      {!item.isRead && (
                        <span className="rounded-full bg-[#1F3B2D] px-2 py-0.5 text-[11px] font-semibold text-white">
                          Olvasatlan
                        </span>
                      )}
                    </div>
                    <p className="text-sm font-semibold text-[#1F3B2D]">{item.title}</p>
                    <p className="text-sm text-[#4F5A50]">{item.message}</p>
                    <p className="text-xs text-[#7C807A]">{formatDateTime(item.createdAt)}</p>
                  </div>

                  <div className="flex items-center gap-2">
                    {item.link ? (
                      <a
                        href={item.link}
                        className="rounded-lg border border-[#D8CDB6] px-3 py-2 text-xs font-semibold text-[#1F3B2D] hover:bg-[#F8F2E4]"
                      >
                        Megnyitás
                      </a>
                    ) : null}
                    {!item.isRead ? (
                      <button
                        type="button"
                        onClick={() => handleMarkRead(item.id)}
                        disabled={markingId === item.id}
                        className="rounded-lg bg-[#1F3B2D] px-3 py-2 text-xs font-semibold text-white disabled:cursor-not-allowed disabled:opacity-50"
                      >
                        {markingId === item.id ? "Mentés..." : "Megjelölés olvasottként"}
                      </button>
                    ) : null}
                  </div>
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>
    </main>
  );
}
