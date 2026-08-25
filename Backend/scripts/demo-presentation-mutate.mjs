#!/usr/bin/env node
/**
 * ADMINICULUM — PRESENTATION DEMO MUTATION SCRIPT
 *
 * npm run demo:presentation:mutate
 *
 * Safety gates (ALL must be satisfied):
 *   1. NODE_ENV != 'production'
 *   2. ADMINICULUM_DEMO_CONTENT_ENABLED === 'true'
 */

import { PrismaClient } from '@prisma/client';
import { createTypedFactAndEvaluate } from '../src/modules/compliance/typedFactMutationService';
import { DEMO_IDS } from '../tests/helpers/presentationDemoFixture';

const NODE_ENV = process.env.NODE_ENV || '';
const DEMO_ENABLED = process.env.ADMINICULUM_DEMO_CONTENT_ENABLED || '';

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
    console.log('🚀 Running employee‑count mutation (47 → 52)...');
    const now = new Date();
    await createTypedFactAndEvaluate(
      {
        clientId: DEMO_IDS.clientId,
        factDefinitionId: DEMO_IDS.factDefinitionId,
        actorUserId: DEMO_IDS.adminUserId,
        input: {
          scopeType: 'COMPANY',
          factKey: DEMO_IDS.factDefinitionKey,
          numberValue: 52,
          validFrom: now,
          observedAt: now,
          evaluationAt: now,
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
