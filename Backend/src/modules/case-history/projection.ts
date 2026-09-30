/** Read-only WF05 projections. No source event can become customer-visible by level alone. */
export type HistoryKind = 'AUDIT' | 'TIME';
export type CustomerHistoryLevel = 1 | 2 | 3;

export interface InternalHistoryItem {
  sourceKey: string;
  kind: HistoryKind;
  occurredAt: string;
  title: string;
  detail: string | null;
  authorName: string | null;
  minutes: number | null;
}

export interface InternalHistoryPage {
  items: InternalHistoryItem[];
  nextCursor: string | null;
  totalMinutes: number;
}

type AuditSource = {
  id: string; eventType: string; type?: string | null; description?: string | null;
  payload?: unknown; createdAt: Date | string; timeEntryId?: string | null;
  user?: { name?: string | null } | null;
};
type TimeSource = {
  id: string; workDate: Date | string; createdAt: Date | string;
  workType: string; description: string; minutes: number;
  user?: { name?: string | null } | null;
};

function iso(value: Date | string): string {
  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) throw new Error('Invalid history timestamp');
  return date.toISOString();
}

const PRIVATE_EVENT_LABELS: Record<string, string> = {
  CASE_CREATED: 'Ügy létrehozva', CASE_ASSIGNED: 'Ügy hozzárendelve',
  CASE_STATUS_CHANGED: 'Ügy állapota változott', DOCUMENT_UPLOADED: 'Dokumentum feltöltve',
  DOCUMENT_VERSION_CREATED: 'Dokumentumverzió létrehozva', DOCUMENT_APPROVED: 'Dokumentum jóváhagyva',
  DOCUMENT_REJECTED: 'Dokumentum elutasítva', DOCUMENT_SENT_TO_CLIENT: 'Dokumentum elküldve',
  DOCUMENT_RECEIVED_FROM_CLIENT: 'Dokumentum érkezett', TASK_CREATED: 'Feladat létrehozva',
  TASK_ASSIGNED: 'Feladat hozzárendelve', TASK_STARTED: 'Feladat elkezdve',
  TASK_COMPLETED: 'Feladat elkészült', TASK_BLOCKED: 'Feladat akadályba ütközött',
  COMMENT_ADDED: 'Megjegyzés hozzáadva', CONTRACT_GENERATED: 'Szerződés létrehozva',
  REVIEW_REQUESTED: 'Felülvizsgálat kérve', REVIEW_COMPLETED: 'Felülvizsgálat lezárva',
  ANONYMIZATION_STARTED: 'Anonimizálás indult', ANONYMIZATION_COMPLETED: 'Anonimizálás lezárva',
  CLIENT_CONTACT: 'Ügyfélkapcsolat', MEETING_SCHEDULED: 'Találkozó ütemezve',
  DEADLINE_SET: 'Határidő rögzítve', DEADLINE_WARNING: 'Határidő közeleg',
  DEADLINE_MISSED: 'Határidő elmúlt', TIME_LOGGED: 'Munkaidő rögzítve', CUSTOM: 'Egyéb esemény',
};

function compare(a: InternalHistoryItem, b: InternalHistoryItem): number {
  return a.occurredAt.localeCompare(b.occurredAt) || a.sourceKey.localeCompare(b.sourceKey);
}

