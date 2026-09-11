/**
 * Demo Kft. compliance + Grow With Us — real-engine acceptance (PostgreSQL).
 *
 * Proves the full 47 -> 52 journey via the REAL typed-fact engine path, the
 * human-gated proposal -> confirm -> Task flow, and truthful reset:
 *   reset -> 47 -> 0 findings
 *   typed-fact mutation (valid observedAt) -> 52 -> 1 engine-derived finding
 *   safe Grow narrative reflects 47 -> 52
 *   proposal available; NO Task before human confirm
 *   confirmProposal (human gate) -> Task created
 *   reset -> 47 -> baseline finding removed
 */
import crypto from 'crypto';
import { PrismaClient } from '@prisma/client';
import { createTypedFactAndEvaluate } from '../src/modules/compliance/typedFactMutationService';
import { createProposal, confirmProposal } from '../src/modules/compliance/complianceProposalService';
import { getClientSafeGrowthNarrative } from '../src/modules/compliance/companyGrowthNarrative';
import { reconcileClientCompliance } from '../src/modules/compliance/complianceReconcileService';
import { getComplianceWorkspace } from '../src/modules/compliance/complianceWorkspaceService';
import { getCompanyProfileDiscovery, answerCompanyProfileQuestion } from '../src/modules/client-workspace/companyProfileAnswerService';
import { canonicalDigest } from '../src/modules/compliance/canonicalDigest';

const databaseUrl =
  process.env.DEMO_KFT_TEST_DATABASE_URL ||
  process.env.MIGRATION_REPLAY_DATABASE_URL ||
  process.env.CLIENT_IDENTITY_TEST_DATABASE_URL;
const d = databaseUrl ? describe : describe.skip;

function stableId(name: string): string {
  return crypto.createHash('sha256').update(`DEMO_KFT_2026:${name}`).digest('hex').slice(0, 32);
}
const IDS = {
  clientId: stableId('demoClient'),
  adminUserId: stableId('adminUser'),
  identityId: stableId('portalIdentity'),
  workspaceId: stableId('orgWorkspace'),
  factDefinitionId: stableId('factDefinitionEmployeeCount'),
  factDefinitionKey: 'employee_count',
  requirementId: stableId('requirement'),
  requirementVersionId: stableId('requirementVersion'),
  caseComplianceId: stableId('caseCompliance'),
};

