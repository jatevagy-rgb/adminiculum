#!/usr/bin/env node
/**
 * ADMINICULUM — DEMO KFT. EMPLOYEE-COUNT MUTATION SCRIPT
 *
 * npm run demo:presentation:mutate
 *
 * Mutates canonical Demo Kft. employee-count fact (47 → 52)
 * using the real typed-fact write/evaluate path.
 *
 * Safety gates (ALL must be satisfied):
 *   1. NODE_ENV != 'production'
 *   2. ADMINICULUM_DEMO_CONTENT_ENABLED === 'true'
 */

import { PrismaClient } from '@prisma/client';
import crypto from 'node:crypto';
import pkg from '../dist/modules/compliance/typedFactMutationService.js';
const { createTypedFactAndEvaluate } = pkg;

const NODE_ENV = process.env.NODE_ENV || '';
const DEMO_ENABLED = process.env.ADMINICULUM_DEMO_CONTENT_ENABLED || '';
const FIXTURE_KEY = 'DEMO_KFT_2026';

function stableId(name) {
  return crypto.createHash('sha256').update(`${FIXTURE_KEY}:${name}`).digest('hex').slice(0, 32);
}

const IDS = {
  adminUserId: process.env.DEMO_ADMIN_USER_ID || stableId('adminUser'),
  clientId: stableId('demoClient'),
  identityId: stableId('portalIdentity'),
  factDefinitionId: stableId('factDefinitionEmployeeCount'),
  factDefinitionKey: 'DEMO_KFT_COMPANY_EMPLOYEE_COUNT',
};

function refuseIfProduction() {
  if (NODE_ENV === 'production') {
    console.error('ADMINICULUM_DEMO_PRODUCTION_DENY');
    process.exit(2);
  }
  if (DEMO_ENABLED !== 'true') {
    console.error('❌ REFUSED: ADMINICULUM_DEMO_CONTENT_ENABLED is not "true". Set it to enable demo mutation.');
    process.exit(2);
  }
  console.log('✅ Safety checks passed.');
}

async function main() {
  refuseIfProduction();
  const db = new PrismaClient();
  try {
    console.log('🚀 Running Demo Kft. employee‑count mutation (47 → 52)...');
    const now = new Date();
    await createTypedFactAndEvaluate(
      {
        clientId: IDS.clientId,
        factDefinitionId: IDS.factDefinitionId,
        actorUserId: IDS.adminUserId,
        verificationStatus: 'CLIENT_PROVIDED',
        input: {
          scopeType: 'COMPANY',
          factKey: IDS.factDefinitionKey,
          numberValue: 52,
          validFrom: now.toISOString(),
          observedAt: now.toISOString(),
          evaluationAt: now.toISOString(),
          sourceReference: `DEMO_KFT_FIXTURE:${IDS.identityId}`,
        },
      },
      db,
    );
    console.log('✅ Mutation completed. Employee count should now be 52.');
  } catch (err) {
    console.error('❌ Demo mutation failed:', err);
    process.exit(1);
  } finally {
    await db.$disconnect();
  }
}

main();
