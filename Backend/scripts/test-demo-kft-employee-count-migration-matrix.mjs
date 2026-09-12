import fs from 'node:fs/promises';
import path from 'node:path';
import { PrismaClient } from '@prisma/client';

const url = process.env.MIGRATION_REPLAY_DATABASE_URL;
if (!url) throw new Error('MIGRATION_REPLAY_DATABASE_URL is required');
const db = new PrismaClient({ datasources: { db: { url } } });
const migration = await fs.readFile(path.resolve('prisma/migrations/20260911090000_reconcile_demo_kft_employee_count_key/migration.sql'), 'utf8');
const oldKey = 'DEMO_KFT_COMPANY_EMPLOYEE_COUNT';
const canonicalKey = 'employee_count';
const syntheticClient = 'matrix-client';

async function clear() {
  await db.clientFactAnswerState.deleteMany({ where: { clientId: syntheticClient } });
  await db.clientFact.deleteMany({ where: { clientId: syntheticClient } });
  await db.client.deleteMany({ where: { id: syntheticClient } });
  await db.factDefinition.deleteMany({ where: { id: { in: ['matrix-old-definition', 'matrix-canonical-definition'] } } });
}
async function runSql() { await db.$executeRawUnsafe(migration); }
async function seedDefinition(id, key) {
  await db.factDefinition.create({ data: { id, key, domainCode: 'MATRIX', valueType: 'NUMBER', allowedScopeTypes: ['COMPANY'], determinationMethod: 'USER_PROVIDED', overlapPolicy: 'DISALLOW', temporalPolicy: 'OBSERVATION' } });
}
async function matrixA() { await clear(); const before = await db.factDefinition.count(); await runSql(); const rows = await db.factDefinition.count(); if (rows !== before) throw new Error('A changed row count'); }
async function matrixB() {
  await clear(); await seedDefinition('matrix-old-definition', oldKey);
  await db.client.create({ data: { id: syntheticClient, name: 'Migration Matrix Client' } });
  await db.clientFact.create({ data: { id: 'matrix-fact', clientId: syntheticClient, type: oldKey, value: '123', factDefinitionId: 'matrix-old-definition', scopeType: 'COMPANY', numberValue: 123, validFrom: new Date('2026-01-01T00:00:00Z') } });
  await db.clientFactAnswerState.create({ data: { id: 'matrix-answer', clientId: syntheticClient, factDefinitionId: 'matrix-old-definition', scopeType: 'COMPANY', status: 'ANSWERED', currentFactId: 'matrix-fact' } });
  await runSql(); const d = await db.factDefinition.findUniqueOrThrow({ where: { key: canonicalKey } });
  if (d.id !== 'matrix-old-definition') throw new Error('B id changed');
  const f = await db.clientFact.findUniqueOrThrow({ where: { id: 'matrix-fact' } }); const s = await db.clientFactAnswerState.findUniqueOrThrow({ where: { id: 'matrix-answer' } });
  if (f.factDefinitionId !== d.id || s.factDefinitionId !== d.id || s.currentFactId !== f.id) throw new Error('B references changed');
}
async function matrixC() { await clear(); await seedDefinition('matrix-canonical-definition', canonicalKey); await runSql(); const d = await db.factDefinition.findUniqueOrThrow({ where: { key: canonicalKey } }); if (d.id !== 'matrix-canonical-definition') throw new Error('C changed'); }
async function matrixD() { await clear(); await seedDefinition('matrix-old-definition', oldKey); await seedDefinition('matrix-canonical-definition', canonicalKey); try { await runSql(); throw new Error('D did not fail'); } catch (e) { if (!String(e.message).includes('canonical FactDefinition already exists on a different id')) throw e; } const old = await db.factDefinition.findUniqueOrThrow({ where: { id: 'matrix-old-definition' } }); const canonical = await db.factDefinition.findUniqueOrThrow({ where: { id: 'matrix-canonical-definition' } }); if (old.key !== oldKey || canonical.key !== canonicalKey) throw new Error('D partial mutation'); }

try { await matrixA(); console.log('MATRIX_A=PASS'); await matrixB(); console.log('MATRIX_B=PASS'); await matrixC(); console.log('MATRIX_C=PASS'); await matrixD(); console.log('MATRIX_D=PASS'); } finally { await clear(); await db.$disconnect(); }
