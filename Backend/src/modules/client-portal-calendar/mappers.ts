/**
 * CUSTOMER PORTAL CALENDAR — pure source mappers.
 *
 * Each mapper receives only the output of a canonical CUSTOMER-SAFE reader and
 * emits allowlisted `CustomerCalendarSourceItem`s. No internal model is read
 * here, so no internal date (Task.dueDate, Case.deadline, CaseIntakeDeadline,
 * unpublished revisions, private milestones, unpublished contracts) can ever
 * reach the projection.
 */
import { CustomerCalendarSourceItem, CustomerCalendarStatus, calendarDay, normalizeSourceDate } from './projection';

export interface PortalMatterSourceRow {
  id: string;
  caseId?: string | null;
  title: string;
  estimatedTiming?: string | null;
  publicDeadlines?: unknown;
}

export interface PortalActionRequestSourceRow {
  id: string;
  matterId?: string | null;
  matterTitle?: string | null;
  title: string;
  dueAt?: string | null;
}

export interface CustomerRequestSourceRow {
  id: string;
  type?: string | null;
  title: string;
  dueAt?: string | null;
  status: string;
}

export interface OrgContractSourceRow {
  reference: string;
  title: string;
  keyDate?: string | null;
  effectiveDate?: string | null;
  expiryDate?: string | null;
  nextCriticalDate?: string | null;
  signatureDate?: string | null;
  publishedDoc?: { publicationId?: string | null } | null;
}

export interface CompanyMilestoneSourceRow {
  id: string;
  title: string;
  date?: string | null;
}

/**
 * Customer-safe occurrence row from the canonical published-occurrence reader
 * (listPublishedOccurrencesForCustomer). Only explicitly published occurrences
 * with a due date reach this mapper — internal note/risk/reviewer metadata is
 * already absent at the reader boundary.
 */
export interface OccurrenceSourceRow {
  id: string;
  occurrenceType: string;
  title: string;
  dueDate: string | Date | null;
}

/** Customer-safe Grow initiative row (from getOrganizationalGrow). */
export interface GrowInitiativeSourceRow {
  id: string;
  title: string;
  targetAt?: string | null;
  statusLabel?: string | null;
}

/**
 * Customer-safe compliance control row (from getClientSafeComplianceReadModel).
 * Identity is the safe-registry `controlRef`; the internal ClientControl id, the
 * internal ControlDefinition key and the display text are never used as identity.
 */
export interface ComplianceReviewSourceRow {
  controlRef: string;
  requirementTitle: string;
  title: string;
  nextReviewAt?: string | null;
}

function matterHref(publicationId: string): string {
  return `/portal/matters/${encodeURIComponent(publicationId)}`;
}

function actionHref(row: PortalActionRequestSourceRow): string {
  return row.matterId
    ? matterHref(String(row.matterId))
    : `/portal/action-requests/${encodeURIComponent(row.id)}`;
}

/**
 * Map published matter revision + published deadline snapshot rows. Only
 * explicitly published fields (`estimatedTiming` = publicTargetDate,
 * `publicDeadlines` = publishedDeadlinesSnapshot) are consumed.
 */
export function mapMatterSources(matter: PortalMatterSourceRow): CustomerCalendarSourceItem[] {
  const items: CustomerCalendarSourceItem[] = [];
  const title = String(matter.title || '').trim() || 'Közzétett ügy';
  if (matter.estimatedTiming) {
    items.push({
      category: 'MATTER_TARGET',
      sourceKey: 'target',
      title,
      date: matter.estimatedTiming,
      status: 'OPEN',
      href: matterHref(matter.id),
      matterTitle: title,
    });
  }
  const deadlines = Array.isArray(matter.publicDeadlines) ? matter.publicDeadlines : [];
  deadlines.forEach((raw, index) => {
    if (!raw || typeof raw !== 'object') return;
    const entry = raw as Record<string, unknown>;
    const dueAt = entry.dueAt ?? entry.date ?? null;
    if (!dueAt) return;
    const label = String(entry.title ?? entry.label ?? '').trim() || title;
    items.push({
      category: 'PUBLISHED_DEADLINE',
      sourceKey: `deadline-${index}`,
      title: label,
      date: dueAt as string,
      status: 'OPEN',
      href: matterHref(matter.id),
      matterTitle: title,
    });
  });
  return items;
}

