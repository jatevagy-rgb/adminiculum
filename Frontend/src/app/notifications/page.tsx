"use client";

import Link from "next/link";
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

const filters = [
  "Összes",
  "Külső",
  "Belső",
  "Válaszra vár",
  "Ügyfélhez sorolt",
  "Ügyhöz sorolt",
  "Feladathoz kapcsolt",
];

const filterViews: Record<string, string> = {
  Összes: "all",
  Külső: "external",
  Belső: "internal",
  "Válaszra vár": "replies",
  "Ügyfélhez sorolt": "clients",
  "Ügyhöz sorolt": "cases",
  "Feladathoz kapcsolt": "tasks",
};

const viewFilters = Object.fromEntries(Object.entries(filterViews).map(([label, view]) => [view, label]));

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

const resolveLinkContextLabel = (link?: string | null): string => {
  if (!link) return "Kapcsolódó elem nem elérhető";
  if (/^\/cases\/[^/]+\/documents/.test(link)) return "Kapcsolódó dokumentum";
  if (/^\/cases\/[^/]+\/handoff/.test(link)) return "Kapcsolódó leadási csomag";
  if (/^\/cases\/[^/]+\/communications/.test(link)) return "Kapcsolódó ügykommunikáció";
  if (/^\/cases\/[^/]+$/.test(link)) return "Kapcsolódó ügy";
  if (/^\/documents\/compare/.test(link)) return "Kapcsolódó workspace";
  if (/^\/reviews/.test(link)) return "Kapcsolódó review";
  if (/^\/time-entries/.test(link)) return "Kapcsolódó munkaóra";
  return "Kapcsolódó elem";
};

export default function NotificationsPage() {
  return (
    <AuthenticatedApp section="notifications">
      <CommunicationWorkspace />
    </AuthenticatedApp>
  );
}

