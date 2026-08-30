import { PrismaClient } from '@prisma/client';
import {
  CASE_WORK_PACKAGE_SNAPSHOT_KEY,
  withCaseWorkPackageRequirednessSnapshot,
} from './caseWorkPackage.service';

export type RequirednessBackfillSummary = {
  total: number;
  withSnapshot: number;
  legacy: number;
  eligible: number;
  repaired: number;
  unresolved: number;
  unresolvedByReason: Record<string, number>;
};

type BackfillOptions = {
  dryRun: boolean;
  batchSize?: number;
  caseWorkPackageIds?: string[];
};

function snapshotRequired(config: unknown): boolean | null {
  if (!config || typeof config !== 'object' || Array.isArray(config)) return null;
  const value = (config as Record<string, unknown>)[CASE_WORK_PACKAGE_SNAPSHOT_KEY];
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  return typeof (value as Record<string, unknown>).required === 'boolean'
    ? (value as Record<string, boolean>).required
    : null;
}

function unresolved(summary: RequirednessBackfillSummary, reason: string): void {
  summary.unresolved += 1;
  summary.unresolvedByReason[reason] = (summary.unresolvedByReason[reason] || 0) + 1;
}

/**
 * Explicit, auditable repair for rows created before requiredness was snapshot.
 * Only an item retained on the case's original immutable ACTIVE/ARCHIVED template
 * version is eligible; every other legacy row is reported and left untouched.
 */
export async function backfillCaseWorkPackageRequiredness(
  db: PrismaClient,
  options: BackfillOptions,
): Promise<RequirednessBackfillSummary> {
  const batchSize = Math.min(Math.max(options.batchSize ?? 100, 1), 500);
  const summary: RequirednessBackfillSummary = {
    total: 0, withSnapshot: 0, legacy: 0, eligible: 0, repaired: 0, unresolved: 0, unresolvedByReason: {},
  };
  let cursor: string | undefined;

  while (true) {
    const result = await db.$transaction(async (tx) => {
      const batch = { total: 0, withSnapshot: 0, legacy: 0, eligible: 0, repaired: 0, unresolved: 0, unresolvedByReason: {} as Record<string, number> };
      const rows = await tx.caseWorkPackageItem.findMany({
        take: batchSize,
        ...(cursor ? { skip: 1, cursor: { id: cursor } } : {}),
        ...(options.caseWorkPackageIds ? { where: { caseWorkPackageId: { in: options.caseWorkPackageIds } } } : {}),
        orderBy: { id: 'asc' },
        select: {
          id: true,
          config: true,
          sourceTemplateItemId: true,
          sourceTemplateItem: { select: { isOptional: true, workPackageTemplateId: true } },
          caseWorkPackage: {
            select: {
              workPackageTemplateId: true,
              workPackageTemplateVersion: true,
              workPackageTemplate: { select: { id: true, version: true, status: true } },
            },
          },
        },
      });
      for (const row of rows) {
        batch.total += 1;
        if (snapshotRequired(row.config) !== null) {
          batch.withSnapshot += 1;
          continue;
        }
        batch.legacy += 1;
        if (row.config && typeof row.config === 'object' && !Array.isArray(row.config)
          && Object.prototype.hasOwnProperty.call(row.config as object, CASE_WORK_PACKAGE_SNAPSHOT_KEY)) {
          unresolved(batch, 'RESERVED_KEY_INVALID');
          continue;
        }
        if (!row.sourceTemplateItemId || !row.sourceTemplateItem) {
          unresolved(batch, 'SOURCE_TEMPLATE_ITEM_MISSING');
          continue;
        }
        const template = row.caseWorkPackage.workPackageTemplate;
        if (!template || !row.caseWorkPackage.workPackageTemplateId || row.sourceTemplateItem.workPackageTemplateId !== row.caseWorkPackage.workPackageTemplateId) {
          unresolved(batch, 'SOURCE_TEMPLATE_MISMATCH');
          continue;
        }
        if (row.caseWorkPackage.workPackageTemplateVersion !== template.version || !['ACTIVE', 'ARCHIVED'].includes(String(template.status))) {
          unresolved(batch, 'TEMPLATE_VERSION_NOT_IMMUTABLE');
          continue;
        }
        batch.eligible += 1;
        if (!options.dryRun) {
          await tx.caseWorkPackageItem.update({
            where: { id: row.id },
            data: { config: withCaseWorkPackageRequirednessSnapshot(row.config, !row.sourceTemplateItem.isOptional) },
          });
          batch.repaired += 1;
        }
      }
      return { rows, batch };
    }, { isolationLevel: 'Serializable' });
    for (const key of ['total', 'withSnapshot', 'legacy', 'eligible', 'repaired', 'unresolved'] as const) summary[key] += result.batch[key];
    for (const [reason, count] of Object.entries(result.batch.unresolvedByReason)) summary.unresolvedByReason[reason] = (summary.unresolvedByReason[reason] || 0) + count;
    if (!result.rows.length) break;
    cursor = result.rows[result.rows.length - 1].id;
    if (result.rows.length < batchSize) break;
  }
  return summary;
}
