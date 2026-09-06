import fs from "node:fs";
import path from "node:path";

const workflowPath = path.resolve(
  __dirname,
  "../../.github/workflows/verify-production-schema-readonly.yml",
);
const workflow = fs.readFileSync(workflowPath, "utf8");

const scriptPath = path.resolve(
  __dirname,
  "../scripts/verify-production-schema-readonly.mjs",
);
const script = fs.readFileSync(scriptPath, "utf8");

const legacyWorkflowPath = path.resolve(
  __dirname,
  "../../.github/workflows/verify-production-schema.yml",
);
const legacyWorkflow = fs.readFileSync(legacyWorkflowPath, "utf8");

const workflowRunBlocks = workflow
  .split(/\n\s+run:\s*\|/g)
  .slice(1)
  .map((block) => block.split(/\n\s+-\s+name:|\n\w/)[0])
  .join("\n");

describe("read-only production schema inspector safety contract", () => {
  test("is manual-only, production-scoped, and uses Azure OIDC", () => {
    expect(workflow).toMatch(/on:\s*\n\s+workflow_dispatch:/);
    expect(workflow).not.toMatch(/\n\s+(pull_request|push|schedule):/);
    expect(workflow).toMatch(/environment:\s+production/);
    expect(workflow).toContain("uses: azure/login@v2");
    expect(workflow).toContain("client-id: ${{ vars.AZURE_CLIENT_ID }}");
    expect(workflow).toContain("tenant-id: ${{ vars.AZURE_TENANT_ID }}");
    expect(workflow).toContain(
      "subscription-id: ${{ vars.AZURE_SUBSCRIPTION_ID }}",
    );
    expect(workflow).toContain("id-token: write");
  });

  test("reads DATABASE_URL from the backend App Service and masks it", () => {
    expect(workflow).not.toMatch(/secrets\.DATABASE_URL/);
    expect(workflow).toMatch(
      /az webapp config appsettings list[\s\S]*--query "\[\?name=='DATABASE_URL'\]\.value \| \[0\]"/,
    );
    expect(workflow).not.toMatch(
      /az webapp config appsettings list(?![\s\S]*--query)/,
    );
    expect(workflow).toContain('echo "::add-mask::${DATABASE_URL}"');
    expect(workflow).toContain("set +x");
    expect(workflow).not.toMatch(
      /DATABASE_URL.*GITHUB_(?:OUTPUT|STEP_SUMMARY)/i,
    );
    expect(workflow).not.toMatch(
      /echo\s+["']?\$\{?DATABASE_URL|print\(\s*["']DATABASE_URL|console\.log\(\s*["']DATABASE_URL|process\.stdout.*DATABASE_URL/i,
    );
    expect(script).not.toMatch(
      /print\(\s*["']DATABASE_URL|console\.log\(\s*["']DATABASE_URL|process\.stdout\.write\([^)]*DATABASE_URL/i,
    );
  });

  test("exposes no arbitrary SQL or script capability", () => {
    const inputsBlock = workflow.split("inputs:")[1]?.split("\n\n")[0] ?? "";
    expect(inputsBlock).toContain("migration_name");
    expect(inputsBlock).toContain("table_name");
    expect(inputsBlock).toContain("columns_json");
    expect(inputsBlock).not.toMatch(
      /^\s{6,}(query|sql|where|script|command|js|javascript|shell)\s*:/im,
    );
    // Inputs must reach the script only through env:, never through shell
    // interpolation inside a run block.
    expect(workflowRunBlocks).not.toContain("inputs.");
    expect(workflow).toContain(
      "SCHEMA_PROOF_MIGRATION_NAME: ${{ inputs.migration_name }}",
    );
    expect(workflow).toContain(
      "SCHEMA_PROOF_TABLE_NAME: ${{ inputs.table_name }}",
    );
    expect(workflow).toContain(
      "SCHEMA_PROOF_COLUMNS_JSON: ${{ inputs.columns_json }}",
    );
  });

  test("validates every identifier before connecting", () => {
    expect(script).toContain("/^[0-9]{14}_[A-Za-z0-9_]+$/");
    expect(script).toContain("/^[A-Za-z_][A-Za-z0-9_]*$/");
    expect(script).toContain("validateInputs");
    const validateIndex = script.indexOf("validateInputs()");
    const connectIndex = script.indexOf("await client.connect()");
    expect(validateIndex).toBeGreaterThan(-1);
    expect(connectIndex).toBeGreaterThan(validateIndex);
  });

  test("identifier validation rejects injection shapes", () => {
    const migrationPattern = /^[0-9]{14}_[A-Za-z0-9_]+$/;
    const identifierPattern = /^[A-Za-z_][A-Za-z0-9_]*$/;

    expect(migrationPattern.test("20260906000000_organization_person_contact_fields")).toBe(true);
    expect(migrationPattern.test("20260906100000_organization_person_contact_fields")).toBe(true);
    for (const bad of [
      "20260906000000_x' OR '1'='1",
      "20260906000000_x;DROP TABLE users",
      "20260906000000_x -- comment",
      "20260906000000_x/**/",
      "20260906000000_x(1)",
      "20260906000000_x|id",
      "20260906000000_x$(whoami)",
      "20260906000000_x`id`",
      "x", // too short timestamp
      "20260906000000000_x",
    ]) {
      expect(migrationPattern.test(bad)).toBe(false);
    }

    expect(identifierPattern.test("organization_persons")).toBe(true);
    expect(identifierPattern.test("email")).toBe(true);
    expect(identifierPattern.test("_prisma_migrations")).toBe(true);
    for (const bad of [
      "email' OR '1'='1",
      "email;DELETE",
      "e mail",
      "email--x",
      "email(x)",
      "email=id",
      "email`x`",
      "$(id)",
      'email"',
      "9email",
      "",
    ]) {
      expect(identifierPattern.test(bad)).toBe(false);
    }
  });

  test("uses a read-only transaction with rollback", () => {
    expect(script).toContain('client.query("BEGIN READ ONLY")');
    expect(script).toContain("SHOW transaction_read_only");
    expect(script).toContain('client.query("ROLLBACK")');
  });

  test("fails closed when the transaction is not read-only", () => {
    // The SHOW result must be compared against "on" and gate the proof.
    expect(script).toMatch(/transaction_read_only\s*===\s*"on"/);

    const showIndex = script.indexOf(
      'client.query("SHOW transaction_read_only")',
    );
    const gateMatch = script.match(
      /if\s*\(\s*!\s*transactionReadOnly\s*\)\s*\{\s*throw new Error\(/,
    );
    expect(showIndex).toBeGreaterThan(-1);
    expect(gateMatch).not.toBeNull();
    const gateIndex = script.indexOf(gateMatch![0]);
    expect(gateIndex).toBeGreaterThan(showIndex);

    // PASS may only be emitted after the fail-closed gate.
    const passIndex = script.indexOf(
      'print("READ_ONLY_SCHEMA_PROOF", "PASS")',
    );
    expect(passIndex).toBeGreaterThan(gateIndex);

    // A thrown gate error still reaches ROLLBACK before connection close,
    // and the outer catch turns it into READ_ONLY_SCHEMA_PROOF=FAIL.
    const rollbackIndex = script.indexOf('client.query("ROLLBACK")');
    const endIndex = script.indexOf("await client.end()");
    const catchIndex = script.indexOf("main().catch");
    expect(rollbackIndex).toBeGreaterThan(gateIndex);
    expect(endIndex).toBeGreaterThan(rollbackIndex);
    expect(catchIndex).toBeGreaterThan(endIndex);
    expect(script.slice(catchIndex)).toContain(
      'print("READ_ONLY_SCHEMA_PROOF", "FAIL")',
    );
    expect(script).toContain("finally");
  });

  test("performs only parameterized metadata SELECTs", () => {
    expect(script).toContain("WHERE migration_name = $1");
    expect(script).toContain('FROM "_prisma_migrations"');
    expect(script).toContain("information_schema.tables");
    expect(script).toContain("information_schema.columns");
    expect(script).toContain("table_name = $1");
    expect(script).toContain("column_name = ANY($2::text[])");
    expect(script).toContain("values:");
    // No identifier is ever concatenated or interpolated into SQL text.
    expect(script).not.toMatch(/text:\s*`[^`]*\$\{/);

    // Every FROM/JOIN target inside query strings must be a metadata source.
    const sqlSources = [
      ...[...script.matchAll(/text:\s*`([^`]*)`/g)].map((m) => m[1]),
      ...[...script.matchAll(/client\.query\("([^"]+)"\)/g)].map((m) => m[1]),
    ];
    expect(sqlSources.length).toBeGreaterThan(0);
    const targets = [
      ...sqlSources
        .join("\n")
        .matchAll(/\b(?:FROM|JOIN)\s+([^\s,;)]+)/gi),
    ].map((match) => match[1].replace(/"/g, ""));
    expect(targets.length).toBeGreaterThan(0);
    for (const target of targets) {
      expect([
        "_prisma_migrations",
        "information_schema.tables",
        "information_schema.columns",
      ]).toContain(target);
    }
  });

  test("contains no mutating SQL, DDL, or prisma migration commands", () => {
    expect(script).not.toMatch(
      /\b(INSERT|UPDATE|DELETE|ALTER|CREATE|DROP|TRUNCATE|GRANT|REVOKE|CALL)\b/i,
    );
    const combined = `${workflow}\n${script}`;
    expect(combined).not.toMatch(
      /prisma\s+(migrate|db\s+push)|npx\s+prisma\s+(migrate|db\s+push)/i,
    );
    expect(script).not.toMatch(/migrate deploy|migrate dev|db push/i);
  });

  test("executes no arbitrary code or shell", () => {
    expect(script).not.toMatch(/\beval\s*\(|new\s+Function|child_process|execSync|spawnSync/);
    expect(workflowRunBlocks).not.toMatch(/\$\{\{\s*(github\.event|inputs\.)/);
  });

  test("prints only sanitized markers", () => {
    expect(script).toContain('print("DATABASE_MUTATED", "NO")');
    expect(script).toContain('print("READ_ONLY_SCHEMA_PROOF", "PASS")');
    // No SELECT returns row payloads into markers: markers are YES/NO/count only.
    expect(script).not.toMatch(
      /print\([^,]+,\s*(?:row|rows|migration|extra|table|columnRows)\b(?!\s*\?)/,
    );
  });

  test("existing W2B production schema proof is preserved", () => {
    expect(legacyWorkflow).toContain("environment: production");
    expect(legacyWorkflow).toContain("20260901220000_w2b_case_first_time");
    expect(legacyWorkflow).toContain("BEGIN READ ONLY");
    expect(legacyWorkflow).toContain("::add-mask::");
    expect(legacyWorkflow).toContain("time_entries");
    expect(legacyWorkflow).toContain("W2B_SCHEMA_PROVEN");
  });
});
