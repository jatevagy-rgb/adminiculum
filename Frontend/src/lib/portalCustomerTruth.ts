/** Safe lifecycle presentation only. Never grants a capability or infers publication. */
export function customerRequestTruth(status: string, submissionStatus?: string): { label: string; explanation: string } {
  if (submissionStatus === 'CORRECTION_REQUESTED' && ['PUBLISHED', 'PARTIALLY_SUBMITTED', 'SUBMITTED', 'UNDER_INTERNAL_REVIEW', 'CORRECTION_REQUESTED'].includes(status)) {
    return { label: 'Önre vár', explanation: 'Az iroda javítást kért a beküldött anyagon.' };
  }
  switch (status) {
    case "PUBLISHED":
    case "PARTIALLY_SUBMITTED":
    case "CORRECTION_REQUESTED":
      return { label: "Önre vár", explanation: "A bekéréshez válasz vagy javítás szükséges." };
    case "SUBMITTED":
      return { label: "Az irodára vár", explanation: "A beküldött anyag az iroda feldolgozására vár." };
    case "UNDER_INTERNAL_REVIEW":
      return { label: "Ügyvédi ellenőrzés alatt", explanation: "Az iroda ellenőrzi a beküldött anyagot." };
    case "COMPLETED":
      return { label: "Elkészült", explanation: "A bekérés teljesült. Ez önmagában nem jelent dokumentum-közzétételt; a közzétett dokumentumok külön jelennek meg." };
    case "CANCELLED":
      return { label: "Visszavonva", explanation: "A bekéréshez nincs további teendő." };
    case "EXPIRED":
      return { label: "Lezárt bekérés", explanation: "A bekérés már nem teljesíthető." };
    default:
      return { label: "Az állapot nem áll rendelkezésre", explanation: "A következő lépés ebből az állapotból nem állapítható meg." };
  }
}
