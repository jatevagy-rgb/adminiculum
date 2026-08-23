import fs from 'node:fs';
import path from 'node:path';

const root = path.resolve(__dirname, '..');
const schema = fs.readFileSync(path.join(root, 'prisma', 'schema.prisma'), 'utf8');
const migration = fs.readFileSync(path.join(root, 'prisma', 'migrations', '20260823090000_phase6_slice_b_requirement_rule_foundation', 'migration.sql'), 'utf8');
const workflow = fs.readFileSync(path.resolve(root, '..', '.github', 'workflows', 'backend-postgresql-integration.yml'), 'utf8');
const packageJson = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8')) as { scripts: Record<string, string> };

describe('Phase 6 Slice B static safety', () => {
  it('declares the global requirement and rule persistence models without client ownership', () => {
    for (const model of ['ComplianceDomain', 'Requirement', 'RequirementVersion', 'RequirementCitation', 'ApplicabilityRuleVersion', 'ApplicabilityRuleFactDependency']) {
      expect(schema).toContain(`model ${model}`);
    }
    for (const model of ['ComplianceDomain', 'Requirement', 'RequirementVersion', 'RequirementCitation', 'ApplicabilityRuleVersion', 'ApplicabilityRuleFactDependency']) {
      const block = schema.match(new RegExp(`model ${model} \\{([\\s\\S]*?)\\n\\}`));
      expect(block?.[1]).not.toContain('clientId');
    }
    expect(schema).toContain('onDelete: Restrict');
    expect(schema).toContain('@@unique([requirementId, versionKey])');
    expect(schema).toContain('@@unique([requirementVersionId, ruleVersionKey])');
  });

  it('keeps stable Requirement identity separate from version approval lifecycle', () => {
    const requirementStatus = schema.match(/enum RequirementStatus \{([\s\S]*?)\n\}/)?.[1] ?? '';
    expect(requirementStatus.match(/\b(ACTIVE|DEPRECATED|RETIRED)\b/g)).toEqual(['ACTIVE', 'DEPRECATED', 'RETIRED']);
    expect(schema).toContain('status           RequirementStatus @default(ACTIVE)');
    expect(migration).toContain('CREATE TYPE "RequirementStatus" AS ENUM (\'ACTIVE\', \'DEPRECATED\', \'RETIRED\')');
    expect(migration).toContain('"status" "RequirementStatus" NOT NULL DEFAULT \'ACTIVE\'');
  });

  it('wires the Slice B PostgreSQL suite into the package and tracked workflow step', () => {
    expect(packageJson.scripts['test:phase6-slice-b:db']).toBe('jest --runInBand tests/phase6SliceBRequirementRule.integration.test.ts');
    expect(workflow).toContain('phase6-slice-b=PENDING');
    expect(workflow).toContain('name: Phase 6 Slice B requirement/rule foundation PG');
    expect(workflow).toContain('npm run test:phase6-slice-b:db');
    expect(workflow).toContain('phase6-slice-b=$rc');
    expect(workflow).toContain('[phase6-slice-b]="Phase 6 Slice B requirement/rule foundation"');
  });

  it('keeps the Slice B migration additive, unseeded, and DB-enforced', () => {
    for (const table of ['compliance_domains', 'requirements', 'requirement_versions', 'requirement_citations', 'applicability_rule_versions', 'applicability_rule_fact_dependencies']) {
      expect(migration).toContain(`CREATE TABLE "${table}"`);
    }
    expect(migration).toContain('applicability_rule_versions_one_approved_per_requirement_version');
    expect(migration).toContain("WHERE \"status\" = 'APPROVED'");
    expect(migration).toContain("canonicalDigest\" ~ '^[0-9a-f]{64}$'");
    expect(migration).toContain('requirement_versions_approved_support_check');
    expect(migration).not.toMatch(/\bINSERT\s+INTO\b/i);
    expect(migration).not.toMatch(/\bDROP\s+(TABLE|COLUMN|TYPE)\b/i);
  });

  it('keeps the compliance engine disabled and excludes evaluator/runtime routes', () => {
    // Slice D owns RequirementApplicability persistence; Slice B still must not
    // expose evaluator/runtime routes or enable the compliance engine itself.
    expect(schema).not.toMatch(/model EvaluationSnapshot\b/);
    expect(fs.readFileSync(path.join(root, 'src', 'middleware', 'featureAvailability.ts'), 'utf8')).toContain("=== 'true'");
    expect(workflow).not.toContain('test:phase6-slice-b:db\n          rc=$?');
  });
});
