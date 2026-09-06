// Read-only production schema metadata proof.
//
// Data-only inputs via environment variables:
//   SCHEMA_PROOF_MIGRATION_NAME        required, e.g. 20260906000000_x
//   SCHEMA_PROOF_EXTRA_MIGRATIONS_JSON optional JSON array of migration names (max 16)
//   SCHEMA_PROOF_TABLE_NAME            optional public-schema table name (empty = skip)
//   SCHEMA_PROOF_COLUMNS_JSON          optional JSON array of column names (max 64)
//   DATABASE_URL                       required, never printed
//
// Every identifier is validated against a strict whitelist BEFORE the
// database connection is opened. Metadata lookups pass names as bound
// parameters ($1/$2); no SQL text is ever built from input.

import pg from "pg";

const MIGRATION_NAME_PATTERN = /^[0-9]{14}_[A-Za-z0-9_]+$/;
const IDENTIFIER_PATTERN = /^[A-Za-z_][A-Za-z0-9_]*$/;
const MAX_EXTRA_MIGRATIONS = 16;
const MAX_COLUMNS = 64;

const print = (name, value) => process.stdout.write(`${name}=${value}\n`);

const fail = (message) => {
  process.stderr.write(`ERROR: ${message}\n`);
  print("READ_ONLY_SCHEMA_PROOF", "FAIL");
  process.exit(1);
};

const readOptional = (name) => {
  const raw = process.env[name];
  return typeof raw === "string" ? raw.trim() : "";
};

const parseNameArray = (envName, pattern, max, label) => {
  const raw = readOptional(envName);
  if (!raw) return [];
  let parsed;
  try {
    parsed = JSON.parse(raw);
  } catch {
    fail(`${envName} is not valid JSON.`);
  }
  if (!Array.isArray(parsed)) fail(`${envName} must be a JSON array.`);
  if (parsed.length > max) fail(`${envName} exceeds the bound of ${max} entries.`);
  const names = [];
  for (const entry of parsed) {
    if (typeof entry !== "string" || !pattern.test(entry)) {
      fail(`${envName} contains an invalid ${label}: ${JSON.stringify(entry)}`);
    }
    if (!names.includes(entry)) names.push(entry);
  }
  return names;
};

const validateInputs = () => {
  const migrationName = readOptional("SCHEMA_PROOF_MIGRATION_NAME");
  if (!migrationName) fail("SCHEMA_PROOF_MIGRATION_NAME is required.");
  if (!MIGRATION_NAME_PATTERN.test(migrationName)) {
    fail("SCHEMA_PROOF_MIGRATION_NAME failed validation.");
  }

  const extraMigrationNames = parseNameArray(
    "SCHEMA_PROOF_EXTRA_MIGRATIONS_JSON",
    MIGRATION_NAME_PATTERN,
    MAX_EXTRA_MIGRATIONS,
    "migration name",
  ).filter((name) => name !== migrationName);

  const tableName = readOptional("SCHEMA_PROOF_TABLE_NAME");
  if (tableName && !IDENTIFIER_PATTERN.test(tableName)) {
    fail("SCHEMA_PROOF_TABLE_NAME failed validation.");
  }

  const columnNames = parseNameArray(
    "SCHEMA_PROOF_COLUMNS_JSON",
    IDENTIFIER_PATTERN,
    MAX_COLUMNS,
    "column name",
  );
  if (columnNames.length > 0 && !tableName) {
    fail("SCHEMA_PROOF_TABLE_NAME is required when columns are requested.");
  }

  if (!process.env.DATABASE_URL) fail("DATABASE_URL is required.");

  return { migrationName, extraMigrationNames, tableName, columnNames };
};

const yesNo = (value) => (value ? "YES" : "NO");

const fetchMigrationRecord = async (client, migrationName) =>
  (
    await client.query({
      text: `SELECT migration_name,
                    finished_at IS NOT NULL AS finished,
                    rolled_back_at IS NOT NULL AS rolled_back
             FROM "_prisma_migrations"
             WHERE migration_name = $1
             ORDER BY started_at DESC
             LIMIT 1`,
      values: [migrationName],
    })
  ).rows[0];

const main = async () => {
  const { migrationName, extraMigrationNames, tableName, columnNames } =
    validateInputs();

  const { Client } = pg;
  const client = new Client({ connectionString: process.env.DATABASE_URL });

  await client.connect();
  try {
    await client.query("BEGIN READ ONLY");

    const readOnlyRow = (
      await client.query("SHOW transaction_read_only")
    ).rows[0];
    const transactionReadOnly =
      readOnlyRow?.transaction_read_only === "on";
    print("TRANSACTION_READ_ONLY", yesNo(transactionReadOnly));
    if (!transactionReadOnly) {
      throw new Error(
        "Production schema proof transaction is not read-only.",
      );
    }

    const migration = await fetchMigrationRecord(client, migrationName);
    print("MIGRATION_NAME", migrationName);
    print("MIGRATION_RECORD_PRESENT", yesNo(Boolean(migration)));
    print("MIGRATION_FINISHED", yesNo(Boolean(migration?.finished)));
    print("MIGRATION_ROLLED_BACK", yesNo(Boolean(migration?.rolled_back)));

    for (const extraName of extraMigrationNames) {
      const extra = await fetchMigrationRecord(client, extraName);
      print("EXTRA_MIGRATION_NAME", extraName);
      print("EXTRA_MIGRATION_RECORD_PRESENT", yesNo(Boolean(extra)));
      print("EXTRA_MIGRATION_FINISHED", yesNo(Boolean(extra?.finished)));
      print("EXTRA_MIGRATION_ROLLED_BACK", yesNo(Boolean(extra?.rolled_back)));
    }

    const unfinished = (
      await client.query({
        text: `SELECT COUNT(*)::int AS count
               FROM "_prisma_migrations"
               WHERE finished_at IS NULL AND rolled_back_at IS NULL`,
        values: [],
      })
    ).rows[0];
    print("UNFINISHED_MIGRATION_COUNT", String(unfinished?.count ?? 0));

    if (tableName) {
      const table = (
        await client.query({
          text: `SELECT table_name
                 FROM information_schema.tables
                 WHERE table_schema = 'public' AND table_name = $1`,
          values: [tableName],
        })
      ).rows[0];
      print("TABLE_NAME", tableName);
      print("TABLE_PRESENT", yesNo(Boolean(table)));

      const columnRows = columnNames.length
        ? (
            await client.query({
              text: `SELECT column_name, is_nullable
                     FROM information_schema.columns
                     WHERE table_schema = 'public' AND table_name = $1
                       AND column_name = ANY($2::text[])`,
              values: [tableName, columnNames],
            })
          ).rows
        : [];
      for (const columnName of columnNames) {
        const row = columnRows.find(
          (entry) => entry.column_name === columnName,
        );
        print(`COLUMN_${columnName}_PRESENT`, yesNo(Boolean(row)));
        print(
          `COLUMN_${columnName}_NULLABLE`,
          row ? (row.is_nullable === "YES" ? "YES" : "NO") : "UNKNOWN",
        );
      }
    }

    print("DATABASE_MUTATED", "NO");
    print("READ_ONLY_SCHEMA_PROOF", "PASS");
  } finally {
    await client.query("ROLLBACK").catch(() => {});
    await client.end();
  }
};

main().catch((error) => {
  process.stderr.write(`ERROR: ${error?.message ?? error}\n`);
  print("DATABASE_MUTATED", "NO");
  print("READ_ONLY_SCHEMA_PROOF", "FAIL");
  process.exit(1);
});