function CommunicationWorkspace() {
  const [activeFilter, setActiveFilter] = useState(filters[0]);
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
      setError("A rendszeresemények most nem érhetők el.");
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    loadNotifications();
  }, []);

  useEffect(() => {
    const view = new URLSearchParams(window.location.search).get("view") || "all";
    const nextFilter = viewFilters[view] || filters[0];
    setActiveFilter(nextFilter);
  }, []);

  const sortedNotifications = useMemo(
    () =>
      [...notifications].sort(
        (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime(),
      ),
    [notifications],
  );

  const visibleNotifications = sortedNotifications.slice(0, 6);

  const handleMarkRead = async (notificationId: string) => {
    setMarkingId(notificationId);
    try {
      await markNotificationRead(notificationId);
      setNotifications((current) =>
        current.map((item) => (item.id === notificationId ? { ...item, isRead: true } : item)),
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
    <main className="adm-dash-stage min-h-screen px-3 pb-5 pt-3 sm:px-5 xl:px-6">
      <section className="mx-auto w-full max-w-[1440px] space-y-3">
        <header className="adm-panel adm-panel-primary overflow-hidden">
          <div className="flex flex-wrap items-start justify-between gap-3 border-b-[3px] border-[var(--adm-blue-500)] bg-white px-4 py-3 lg:px-5">
            <div>
              <p className="adm-kicker text-[var(--adm-blue-700)]">Kommunikáció</p>
              <h1 className="adm-heading mt-1 text-[28px] leading-tight">Kommunikációs munkatér</h1>
              <p className="mt-1 max-w-3xl text-[12px] leading-5 text-[var(--adm-text-muted)]">
                Levelek, belső jelzések és ügyhöz kapcsolható kommunikáció egy helyen.
              </p>
              <p className="mt-1 max-w-3xl text-[11px] leading-4 text-[var(--adm-text-soft)]">
                A jelenlegi nézet a kommunikációs munkafolyamat szerkezetét készíti elő; élő Outlook/Graph-bekötést nem jelez.
              </p>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <span className="rounded-[var(--adm-radius-sm)] border border-[var(--adm-blue-500)]/30 bg-[var(--adm-blue-100)]/35 px-3 py-1 text-[10.5px] font-semibold text-[var(--adm-blue-700)]">
                Foundation · Outlook később
              </span>
              <Link href="/cases" className="adm-link-button px-3 py-2 text-[11px]">
                Ügyek megnyitása
              </Link>
            </div>
          </div>

          <nav className="flex gap-1.5 overflow-x-auto px-4 py-2.5 lg:px-5" aria-label="Kommunikációs szűrők">
            {filters.map((filter) => {
              const isActive = activeFilter === filter;
              return (
                <button
                  key={filter}
                  type="button"
                  onClick={() => {
                    setActiveFilter(filter);
                    const view = filterViews[filter];
                    const url = view === "all" ? "/notifications" : `/notifications?view=${view}`;
                    window.history.replaceState(null, "", url);
                  }}
                  className={`shrink-0 rounded-[var(--adm-radius-sm)] border px-3 py-1.5 text-[11px] font-bold ${
                    isActive
                      ? "border-[var(--adm-blue-500)] bg-[var(--adm-blue-500)] text-white"
                      : "border-[var(--adm-border)] bg-[var(--adm-surface)] text-[var(--adm-text-muted)] hover:bg-white"
                  }`}
                >
                  {filter}
                </button>
              );
            })}
          </nav>
        </header>

        <section className="grid gap-3 xl:grid-cols-2">
          <CommunicationPanel
            title="Külső kommunikáció"
            accent="var(--adm-blue-500)"
            countLabel="0/8"
            emptyTitle="Nincs megjeleníthető külső kommunikáció a jelenlegi nézetben."
            emptyText="A lista később legfeljebb 8 levélelőnézetet mutat: feladó, tárgy, ügyfél/ügy, státusz."
          />
          <CommunicationPanel
            title="Belső kommunikáció"
            accent="var(--adm-blue-700)"
            countLabel="0/8"
            emptyTitle="Nincs megjeleníthető belső kommunikáció a jelenlegi nézetben."
            emptyText="A lista később belső jelzéseket, átadási kommenteket és review-visszajelzéseket mutat."
          />
        </section>

        <section className="grid items-start gap-3 xl:grid-cols-[minmax(0,1.1fr)_minmax(300px,0.7fr)_minmax(300px,0.7fr)]">
          <article className="adm-panel adm-panel-accent-navy p-4">
            <p className="adm-kicker text-[var(--adm-blue-950)]">Besorolás</p>
            <h2 className="adm-heading mt-1 text-[21px]">Besorolási munkafolyamat</h2>
            <div className="mt-3 flex flex-wrap items-center gap-2">
              {["Kommunikáció", "Ügyfél", "Ügy", "Feladat", "Dokumentum / review"].map((step, index) => (
                <span key={step} className="inline-flex items-center gap-2">
                  <span className="rounded-[var(--adm-radius-sm)] border border-[var(--adm-blue-950)]/20 bg-white px-2.5 py-1 text-[10.5px] font-bold text-[var(--adm-blue-950)]">
                    {step}
                  </span>
                  {index < 4 ? <span className="text-[var(--adm-text-soft)]">→</span> : null}
                </span>
              ))}
            </div>
            <p className="mt-3 text-[11.5px] leading-5 text-[var(--adm-text-muted)]">
              A kommunikáció később ügyfélhez, ügyhöz és feladathoz kapcsolható. A besorolási döntések megjegyezhetők lesznek.
            </p>
          </article>

          <article className="adm-panel adm-panel-accent-amber p-4">
            <p className="adm-kicker text-[var(--adm-warm-600)]">Válasz</p>
            <h2 className="adm-heading mt-1 text-[21px]">Válaszállapot</h2>
            <div className="mt-3 grid gap-2 sm:grid-cols-2 xl:grid-cols-1">
              <ReplyLane label="Tőlünk várnak választ" />
              <ReplyLane label="Mi várunk válaszra" />
            </div>
            <p className="mt-3 rounded-[var(--adm-radius-sm)] border border-dashed border-[var(--adm-warm-400)]/45 bg-[#FFF8E2] p-2.5 text-[11px] text-[var(--adm-text-muted)]">
              Nincs nyitott válaszállapot.
            </p>
          </article>

          <article className="adm-panel p-4" style={{ borderTop: "3px solid var(--adm-blue-950)" }}>
            <p className="adm-kicker text-[var(--adm-blue-950)]">Feladat</p>
            <h2 className="adm-heading mt-1 text-[21px]">Feladathoz kapcsolás</h2>
            <p className="mt-2 text-[11.5px] leading-5 text-[var(--adm-text-muted)]">
              Feladatkiadáskor később kapcsolható lesz releváns levél vagy kommunikációs szál.
            </p>
            <div className="mt-3 grid grid-cols-2 gap-2">
              {["Kommunikáció", "Feladat", "Ügy", "Felelős"].map((item) => (
                <span key={item} className="rounded-[var(--adm-radius-sm)] border border-[var(--adm-border)] bg-[var(--adm-surface)] px-2.5 py-2 text-[11px] font-bold text-[var(--adm-text)]">
                  {item}
                </span>
              ))}
            </div>
          </article>
        </section>

        <section className="adm-panel overflow-hidden">
          <div className="border-b border-[var(--adm-border)] bg-white px-4 py-3 lg:px-5">
            <p className="adm-kicker text-[var(--adm-blue-950)]">Adatmodell</p>
            <h2 className="adm-heading mt-0.5 text-[21px]">Kommunikációs szerkezet</h2>
          </div>
          <div className="grid gap-2 p-4 md:grid-cols-5 lg:px-5">
            {[
              { label: "Communication", detail: "üzenet / jegyzet" },
              { label: "Thread", detail: "kommunikációs szál" },
              { label: "Classification", detail: "ügyfél / ügy / feladat" },
              { label: "Assignment", detail: "feladathoz kapcsolás" },
              { label: "Rule", detail: "megjegyzett döntés" },
            ].map((item) => (
              <div key={item.label} className="rounded-[var(--adm-radius-sm)] border border-[var(--adm-border)] bg-[var(--adm-surface)] p-3">
                <p className="text-[10px] font-bold uppercase tracking-[0.12em] text-[var(--adm-blue-950)]">{item.label}</p>
                <p className="mt-1 text-[11px] text-[var(--adm-text-muted)]">{item.detail}</p>
              </div>
            ))}
          </div>
        </section>

        <section className="adm-panel overflow-hidden">
          <div className="flex flex-wrap items-center justify-between gap-3 border-b border-[var(--adm-border)] bg-white px-4 py-3 lg:px-5">
            <div>
              <p className="adm-kicker text-[var(--adm-green-800)]">Rendszeresemények</p>
              <h2 className="adm-heading mt-0.5 text-[21px]">Aktív értesítési sor</h2>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <span className="rounded-[var(--adm-radius-sm)] border border-[var(--adm-border)] bg-[var(--adm-surface)] px-3 py-1 text-[11px] font-semibold text-[var(--adm-text-muted)]">
                Olvasatlan: {unreadCount}
              </span>
              <button
                type="button"
                onClick={handleMarkAllRead}
                disabled={isLoading || isMarkingAll || notifications.length === 0 || unreadCount === 0}
                className="adm-link-button px-3 py-2 text-[11px] disabled:cursor-not-allowed disabled:opacity-50"
              >
                {isMarkingAll ? "Jelölés..." : "Összes olvasott"}
              </button>
            </div>
          </div>

          <div className="p-4 lg:px-5">
            {isLoading ? (
              <div className="adm-board-empty adm-board-empty-compact">
                <p className="text-xs font-semibold text-[var(--adm-text)]">Értesítések betöltése...</p>
                <p className="mt-1 text-[11px] text-[var(--adm-text-muted)]">A rendszeresemények lekérése folyamatban van.</p>
              </div>
            ) : error ? (
              <div className="rounded-[var(--adm-radius-sm)] border border-[var(--adm-terracotta-100)] bg-[var(--adm-terracotta-100)] p-3">
                <p className="text-xs font-semibold text-[var(--adm-terracotta-700)]">{error}</p>
                <button type="button" onClick={loadNotifications} className="adm-link-button mt-2 px-3 py-2 text-[11px]">
                  Újrapróbálás
                </button>
              </div>
            ) : visibleNotifications.length === 0 ? (
              <div className="adm-board-empty adm-board-empty-compact">
                <p className="text-xs font-semibold text-[var(--adm-text)]">Nincs új értesítés.</p>
                <p className="mt-1 text-[11px] text-[var(--adm-text-muted)]">Az ügy-, dokumentum- és review-jelzések itt jelennek meg.</p>
              </div>
            ) : (
              <ul className="grid gap-2">
                {visibleNotifications.map((item) => (
                  <li
                    key={item.id}
                    className={`rounded-[var(--adm-radius-sm)] border border-l-4 p-3 ${
                      item.isRead
                        ? "border-[var(--adm-border)] border-l-[var(--adm-blue-950)] bg-white"
                        : "border-[#F1CB64] border-l-[var(--adm-warm-500)] bg-[#FFF8E2]"
                    }`}
                  >
                    <div className="flex flex-wrap items-start justify-between gap-3">
                      <div className="min-w-0 flex-1">
                        <div className="flex flex-wrap items-center gap-1.5">
                          <span className="rounded bg-[var(--adm-ivory-200)] px-2 py-0.5 text-[10px] font-bold uppercase tracking-[0.08em] text-[var(--adm-text-muted)]">
                            {typeLabels[item.type] || "Értesítés"}
                          </span>
                          {!item.isRead ? (
                            <span className="rounded bg-[var(--adm-warm-500)] px-2 py-0.5 text-[10px] font-bold uppercase tracking-[0.08em] text-white">
                              Olvasatlan
                            </span>
                          ) : null}
                        </div>
                        <p className="mt-1 text-sm font-semibold text-[var(--adm-text)]">{item.title}</p>
                        <p className="mt-0.5 text-xs text-[var(--adm-text-muted)]">{item.message}</p>
                        <p className="mt-1 text-[10.5px] text-[var(--adm-text-soft)]">
                          {resolveLinkContextLabel(item.link)} · {formatDateTime(item.createdAt)}
                        </p>
                      </div>
                      <div className="flex shrink-0 flex-wrap gap-2">
                        {item.link ? (
                          <a href={item.link} className="adm-link-button px-3 py-2 text-[11px]">
                            Megnyitás
                          </a>
                        ) : null}
                        {!item.isRead ? (
                          <button
                            type="button"
                            onClick={() => handleMarkRead(item.id)}
                            disabled={markingId === item.id}
                            className="adm-link-button adm-link-button-primary px-3 py-2 text-[11px] disabled:cursor-not-allowed disabled:opacity-50"
                          >
                            {markingId === item.id ? "Mentés..." : "Olvasott"}
                          </button>
                        ) : null}
                      </div>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </section>
      </section>
    </main>
  );
}

function CommunicationPanel({
  title,
  accent,
  countLabel,
  emptyTitle,
  emptyText,
}: {
  title: string;
  accent: string;
  countLabel: string;
  emptyTitle: string;
  emptyText: string;
}) {
  return (
    <article className="adm-panel overflow-hidden">
      <div className="flex items-center justify-between gap-2 border-b border-[var(--adm-border)] bg-white px-4 py-3" style={{ borderTop: `3px solid ${accent}` }}>
        <h2 className="adm-heading text-[22px]">{title}</h2>
        <span className="rounded-[var(--adm-radius-sm)] border border-[var(--adm-border)] bg-[var(--adm-surface)] px-2.5 py-1 text-[10px] font-bold text-[var(--adm-text-soft)]">
          {countLabel}
        </span>
      </div>
      <div className="p-4">
        <div className="rounded-[var(--adm-radius-sm)] border border-dashed border-[var(--adm-border)] bg-[var(--adm-surface)] p-3">
          <p className="text-xs font-semibold text-[var(--adm-text)]">{emptyTitle}</p>
          <p className="mt-1 text-[11px] leading-4 text-[var(--adm-text-muted)]">{emptyText}</p>
        </div>
      </div>
    </article>
  );
}

function ReplyLane({ label }: { label: string }) {
  return (
    <div className="rounded-[var(--adm-radius-sm)] border border-[var(--adm-warm-400)]/35 bg-white px-3 py-2">
      <p className="text-[10px] font-bold uppercase tracking-[0.12em] text-[var(--adm-warm-600)]">{label}</p>
      <p className="mt-1 text-[11px] text-[var(--adm-text-muted)]">0 tétel</p>
    </div>
  );
}
