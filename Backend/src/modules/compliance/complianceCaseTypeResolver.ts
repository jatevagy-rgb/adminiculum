import { Prisma, ComplianceProposalKind } from '@prisma/client';

/**
 * Compliance work must enter through a NORMAL Case Type — never a parallel
 * compliance workflow/package model. This resolver maps a confirmed compliance
 * proposal to a recommended, canonical Case Type, and degrades safely when none
 * is usable.
 *
 * "Usable" = an ACTIVE CaseTypeDefinition that also has an ACTIVE
 * WorkPackageTemplate, so the canonical CaseWorkPackage snapshot can be created.
 * When nothing is usable we return caseTypeDefinitionId=null together with a
 * matterType that is guaranteed NOT to resolve to any active Case Type, so the
 * canonical snapshot step returns null (a Case with no snapshot) rather than
 * throwing on a Case Type that has no active work package.
 */

// Canonical matter types accepted by the Case creation service.
const VALID_MATTER_TYPES = ['REAL_ESTATE_SALE', 'LEASE', 'EMPLOYMENT', 'CORPORATE', 'LITIGATION', 'OTHER'] as const;

// Minimal, explicit mapping mechanism. Compliance proposals prefer a
// compliance-oriented Case Type (matched by slug OR legacy key), then fall back
// to the generic default type. This intentionally avoids hardcoding dozens of
// compliance-specific workflows: it only chooses which existing Case Type to use.
const KIND_TO_CASE_TYPE_KEYS: Record<ComplianceProposalKind, string[]> = {
  REMEDIATION: ['COMPLIANCE'],
  CONTROL_IMPLEMENTATION: ['COMPLIANCE'],
  DISCLOSURE: ['COMPLIANCE'],
  DOCUMENT_UPDATE: ['COMPLIANCE'],
  REVIEW: ['COMPLIANCE'],
  OPEN_MATTER: ['COMPLIANCE'],
};
const FALLBACK_CASE_TYPE_KEYS = ['COMPLIANCE', 'OTHER'];

export type RecommendedCaseType = {
  caseTypeDefinitionId: string | null;
  matterType: string;
};

type Db = Prisma.TransactionClient;

function dedupe(values: string[]): string[] {
  return Array.from(new Set(values.map((value) => value.trim()).filter(Boolean)));
}

async function firstCaseTypeWithActiveWorkPackage(db: Db, keys: string[]): Promise<string | null> {
  for (const key of keys) {
    const candidates = await db.caseTypeDefinition.findMany({
      where: { isActive: true, OR: [{ slug: key }, { legacyCaseTypeKey: key }] },
      select: { id: true },
      orderBy: { sortOrder: 'asc' },
    });
    for (const candidate of candidates) {
      const activeWorkPackage = await db.workPackageTemplate.findFirst({
        where: { caseTypeDefinitionId: candidate.id, status: 'ACTIVE' },
        select: { id: true },
      });
      if (activeWorkPackage) return candidate.id;
    }
  }
  return null;
}

// A matterType is a safe fallback only when NO active Case Type resolves from it,
// so the canonical snapshot step (which looks up by legacyCaseTypeKey when no
// explicit Case Type id is given) returns null instead of throwing.
async function safeFallbackMatterType(db: Db): Promise<string> {
  for (const matterType of VALID_MATTER_TYPES) {
    const existing = await db.caseTypeDefinition.findFirst({
      where: { isActive: true, legacyCaseTypeKey: matterType },
      select: { id: true },
    });
    if (!existing) return matterType;
  }
  return 'OTHER';
}

/**
 * Resolve the recommended canonical Case Type for a compliance proposal kind.
 * Returns an explicit Case Type id when one is usable (active + active work
 * package), otherwise a null id plus a safe fallback matterType.
 */
export async function resolveComplianceCaseType(db: Db, kind: ComplianceProposalKind): Promise<RecommendedCaseType> {
  const keys = dedupe([...(KIND_TO_CASE_TYPE_KEYS[kind] || []), ...FALLBACK_CASE_TYPE_KEYS]);
  const caseTypeDefinitionId = await firstCaseTypeWithActiveWorkPackage(db, keys);
  if (caseTypeDefinitionId) {
    return { caseTypeDefinitionId, matterType: 'OTHER' };
  }
  return { caseTypeDefinitionId: null, matterType: await safeFallbackMatterType(db) };
}
