export type PortalMatterStatus = "Előkészítés" | "Egyeztetés" | "Ügyfélre vár" | "Lezárás előtt";

export type PortalMatter = {
  externalId: string;
  title: string;
  status: PortalMatterStatus;
  summary: string;
  nextAction: string;
  deadline: string;
  safeUpdate: string;
};

export type PortalDocument = {
  title: string;
  type: string;
  sharedAt: string;
  matterTitle: string;
  status: string;
};

export type PortalUploadRequest = {
  title: string;
  matterTitle: string;
  dueDate: string;
  status: string;
};

export const mockMatters: PortalMatter[] = [
  {
    externalId: "portal-minta-001",
    title: "Minta ügy — szerződés előkészítés",
    status: "Ügyfélre vár",
    summary: "Az iroda a véglegesítéshez egy hiányzó mellékletet vár.",
    nextAction: "Személyi igazolvány másolat feltöltése",
    deadline: "2026. július 18.",
    safeUpdate: "A következő ügyféloldali lépés egy hiánypótlás. Ez a minta nem küld adatot.",
  },
  {
    externalId: "portal-minta-002",
    title: "Minta ingatlanügy",
    status: "Egyeztetés",
    summary: "A felek egyeztetése folyamatban van, új ügyfélteendő nincs.",
    nextAction: "Nincs aktív teendő",
    deadline: "2026. július 24.",
    safeUpdate: "A státusz csak ügyfélnek szánt, rövid összefoglaló. Belső munkafolyamat nem látható.",
  },
  {
    externalId: "portal-minta-003",
    title: "Minta cégjogi változás",
    status: "Előkészítés",
    summary: "Az előkészítő adatok ellenőrzése zajlik.",
    nextAction: "Kapcsolattartó adatok ellenőrzése",
    deadline: "2026. július 29.",
    safeUpdate: "A kapcsolattartói adatok ellenőrzése későbbi, jóváhagyott űrlapon történhet.",
  },
];

export const mockDocuments: PortalDocument[] = [
  {
    title: "Tájékoztató.pdf",
    type: "Megosztott dokumentum",
    sharedAt: "2026. július 10.",
    matterTitle: "Minta ügy — szerződés előkészítés",
    status: "Letöltés nem aktív",
  },
  {
    title: "Ütemezési összefoglaló.pdf",
    type: "Ügyfélnek szánt összefoglaló",
    sharedAt: "2026. július 9.",
    matterTitle: "Minta ingatlanügy",
    status: "Metaadat előnézet",
  },
  {
    title: "Adatbekérő lista.pdf",
    type: "Feltöltést segítő lista",
    sharedAt: "2026. július 8.",
    matterTitle: "Minta cégjogi változás",
    status: "Későbbi funkció",
  },
];

export const mockUploadRequests: PortalUploadRequest[] = [
  {
    title: "Hiánypótlás: személyi igazolvány másolat",
    matterTitle: "Minta ügy — szerződés előkészítés",
    dueDate: "2026. július 18.",
    status: "Mock előnézet",
  },
  {
    title: "Kapcsolattartói adatok megerősítése",
    matterTitle: "Minta cégjogi változás",
    dueDate: "2026. július 29.",
    status: "Nem aktív",
  },
];

export const statusTone: Record<PortalMatterStatus, string> = {
  Előkészítés: "border-[var(--adm-blue-100)] bg-[rgba(142,202,230,0.22)] text-[var(--adm-blue-700)]",
  Egyeztetés: "border-[var(--adm-sand-300)] bg-[rgba(244,230,199,0.45)] text-[var(--adm-green-900)]",
  "Ügyfélre vár": "border-[var(--adm-warm-500)] bg-[rgba(253,158,2,0.14)] text-[var(--adm-blue-950)]",
  "Lezárás előtt": "border-[var(--adm-sage-300)] bg-[rgba(223,232,216,0.55)] text-[var(--adm-green-800)]",
};
