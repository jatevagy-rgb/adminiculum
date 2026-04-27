import type { CaseListItem, Client, TaskItem, DocumentSearchItem } from "./api";

export type SearchResultItem = {
  id: string;
  entityType: "case" | "client" | "task" | "document";
  title: string;
  subtitle: string;
  status?: string;
  link: string;
  matchedOn: string;
  caseInfo?: {
    caseNumber?: string;
    clientName?: string;
  };
};

export type SearchResults = {
  case: SearchResultItem[];
  client: SearchResultItem[];
  task: SearchResultItem[];
  document: SearchResultItem[];
  totalCase: number;
  totalClient: number;
  totalTask: number;
  totalDocument: number;
};

export const MAX_RESULTS_PER_GROUP = 20;

/**
 * Normalize search string for matching
 * - converts to lowercase
 * - trims whitespace
 */
export function normalizeSearch(str: string): string {
  return str.toLowerCase().trim();
}

/**
 * Check if query matches a value
 * Returns true if value exists and contains the query
 */
export function matches(value: string | undefined, query: string): boolean {
  if (!value) return false;
  return normalizeSearch(value).includes(query);
}

/**
 * Highlight matching substring in text
 * Returns array of segments (matching and non-matching)
 */
export function highlightMatch(text: string, query: string): { text: string; highlight: boolean }[] {
  if (!query.trim()) {
    return [{ text, highlight: false }];
  }

  const normalizedText = normalizeSearch(text);
  const normalizedQuery = normalizeSearch(query);
  const index = normalizedText.indexOf(normalizedQuery);

  if (index === -1) {
    return [{ text, highlight: false }];
  }

  const segments: { text: string; highlight: boolean }[] = [];

  // Before match
  if (index > 0) {
    segments.push({ text: text.slice(0, index), highlight: false });
  }

  // Match
  segments.push({ text: text.slice(index, index + normalizedQuery.length), highlight: true });

  // After match
  if (index + normalizedQuery.length < text.length) {
    segments.push({ text: text.slice(index + normalizedQuery.length), highlight: false });
  }

  return segments;
}

/**
 * Filter cases by query
 */
export function filterCases(cases: CaseListItem[], query: string): SearchResultItem[] {
  if (!query.trim()) return [];

  const q = normalizeSearch(query);
  const results: SearchResultItem[] = [];

  for (const c of cases) {
    if (
      matches(c.caseNumber, q) ||
      matches(c.title, q) ||
      matches(c.clientName, q) ||
      matches(c.matterType, q)
    ) {
      let matchedOn = "title";
      if (matches(c.caseNumber, q)) matchedOn = "case number";
      else if (matches(c.clientName, q)) matchedOn = "client name";
      else if (matches(c.matterType, q)) matchedOn = "matter type";

      results.push({
        id: c.id,
        entityType: "case",
        title: c.title || "Untitled Case",
        subtitle: `${c.caseNumber} • ${c.clientName || "No client"}`,
        status: c.status,
        link: `/cases/${c.id}`,
        matchedOn,
        caseInfo: {
          caseNumber: c.caseNumber,
          clientName: c.clientName,
        },
      });
    }
  }

  return results;
}

/**
 * Filter clients by query
 */
export function filterClients(clients: Client[], query: string): SearchResultItem[] {
  if (!query.trim()) return [];

  const q = normalizeSearch(query);
  const results: SearchResultItem[] = [];

  for (const c of clients) {
    if (
      matches(c.name, q) ||
      matches(c.email, q) ||
      matches(c.taxNumber, q) ||
      matches(c.companyRegistrationNumber, q)
    ) {
      let matchedOn = "name";
      if (matches(c.email, q)) matchedOn = "email";
      else if (matches(c.taxNumber, q)) matchedOn = "tax number";
      else if (matches(c.companyRegistrationNumber, q)) matchedOn = "company registration";

      results.push({
        id: c.id,
        entityType: "client",
        title: c.name,
        subtitle: c.email || c.taxNumber || c.companyRegistrationNumber || "No details",
        link: `/clients/${c.id}`,
        matchedOn,
      });
    }
  }

  return results;
}

