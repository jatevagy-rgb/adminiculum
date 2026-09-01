// Legacy "Napi munka összefoglaló" colored work-summary cards.
//
// Restored from the last correct historical implementation — DashboardFocused
// @ a948839 (6-card grid), which was degraded to 3 cards at 10e1bd3 and removed
// entirely at a607f6e. Labels, tones, order, hrefs, empty labels and the
// tone→color mapping are preserved verbatim from that revision. The tone→class
// map is the single source of truth shared by the component and the tests, so no
// parallel implementation can drift.

export type WorkloadSummaryTone = "petrol" | "amber" | "gold" | "navy" | "terracotta" | "green";

export type WorkloadSummaryValueKey =
  | "openCases"
  | "todayTasks"
  | "deadlines"
  | "reviews"
  | "externalComms"
  | "internalComms";

export type WorkloadSummaryCardDef = {
  valueKey: WorkloadSummaryValueKey;
  label: string;
  emptyLabel: string;
  href: string;
  tone: WorkloadSummaryTone;
};

// Exact labels / tones / order / hrefs from DashboardFocused @ a948839.
export const WORKLOAD_SUMMARY_CARDS: readonly WorkloadSummaryCardDef[] = [
  { valueKey: "openCases", label: "Nyitott ügyek", emptyLabel: "Nincs ügy", href: "/cases", tone: "petrol" },
  { valueKey: "todayTasks", label: "Mai teendők", emptyLabel: "Nincs mai teendő", href: "/deadlines?view=day", tone: "amber" },
  { valueKey: "deadlines", label: "Közeli határidők", emptyLabel: "Nincs közeli határidő", href: "/deadlines", tone: "gold" },
  { valueKey: "reviews", label: "Review tételek", emptyLabel: "Nincs review tétel", href: "/reviews", tone: "navy" },
  { valueKey: "externalComms", label: "Külső kommunikáció", emptyLabel: "Nincs külső tétel", href: "/communications?view=external", tone: "terracotta" },
  { valueKey: "internalComms", label: "Belső kommunikáció", emptyLabel: "Nincs belső tétel", href: "/communications?view=internal", tone: "green" },
];

// Whole-card background carries the semantic color. Verbatim from a948839.
// "terracotta" and "green" map to the established Dashboard design tokens.
export function workloadSummaryToneClass(tone: WorkloadSummaryTone): string {
  return tone === "amber"
    ? "bg-[#FD9E02] text-[#3E2400]"
    : tone === "gold"
      ? "bg-[#FFB703] text-[#4A3300]"
      : tone === "terracotta"
        ? "bg-[var(--adm-terracotta-700)] text-white"
        : tone === "green"
          ? "bg-[var(--adm-green-800)] text-white"
          : tone === "navy"
            ? "bg-[#023047] text-white"
            : "bg-[#126782] text-white";
}

export function workloadSummaryPanelClass(tone: WorkloadSummaryTone): string {
  return tone === "amber" || tone === "gold"
    ? "bg-black/[0.07] border-black/[0.12]"
    : "bg-white/[0.14] border-white/[0.24]";
}

// Caption logic (verbatim): failure (null) → "Most nem elérhető", successful
// empty (0) → the card's empty label, otherwise "Aktív tétel". A failed source
// is therefore never shown as a fake zero.
export function workloadSummaryCaption(value: number | null, emptyLabel: string): string {
  return value === null ? "Most nem elérhető" : value === 0 ? emptyLabel : "Aktív tétel";
}
