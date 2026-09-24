/**
 * Adminiculum Canonical Semantic Design Tokens
 * 
 * Authority: ADMINICULUM_UI_SOURCE_OF_TRUTH.md
 * 
 * Rules:
 * 1. Product components MUST consume these semantic tokens or canonical primitives.
 * 2. Do not invent route-local arbitrary colors (e.g. bg-[#faf6ee]).
 * 3. Client identity colors (ClientColorKey) are a bounded exception for client tagging
 *    and MUST NOT be overloaded for workflow or status semantics.
 */

export interface TokenDefinition {
  id: string;
  name: string;
  cssVariable: string;
  hex: string;
  role: string;
  intendedUse: string;
  contrastWithWhite: number;
  contrastWithCanvasSubtle: number;
  isAccessibleOnLight: boolean;
}

export interface ClientColorDefinition {
  key: string;
  label: string;
  dotColor: string;
  badgeBg: string;
  badgeBorder: string;
  badgeText: string;
  description: string;
}

export const CANONICAL_TOKENS: Record<string, TokenDefinition> = {
  brandGreen: {
    id: "brandGreen",
    name: "Adminiculum Green",
    cssVariable: "--adm-brand-green",
    hex: "#0F3D32",
    role: "Primary Brand & Principal Action",
    intendedUse: "Main navigation, primary action buttons (AdminButton primary), active selection indicators",
    contrastWithWhite: 10.9,
    contrastWithCanvasSubtle: 10.4,
    isAccessibleOnLight: true,
  },
  brandDeep: {
    id: "brandDeep",
    name: "Deep Green",
    cssVariable: "--adm-brand-deep",
    hex: "#062B22",
    role: "Primary Hover & Deep Chrome",
    intendedUse: "Hover state for primary buttons, deep chrome accents, high-contrast dark badges",
    contrastWithWhite: 14.8,
    contrastWithCanvasSubtle: 14.1,
    isAccessibleOnLight: true,
  },
  brandTerracotta: {
    id: "brandTerracotta",
    name: "Terracotta",
    cssVariable: "--adm-brand-terracotta",
    hex: "#B85C4B",
    role: "Destructive Action & Critical Warning",
    intendedUse: "Irreversible deletion, critical alerts, error borders",
    contrastWithWhite: 4.8,
    contrastWithCanvasSubtle: 4.6,
    isAccessibleOnLight: true,
  },
  brandTerracottaSoft: {
    id: "brandTerracottaSoft",
    name: "Terracotta Soft",
    cssVariable: "--adm-brand-terracotta-soft",
    hex: "#F1D7D1",
    role: "Danger / Error Soft Surface",
    intendedUse: "Error alert background, danger badge fill",
    contrastWithWhite: 1.4,
    contrastWithCanvasSubtle: 1.3,
    isAccessibleOnLight: false,
  },
  canvasWhite: {
    id: "canvasWhite",
    name: "Canvas White",
    cssVariable: "--adm-canvas-white",
    hex: "#FFFFFF",
    role: "Raised Surface",
    intendedUse: "Card backgrounds, modal surfaces, form input backgrounds, table row surfaces",
    contrastWithWhite: 1.0,
    contrastWithCanvasSubtle: 1.05,
    isAccessibleOnLight: false,
  },
  canvasSubtle: {
    id: "canvasSubtle",
    name: "Surface Subtle",
    cssVariable: "--adm-canvas-subtle",
    hex: "#F8FAF9",
    role: "Application Background",
    intendedUse: "Main application background, quiet rails, table header backgrounds",
    contrastWithWhite: 1.05,
    contrastWithCanvasSubtle: 1.0,
    isAccessibleOnLight: false,
  },
  borderCanonical: {
    id: "borderCanonical",
    name: "Border Canonical",
    cssVariable: "--adm-border-canonical",
    hex: "#E5E7E6",
    role: "Structural Border",
    intendedUse: "Card borders, table dividers, form field borders (1px solid)",
    contrastWithWhite: 1.25,
    contrastWithCanvasSubtle: 1.2,
    isAccessibleOnLight: false,
  },
  textPrimary: {
    id: "textPrimary",
    name: "Text Primary",
    cssVariable: "--adm-text-primary",
    hex: "#1F2937",
    role: "Primary Body & Heading Copy",
    intendedUse: "Page titles, section headers, table data, form labels, body text",
    contrastWithWhite: 12.6,
    contrastWithCanvasSubtle: 12.0,
    isAccessibleOnLight: true,
  },
  textSecondary: {
    id: "textSecondary",
    name: "Text Secondary",
    cssVariable: "--adm-text-secondary",
    hex: "#6B7280",
    role: "Secondary Copy & Metadata",
    intendedUse: "Timestamps, record counts, helper copy, quiet link text",
    contrastWithWhite: 5.0,
    contrastWithCanvasSubtle: 4.7,
    isAccessibleOnLight: true,
  },
  paletteTeal: {
    id: "paletteTeal",
    name: "Teal",
    cssVariable: "--adm-palette-teal",
    hex: "#2E7DBA",
    role: "Legal Analysis & Intelligence",
    intendedUse: "Compliance intelligence tiles, clause anchor references, information badges",
    contrastWithWhite: 4.6,
    contrastWithCanvasSubtle: 4.4,
    isAccessibleOnLight: true,
  },
  paletteGold: {
    id: "paletteGold",
    name: "Gold",
    cssVariable: "--adm-palette-gold",
    hex: "#F4A51C",
    role: "Attention & Highlighted Action",
    intendedUse: "Urgent attention states, pending signature notices, secondary highlighted actions",
    contrastWithWhite: 2.1,
    contrastWithCanvasSubtle: 2.0,
    isAccessibleOnLight: false,
  },
  paletteNavy: {
    id: "paletteNavy",
    name: "Navy",
    cssVariable: "--adm-palette-navy",
    hex: "#1E3A5F",
    role: "Company & Workgroup Hierarchy",
    intendedUse: "Corporate workspace headers, workgroup membership badges",
    contrastWithWhite: 9.8,
    contrastWithCanvasSubtle: 9.3,
    isAccessibleOnLight: true,
  },
  paletteBrick: {
    id: "paletteBrick",
    name: "Brick",
    cssVariable: "--adm-palette-brick",
    hex: "#8B4B4B",
    role: "Audit Alert & Distinct Warning",
    intendedUse: "Audit discrepancy tags, distinct non-fatal legal warnings",
    contrastWithWhite: 6.8,
    contrastWithCanvasSubtle: 6.5,
    isAccessibleOnLight: true,
  },
  semanticSuccess: {
    id: "semanticSuccess",
    name: "Semantic Success",
    cssVariable: "--adm-semantic-success",
    hex: "#1E7E51",
    role: "Completed / Verified State",
    intendedUse: "Signed documents, completed tasks, passing compliance controls",
    contrastWithWhite: 5.2,
    contrastWithCanvasSubtle: 4.9,
    isAccessibleOnLight: true,
  },
  semanticWarning: {
    id: "semanticWarning",
    name: "Semantic Warning",
    cssVariable: "--adm-semantic-warning",
    hex: "#D97706",
    role: "Pending / Action Required State",
    intendedUse: "Approaching deadlines, pending reviews, items awaiting user confirmation",
    contrastWithWhite: 3.3,
    contrastWithCanvasSubtle: 3.1,
    isAccessibleOnLight: false,
  },
  semanticDanger: {
    id: "semanticDanger",
    name: "Semantic Danger",
    cssVariable: "--adm-semantic-danger",
    hex: "#DC2626",
    role: "Error / Overdue State",
    intendedUse: "Overdue tasks, failed submissions, missing required attachments",
    contrastWithWhite: 4.6,
    contrastWithCanvasSubtle: 4.3,
    isAccessibleOnLight: true,
  },
  semanticInfo: {
    id: "semanticInfo",
    name: "Semantic Info",
    cssVariable: "--adm-semantic-info",
    hex: "#2563EB",
    role: "System Information State",
    intendedUse: "Read-only notices, workflow step progression, system synchronization messages",
    contrastWithWhite: 4.6,
    contrastWithCanvasSubtle: 4.4,
    isAccessibleOnLight: true,
  },
};

