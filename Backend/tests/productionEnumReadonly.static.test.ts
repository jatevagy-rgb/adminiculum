import fs from "node:fs";
import path from "node:path";

const workflowPath = path.resolve(
  __dirname,
  "../../.github/workflows/verify-production-enum-readonly.yml",
);
const workflow = fs.readFileSync(workflowPath, "utf8");

const scriptPath = path.resolve(
  __dirname,
  "../scripts/verify-production-enum-readonly.mjs",
);
const script = fs.readFileSync(scriptPath, "utf8");

const schemaInspectorWorkflowPath = path.resolve(
  __dirname,
  "../../.github/workflows/verify-production-schema-readonly.yml",
);
const schemaInspectorWorkflow = fs.readFileSync(
  schemaInspectorWorkflowPath,
  "utf8",
);

const schemaInspectorScriptPath = path.resolve(
  __dirname,
  "../scripts/verify-production-schema-readonly.mjs",
);
const schemaInspectorScript = fs.readFileSync(
  schemaInspectorScriptPath,
  "utf8",
);

const workflowRunBlocks = workflow
  .split(/\n\s+run:\s*\|/g)
  .slice(1)
  .map((block) => block.split(/\n\s+-\s+name:|\n\w/)[0])
  .join("\n");

describe("read-only production enum inspector safety contract", () => {
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
    expect(workflow).not.toMatch(/client-secret|azure_credentials/i);
  });

  test("reads DATABASE_URL from the backend App Service and masks it", () => {
    expect(workflow).not.toMatch(/secrets\.DATABASE_URL/);
    expect(workflow).toMatch(
      /az webapp config appsettings list[\s\S]*--query "\[\?name=='DATABASE_URL'\]\.value \| \[0\]"/,
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
    expect(inputsBlock).toContain("enum_name");
    expect(inputsBlock).toContain("expected_values_json");
    expect(inputsBlock).toContain("schema_name");
    expect(inputsBlock).not.toMatch(
      /^\s{6,}(query|sql|where|script|command|js|javascript|shell|table)\s*:/im,
    );
    // Inputs must reach the script only through env:, never through shell
    // interpolation inside a run block.
    expect(workflowRunBlocks).not.toContain("inputs.");
    expect(workflow).toContain(
      "ENUM_PROOF_ENUM_NAME: ${{ inputs.enum_name }}",
    );
    expect(workflow).toContain(
      "ENUM_PROOF_EXPECTED_VALUES_JSON: ${{ inputs.expected_values_json }}",
    );
    expect(workflow).toContain(
      "ENUM_PROOF_SCHEMA_NAME: ${{ inputs.schema_name }}",
    );
  });

  test("validates every identifier before connecting", () => {
    expect(script).toContain("/^[A-Za-z_][A-Za-z0-9_]*$/");
    expect(script).toContain("validateInputs");
    const validateIndex = script.indexOf("validateInputs()");
    const connectIndex = script.indexOf("await client.connect()");
    expect(validateIndex).toBeGreaterThan(-1);
    expect(connectIndex).toBeGreaterThan(validateIndex);
  });

  test("identifier validation rejects injection shapes", () => {
    const identifierPattern = /^[A-Za-z_][A-Za-z0-9_]*$/;

    expect(identifierPattern.test("LegalAnalysisStatus")).toBe(true);
    expect(identifierPattern.test("legal_analyses")).toBe(true);
    expect(identifierPattern.test("public")).toBe(true);
    expect(identifierPattern.test("_private")).toBe(true);
    for (const bad of [
      "LegalAnalysisStatus' OR '1'='1",
      "x;DELETE",
      "e num",
      "enum--x",
      "enum(x)",
      "enum=x",
      "enum`x`",
      "$(id)",
      'enum"',
      "9enum",
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

    // The metadata SELECT may only run after the fail-closed gate.
    const enumQueryIndex = script.indexOf("FROM pg_type t");
    expect(enumQueryIndex).toBeGreaterThan(gateIndex);

    // A thrown gate error still reaches ROLLBACK before connection close,
    // and the outer catch turns it into READ_ONLY_ENUM_PROOF=FAIL.
    const rollbackIndex = script.indexOf('client.query("ROLLBACK")');
    const endIndex = script.indexOf("await client.end()");
    const catchIndex = script.indexOf("main().catch");
    expect(rollbackIndex).toBeGreaterThan(gateIndex);
    expect(endIndex).toBeGreaterThan(rollbackIndex);
    expect(catchIndex).toBeGreaterThan(endIndex);
    expect(script.slice(catchIndex)).toContain(
      'print("READ_ONLY_ENUM_PROOF", "FAIL")',
    );
    expect(script).toContain("finally");
  });

  test("outer runtime catch emits only a fixed sanitized error", () => {
    const catchIndex = script.indexOf("main().catch");
    expect(catchIndex).toBeGreaterThan(-1);
    const catchBlock = script.slice(catchIndex);

    expect(catchBlock).not.toMatch(
      /error\.message|error\?\.message|String\(error\)|error\.stack|error\.cause|console\.error\(error|\$\{\s*error|JSON\.stringify\(error/,
    );
    expect(catchBlock).toMatch(/main\(\)\.catch\(\(\)\s*=>/);
    expect(catchBlock).toContain(
      '"ERROR: Production enum metadata proof failed.\\n"',
    );
    expect(catchBlock).toContain('print("DATABASE_MUTATED", "NO")');
    expect(catchBlock).toContain('print("READ_ONLY_ENUM_PROOF", "FAIL")');
    expect(catchBlock).toContain("process.exit(1)");
  });

  test("pre-connection fail() emits DATABASE_MUTATED=NO then PROOF=FAIL", () => {
    const failDeclIndex = script.indexOf("const fail = (message) =>");
    expect(failDeclIndex).toBeGreaterThan(-1);
    const failBody = script.slice(
      failDeclIndex,
      script.indexOf("};", failDeclIndex),
    );
    const mutatedIndex = failBody.indexOf('print("DATABASE_MUTATED", "NO")');
    const failMarkerIndex = failBody.indexOf(
      'print("READ_ONLY_ENUM_PROOF", "FAIL")',
    );
    const exitIndex = failBody.indexOf("process.exit(1)");
    expect(mutatedIndex).toBeGreaterThan(-1);
    expect(failMarkerIndex).toBeGreaterThan(mutatedIndex);
    expect(exitIndex).toBeGreaterThan(failMarkerIndex);
  });

  test("pre-connection validation errors remain fixed safe messages", () => {
    const failCalls = [...script.matchAll(/fail\(([^;]+?)\);/gs)].map(
      (m) => m[1],
    );
    expect(failCalls.length).toBeGreaterThan(0);
    for (const args of failCalls) {
      expect(args).not.toMatch(/\berror\b|\.stack|\.cause|process\.env/);
      expect(args).not.toContain("DATABASE_URL=");
      expect(args).not.toMatch(/\$\{?process\.env\.DATABASE_URL/);
    }
  });

  test("performs only parameterized metadata SELECTs on enum catalogs", () => {
    expect(script).toContain("FROM pg_type t");
    expect(script).toContain("JOIN pg_enum e ON e.enumtypid = t.oid");
    expect(script).toContain("JOIN pg_namespace n ON n.oid = t.typnamespace");
    expect(script).toContain("WHERE n.nspname = $1 AND t.typname = $2");
    expect(script).toContain("ORDER BY e.enumsortorder ASC");
    expect(script).toContain("values: [schemaName, enumName]");
    // No identifier is ever concatenated or interpolated into SQL text.
    expect(script).not.toMatch(/text:\s*`[^`]*\$\{/);

    const sqlSources = [
      ...[...script.matchAll(/text:\s*`([^`]*)`/g)].map((m) => m[1]),
      ...[...script.matchAll(/client\.query\("([^"]+)"\)/g)].map((m) => m[1]),
    ];
    expect(sqlSources.length).toBeGreaterThan(0);
    const targets = [
      ...sqlSources.join("\n").matchAll(/\b(?:FROM|JOIN)\s+([^\s,;)]+)/gi),
    ].map((match) => match[1].replace(/"/g, ""));
    expect(targets.length).toBeGreaterThan(0);
    for (const target of targets) {
      expect(["pg_type", "pg_enum", "pg_namespace"]).toContain(target);
    }
  });

  test("requires exact value and order match — superset or reorder fails", () => {
    expect(script).toContain('print("ENUM_PRESENT", yesNo(enumPresent))');
    expect(script).toContain('print("EXPECTED_VALUE_COUNT"');
    expect(script).toContain('print("ACTUAL_VALUE_COUNT"');
    expect(script).toContain('print("EXACT_VALUES_MATCH"');
    expect(script).toContain('print("EXACT_ORDER_MATCH"');
    // PASS is gated on exactOrderMatch, which requires set equality
    // (no missing, no unexpected) AND identical ordered arrays.
    expect(script).toMatch(/noMissing\s*&&\s*noUnexpected/);
    expect(script).toMatch(
      /expectedValues\.every\(\(value,\s*index\)\s*=>\s*value\s*===\s*actualValues\[index\]\)/,
    );
    expect(script).toMatch(/exactOrderMatch\s*\?\s*"PASS"\s*:\s*"FAIL"/);
  });

  test("contains no mutating SQL, DDL, or prisma migration commands", () => {
    expect(script).not.toMatch(
      /\b(INSERT|UPDATE|DELETE|UPSERT|ALTER|CREATE|DROP|TRUNCATE|GRANT|REVOKE|CALL)\b/i,
    );
    const combined = `${workflow}\n${script}`;
    expect(combined).not.toMatch(
      /prisma\s+(migrate|db\s+push)|npx\s+prisma\s+(migrate|db\s+push)/i,
    );
    expect(script).not.toMatch(/migrate deploy|migrate dev|db push|baseline/i);
  });

  test("executes no arbitrary code or shell", () => {
    expect(script).not.toMatch(
      /\beval\s*\(|new\s+Function|child_process|execSync|spawnSync/,
    );
    expect(workflowRunBlocks).not.toMatch(/\$\{\{\s*(github\.event|inputs\.)/);
  });

  test("prints only sanitized markers", () => {
    expect(script).toContain('print("DATABASE_MUTATED", "NO")');
    // Enum labels never reach stdout: markers are YES/NO/count/name only.
    expect(script).not.toMatch(
      /print\([^,]+,\s*(?:row|rows|actualValues|expectedValues)\b(?!\s*\?)/,
    );
  });

  test("merged #177 schema inspector remains unchanged", () => {
    expect(schemaInspectorWorkflow).toContain("environment: production");
    expect(schemaInspectorWorkflow).toContain("uses: azure/login@v2");
    expect(schemaInspectorWorkflow).toContain("workflow_dispatch");
    expect(schemaInspectorWorkflow).toContain('echo "::add-mask::${DATABASE_URL}"');
    expect(schemaInspectorScript).toContain('client.query("BEGIN READ ONLY")');
    expect(schemaInspectorScript).toContain("SHOW transaction_read_only");
    expect(schemaInspectorScript).toContain('client.query("ROLLBACK")');
    expect(schemaInspectorScript).toContain('print("DATABASE_MUTATED", "NO")');
    expect(schemaInspectorScript).toContain(
      'print("READ_ONLY_SCHEMA_PROOF", "PASS")',
    );
  });
});
