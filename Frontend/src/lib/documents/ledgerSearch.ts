// Left-rail document search: a pure view filter over the already-loaded case
// document collection. No second index, no extra fetch — canonical state only.

export type LedgerSearchable = {
  fileName?: string | null;
  title?: string | null;
  templateName?: string | null;
};

/** Case-insensitive substring match across the known document fields. */
export function matchesLedgerSearch(term: string, ...values: Array<string | null | undefined>): boolean {
  const normalized = term.trim().toLowerCase();
  if (!normalized) return true;
  return values.some((value) => String(value ?? "").toLowerCase().includes(normalized));
}

export function filterLedgerItems<T extends LedgerSearchable>(items: T[], term: string): T[] {
  return items.filter((item) => matchesLedgerSearch(term, item.fileName, item.title, item.templateName));
}
