import fs from "node:fs";
import path from "node:path";

const workflowPath = path.resolve(
  __dirname,
  "../../.github/workflows/verify-production-schema.yml",
);
const workflow = fs.readFileSync(workflowPath, "utf8");

describe("production schema proof safety contract", () => {
  test("is manual-only and production-scoped", () => {
    expect(workflow).toMatch(/on:\s*\n\s+workflow_dispatch:\s*\n\s*\n/);
    expect(workflow).toMatch(/environment:\s+production/);
    expect(workflow).toContain("uses: azure/login@v2");
    expect(workflow).toContain("client-id: ${{ vars.AZURE_CLIENT_ID }}");
    expect(workflow).toContain("tenant-id: ${{ vars.AZURE_TENANT_ID }}");
    expect(workflow).toContain(
      "subscription-id: ${{ vars.AZURE_SUBSCRIPTION_ID }}",
    );
    expect(workflow).not.toMatch(/secrets\.DATABASE_URL/);
    expect(workflow).toMatch(
      /az webapp config appsettings list[\s\S]*--query "\[\?name=='DATABASE_URL'\]\.value \| \[0\]"/,
    );
    expect(workflow).not.toMatch(
      /az webapp config appsettings list(?![\s\S]*--query)/,
    );
    expect(workflow).toContain('echo "::add-mask::${DATABASE_URL}"');
    expect(workflow).not.toMatch(
      /DATABASE_URL.*GITHUB_(?:OUTPUT|STEP_SUMMARY)/i,
    );
    expect(workflow).toContain("set +x");
    expect(workflow).not.toMatch(
      /echo\s+["']?\$\{?DATABASE_URL|print\(\s*["']DATABASE_URL|console\.log\(\s*["']DATABASE_URL/i,
    );
  });

  test("requires a read-only transaction and rollback", () => {
    expect(workflow).toContain("BEGIN READ ONLY");
    expect(workflow).toContain("client.query('ROLLBACK')");
    expect(workflow).toMatch(/SELECT\s+column_name/i);
    expect(workflow).toMatch(/SELECT\s+COUNT\(\*\)/i);
  });

  test("contains no mutating SQL or migration commands", () => {
    const sql = workflow.split("node --input-type=module <<'NODE'")[1] ?? "";
    expect(sql).not.toMatch(
      /\b(INSERT|UPDATE|DELETE|ALTER|CREATE|DROP|TRUNCATE|GRANT|REVOKE|CALL|DO)\b/i,
    );
    expect(workflow).not.toMatch(
      /prisma\s+(migrate|db\s+push)|npx\s+prisma\s+(migrate|db\s+push)/i,
    );
  });

  test("contains no deployment action", () => {
    expect(workflow).not.toMatch(
      /az\s+webapp\s+deploy|azure\/webapps-deploy|ZipDeploy|deploy_backend/i,
    );
  });
});
