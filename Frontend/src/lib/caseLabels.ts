const CASE_MATTER_TYPE_LABELS: Record<string, string> = {
  REAL_ESTATE: "Ingatlanjog",
  REAL_ESTATE_SALE: "Ingatlan-adásvétel",
  EMPLOYMENT: "Munkajog",
  CONTRACT: "Szerződés",
  LITIGATION: "Peres ügy",
  COMPLIANCE: "Compliance",
  CORPORATE: "Társasági jog",
  IP: "Szellemi alkotások joga",
  MERGERS_ACQUISITIONS: "M&A",
  OTHER: "Egyéb",
};

const CASE_STATUS_LABELS: Record<string, string> = {
  CLIENT_INPUT: "Ügyféltől érkezett",
  DRAFT: "Piszkozat",
  IN_REVIEW: "Review alatt",
  APPROVED: "Jóváhagyva",
  SENT_TO_CLIENT: "Ügyfélnek elküldve",
  CLIENT_FEEDBACK: "Ügyfél-visszajelzés",
  FINAL: "Végleges",
  ON_HOLD: "Függőben",
  CANCELLED: "Törölve",
  ARCHIVED: "Archivált",
  OPEN: "Nyitott",
  CLOSED: "Lezárt",
};

export function getCaseMatterTypeLabel(value?: string | null): string {
  const normalized = String(value || "").trim().toUpperCase();
  if (!normalized) return "Nincs megadva";
  return CASE_MATTER_TYPE_LABELS[normalized] || normalized.replace(/_/g, " ").toLocaleLowerCase("hu-HU").replace(/^./, (character) => character.toLocaleUpperCase("hu-HU"));
}

export function getCaseStatusLabel(value?: string | null): string {
  const normalized = String(value || "").trim().toUpperCase();
  if (!normalized) return "Nincs állapotadat";
  return CASE_STATUS_LABELS[normalized] || normalized.replace(/_/g, " ").toLocaleLowerCase("hu-HU").replace(/^./, (character) => character.toLocaleUpperCase("hu-HU"));
}

export function getCaseDisplayTitle(input: {
  title?: string | null;
  clientName?: string | null;
  matterType?: string | null;
}): string {
  const title = String(input.title || "").trim();
  const clientName = String(input.clientName || "").trim();
  const matterType = String(input.matterType || "").trim().toUpperCase();

  if (matterType && clientName && (!title || title.toUpperCase() === `${clientName} - ${matterType}`.toUpperCase())) {
    return `${clientName} - ${getCaseMatterTypeLabel(matterType)}`;
  }

  for (const [rawValue, label] of Object.entries(CASE_MATTER_TYPE_LABELS)) {
    const suffix = ` - ${rawValue}`;
    if (title.toUpperCase().endsWith(suffix)) {
      return `${title.slice(0, -suffix.length)} - ${label}`;
    }
  }

  return title || (clientName ? `${clientName} - ${getCaseMatterTypeLabel(matterType)}` : "Ügy megnevezése nem elérhető");
}
