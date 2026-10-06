/**
 * Truthful, product-level wording for the case-thread linking flow.
 *
 * The linking operation is the existing `POST /communications/:id/link-case`
 * contract. Its failure surface is mapped here so the picker never leaks raw
 * server/provider text and always names the state the user actually hit:
 * unauthorized, not-found, or a cross-client / cross-case conflict.
 */

export type CommunicationLinkErrorInput = {
  status?: number;
  code?: string;
};

export function linkThreadErrorMessage(input: CommunicationLinkErrorInput | null | undefined): string {
  const status = input?.status ?? 0;
  const code = String(input?.code || "").toUpperCase();

  if (status === 403) return "Nincs jogosultságod a beszélgetés ehhez az ügyhöz kapcsolásához.";
  if (status === 404) return "A kiválasztott beszélgetés vagy az ügy nem található.";
  if (status === 409) {
    if (code === "COMMUNICATION_ALREADY_LINKED") return "A beszélgetés már másik ügyhöz tartozik. Frissítsd a listát, és ellenőrizd a kapcsolatot.";
    if (code === "CLIENT_CASE_MISMATCH") return "A beszélgetés másik ügyfélhez tartozik, ezért nem kapcsolható ehhez az ügyhöz.";
    if (code === "COMMUNICATION_TASK_CASE_MISMATCH") return "A beszélgetéshez kapcsolt feladat másik ügyhöz tartozik; előbb rendezd a feladat kapcsolatát.";
    return "A beszélgetés hozzárendelése ütközés miatt nem sikerült. Próbáld újra.";
  }
  return "A beszélgetés hozzárendelése nem sikerült. Próbáld újra.";
}
