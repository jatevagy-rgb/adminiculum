export type PleadingSectionStatus = "Hiányos" | "Szerkesztés alatt" | "Ügyvédi ellenőrzésre kész";

export type PleadingQualityChecklistKey =
  | "factsOrganized"
  | "evidenceIdentified"
  | "legalBasisIdentified"
  | "counterargumentHandled"
  | "reliefClarified";

export type PleadingQualityChecklist = Record<PleadingQualityChecklistKey, boolean>;

export type InsertedPleadingSection = {
  id: string;
  chapterId: string;
  title: string;
  sourceLabel: string;
  insertedAt: string;
  status: PleadingSectionStatus;
  qualityChecklist: PleadingQualityChecklist;
  reviewNote: string;
  nextAction: string;
};

export const pleadingSectionStatusOptions: Array<{ label: string; status: PleadingSectionStatus }> = [
  { label: "Hiányos", status: "Hiányos" },
  { label: "Szerkesztés alatt", status: "Szerkesztés alatt" },
  { label: "Kész ellenőrzésre", status: "Ügyvédi ellenőrzésre kész" },
];

export const pleadingSectionStatusTone: Record<PleadingSectionStatus, "amber" | "blue" | "green"> = {
  Hiányos: "amber",
  "Szerkesztés alatt": "blue",
  "Ügyvédi ellenőrzésre kész": "green",
};

export const pleadingQualityChecklistOptions: Array<{ key: PleadingQualityChecklistKey; label: string }> = [
  { key: "factsOrganized", label: "Tényállás rendezve" },
  { key: "evidenceIdentified", label: "Bizonyíték megjelölve" },
  { key: "legalBasisIdentified", label: "Jogi alap megjelölve" },
  { key: "counterargumentHandled", label: "Ellenérv kezelve" },
  { key: "reliefClarified", label: "Kérelem / indítvány pontosítva" },
];

export const createDefaultPleadingQualityChecklist = (): PleadingQualityChecklist => ({
  factsOrganized: false,
  evidenceIdentified: false,
  legalBasisIdentified: false,
  counterargumentHandled: false,
  reliefClarified: false,
});

export const countCompletedChecklistItems = (checklist: PleadingQualityChecklist) =>
  pleadingQualityChecklistOptions.filter((item) => checklist[item.key]).length;

export const isInsertedPleadingSectionReady = (section: InsertedPleadingSection) =>
  section.status === "Ügyvédi ellenőrzésre kész" && countCompletedChecklistItems(section.qualityChecklist) === pleadingQualityChecklistOptions.length;
