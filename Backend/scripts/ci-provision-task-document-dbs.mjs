// CI provisioning for the four task/document PostgreSQL suites that carry their
// own disposable-database name guards:
//
//   - documentVersionPersistence -> adminiculum_document_versions_backend_*
//   - taskLifecycleSchema        -> adminiculum_task_lifecycle_schema_*
//   - taskReviewDecision         -> adminiculum_task_review_decision_backend_*
//   - taskSubmission             -> adminiculum_task_submission_backend_*
//
// Each suite refuses to run against anything other than a loopback host and a
// database name matching its guard. This script creates those databases as
// deterministic schema copies of the already-replayed canonical schema
// (adminiculum_replay_ci) via PostgreSQL TEMPLATE, then seeds the pre-migration
// baseline rows the taskLifecycleSchema suite relies on.
//
// Safety:
//   - only ever runs against a loopback PostgreSQL host;
//   - only ever creates the four exact whitelisted database names above;
//   - connects to the maintenance `postgres` database (never to the TEMPLATE
//     source), so CREATE DATABASE ... TEMPLATE cannot collide with the current
//     session's own connection;
//   - never touches production connection strings.

import { Client } from 'pg';

const adminUrl = process.env.PG_ADMIN_URL;
const TEMPLATE_DB = 'adminiculum_replay_ci';

if (!adminUrl) {
  console.error('PROVISION FAILED: PG_ADMIN_URL is required.');
  process.exit(2);
}

let parsed;
try {
  parsed = new URL(adminUrl);
} catch {
  console.error('PROVISION REFUSED: PG_ADMIN_URL is not a valid URL.');
  process.exit(3);
}
if (!['127.0.0.1', 'localhost', '::1'].includes(parsed.hostname)) {
  console.error('PROVISION REFUSED: PG_ADMIN_URL must target a loopback host.');
  process.exit(3);
}

const SUITES = [
  { name: 'adminiculum_document_versions_backend_ci', env: 'DOCUMENT_VERSION_TEST_DATABASE_URL' },
  { name: 'adminiculum_task_lifecycle_schema_ci', env: 'TASK_LIFECYCLE_TEST_DATABASE_URL' },
  { name: 'adminiculum_task_review_decision_backend_ci', env: 'TASK_REVIEW_DECISION_TEST_DATABASE_URL' },
  { name: 'adminiculum_task_submission_backend_ci', env: 'TASK_SUBMISSION_TEST_DATABASE_URL' },
];

// Baseline rows the taskLifecycleSchema suite expects to already exist before it
// runs (legacy rows that predate the additive task-submission schema). Seeded
// only into the lifecycle database, after its schema copy is created.
const BASELINE_INSERTS = [
  `INSERT INTO users (id, email, name, role, status, skills, "isActive", "createdAt", "updatedAt")
   VALUES ('tl-baseline-user', 'tl-baseline@example.invalid', 'Baseline User', 'LAWYER', 'ACTIVE', ARRAY[]::TEXT[], true, NOW(), NOW())`,
  `INSERT INTO clients (id, name, "createdAt", "updatedAt")
   VALUES ('tl-baseline-client', 'Baseline Client', NOW(), NOW())`,
  `INSERT INTO matters (id, title, "matterType", status, "totalMinutes", "openedAt", "createdAt", "updatedAt", "clientId")
   VALUES ('tl-baseline-matter', 'Baseline Matter', 'CONTRACT', 'OPEN', 0, NOW(), NOW(), NOW(), 'tl-baseline-client')`,
  `INSERT INTO cases (id, "caseNumber", title, "caseType", status, priority, "receivedAt", "createdAt", "updatedAt", "clientId", "matterId", "createdById", "assignedLawyerId")
   VALUES ('tl-baseline-case', 'TL-BASELINE-001', 'Baseline Case', 'CONTRACT_REVIEW', 'CLIENT_INPUT', 'MEDIUM', NOW(), NOW(), NOW(), 'tl-baseline-client', 'tl-baseline-matter', 'tl-baseline-user', 'tl-baseline-user')`,
  `INSERT INTO tasks (id, title, "taskType", status, priority, "requiredSkills", "caseId", "matterId", "assignedToId", "assignedById", "createdAt", "updatedAt")
   VALUES ('tl-baseline-task', 'Baseline Task', 'OTHER', 'IN_PROGRESS', 'MEDIUM', ARRAY[]::TEXT[], 'tl-baseline-case', 'tl-baseline-matter', 'tl-baseline-user', 'tl-baseline-user', NOW(), NOW())`,
  `INSERT INTO time_entries (id, "workType", description, minutes, billable, "workDate", "createdAt", "updatedAt", "matterId", "userId", "taskId")
   VALUES ('tl-baseline-time', 'REVIEW', 'Baseline time entry', 15, true, NOW(), NOW(), NOW(), 'tl-baseline-matter', 'tl-baseline-user', NULL)`,
  `INSERT INTO lawyer_handoff_packages (id, "caseId", status, "packageType", "createdAt", "updatedAt")
   VALUES ('tl-baseline-handoff', 'tl-baseline-case', 'DRAFT', 'STANDARD', NOW(), NOW())`,
];

// Build a connection string to a specific database reusing the admin URL's
// credentials, host and port (safe: database name is a fixed whitelisted one).
function urlForDatabase(database) {
  const copy = new URL(adminUrl);
  copy.pathname = `/${database}`;
  copy.search = '';
  return copy.toString();
}

async function main() {
  const admin = new Client({ connectionString: adminUrl });
  await admin.connect();
  try {
    const identity = await admin.query('SELECT current_database() AS database');
    console.log(`admin database : ${identity.rows[0].database}`);

    for (const suite of SUITES) {
      await admin.query(`DROP DATABASE IF EXISTS ${suite.name}`);
      await admin.query(`CREATE DATABASE ${suite.name} TEMPLATE ${TEMPLATE_DB}`);
      console.log(`created ${suite.name} from template ${TEMPLATE_DB}`);
    }

    const lifecycle = new Client({
      connectionString: urlForDatabase('adminiculum_task_lifecycle_schema_ci'),
    });
    await lifecycle.connect();
    try {
      for (const statement of BASELINE_INSERTS) {
        await lifecycle.query(statement);
      }
      const baseline = await lifecycle.query(
        `SELECT count(*)::int AS count FROM tasks WHERE id = 'tl-baseline-task'`,
      );
      if (baseline.rows[0].count !== 1) {
        throw new Error('task lifecycle baseline rows were not seeded');
      }
      console.log('task lifecycle baseline rows seeded');
    } finally {
      await lifecycle.end();
    }

    console.log('PROVISION OK: four dedicated task/document databases ready.');
  } finally {
    await admin.end();
  }
}

main().catch((error) => {
  console.error('PROVISION FAILED:', error.message);
  process.exitCode = 1;
});