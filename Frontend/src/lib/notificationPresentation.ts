/**
 * Shared FRONTEND presentation mapping for the workforce notification inbox.
 *
 * The backend contract is authoritative and untouched: notification rows stay
 * user-scoped and the `type` values remain the canonical NotificationType enum
 * names. This module only translates those names into restrained human wording
 * and decides whether a backend-supplied `link` is safe to navigate to.
 *
 * Nothing here invents priority, importance or delivery channels — an unknown
 * or future notification type degrades to a generic label instead of crashing.
 */

/** Tone keys mirrored from the canonical admin badge palette. */
export type NotificationTone =
  | "green"
  | "gold"
  | "amber"
  | "blue"
  | "sage"
  | "violet"
  | "burgundy"
  | "neutral";

export interface NotificationTypePresentation {
  label: string;
  tone: NotificationTone;
}

/** Truthful fallback for unknown or malformed notification types. */
export const UNKNOWN_NOTIFICATION_LABEL = "Értesítés";

const FALLBACK_PRESENTATION: NotificationTypePresentation = {
  label: UNKNOWN_NOTIFICATION_LABEL,
  tone: "neutral",
};

/**
 * UI-only wording for the canonical backend NotificationType values. Keys are
 * never renamed on the backend; an unknown key falls through to the fallback.
 */
const NOTIFICATION_TYPE_PRESENTATIONS: Record<string, NotificationTypePresentation> = {
  TASK_ASSIGNED: { label: "Feladat kiosztva", tone: "blue" },
  TASK_DUE_SOON: { label: "Közelgő határidő", tone: "gold" },
  TASK_OVERDUE: { label: "Lejárt határidő", tone: "burgundy" },
  CASE_ASSIGNED: { label: "Ügy kiosztva", tone: "blue" },
  CASE_STATUS_CHANGED: { label: "Ügy állapota változott", tone: "violet" },
  DOCUMENT_UPLOADED: { label: "Dokumentum feltöltve", tone: "sage" },
  DOCUMENT_APPROVED: { label: "Dokumentum jóváhagyva", tone: "green" },
  COMMENT_ADDED: { label: "Új hozzászólás", tone: "neutral" },
  REVIEW_REQUESTED: { label: "Review kérés", tone: "violet" },
  REVIEW_COMPLETED: { label: "Review lezárva", tone: "green" },
  TIME_LOGGED: { label: "Munkaóra rögzítve", tone: "neutral" },
  SYSTEM: { label: "Rendszerértesítés", tone: "neutral" },
};

export function notificationTypePresentation(type: unknown): NotificationTypePresentation {
  if (typeof type !== "string") {
    return FALLBACK_PRESENTATION;
  }

  const key = type.trim().toUpperCase();
  if (!key) {
    return FALLBACK_PRESENTATION;
  }

  return NOTIFICATION_TYPE_PRESENTATIONS[key] ?? FALLBACK_PRESENTATION;
}

/** Fixed base used to resolve candidate links without touching `window`. */
const INTERNAL_LINK_BASE = "https://adminiculum.internal.invalid";

/**
 * Returns the canonical internal application route for a backend `link`, or
 * null when the value is not a safe same-application relative path.
 *
 * Rejected: absolute URLs, protocol-relative URLs (`//host`), pseudo schemes
 * (`javascript:`), backslash variants browsers normalise to a path, raw
 * whitespace, control characters and anything unparseable. A rejected link is
 * rendered without navigation rather than silently rewritten.
 */
export function resolveNotificationHref(link: unknown): string | null {
  if (typeof link !== "string") {
    return null;
  }

  const candidate = link.trim();
  if (!candidate || !candidate.startsWith("/")) {
    return null;
  }

  if (candidate.startsWith("//") || candidate.includes("\\")) {
    return null;
  }

  if (/[\s\u0000-\u001F\u007F]/.test(candidate)) {
    return null;
  }

  try {
    const resolved = new URL(candidate, INTERNAL_LINK_BASE);
    if (resolved.origin !== INTERNAL_LINK_BASE) {
      return null;
    }
    return `${resolved.pathname}${resolved.search}${resolved.hash}`;
  } catch {
    return null;
  }
}

/** True when a notification row can offer canonical internal navigation. */
export function notificationHrefLabel(href: string): string {
  return href.length > 64 ? `${href.slice(0, 61)}…` : href;
}

/** Page size for the truthful load-more pagination over the existing API. */
export const NOTIFICATION_PAGE_SIZE = 20;

/** Browser event used to refresh canonical unread badges after a mutation. */
export const NOTIFICATIONS_CHANGED_EVENT = "adminiculum:notifications-changed";
