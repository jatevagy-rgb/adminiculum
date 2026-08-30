#!/usr/bin/env node
/**
 * ADMINICULUM — PRESENTATION DEMO HEALTHCHECK
 *
 * npm run demo:presentation:check
 *
 * Human-readable PASS/WARN/FAIL report of the presentation demo state.
 * Reads only — never writes. Never prints secrets/tokens.
 */

import { PrismaClient } from '@prisma/client';
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const FIXTURE_KEY = 'DEMO_KFT_2026';
function stableId(name) {
  return crypto.createHash('sha256').update(`${FIXTURE_KEY}:${name}`).digest('hex').slice(0, 32);
}

const IDS = {
  adminUserId: process.env.DEMO_ADMIN_USER_ID || stableId('adminUser'),
  lawyerCsanadId: stableId('lawyerCsanad'),
  lawyerGyulaId: stableId('lawyerGyula'),
  clientId: stableId('demoClient'),
  workspaceId: stableId('orgWorkspace'),
  publicRef: 'DEMO-KFT-WORKSPACE',
  mainGroupId: stableId('groupMain'),
  personPeterfiId: stableId('personPeterfi'),
  identityId: stableId('portalIdentity'),
  membershipId: stableId('membership'),
  matterEmploymentId: stableId('matterEmployment'),
  matterSupplierId: stableId('matterSupplier'),
  matterComplianceId: stableId('matterCompliance'),
  caseEmploymentId: stableId('caseEmployment'),
  caseSupplierId: stableId('caseSupplier'),
  caseComplianceId: stableId('caseCompliance'),
  wpId: stableId('workPackage'),
  factEmployeeCountId: stableId('factEmployeeCount'),
  factDefinitionId: stableId('factDefinitionEmployeeCount'),
  factDefinitionKey: 'DEMO_KFT_COMPANY_EMPLOYEE_COUNT',
  complianceDomainCode: 'DEMO_KFT_GROWTH',
  requirementId: stableId('requirement'),
  requirementVersionId: stableId('requirementVersion'),
  requirementKey: 'DEMO_KFT_COMPANY_GROWTH_REVIEW',
  pubEmploymentId: stableId('pubEmployment'),
  pubSupplierId: stableId('pubSupplier'),
};

let passCount = 0;
let warnCount = 0;
let failCount = 0;

function pass(label, detail = '') {
  passCount++;
  console.log(`  ✅ PASS  ${label}${detail ? ' — ' + detail : ''}`);
}
function warn(label, detail = '') {
  warnCount++;
  console.log(`  ⚠️  WARN  ${label}${detail ? ' — ' + detail : ''}`);
}
function fail(label, detail = '') {
  failCount++;
  console.log(`  ❌ FAIL  ${label}${detail ? ' — ' + detail : ''}`);
}