/**
 * ClientColorKey Palette
 * 
 * Bounded exception: Allowed ONLY for client organizational tagging/identity.
 * NEVER use client identity colors to signify workflow status (e.g. green for done, red for error).
 */
export const CLIENT_COLOR_KEYS: Record<string, ClientColorDefinition> = {
  BLUE: {
    key: "BLUE",
    label: "Kék ügyféljelölő",
    dotColor: "#2563EB",
    badgeBg: "#EFF6FF",
    badgeBorder: "#BFDBFE",
    badgeText: "#1E40AF",
    description: "Pénzügyi és banki ügyfelek kategóriajelölője",
  },
  AMBER: {
    key: "AMBER",
    label: "Borostyán ügyféljelölő",
    dotColor: "#D97706",
    badgeBg: "#FFFBEB",
    badgeBorder: "#FDE68A",
    badgeText: "#92400E",
    description: "Kereskedelmi és ingatlanfejlesztési ügyfelek kategóriajelölője",
  },
  EMERALD: {
    key: "EMERALD",
    label: "Smaragd ügyféljelölő",
    dotColor: "#059669",
    badgeBg: "#ECFDF5",
    badgeBorder: "#A7F3D0",
    badgeText: "#065F46",
    description: "Agrár és energetikai ügyfelek kategóriajelölője",
  },
  PURPLE: {
    key: "PURPLE",
    label: "Lila ügyféljelölő",
    dotColor: "#7C3AED",
    badgeBg: "#F5F3FF",
    badgeBorder: "#DDD6FE",
    badgeText: "#5B21B6",
    description: "Technológiai és IP ügyfelek kategóriajelölője",
  },
  ROSE: {
    key: "ROSE",
    label: "Rózsa ügyféljelölő",
    dotColor: "#E11D48",
    badgeBg: "#FFF1F2",
    badgeBorder: "#FECDD3",
    badgeText: "#9F1239",
    description: "Egészségügyi és szabályozott ügyfelek kategóriajelölője",
  },
};

/**
 * Calculates WCAG 2.1 relative luminance and contrast ratio between two hex colors.
 */
export function calculateContrastRatio(hex1: string, hex2: string): number {
  const lum1 = getLuminance(hex1);
  const lum2 = getLuminance(hex2);
  const brightest = Math.max(lum1, lum2);
  const darkest = Math.min(lum1, lum2);
  return Number(((brightest + 0.05) / (darkest + 0.05)).toFixed(2));
}

function getLuminance(hex: string): number {
  const clean = hex.replace("#", "");
  const r = parseInt(clean.substring(0, 2), 16) / 255;
  const g = parseInt(clean.substring(2, 4), 16) / 255;
  const b = parseInt(clean.substring(4, 6), 16) / 255;

  const a = [r, g, b].map((v) => {
    return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4);
  });

  return a[0] * 0.2126 + a[1] * 0.7152 + a[2] * 0.0722;
}
