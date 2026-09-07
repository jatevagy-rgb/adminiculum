// Read-only production enum metadata proof.
//
// Data-only inputs via environment variables:
//   ENUM_PROOF_ENUM_NAME            required, e.g. LegalAnalysisStatus
//   ENUM_PROOF_EXPECTED_VALUES_JSON required JSON array of expected enum
//                                   labels in exact expected order (max 64)
//   ENUM_PROOF_SCHEMA_NAME          optional schema name (default "public")
//   DATABASE_URL                    required, never printed
//
// Every identifier is validated against a strict whitelist BEFORE the
// database connection is opened. Metadata lookups pass names as bound
// parameters ($1/$2); no SQL text is ever built from input. Expected enum
// labels are only compared against catalog output in memory — they are
// never part of a query string.

import pg from "pg";

const IDENTIFIER_PATTERN = /^[A-Za-z_][A-Za-z0-9_]*$/;
const MAX_EXPECTED_VALUES = 64;
const MAX_LABEL_LENGTH = 128;

const print = (name, value) => process.stdout.write(`${name}=${value}\n`);

const fail = (message) => {
  process.stderr.write(`ERROR: ${message}\n`);
  // Pre-connection validation cannot have touched the database.
  print("DATABASE_MUTATED", "NO");
  print("READ_ONLY_ENUM_PROOF", "FAIL");
  process.exit(1);
};

const readOptional = (name) => {
  const raw = process.env[name];
  return typeof raw === "string" ? raw.trim() : "";
};

const parseExpectedValues = () => {
  const raw = readOptional("ENUM_PROOF_EXPECTED_VALUES_JSON");
  if (!raw) fail("ENUM_PROOF_EXPECTED_VALUES_JSON is required.");
  let parsed;
  try {
    parsed = JSON.parse(raw);
  } catch {
    fail("ENUM_PROOF_EXPECTED_VALUES_JSON is not valid JSON.");
  }
  if (!Array.isArray(parsed) || parsed.length === 0) {
    fail("ENUM_PROOF_EXPECTED_VALUES_JSON must be a non-empty JSON array.");
  }
  if (parsed.length > MAX_EXPECTED_VALUES) {
    fail(`ENUM_PROOF_EXPECTED_VALUES_JSON exceeds the bound of ${MAX_EXPECTED_VALUES} entries.`);
  }
  const values = [];
  for (const entry of parsed) {
    if (
      typeof entry !== "string" ||
      entry.length === 0 ||
      entry.length > MAX_LABEL_LENGTH
    ) {
      fail("ENUM_PROOF_EXPECTED_VALUES_JSON contains an invalid enum label.");
    }
    values.push(entry);
  }
  return values;
};

const validateInputs = () => {
  const enumName = readOptional("ENUM_PROOF_ENUM_NAME");
  if (!enumName) fail("ENUM_PROOF_ENUM_NAME is required.");
  if (!IDENTIFIER_PATTERN.test(enumName)) {
    fail("ENUM_PROOF_ENUM_NAME failed validation.");
  }

  const expectedValues = parseExpectedValues();

  const schemaName = readOptional("ENUM_PROOF_SCHEMA_NAME") || "public";
  if (!IDENTIFIER_PATTERN.test(schemaName)) {
    fail("ENUM_PROOF_SCHEMA_NAME failed validation.");
  }

  if (!process.env.DATABASE_URL) fail("DATABASE_URL is required.");

  return { enumName, expectedValues, schemaName };
};

const yesNo = (value) => (value ? "YES" : "NO");

const main = async () => {
  const { enumName, expectedValues, schemaName } = validateInputs();

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
        "Production enum proof transaction is not read-only.",
      );
    }

    const rows = (
      await client.query({
        text: `SELECT e.enumlabel AS label
               FROM pg_type t
               JOIN pg_enum e ON e.enumtypid = t.oid
               JOIN pg_namespace n ON n.oid = t.typnamespace
               WHERE n.nspname = $1 AND t.typname = $2
               ORDER BY e.enumsortorder ASC`,
        values: [schemaName, enumName],
      })
    ).rows;

    const actualValues = rows.map((row) => row.label);
    const enumPresent = actualValues.length > 0;

    const expectedSet = new Set(expectedValues);
    const actualSet = new Set(actualValues);
    const noMissing = expectedValues.every((value) => actualSet.has(value));
    const noUnexpected = actualValues.every((value) => expectedSet.has(value));
    const exactValuesMatch =
      enumPresent && noMissing && noUnexpected;
    const exactOrderMatch =
      exactValuesMatch &&
      expectedValues.length === actualValues.length &&
      expectedValues.every((value, index) => value === actualValues[index]);

    print("SCHEMA_NAME", schemaName);
    print("ENUM_NAME", enumName);
    print("ENUM_PRESENT", yesNo(enumPresent));
    print("EXPECTED_VALUE_COUNT", String(expectedValues.length));
    print("ACTUAL_VALUE_COUNT", String(actualValues.length));
    print("EXACT_VALUES_MATCH", yesNo(exactValuesMatch));
    print("EXACT_ORDER_MATCH", yesNo(exactOrderMatch));
    print("DATABASE_MUTATED", "NO");
    print(
      "READ_ONLY_ENUM_PROOF",
      exactOrderMatch ? "PASS" : "FAIL",
    );
    if (!exactOrderMatch) {
      process.exitCode = 1;
    }
  } finally {
    await client.query("ROLLBACK").catch(() => {});
    await client.end();
  }
};

main().catch(() => {
  process.stderr.write("ERROR: Production enum metadata proof failed.\n");
  print("DATABASE_MUTATED", "NO");
  print("READ_ONLY_ENUM_PROOF", "FAIL");
  process.exit(1);
});