export function buildInternalHistory(
  audits: readonly AuditSource[], times: readonly TimeSource[],
  options: { limit?: number; cursor?: string | null } = {},
): InternalHistoryPage {
  const timeIds = new Set(times.map((entry) => entry.id));
  const byKey = new Map<string, InternalHistoryItem>();
  for (const entry of times) {
    const key = `time:${entry.id}`;
    byKey.set(key, {
      sourceKey: key, kind: 'TIME', occurredAt: iso(entry.workDate),
      title: 'Munkaidő rögzítve', detail: entry.description || null,
      authorName: entry.user?.name || null, minutes: entry.minutes,
    });
  }
  for (const event of audits) {
    if (event.eventType === 'TIME_LOGGED' && event.timeEntryId && timeIds.has(event.timeEntryId)) continue;
    const key = `timeline:${event.id}`;
    const payload = event.payload && typeof event.payload === 'object' && !Array.isArray(event.payload)
      ? event.payload as Record<string, unknown> : {};
    const detail = event.description || (typeof payload.description === 'string' ? payload.description : null);
    byKey.set(key, {
      sourceKey: key, kind: 'AUDIT', occurredAt: iso(event.createdAt),
      title: PRIVATE_EVENT_LABELS[event.eventType] || 'Egyéb belső esemény',
      detail, authorName: event.user?.name || null, minutes: null,
    });
  }
  const sorted = [...byKey.values()].sort(compare);
  const limit = Math.min(100, Math.max(1, Math.trunc(options.limit ?? 30)));
  const cursorIndex = options.cursor ? sorted.findIndex((item) => item.sourceKey === options.cursor) : -1;
  if (options.cursor && cursorIndex < 0) throw new Error('Invalid history cursor');
  const start = cursorIndex + 1;
  const items = sorted.slice(start, start + limit);
  return {
    items,
    nextCursor: start + limit < sorted.length ? items[items.length - 1].sourceKey : null,
    totalMinutes: [...new Map(times.map((entry) => [entry.id, entry])).values()]
      .reduce((sum, entry) => sum + Math.max(0, entry.minutes), 0),
  };
}

/** Shared customer DTO for portal and report consumers, once a policy store exists. */
export interface CustomerHistoryItem {
  sourceKey: string;
  occurredAt: string;
  title: string;
  body: string | null;
  minutes: number | null;
}
export interface ApprovedHistorySource extends CustomerHistoryItem {
  minimumLevel: CustomerHistoryLevel;
  caseId: string;
  clientId: string;
  published: boolean;
  category: 'STATUS' | 'ACTION_REQUIRED' | 'MILESTONE' | 'DOCUMENT' | 'SAFE_UPDATE' | 'REVIEWED_WORK';
}
export interface HistoryPolicySnapshot {
  caseId: string;
  clientId: string;
  level: CustomerHistoryLevel;
  excludedSourceKeys: readonly string[];
  customerText: Readonly<Record<string, string>>;
}

const CATEGORY_LEVEL: Record<ApprovedHistorySource['category'], CustomerHistoryLevel> = {
  STATUS: 1, ACTION_REQUIRED: 1, MILESTONE: 2, DOCUMENT: 2,
  SAFE_UPDATE: 2, REVIEWED_WORK: 3,
};

function validOverlay(text: string): boolean {
  return text.length <= 3000 && !/[<>\x00-\x08\x0B\x0C\x0E-\x1F]/.test(text);
}

export function projectCustomerHistory(input: {
  caseId: string; clientId: string; grantAuthorized: boolean;
  policy: HistoryPolicySnapshot | null; sources: readonly ApprovedHistorySource[];
}): CustomerHistoryItem[] {
  const { caseId, clientId, grantAuthorized, policy, sources } = input;
  if (!grantAuthorized || !policy || policy.caseId !== caseId || policy.clientId !== clientId ||
    ![1, 2, 3].includes(policy.level)) return [];
  const hidden = new Set(policy.excludedSourceKeys);
  const result = new Map<string, CustomerHistoryItem>();
  for (const source of sources) {
    if (!source.published || source.caseId !== caseId || source.clientId !== clientId ||
      !(source.category in CATEGORY_LEVEL) ||
      ![1, 2, 3].includes(source.minimumLevel) ||
      Math.max(source.minimumLevel, CATEGORY_LEVEL[source.category]) > policy.level ||
      hidden.has(source.sourceKey)) continue;
    const overlay = policy.customerText[source.sourceKey];
    if (overlay !== undefined && !validOverlay(overlay)) continue;
    result.set(source.sourceKey, {
      sourceKey: source.sourceKey, occurredAt: source.occurredAt,
      title: source.title, body: overlay === undefined ? source.body : overlay,
      minutes: source.category === 'REVIEWED_WORK' && policy.level === 3 ? source.minutes : null,
    });
  }
  return [...result.values()].sort((a, b) => a.occurredAt.localeCompare(b.occurredAt) || a.sourceKey.localeCompare(b.sourceKey));
}