/**
 * Filter tasks by query
 */
export function filterTasks(tasks: TaskItem[], query: string): SearchResultItem[] {
  if (!query.trim()) return [];

  const q = normalizeSearch(query);
  const results: SearchResultItem[] = [];

  for (const t of tasks) {
    if (
      matches(t.title, q) ||
      matches(t.description, q) ||
      matches(t.case?.caseNumber, q) ||
      matches(t.case?.clientName, q)
    ) {
      let matchedOn = "title";
      if (matches(t.description, q)) matchedOn = "description";
      else if (matches(t.case?.caseNumber, q)) matchedOn = "case number";
      else if (matches(t.case?.clientName, q)) matchedOn = "case client";

      const caseInfo = t.case ? {
        caseNumber: t.case.caseNumber,
        clientName: t.case.clientName,
      } : undefined;

      const caseLine = caseInfo?.caseNumber || caseInfo?.clientName
        ? `${caseInfo.caseNumber || ""} ${caseInfo.clientName || ""}`.trim()
        : "";

      results.push({
        id: t.id,
        entityType: "task",
        title: t.title,
        subtitle: caseLine || "No case linked",
        status: t.status,
        link: `/tasks?search=${encodeURIComponent(query)}`,
        matchedOn,
        caseInfo,
      });
    }
  }

  return results;
}

/**
 * Map backend document-search rows into search result items
 */
export function mapDocumentResults(documents: DocumentSearchItem[]): SearchResultItem[] {
  return documents.map((d) => ({
    id: d.id,
    entityType: "document",
    title: d.fileName || "Névtelen dokumentum",
    subtitle: `${d.caseNumber} • ${d.clientName} • ${d.documentType || "OTHER"}`,
    link: `/cases/${d.caseId}/documents`,
    matchedOn: "document metadata",
    caseInfo: {
      caseNumber: d.caseNumber,
      clientName: d.clientName,
    },
  }));
}

/**
 * Main search function - filters all entities and applies result limiting
 */
export function search(
  cases: CaseListItem[],
  clients: Client[],
  tasks: TaskItem[],
  query: string,
  documents: DocumentSearchItem[] = []
): SearchResults {
  const caseResults = filterCases(cases, query);
  const clientResults = filterClients(clients, query);
  const taskResults = filterTasks(tasks, query);
  const documentResults = mapDocumentResults(documents);

  // Sort each group
  caseResults.sort((a, b) => a.title.localeCompare(b.title));
  clientResults.sort((a, b) => a.title.localeCompare(b.title));
  taskResults.sort((a, b) => a.title.localeCompare(b.title));
  documentResults.sort((a, b) => a.title.localeCompare(b.title));

  // Apply result limiting
  const limitedCase = caseResults.slice(0, MAX_RESULTS_PER_GROUP);
  const limitedClient = clientResults.slice(0, MAX_RESULTS_PER_GROUP);
  const limitedTask = taskResults.slice(0, MAX_RESULTS_PER_GROUP);
  const limitedDocument = documentResults.slice(0, MAX_RESULTS_PER_GROUP);

  return {
    case: limitedCase,
    client: limitedClient,
    task: limitedTask,
    document: limitedDocument,
    totalCase: caseResults.length,
    totalClient: clientResults.length,
    totalTask: taskResults.length,
    totalDocument: documentResults.length,
  };
}

/**
 * Check if there are more results than shown
 */
export function hasMoreResults(
  results: SearchResults,
  entityType: "case" | "client" | "task" | "document"
): boolean {
  switch (entityType) {
    case "case":
      return results.totalCase > MAX_RESULTS_PER_GROUP;
    case "client":
      return results.totalClient > MAX_RESULTS_PER_GROUP;
    case "task":
      return results.totalTask > MAX_RESULTS_PER_GROUP;
    case "document":
      return results.totalDocument > MAX_RESULTS_PER_GROUP;
    default:
      return false;
  }
}
