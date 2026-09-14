/**
 * COMPLIANCE DISCOVERY 2.0 — PRODUCTION RULE PROVISIONING
 *
 * Wires the existing idempotent `seedComplianceModuleRuleFamilies` into the
 * production bootstrap so the three representative verticals (GDPR /
 * whistleblowing / NIS2) exist after a normal deploy without a human running a
 * test helper.
 *
 * Additive, idempotent, replay-safe: every step checks for existing rows and
 * never mutates an already-approved version. The only pre-step is ensuring the
 * `employee_count` FactDefinition exists, because the declarative rules resolve
 * their fact dependencies at provisioning time and `employee_count` is owned by
 * the runtime seed rather than the fact-definition migration.
 */

import { PrismaClient } from '@prisma/client';
import { seedComplianceModuleRuleFamilies } from './complianceModuleSeedingService';

type Db = PrismaClient;

/**
 * Opaque provisioning actor recorded on `approvedById`. The column is a plain
 * string (not a foreign key), so no synthetic user row is required.
 */
export const SYSTEM_PROVISIONING_ACTOR_ID = 'system:compliance-provisioning';

/** Ensures the `employee_count` FactDefinition exists (no-op when present). */
export async function ensureEmployeeCountFactDefinition(db: Db): Promise<boolean> {
  const existing = await db.factDefinition.findUnique({ where: { key: 'employee_count' }, select: { id: true } });
  if (existing) return false;
  await db.factDefinition.create({
    data: {
      key: 'employee_count',
      domainCode: 'CLIENT_COMPANY_PROFILE',
      valueType: 'NUMBER',
      allowedScopeTypes: ['COMPANY'],
      determinationMethod: 'USER_PROVIDED',
      overlapPolicy: 'DISALLOW',
      temporalPolicy: 'OBSERVATION',
      questionKey: 'employee_count',
      status: 'ACTIVE',
    },
  });
  return true;
}

/**
 * Provisions the three compliance verticals. Idempotent: re-running creates no
 * duplicates and leaves existing approved versions untouched.
 */
export async function provisionComplianceModuleRules(
  db: Db,
  actorUserId: string = SYSTEM_PROVISIONING_ACTOR_ID,
) {
  await ensureEmployeeCountFactDefinition(db);
  return seedComplianceModuleRuleFamilies(db, actorUserId);
}