export function mapActionRequestSources(row: PortalActionRequestSourceRow): CustomerCalendarSourceItem[] {
  if (!row.dueAt) return [];
  return [{
    category: 'ACTION_REQUEST',
    sourceKey: `action-${row.id}`,
    title: String(row.title || '').trim() || 'Ügyintézési teendő',
    date: row.dueAt,
    status: 'OPEN',
    href: actionHref(row),
    matterTitle: row.matterTitle ?? null,
  }];
}

/**
 * Customer-visible interaction request statuses (requestService.CUSTOMER_VISIBLE,
 * excluding terminal non-visible states which never reach this mapper).
 */
export function classifyCustomerRequestStatus(status: string): CustomerCalendarStatus {
  const value = String(status || '').toUpperCase();
  if (value === 'COMPLETED') return 'DONE';
  if (value === 'SUBMITTED' || value === 'UNDER_INTERNAL_REVIEW') return 'INFO';
  return 'OPEN';
}

export function mapCustomerRequestSource(row: CustomerRequestSourceRow, href: string): CustomerCalendarSourceItem[] {
  if (!row.dueAt) return [];
  return [{
    category: 'CUSTOMER_REQUEST',
    sourceKey: `request-${row.id}`,
    title: String(row.title || '').trim() || 'Kérés',
    date: row.dueAt,
    status: classifyCustomerRequestStatus(row.status),
    href,
    matterTitle: null,
  }];
}

/** Concise Hungarian labels for the contract lifecycle dates the customer may see. */
export const CONTRACT_DATE_LABELS = {
  expiry: 'Lejárat',
  critical: 'Következő kritikus dátum',
  effective: 'Hatálybalépés',
  signature: 'Aláírás dátuma',
} as const;

/**
 * Project the customer-safe lifecycle dates of a contract that is EXPLICITLY
 * published to this customer (a published document publication exists). All four
 * dates (signature / effective / expiry / next critical) are contract-level dates
 * carried by the canonical customer-safe contract projector; none is an internal
 * obligation/occurrence. An unpublished contract date must never surface.
 *
 * Only non-null dates produce items (a null date is dropped, never invented).
 * To avoid double counting, the legacy single `keyDate` (which is derived from one
 * of these dates) is emitted ONLY when no explicit date is present, and — when two
 * canonical dates fall on the same day — exactly one deterministic item is emitted
 * for that contract/day (priority: expiry > next critical > effective > signature).
 */
export function mapOrgContractSource(contract: OrgContractSourceRow): CustomerCalendarSourceItem[] {
  if (!contract.publishedDoc) return [];
  const reference = String(contract.reference || '').trim();
  if (!reference) return [];
  const title = String(contract.title || '').trim() || 'Közzétett szerződés';
  const href = '/portal/szerzodesek';

  const candidates: Array<{ key: string; label: string; date?: string | null }> = [
    { key: 'expiry', label: CONTRACT_DATE_LABELS.expiry, date: contract.expiryDate },
    { key: 'critical', label: CONTRACT_DATE_LABELS.critical, date: contract.nextCriticalDate },
    { key: 'effective', label: CONTRACT_DATE_LABELS.effective, date: contract.effectiveDate },
    { key: 'signature', label: CONTRACT_DATE_LABELS.signature, date: contract.signatureDate },
  ];

  const items: CustomerCalendarSourceItem[] = [];
  const seenDays = new Set<string>();
  for (const candidate of candidates) {
    const iso = normalizeSourceDate(candidate.date);
    if (!iso) continue;
    const day = calendarDay(iso);
    if (seenDays.has(day)) continue;
    seenDays.add(day);
    items.push({
      category: 'CONTRACT_DATE',
      sourceKey: `contract-${reference}-${candidate.key}`,
      title: `${title} · ${candidate.label}`,
      date: iso,
      status: 'INFO',
      href,
      matterTitle: null,
    });
  }
  if (items.length) return items;

  // Legacy fallback: keyDate only, so the previously projected item is preserved
  // when the richer dates are absent. Never double counted with the items above.
  if (!contract.keyDate) return [];
  return [{
    category: 'CONTRACT_DATE',
    sourceKey: `contract-${reference}`,
    title,
    date: contract.keyDate,
    status: 'INFO',
    href,
    matterTitle: null,
  }];
}

