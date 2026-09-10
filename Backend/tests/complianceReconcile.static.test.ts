import { readFileSync } from 'node:fs';
import path from 'node:path';

const root = path.join(__dirname, '..');
const service = readFileSync(path.join(root, 'src/modules/compliance/complianceReconcileService.ts'), 'utf8');
const routes = readFileSync(path.join(root, 'src/modules/compliance/complianceOverviewRoutes.ts'), 'utf8');
const workspaceService = readFileSync(path.join(root, 'src/modules/compliance/complianceWorkspaceService.ts'), 'utf8');

describe('compliance reconciliation — initial/backfill evaluation (static)', () => {
  it('exposes one explicit POST action on the existing compliance router', () => {
    expect(routes).toContain("router.post('/clients/:clientId/reconcile'");
    expect(routes).toContain('reconcileClientCompliance');
    expect(routes).toContain('COMPLIANCE_RECONCILE_INTERNAL_ERROR');
    expect((routes.match(/router\.post\('/g) ?? []).length).toBe(1);
  });

  it('keeps the existing workforce client access gate — no weaker permission is introduced', () => {
    expect(service).toContain('await assertClientReadAccess(actor, clientId, prisma);');
    expect(service).not.toMatch(/role\s*===\s*'ADMIN'|isAdmin|req\.user/);
  });

  it('runs inside the existing serializable transaction pattern with conflict retry', () => {
    expect(service).toContain('Prisma.TransactionIsolationLevel.Serializable');
    expect(service).toContain('FindingMaterializationIdentityConflictError');
    expect(service).toMatch(/P2034/);
    expect(service).toMatch(/attempt\s*<\s*3/);
  });

  it('begins from the current effective approved rule set, not from a mutated fact', () => {
    expect(service).toContain('tx.requirement.findMany');
    expect(service).toMatch(/status:\s*'APPROVED'/);
    expect(service).toMatch(/effectiveFrom:\s*\{\s*lte:\s*now\s*\}/);
    expect(service).toMatch(/effectiveTo:\s*\{\s*gt:\s*now\s*\}/);
    expect(service).toContain('resolveEffectiveRequirementRuleVersion');
  });

  it('reuses the existing evaluator and finding materialization — no second engine', () => {
    expect(service).toContain('createRequirementApplicabilityInTx');
    expect(service).toContain('materializeRequirementApplicabilityFindingInTx');
    // No rule AST interpretation, comparison operators, or outcome derivation here.
    expect(service).not.toMatch(/ruleAst|astJson|'COMPARE'|'LITERAL'|operator\s*===/);
    expect(service).not.toMatch(/outcome\s*[:=]/);
  });

  it('never creates, updates, or supersedes ClientFact rows', () => {
    expect(service).not.toMatch(/clientFact\.(create|createMany|update|updateMany|upsert|delete|deleteMany)/);
    expect(service).not.toMatch(/supersedeFact|supersededAt/);
  });

  it('skips the same resolvable states as the mutation path and rethrows ambiguous corpus states', () => {
    expect(service).toContain('RESOLVABLE_SKIPS');
    expect(service).toContain('NO_EFFECTIVE_REQUIREMENT_VERSION');
    expect(service).toContain('NO_CURRENT_APPROVED_RULE_VERSION');
    expect(service).toContain('RULE_SCOPE_UNRESOLVED');
    expect(service).toContain('throw caught');
  });

  it('evaluates subject-scoped rules only for real, non-archived client subjects', () => {
    expect(service).toContain('tx.factSubject.findMany');
    expect(service).toMatch(/where:\s*\{\s*clientId,\s*scopeType,\s*archivedAt:\s*null\s*\}/);
    expect(service).toContain('if (!subjectIds.length) continue;');
  });

  it('is a no-op for non-enrolled clients', () => {
    expect(service).toContain("complianceEnrollmentStatus === 'ENROLLED'");
  });

  it('contains no demo constants, thresholds, or product special-casing', () => {
    expect(service + routes).not.toMatch(/DEMO_KFT|Demo Kft|employee_count|\b47\b|\b50\b|\b52\b/i);
  });

  it('leaves the read-only workspace GET untouched', () => {
    expect(routes).toContain("router.get('/clients/:clientId/workspace'");
    expect(workspaceService).not.toMatch(/\.(create|createMany|update|updateMany|upsert|delete|deleteMany)\s*\(/);
    expect(workspaceService).not.toContain('reconcileClientCompliance');
  });
});
