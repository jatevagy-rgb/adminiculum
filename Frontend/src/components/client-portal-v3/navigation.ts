/**
 * Client Portal 3.0 — ORGANIZATION navigation configuration.
 *
 * This module is the single source of truth for the V3 organization portal
 * information architecture. It is presentation-only: it never changes
 * authorization, capability gating or route availability.
 */

export type OrgPortalNavItem = {
  label: string;
  href: string;
};

/**
 * The exact seven ORGANIZATION desktop primary destinations.
 *
 * Naptár and Kommunikáció are utilities, not primary destinations, and must
 * never be added here. Szerződések / Megkeresések / Szervezeti áttekintés are
 * contextual surfaces and stay outside the primary navigation as well.
 */
export const ORG_PRIMARY_NAV: readonly OrgPortalNavItem[] = [
  { label: "Áttekintés", href: "/portal" },
  { label: "Ügyek", href: "/portal/ugyek" },
  { label: "Teendők", href: "/portal/teendoim" },
  { label: "Dokumentumok", href: "/portal/dokumentumok" },
  { label: "Vállalat", href: "/portal/vallalat" },
  { label: "Fejlesztés", href: "/portal/fejlesztes" },
  { label: "Megfelelés", href: "/portal/megfeleles" },
];

/** The exact three compact mobile primary destinations; "Több" is the fourth slot. */
export const ORG_MOBILE_PRIMARY_NAV: readonly OrgPortalNavItem[] = [
  { label: "Áttekintés", href: "/portal" },
  { label: "Ügyek", href: "/portal/ugyek" },
  { label: "Teendők", href: "/portal/teendoim" },
];

/**
 * The secondary destinations exposed by the mobile "Több" sheet. Kommunikáció
 * is filtered at render time by the canonical communication mode, exactly like
 * the desktop utility.
 */
export const ORG_MOBILE_MORE_NAV: readonly OrgPortalNavItem[] = [
  { label: "Dokumentumok", href: "/portal/dokumentumok" },
  { label: "Vállalat", href: "/portal/vallalat" },
  { label: "Fejlesztés", href: "/portal/fejlesztes" },
  { label: "Megfelelés", href: "/portal/megfeleles" },
  { label: "Naptár", href: "/portal/naptar" },
  { label: "Kommunikáció", href: "/portal/uzenetek" },
];

export const ORG_COMMUNICATION_HREF = "/portal/uzenetek";

/**
 * Canonical view key per portal path. Used only to mark the active destination;
 * it never changes authorization. /portal/ugyeim stays mapped as the legacy
 * alias of Ügyek so old deep links still highlight the right primary item.
 */
export const ORG_NAV_VIEW_BY_PATH: Readonly<Record<string, string>> = {
  "/portal": "home",
  "/portal/ugyek": "matters",
  "/portal/ugyeim": "matters",
  "/portal/teendoim": "tasks",
  "/portal/dokumentumok": "documents",
  "/portal/naptar": "calendar",
  "/portal/fejlesztes": "grow",
  "/portal/megfeleles": "compliance",
  "/portal/uzenetek": "messages",
  "/portal/vallalat": "company",
  "/portal/szervezeti-attekintes": "leadership",
};

/** Canonical destination for the single green global CTA. */
export const ORG_NEW_INTAKE_HREF = "/portal/megkeresesek/uj";