/** Company milestones are customer-safe only as the ACHIEVED projection already returned. */
export function mapCompanyMilestoneSource(milestone: CompanyMilestoneSourceRow): CustomerCalendarSourceItem[] {
  if (!milestone.date) return [];
  return [{
    category: 'COMPANY_MILESTONE',
    sourceKey: `milestone-${milestone.id}`,
    title: String(milestone.title || '').trim() || 'Mérföldkő',
    date: milestone.date,
    status: 'INFO',
    href: '/portal/vallalat',
    matterTitle: null,
  }];
}

/** Customer labels for the occurrence kinds that may be explicitly published. */
export const CUSTOMER_OCCURRENCE_LABELS: Record<string, string> = {
  PAYMENT: 'Fizetési határidő',
  MILESTONE: 'Köztes teljesítés / mérföldkő',
  NOTICE: 'Értesítési határidő',
};

/**
 * Project ONE explicitly published contract occurrence into the customer
 * calendar. Fail-closed: an occurrence without a known customer label (i.e.
 * any kind outside PAYMENT / MILESTONE / NOTICE) emits nothing. The published
 * reader already guarantees publishedAt != null and a due date, so this mapper
 * never re-checks internal state and never duplicates contract lifecycle dates
 * (distinct CONTRACT_OCCURRENCE category + occurrence-scoped sourceKey).
 */
export function mapPublishedOccurrenceSource(row: OccurrenceSourceRow): CustomerCalendarSourceItem[] {
  const label = CUSTOMER_OCCURRENCE_LABELS[String(row.occurrenceType || '').toUpperCase()];
  if (!label) return [];
  const iso = normalizeSourceDate(row.dueDate);
  if (!iso) return [];
  const baseTitle = String(row.title || '').trim();
  const title = baseTitle && baseTitle !== label ? `${baseTitle} · ${label}` : label;
  return [{
    category: 'CONTRACT_OCCURRENCE',
    sourceKey: `occurrence-${row.id}`,
    title,
    date: iso,
    status: 'OPEN',
    href: '/portal/szerzodesek',
    matterTitle: null,
  }];
}

/**
 * Grow initiative target date. The initiative is only projectable because it
 * already crosses the customer-safe Grow projection (getOrganizationalGrow), so
 * no internal status or task deadline is carried. A target is informational, not
 * a customer obligation.
 */
export function mapGrowInitiativeSource(row: GrowInitiativeSourceRow): CustomerCalendarSourceItem[] {
  if (!row.targetAt) return [];
  return [{
    category: 'GROW_TARGET',
    sourceKey: `initiative-${row.id}`,
    title: String(row.title || '').trim() || 'Fejlesztési kezdeményezés',
    date: row.targetAt,
    status: 'INFO',
    href: '/portal/fejlesztes',
    matterTitle: null,
  }];
}

/**
 * Compliance control next review date. Sourced only from the customer-safe
 * compliance read model, so internal control ids, severity and raw engine state
 * never appear. Identity is the opaque safe-registry `controlRef`, so two
 * distinct controls with identical display labels stay distinct. No customer
 * action is required, therefore the item is informational ("Következő
 * ellenőrzés"), never an "Ön határideje" obligation.
 */
export function mapComplianceReviewSource(row: ComplianceReviewSourceRow): CustomerCalendarSourceItem[] {
  if (!row.nextReviewAt) return [];
  const controlRef = String(row.controlRef || '').trim();
  if (!controlRef) return [];
  const requirementTitle = String(row.requirementTitle || '').trim();
  const controlTitle = String(row.title || '').trim();
  return [{
    category: 'COMPLIANCE_REVIEW',
    sourceKey: `control-${controlRef}`,
    title: controlTitle || requirementTitle || 'Megfelelési ellenőrzés',
    date: row.nextReviewAt,
    status: 'INFO',
    href: '/portal/megfeleles',
    matterTitle: null,
  }];
}
