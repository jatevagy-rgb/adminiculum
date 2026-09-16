/**
 * CUSTOMER PORTAL CALENDAR — pure source mappers.
 *
 * Each mapper receives only the output of a canonical CUSTOMER-SAFE reader and
 * emits allowlisted `CustomerCalendarSourceItem`s. No internal model is read
 * here, so no internal date (Task.dueDate, Case.deadline, CaseIntakeDeadline,
 * unpublished revisions, private milestones, unpublished contracts) can ever
 * reach the projection.
 */
import { CustomerCalendarSourceItem, CustomerCalendarStatus } from './projection';

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
  publishedDoc?: { publicationId?: string | null } | null;
}

export interface CompanyMilestoneSourceRow {
  id: string;
  title: string;
  date?: string | null;
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

/**
 * A contract date is only projectable when the contract is EXPLICITLY published
 * to this customer (a published document publication exists). An unpublished
 * contract keyDate must never surface.
 */
export function mapOrgContractSource(contract: OrgContractSourceRow): CustomerCalendarSourceItem[] {
  if (!contract.publishedDoc || !contract.keyDate) return [];
  return [{
    category: 'CONTRACT_DATE',
    sourceKey: `contract-${contract.reference}`,
    title: String(contract.title || '').trim() || 'Közzétett szerződés',
    date: contract.keyDate,
    status: 'INFO',
    href: '/portal/szerzodesek',
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
