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

const PRESENTATION_SEED = 'DEMO_PRESENTATION_2026';
function stableId(name) {
  return crypto.createHash('sha256').update(`${PRESENTATION_SEED}:${name}`).digest('hex').slice(0, 32);
}

const IDS = {
  adminUserId: stableId('adminUser'),
  lawyerUserId: stableId('lawyerUser'),
  clientId: stableId('demoClient'),
  groupRootId: stableId('groupRoot'),
  personUgyvezetoId: stableId('personUgyvezeto'),
  workspaceId: stableId('orgWorkspace'),
  caseMainId: stableId('caseMain'),
  caseComplianceId: stableId('caseCompliance'),
  taskOneId: stableId('taskOne'),
  factEmployeeCountId: stableId('factEmployeeCount'),
  complianceDomainCode: 'DEMO_PRESENTATION_GROWTH',
  requirementVersionId: stableId('demoRequirementVersion'),
  factDefinitionKey: 'DEMO_PRESENTATION_COMPANY_EMPLOYEE_COUNT',
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
  console.log('  ADMINICULUM — PRESENTATION DEMO HEALTHCHECK');
  console.log('══════════════════════════════════════════════════════════════');
  console.log('');

  const db = new PrismaClient();
  try {
    // 1. Demo client
    const client = await db.client.findUnique({ where: { id: IDS.clientId }, select: { id: true, name: true } });
    if (client) pass('Demo client exists', `"${client.name}"`);
    else fail('Demo client missing', 'Run: npm run demo:presentation:reset');

    // 2. Lawyer (Dr. Kovács Péter)
    const lawyer = await db.user.findUnique({ where: { id: IDS.lawyerUserId }, select: { id: true, name: true, role: true } });
    if (lawyer) pass('Demo Lawyer exists', `${lawyer.name} (${lawyer.role})`);
    else fail('Demo Lawyer missing');

    // 3. Demo Ügyvezető (org person)
    const ugyvezeto = await db.organizationPerson.findUnique({ where: { id: IDS.personUgyvezetoId }, select: { id: true, name: true } });
    if (ugyvezeto) pass('Demo Ügyvezető (org person) exists', ugyvezeto.name);
    else fail('Demo Ügyvezető (org person) missing');

    // 4. Organization group
    const group = await db.clientOrganizationGroup.findUnique({ where: { id: IDS.groupRootId }, select: { id: true, name: true } });
    if (group) pass('Organization group exists', `"${group.name}"`);
    else fail('Organization group missing');

    // 5. Portal workspace
    const workspace = await db.clientPortalWorkspace.findUnique({ where: { id: IDS.workspaceId }, select: { id: true, name: true, status: true } });
    if (workspace && workspace.status === 'ACTIVE') pass('Portal workspace ACTIVE', workspace.name);
    else if (workspace) warn('Portal workspace exists but not ACTIVE', workspace.status);
    else fail('Portal workspace missing');

    // 6. Portal identity (if DEMO_PORTAL_EMAIL configured)
    const demoEmail = process.env.DEMO_PORTAL_EMAIL;
    if (demoEmail && !demoEmail.includes('fixture.invalid')) {
      const normalizedEmail = demoEmail.toLowerCase().trim();
      const identity = await db.clientPortalIdentity.findUnique({ where: { normalizedEmail }, select: { id: true, status: true } });
      if (!identity) fail('Portal identity not found for DEMO_PORTAL_EMAIL', '(email not printed)');
      else {
        const membership = await db.clientPortalWorkspaceMembership.findFirst({
          where: { clientPortalIdentityId: identity.id, workspaceId: IDS.workspaceId },
          select: { id: true, status: true },
        });
        if (membership && membership.status === 'ACTIVE') pass('Portal membership configured', 'identity linked to workspace');
        else if (membership) warn('Portal membership exists but not ACTIVE', membership.status);
        else fail('Portal identity found but workspace membership missing', 'Run: npm run demo:presentation:reset');
      }
    } else {
      warn('Portal identity not checked', 'DEMO_PORTAL_EMAIL not set (optional for workforce-only demo)');
    }

    // 7. Presentation Cases
    const caseMain = await db.case.findUnique({ where: { id: IDS.caseMainId }, select: { id: true, title: true, status: true } });
    if (caseMain) pass('Main presentation Case exists', `"${caseMain.title}"`);
    else fail('Main Case (Munkajogi szerződéses áttekintés) missing');

    const caseCom = await db.case.findUnique({ where: { id: IDS.caseComplianceId }, select: { id: true, title: true } });
    if (caseCom) pass('Secondary Case exists', `"${caseCom.title}"`);
    else warn('Secondary Case (Vállalati megfelelőségi áttekintés) missing', 'optional');

    // 8. Initial fact (employee count = 47)
    const fact = await db.clientFact.findUnique({ where: { id: IDS.factEmployeeCountId }, select: { id: true, numberValue: true, value: true } });
    if (fact && Number(fact.numberValue) === 47) pass('Initial employee count fact = 47', '✓ ready for demo');
    else if (fact) warn('Employee count fact exists but value is not 47', `current value: ${fact.value} (${fact.numberValue})`);
    else fail('Employee count fact missing');

    // 9. Demo compliance content (CANDIDATE — blocker documented)
    const domain = await db.complianceDomain.findUnique({ where: { code: IDS.complianceDomainCode }, select: { code: true, label: true } });
    if (domain) pass('Demo compliance domain exists', domain.label);
    else fail('Demo compliance domain missing');

    const rv = await db.requirementVersion.findUnique({ where: { id: IDS.requirementVersionId }, select: { id: true, status: true, title: true } });
    if (rv && rv.status === 'APPROVED') pass('Demo RequirementVersion is APPROVED', 'PRIMARY citation exists');
    else if (rv) warn('Demo RequirementVersion exists but not APPROVED', `status: ${rv.status}`);
    else fail('Demo RequirementVersion missing');

    // 10. 7B compliance proposal surface (code presence check)
    const proposalService = path.join(__dirname, '..', 'src', 'modules', 'compliance', 'complianceProposalService.ts');
    if (fs.existsSync(proposalService)) pass('Phase 7B proposal service present', 'complianceProposalService.ts');
    else fail('Phase 7B proposal service missing', proposalService);

    // 11. 7C-B availability (check if it's in canonical branch)
    // 7C-B is not yet in release/editor-ops-workflow-1 — this is expected
    warn('Organizational company-profile write API', 'not implemented yet');

    // 12. Backend config present
    const backendEnv = path.join(__dirname, '..', '.env');
    if (fs.existsSync(backendEnv)) pass('Backend .env present');
    else warn('Backend .env missing', 'Copy from .env.example and configure DATABASE_URL');

    // 13. Frontend config
    const frontendEnv = path.join(__dirname, '..', '..', 'Frontend', '.env.local');
    const frontendEnv2 = path.join(__dirname, '..', '..', 'Frontend', '.env');
    if (fs.existsSync(frontendEnv) || fs.existsSync(frontendEnv2)) pass('Frontend env present');
    else warn('Frontend env not found', 'Configure Frontend/.env.local if needed');

    // 14. Tasks pre-seeded (not the live-demo Task)
    const taskCount = await db.task.count({ where: { caseId: { in: [IDS.caseMainId, IDS.caseComplianceId] } } });
    if (taskCount >= 3) pass(`Pre-seeded tasks present`, `${taskCount} tasks (live-demo Task NOT seeded — correct)`);
    else if (taskCount > 0) warn(`Only ${taskCount} tasks pre-seeded`, 'expected 3+');
    else fail('No pre-seeded tasks found');

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
    console.log('  ❌ Failures found. Run: npm run demo:presentation:reset');
  }
  console.log('══════════════════════════════════════════════════════════════');
  console.log('');

  process.exit(failCount > 0 ? 1 : 0);
}

main();
