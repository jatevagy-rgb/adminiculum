export const CLIENT_COLOR_KEYS = [
  "RED",
  "ORANGE",
  "AMBER",
  "GREEN",
  "TEAL",
  "BLUE",
  "INDIGO",
  "PURPLE",
  "ROSE",
  "SLATE",
] as const;

export type ClientColorKey = (typeof CLIENT_COLOR_KEYS)[number];

export interface ClientColorDefinition {
  key: ClientColorKey | null;
  label: string;
  accentClass: string;
  accentBorderClass: string;
  softBackgroundClass: string;
  borderClass: string;
  ringClass: string;
}

export const NEUTRAL_CLIENT_COLOR: ClientColorDefinition = {
  key: null,
  label: "Nincs színjelölés",
  accentClass: "bg-transparent",
  accentBorderClass: "border-l-transparent",
  softBackgroundClass: "bg-white",
  borderClass: "border-[var(--adm-border)]",
  ringClass: "ring-[var(--adm-border)]",
};

export const CLIENT_COLOR_DEFINITIONS: Record<ClientColorKey, ClientColorDefinition> = {
  RED: { key: "RED", label: "Piros", accentClass: "bg-red-600", accentBorderClass: "border-l-red-600", softBackgroundClass: "bg-red-50/40", borderClass: "border-red-200", ringClass: "ring-red-600" },
  ORANGE: { key: "ORANGE", label: "Narancs", accentClass: "bg-orange-600", accentBorderClass: "border-l-orange-600", softBackgroundClass: "bg-orange-50/40", borderClass: "border-orange-200", ringClass: "ring-orange-600" },
  AMBER: { key: "AMBER", label: "Borostyán", accentClass: "bg-amber-500", accentBorderClass: "border-l-amber-500", softBackgroundClass: "bg-amber-50/40", borderClass: "border-amber-200", ringClass: "ring-amber-500" },
  GREEN: { key: "GREEN", label: "Zöld", accentClass: "bg-emerald-600", accentBorderClass: "border-l-emerald-600", softBackgroundClass: "bg-emerald-50/40", borderClass: "border-emerald-200", ringClass: "ring-emerald-600" },
  TEAL: { key: "TEAL", label: "Türkiz", accentClass: "bg-teal-600", accentBorderClass: "border-l-teal-600", softBackgroundClass: "bg-teal-50/40", borderClass: "border-teal-200", ringClass: "ring-teal-600" },
  BLUE: { key: "BLUE", label: "Kék", accentClass: "bg-blue-600", accentBorderClass: "border-l-blue-600", softBackgroundClass: "bg-blue-50/40", borderClass: "border-blue-200", ringClass: "ring-blue-600" },
  INDIGO: { key: "INDIGO", label: "Indigó", accentClass: "bg-indigo-600", accentBorderClass: "border-l-indigo-600", softBackgroundClass: "bg-indigo-50/40", borderClass: "border-indigo-200", ringClass: "ring-indigo-600" },
  PURPLE: { key: "PURPLE", label: "Lila", accentClass: "bg-purple-600", accentBorderClass: "border-l-purple-600", softBackgroundClass: "bg-purple-50/40", borderClass: "border-purple-200", ringClass: "ring-purple-600" },
  ROSE: { key: "ROSE", label: "Rózsaszín", accentClass: "bg-rose-600", accentBorderClass: "border-l-rose-600", softBackgroundClass: "bg-rose-50/40", borderClass: "border-rose-200", ringClass: "ring-rose-600" },
  SLATE: { key: "SLATE", label: "Palaszürke", accentClass: "bg-slate-600", accentBorderClass: "border-l-slate-600", softBackgroundClass: "bg-slate-50/50", borderClass: "border-slate-300", ringClass: "ring-slate-600" },
};

export const CLIENT_COLOR_OPTIONS = CLIENT_COLOR_KEYS.map((key) => CLIENT_COLOR_DEFINITIONS[key]);

export function isClientColorKey(value: unknown): value is ClientColorKey {
  return typeof value === "string" && Object.prototype.hasOwnProperty.call(CLIENT_COLOR_DEFINITIONS, value);
}

export function getClientColorDefinition(value?: string | null): ClientColorDefinition {
  return isClientColorKey(value) ? CLIENT_COLOR_DEFINITIONS[value] : NEUTRAL_CLIENT_COLOR;
}

export function getClientAccentClass(value?: string | null): string {
  return getClientColorDefinition(value).accentClass;
}

export function getClientAccentBorderClass(value?: string | null): string {
  return getClientColorDefinition(value).accentBorderClass;
}

export function getClientSoftBackgroundClass(value?: string | null): string {
  return getClientColorDefinition(value).softBackgroundClass;
}

export function getClientColorLabel(value?: string | null): string {
  return getClientColorDefinition(value).label;
}