d('Demo Kft. compliance + Grow With Us (PostgreSQL)', () => {
  let db: PrismaClient;
  const admin = { userId: IDS.adminUserId, role: 'ADMIN' };

  beforeAll(() => {
    process.env.DATABASE_URL = databaseUrl;
    process.env.ADMINICULUM_DEMO_CONTENT_ENABLED = 'true';
    db = new PrismaClient({ datasources: { db: { url: databaseUrl } } });
  });
  afterAll(async () => {
    await db.$disconnect();
  });

  async function reset() {
    const { execFileSync } = await import('node:child_process');
    const path = await import('node:path');
    const fs = await import('node:fs');
    const possibleTsx = [
      path.resolve(__dirname, '../node_modules/tsx/dist/cli.mjs'),
      path.resolve(process.cwd(), 'node_modules/tsx/dist/cli.mjs'),
      path.resolve(process.cwd(), 'Backend/node_modules/tsx/dist/cli.mjs'),
    ];
    const tsxCli = possibleTsx.find((p) => fs.existsSync(p)) || 'tsx';
    const scriptPath = path.resolve(__dirname, '../scripts/demo-kft-reset.mjs');
    execFileSync(process.execPath, [tsxCli, scriptPath], {
      cwd: path.resolve(__dirname, '..'),
      env: { ...process.env, ADMINICULUM_DEMO_CONTENT_ENABLED: 'true' },
      stdio: 'pipe',
    });
  }

  async function findingCount(): Promise<number> {
    return db.assessmentFinding.count({ where: { clientId: IDS.clientId } });
  }

  it('reset -> 47 -> zero threshold finding; safe Grow unchanged', async () => {
    await reset();
    expect(await findingCount()).toBe(0);
    const grow = await getClientSafeGrowthNarrative(IDS.clientId, db);
    // Baseline has one current fact and no superseded predecessor yet.
    expect(grow.beforeEmployeeCount).toBeNull();
    expect(grow.currentEmployeeCount).toBe(47);
    expect(grow.changed).toBe(false);
    expect(grow.newTopicSafeCount).toBe(0);
  });

  it('generic reconciliation backfills the evaluated 47 baseline — real DOES_NOT_APPLY, no fabricated finding', async () => {
    await reset();
    // Baseline: facts and the approved rule exist, but nothing was ever
    // evaluated through the mutation path — the live gap this PR repairs.
    // (Scope all assertions to the demo requirement: the shared CI database
    // may hold requirements left by other suites.)
    expect(await db.requirementApplicability.count({
      where: { clientId: IDS.clientId, requirementVersionId: IDS.requirementVersionId },
    })).toBe(0);

    const result = await reconcileClientCompliance(admin, IDS.clientId, db);
    expect(result.enrolled).toBe(true);
    expect(result.evaluated).toBeGreaterThanOrEqual(1);
    expect(result.snapshotsCreated).toBeGreaterThanOrEqual(1);

    const rows = await db.requirementApplicability.findMany({
      where: { clientId: IDS.clientId, requirementVersionId: IDS.requirementVersionId },
      select: { id: true, outcome: true },
    });
    expect(rows).toHaveLength(1);
    expect(rows[0].outcome).toBe('DOES_NOT_APPLY');

    // The workspace now projects the real evaluated state.
    const workspace = await getComplianceWorkspace(admin, IDS.clientId, db);
    expect(workspace.summary.evaluatedCount).toBeGreaterThanOrEqual(1);
    const demoArea = workspace.areas.find((area) => area.applicabilityId === rows[0].id);
    expect(demoArea?.outcome).toBe('DOES_NOT_APPLY');
    expect(await db.assessmentFinding.count({
      where: { clientId: IDS.clientId, requirementId: IDS.requirementId },
    })).toBe(0);

    // Idempotent: a second run creates no duplicate current state.
    const second = await reconcileClientCompliance(admin, IDS.clientId, db);
    expect(second.snapshotsCreated).toBe(0);
    expect(second.findingsCreated).toBe(0);
  });

  it('real portal-equivalent typed-fact mutation (valid observedAt) -> 52 -> one engine finding', async () => {
    const now = new Date();
    // Mirror the canonical company-profile answer path: it supersedes the
    // active company fact for the definition before writing the new truth.
    await db.clientFact.updateMany({
      where: { clientId: IDS.clientId, factDefinitionId: IDS.factDefinitionId, scopeType: 'COMPANY', factSubjectId: null, supersededAt: null },
      data: { supersededAt: now },
    });
    const { evaluations } = await createTypedFactAndEvaluate(
      {
        clientId: IDS.clientId,
        factDefinitionId: IDS.factDefinitionId,
        actorUserId: IDS.adminUserId,
        verificationStatus: 'CLIENT_PROVIDED',
        input: {
          scopeType: 'COMPANY',
          numberValue: 52,
          validFrom: now.toISOString(),
          observedAt: now.toISOString(),
          evaluationAt: now.toISOString(),
          sourceReference: `CLIENT_PORTAL_IDENTITY:${IDS.identityId}`,
        },
      },
      db,
    );
    expect(Number(evaluations?.length ?? 0)).toBeGreaterThanOrEqual(1);
    expect(await findingCount()).toBeGreaterThanOrEqual(1);

    const grow = await getClientSafeGrowthNarrative(IDS.clientId, db);
    expect(grow.changed).toBe(true);
    expect(grow.beforeEmployeeCount).toBe(47);
    expect(grow.currentEmployeeCount).toBe(52);
    expect(grow.newTopicSafeCount).toBeGreaterThanOrEqual(1);
    expect(grow.safeFeedback).toContain('új terület');
    expect(grow.safeNowText).toContain('szükséges');
  });

  it('mixed legacy rule key with canonical definition preserves discovery, reevaluation, and Grow continuity', async () => {
    await reset();
    const fact = await db.clientFact.findFirstOrThrow({ where: { clientId: IDS.clientId, factDefinitionId: IDS.factDefinitionId, supersededAt: null } });
    await db.clientFact.update({ where: { id: fact.id }, data: { type: 'DEMO_KFT_COMPANY_EMPLOYEE_COUNT' } });
    const rule = await db.applicabilityRuleVersion.findFirstOrThrow({ where: { requirementVersionId: IDS.requirementVersionId }, select: { id: true, astJson: true } });
    const legacyAst = JSON.parse(JSON.stringify(rule.astJson).replaceAll('employee_count', 'DEMO_KFT_COMPANY_EMPLOYEE_COUNT'));
    await db.applicabilityRuleVersion.update({ where: { id: rule.id }, data: { astJson: legacyAst, canonicalDigest: canonicalDigest(legacyAst) } });
    await db.applicabilityRuleFactDependency.updateMany({ where: { applicabilityRuleVersionId: rule.id }, data: { factKey: 'DEMO_KFT_COMPANY_EMPLOYEE_COUNT' } });
    const mixed = await db.applicabilityRuleFactDependency.findFirstOrThrow({ where: { applicabilityRuleVersionId: rule.id } });
    expect(mixed.factKey).toBe('DEMO_KFT_COMPANY_EMPLOYEE_COUNT');
    expect(mixed.resolvedFactDefinitionId).toBe(IDS.factDefinitionId);
    expect((legacyAst as any).node.left.factKey).toBe('DEMO_KFT_COMPANY_EMPLOYEE_COUNT');
    const legacyDependencyKey = mixed.factKey;
    const legacyResolvedDefinitionId = mixed.resolvedFactDefinitionId;
    const discovery = await getCompanyProfileDiscovery(IDS.identityId, IDS.workspaceId, db);
    expect(discovery.questions).toEqual(expect.arrayContaining([expect.objectContaining({ questionKey: 'employee_count', status: 'ANSWERED', value: 47 })]));
    await answerCompanyProfileQuestion(IDS.identityId, IDS.workspaceId, 'employee_count', { status: 'ANSWERED', numberValue: 52 }, db);
    const afterRule = await db.applicabilityRuleVersion.findUniqueOrThrow({ where: { id: rule.id }, select: { astJson: true } });
    const afterDependency = await db.applicabilityRuleFactDependency.findFirstOrThrow({ where: { applicabilityRuleVersionId: rule.id } });
    expect((afterRule.astJson as any).node.left.factKey).toBe(legacyDependencyKey);
    expect(afterDependency.factKey).toBe(legacyDependencyKey);
    expect(afterDependency.resolvedFactDefinitionId).toBe(legacyResolvedDefinitionId);
    const applicability = await db.requirementApplicability.findFirstOrThrow({ where: { clientId: IDS.clientId, requirementVersionId: IDS.requirementVersionId }, select: { outcome: true } });
    expect(applicability.outcome).toBe('APPLIES');
    const grow = await getClientSafeGrowthNarrative(IDS.clientId, db);
    expect(grow.beforeEmployeeCount).toBe(47);
    expect(grow.currentEmployeeCount).toBe(52);
    expect(await findingCount()).toBeGreaterThanOrEqual(1);
  });

  it('proposal is human-gated: NO Task before confirm; Task created only after confirm', async () => {
    const finding = await db.assessmentFinding.findFirst({ where: { clientId: IDS.clientId }, select: { id: true } });
    expect(finding).not.toBeNull();

    const proposal = await createProposal(admin, {
      findingId: (finding as { id: string }).id,
      // Proposal confirmation requires a linked Case (canonical binding since
      // the Work-Package-spine convergence); the fixture seeds one.
      caseId: IDS.caseComplianceId,
      proposalKind: 'REVIEW',
      title: 'Megfelelőségi áttekintés megindítása',
      suggestedAction: 'Jogi áttekintés a Szervezeti növekedési áttekintés témában.',
    }, db);
    expect(String(proposal.status)).toBe('PROPOSED');
    // No task yet — human confirmation is mandatory.
    expect(proposal.taskId).toBeNull();
    expect(proposal.task).toBeNull();

    // confirmProposal returns the created compliance Task; the CONFIRMED
    // transition lives on the proposal row.
    const task = await confirmProposal(admin, String(proposal.id), db);
    expect(String(task.type)).toBe('COMPLIANCE_PROPOSAL');
    expect(String(task.caseId)).toBe(IDS.caseComplianceId);
    const stored = await db.complianceProposal.findUniqueOrThrow({ where: { id: String(proposal.id) } });
    expect(String(stored.status)).toBe('CONFIRMED');
    expect(String(stored.taskId)).toBe(String(task.id));
    expect(String(stored.confirmedById)).toBe(IDS.adminUserId);
  });

  it('reset restores 47 and removes the demo 52-derived finding truthfully', async () => {
    await reset();
    expect(await findingCount()).toBe(0);
    const grow = await getClientSafeGrowthNarrative(IDS.clientId, db);
    expect(grow.currentEmployeeCount).toBe(47);
    expect(grow.changed).toBe(false);
    expect(grow.newTopicSafeCount).toBe(0);
  });
});