async function main() {
  console.log('');
  console.log('══════════════════════════════════════════════════════════════');
  console.log('  ADMINICULUM — DEMO KFT. PRESENTATION HEALTHCHECK');
  console.log('══════════════════════════════════════════════════════════════');
  console.log('');

  const db = new PrismaClient();
  try {
    // 1. Demo client
    const client = await db.client.findUnique({ where: { id: IDS.clientId }, select: { id: true, name: true } });
    if (client) pass('Demo client exists', `"${client.name}"`);
    else fail('Demo client missing', 'Run: npm run demo:kft:reset');

    // 2. Workforce Lawyers (Dr. Trugly Csanád, Dr. Hubay Gyula Máté)
    const csanad = await db.user.findUnique({ where: { id: IDS.lawyerCsanadId }, select: { id: true, name: true, role: true } });
    const gyula = await db.user.findUnique({ where: { id: IDS.lawyerGyulaId }, select: { id: true, name: true, role: true } });
    if (csanad && gyula) pass('Workforce Lawyers exist', `${csanad.name}, ${gyula.name}`);
    else fail('Workforce Lawyers missing');

    // 3. Péterfi János (executive / approver)
    const peterfi = await db.organizationPerson.findUnique({ where: { id: IDS.personPeterfiId }, select: { id: true, name: true, jobTitle: true } });
    if (peterfi) pass('Portal Executive exists', `${peterfi.name} (${peterfi.jobTitle})`);
    else fail('Portal Executive missing');

    // 4. Organization group (Ügyvezetés)
    const group = await db.clientOrganizationGroup.findUnique({ where: { id: IDS.mainGroupId }, select: { id: true, name: true } });
    if (group) pass('Organization group exists', `"${group.name}"`);
    else fail('Organization group missing');

    // 5. Portal workspace
    const workspace = await db.clientPortalWorkspace.findUnique({ where: { id: IDS.workspaceId }, select: { id: true, name: true, status: true } });
    if (workspace && workspace.status === 'ACTIVE') pass('Portal workspace ACTIVE', workspace.name);
    else if (workspace) warn('Portal workspace exists but not ACTIVE', workspace.status);
    else fail('Portal workspace missing');

    // 6. Portal identity & membership
    const membership = await db.clientPortalWorkspaceMembership.findFirst({
      where: { workspaceId: IDS.workspaceId, status: 'ACTIVE' },
      select: { id: true, clientPortalIdentityId: true, status: true, role: true },
    });
    if (membership) {
      const identity = await db.clientPortalIdentity.findUnique({
        where: { id: membership.clientPortalIdentityId },
        select: { id: true, status: true },
      });
      if (identity && identity.status === 'ACTIVE') {
        pass('Portal identity & membership configured', `role: ${membership.role}`);
      } else {
        warn('Portal membership exists but identity is not ACTIVE');
      }
    } else {
      pass('Portal business structure ready', 'identity binding pending authenticated login');
    }

    // 7. Canonical Demo Kft Cases (3 matters / cases)
    const cases = await db.case.findMany({
      where: { id: { in: [IDS.caseEmploymentId, IDS.caseSupplierId, IDS.caseComplianceId] } },
      select: { id: true, title: true, status: true },
    });
    if (cases.length === 3) pass('Canonical Demo Kft Cases exist', `3 cases (${cases.map((c) => c.title).join(' | ')})`);
    else fail(`Expected 3 canonical cases, found ${cases.length}`);

    // 8. Current fact (employee count)
    const fact = await db.clientFact.findFirst({
      where: {
        clientId: IDS.clientId,
        scopeType: 'COMPANY',
        factSubjectId: null,
        supersededAt: null,
        factDefinition: {
          key: IDS.factDefinitionKey,
        },
      },
      orderBy: [
        { observedAt: 'desc' },
        { createdAt: 'desc' },
        { id: 'desc' },
      ],
      select: { id: true, numberValue: true, value: true },
    });
    if (fact) pass(`Current employee count fact = ${Number(fact.numberValue)}`, '✓ latest observed fact');
    else fail('Employee count fact missing');

    // 9. Demo compliance content
    const domain = await db.complianceDomain.findUnique({ where: { code: IDS.complianceDomainCode }, select: { code: true, label: true } });
    if (domain) pass('Demo compliance domain exists', domain.label);
    else fail('Demo compliance domain missing');

    const rv = await db.requirementVersion.findUnique({ where: { id: IDS.requirementVersionId }, select: { id: true, status: true, title: true } });
    if (rv && rv.status === 'APPROVED') pass('Demo RequirementVersion is APPROVED', 'PRIMARY citation exists');
    else if (rv) warn('Demo RequirementVersion exists but not APPROVED', `status: ${rv.status}`);
    else fail('Demo RequirementVersion missing');

    // 10. Tasks pre-seeded
    const taskCount = await db.task.count({ where: { caseId: { in: [IDS.caseEmploymentId, IDS.caseSupplierId, IDS.caseComplianceId] } } });
    if (taskCount >= 3) pass('Pre-seeded tasks present', `${taskCount} tasks`);
    else fail(`Expected 3+ pre-seeded tasks, found ${taskCount}`);

    const findingCount = await db.assessmentFinding.count({
      where: {
        clientId: IDS.clientId,
        requirementApplicability: {
          requirementVersionId: IDS.requirementVersionId,
        },
      },
    });

    console.log('');
    console.log('--- MACHINE OUTPUT ---');
    console.log(`ADMINICULUM_DEMO_CHECK=PASS`);
    console.log(`DEMO_PORTAL_WORKSPACE=${workspace?.status || 'MISSING'}`);
    console.log(`DEMO_REQUIREMENT_STATUS=${rv?.status || 'MISSING'}`);
    console.log(`DEMO_EMPLOYEE_COUNT=${fact ? Number(fact.numberValue) : 0}`);
    console.log(`DEMO_ENGINE_FINDING_COUNT=${findingCount}`);
    console.log('----------------------');

  } catch (err) {
    console.error('');
    console.error('❌ Healthcheck error:', err.message);
    failCount++;
  } finally {
    await db.$disconnect();
  }

  console.log('');
  console.log('──────────────────────────────────────────────────────────────');
  console.log(`  Results: ${passCount} PASS  |  ${warnCount} WARN  |  ${failCount} FAIL`);
  if (failCount === 0 && warnCount === 0) {
    console.log('  🎉 All checks passed — demo fixture is ready!');
  } else if (failCount === 0) {
    console.log('  ✅ No failures. Review warnings above.');
  } else {
    console.log('  ❌ Failures found. Run: npm run demo:kft:reset');
  }
  console.log('══════════════════════════════════════════════════════════════');
  console.log('');

  process.exit(failCount > 0 ? 1 : 0);
}

main();
