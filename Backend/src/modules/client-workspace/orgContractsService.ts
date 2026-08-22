/**
 * PHASE 5B — ORGANIZATIONAL CUSTOMER CONTRACT OVERVIEW (Szerződések).
 *
 * Customer-facing contract surface for an ORGANIZATION workspace. Every item is
 * derived ONLY from explicit customer-safe publication data:
 *   - the customer's visible, exact-version published document publications
 *     (reuses the canonical portal document reader + audience/visibility checks);
 *   - the canonical customer-safe contract-library projector
 *     (projectContractLibraryForCustomer), which requires a ContractRecord's
 *     canonicalDocumentVersionId to be an EXPLICITLY published document version.
 *
 * Authorization is the canonical org portal path: requireOrganizationWorkspace
 * first, then the customer's granted-cases + published-document resolvers. No
 * client/case/grant/contract id is ever accepted from the browser. Only allowlisted
 * customer-safe fields are returned; internal ContractRecord/status/owner/Task/
 * DocumentVersion/SharePoint/AI/audit data never crosses.
 *
 * EXACT-VERSION INVARIANT: a contract is customer-visible only when its
 * canonicalDocumentVersionId is an explicitly published document version for the
 * customer. If V1 is published and V2 is an internal current version, the customer
 * still sees/downloads V1 (the published publication pins the exact version).
 *
 * NO new persistence. Reuses existing canonical models + services.
 */
import { prisma as defaultPrisma } from '../../prisma/prisma.service';
import { assertClientSafe } from '../client-interaction/base';
import { requireOrganizationWorkspace } from './organizationalAccessPolicy';
import { listPortalDocuments } from '../client-publication/publicationService';
import { projectContractLibraryForCustomer } from '../client-contracts/projector';

type Prisma = typeof defaultPrisma;

export interface OrgContractPublishedDoc {
  publicationId: string;
  title: string | null;
  versionLabel: string;
  publishedAt: string | null;
  downloadAvailable: boolean;
}

export interface OrgContractItem {
  reference: string;
  title: string;
  statusLabel: string;
  lifecycle: 'active' | 'upcoming' | 'terminating';
  relatedMatterTitle: string | null;
  nextStep: string | null;
  customerActionRequired: boolean;
  keyDate: string | null;
  publishedDoc: OrgContractPublishedDoc | null;
}

export interface OrgContractsDto {
  items: OrgContractItem[];
}

const CUSTOMER_STATUS_LABELS: Record<string, { label: string; lifecycle: OrgContractItem['lifecycle'] }> = {
  ACTIVE: { label: 'Hatályban', lifecycle: 'active' },
  SIGNED_NOT_EFFECTIVE: { label: 'Aláírva, hatálybalépés előtt', lifecycle: 'upcoming' },
  TERMINATING: { label: 'Megszűnés alatt', lifecycle: 'terminating' },
};

function iso(v: Date | string | null | undefined): string | null {
  if (!v) return null;
  return typeof v === 'string' ? v : v.toISOString();
}

interface PublishedPublication extends OrgContractPublishedDoc {
  matterTitle: string | null;
}

/**
 * Resolve the customer's visible, exact-version published document publications
 * as a map keyed by documentVersionId. Reuses the canonical portal document
 * reader so every returned publication has already passed the identity/workspace/
 * grant/audience/visibility gates.
 */
async function publishedPublicationsByVersion(
  identityId: string,
  workspaceId: string,
  prisma: Prisma,
): Promise<{ byVersion: Map<string, PublishedPublication>; versionIds: Set<string> }> {
  const actor = { userId: identityId, role: 'CLIENT_PORTAL', workspaceId };
  const portalDocs = await listPortalDocuments(actor, undefined, prisma);
  const byVersion = new Map<string, PublishedPublication>();
  if (!portalDocs.items.length) return { byVersion, versionIds: new Set() };

  const publicationIds = portalDocs.items.map((item: any) => String(item.id));
  const rows = await prisma.clientDocumentPublication.findMany({
    where: { id: { in: publicationIds }, status: 'PUBLISHED' },
    select: { id: true, documentVersionId: true, clientFacingTitle: true, publishedAt: true },
  });
  const rowByPublication = new Map(rows.map((row) => [row.id, row]));

  for (const item of portalDocs.items as Array<Record<string, any>>) {
    const row = rowByPublication.get(String(item.id));
    if (!row?.documentVersionId) continue;
    byVersion.set(row.documentVersionId, {
      publicationId: String(row.id),
      title: row.clientFacingTitle ?? null,
      versionLabel: item.versionLabel || 'Közzétett változat',
      publishedAt: iso(item.publishedAt || row.publishedAt || null),
      downloadAvailable: Boolean(item.downloadAvailable),
      matterTitle: item.matterTitle ?? null,
    });
  }

  return { byVersion, versionIds: new Set(byVersion.keys()) };
}

/**
 * Build the customer contract overview DTO. Requires an active ORGANIZATION
 * workspace; all contract content comes from canonical safe projections.
 */
export async function getOrganizationalContracts(
  identityId: string,
  workspaceId: string,
  prisma: Prisma = defaultPrisma,
): Promise<OrgContractsDto> {
  const workspace = await requireOrganizationWorkspace(workspaceId, prisma);
  const { byVersion, versionIds } = await publishedPublicationsByVersion(identityId, workspaceId, prisma);
  const library = await projectContractLibraryForCustomer(workspace.clientId, versionIds, prisma);

  // Narrow internal read for the join key (canonicalDocumentVersionId) + source
  // case id only. These values are used to link the eligible contract to its
  // published publication and are NEVER exposed to the customer.
  const contractIds = (library.items as any[]).map((contract) => String(contract.id));
  const joinRows = contractIds.length
    ? await prisma.contractRecord.findMany({
        where: { id: { in: contractIds } },
        select: { id: true, canonicalDocumentVersionId: true, sourceCaseId: true },
      })
    : [];
  const joinByContract = new Map(joinRows.map((row) => [row.id, row]));

  const items: OrgContractItem[] = (library.items as any[]).map((contract) => {
    const canonical = joinByContract.get(String(contract.id))?.canonicalDocumentVersionId || null;
    const publication = canonical ? byVersion.get(canonical) || null : null;
    const statusMeta = CUSTOMER_STATUS_LABELS[String(contract.status)] || CUSTOMER_STATUS_LABELS.ACTIVE;
    const keyDate = iso(contract.expiryDate || contract.nextCriticalDate || contract.effectiveDate || null);
    return {
      reference: publication?.publicationId || String(contract.id),
      title: publication?.title || String(contract.title),
      statusLabel: statusMeta.label,
      lifecycle: statusMeta.lifecycle,
      relatedMatterTitle: publication?.matterTitle ?? null,
      nextStep: null,
      customerActionRequired: false,
      keyDate,
      publishedDoc: publication ? {
        publicationId: publication.publicationId,
        title: publication.title,
        versionLabel: publication.versionLabel,
        publishedAt: publication.publishedAt,
        downloadAvailable: publication.downloadAvailable,
      } : null,
    };
  });

  const dto: OrgContractsDto = { items };
  assertClientSafe(dto);
  return dto;
}