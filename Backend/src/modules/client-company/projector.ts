/**
 * CUSTOMER-SAFE COMPANY OVERVIEW PROJECTOR — FOUNDATION ONLY.
 *
 * Architecturally ready for a future organizational-customer company overview,
 * but deliberately NOT exposed through any public route in Phase 1. There is no
 * company-level customer scope in the current Case-grant model yet; forcing one
 * now would be a wrong authorization model. We prefer a correct dormant
 * projector over an incorrect one. The public route is deferred to Phase 5.
 *
 * Safety rules applied here:
 *  - no internal notes / review data;
 *  - no verification status or provenance (sourceDocumentVersionId, verifiedBy);
 *  - no raw Assessment items or findings;
 *  - milestones/initiatives only as customer-safe summaries.
 */
import { prisma as defaultPrisma } from '../../prisma/prisma.service';
import { assertClientSafe } from '../client-interaction/base';

type Prisma = typeof defaultPrisma;

export async function projectCompanyOverviewForCustomer(clientId: string, prisma: Prisma = defaultPrisma) {
  const [profile, milestones, initiatives] = await Promise.all([
    prisma.clientOperatingProfile.findUnique({ where: { clientId }, select: { summary: true, nextReviewAt: true } }),
    prisma.companyMilestone.findMany({
      where: { clientId, status: 'ACHIEVED' },
      orderBy: { milestoneDate: 'desc' },
      take: 10,
      select: { id: true, type: true, title: true, milestoneDate: true },
    }),
    prisma.developmentInitiative.findMany({
      where: { clientId, status: { in: ['PLANNED', 'ACTIVE'] } },
      orderBy: { createdAt: 'desc' },
      take: 10,
      select: { id: true, title: true, targetState: true, status: true, targetAt: true },
    }),
  ]);

  const dto = {
    profileHeadline: profile?.summary ?? null,
    milestones: milestones.map((m) => ({ id: m.id, type: m.type, title: m.title, date: m.milestoneDate ? m.milestoneDate.toISOString() : null })),
    initiatives: initiatives.map((i) => ({
      id: i.id,
      title: i.title,
      targetState: i.targetState,
      status: i.status,
      targetAt: i.targetAt ? i.targetAt.toISOString() : null,
    })),
  };
  assertClientSafe(dto);
  return dto;
}
