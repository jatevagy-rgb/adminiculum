const { Client } = require('pg');

const databaseUrl = process.env.TASK_LIFECYCLE_TEST_DATABASE_URL;
const describeWithDatabase = databaseUrl ? describe : describe.skip;

const ids = {
  baselineTask: 'tl-baseline-task',
  baselineTime: 'tl-baseline-time',
  baselineHandoff: 'tl-baseline-handoff',
  submitter: 'tl-schema-submit-user',
  reviewer: 'tl-schema-review-user',
  client: 'tl-schema-client',
  matter: 'tl-schema-matter',
  case: 'tl-schema-case',
  task: 'tl-schema-task',
  documentOne: 'tl-schema-document-1',
  documentTwo: 'tl-schema-document-2',
  versionOne: 'tl-schema-document-version-1',
  versionTwo: 'tl-schema-document-version-2',
  historicalTime: 'tl-schema-time-historical',
  taskTimeOne: 'tl-schema-time-task-1',
  taskTimeTwo: 'tl-schema-time-task-2',
  legacyHandoff: 'tl-schema-legacy-handoff',
  submissionOne: 'tl-schema-submission-1',
  submissionTwo: 'tl-schema-submission-2',
};

describeWithDatabase('task lifecycle additive schema', () => {
  let client: any;

  beforeAll(async () => {
    const parsed = new URL(databaseUrl as string);
    expect(['127.0.0.1', 'localhost', '::1']).toContain(parsed.hostname);
    expect(parsed.pathname.replace(/^\//, '')).toMatch(/^adminiculum_task_lifecycle_schema_/);

    client = new Client({ connectionString: databaseUrl });
    await client.connect();

    const identity = await client.query('SELECT current_database() AS database_name');
    expect(identity.rows[0].database_name).toBe(parsed.pathname.replace(/^\//, ''));

    await client.query(`
      DELETE FROM "task_submission_time_entries" WHERE "id" LIKE 'tl-schema-%';
      DELETE FROM "task_review_decisions" WHERE "id" LIKE 'tl-schema-%';
      DELETE FROM "task_submission_documents" WHERE "id" LIKE 'tl-schema-%';
      DELETE FROM "task_submissions" WHERE "id" LIKE 'tl-schema-%';
      DELETE FROM "lawyer_handoff_packages" WHERE "id" LIKE 'tl-schema-%';
      DELETE FROM "time_entries" WHERE "id" LIKE 'tl-schema-%';
      DELETE FROM "document_versions" WHERE "id" LIKE 'tl-schema-%';
      DELETE FROM "documents" WHERE "id" LIKE 'tl-schema-%';
      DELETE FROM "tasks" WHERE "id" LIKE 'tl-schema-%';
      DELETE FROM "cases" WHERE "id" LIKE 'tl-schema-%';
      DELETE FROM "matters" WHERE "id" LIKE 'tl-schema-%';
      DELETE FROM "clients" WHERE "id" LIKE 'tl-schema-%';
      DELETE FROM "users" WHERE "id" LIKE 'tl-schema-%';
    `);

    await client.query(
      `INSERT INTO "users" ("id", "email", "name", "role", "status", "skills", "isActive", "createdAt", "updatedAt")
       VALUES
         ($1, 'task-schema-submitter@example.invalid', 'Schema Submitter', 'LAWYER', 'ACTIVE', ARRAY[]::TEXT[], true, NOW(), NOW()),
         ($2, 'task-schema-reviewer@example.invalid', 'Schema Reviewer', 'PARTNER', 'ACTIVE', ARRAY[]::TEXT[], true, NOW(), NOW())`,
      [ids.submitter, ids.reviewer],
    );
    await client.query(
      `INSERT INTO "clients" ("id", "name", "createdAt", "updatedAt") VALUES ($1, 'Synthetic schema client', NOW(), NOW())`,
      [ids.client],
    );
    await client.query(
      `INSERT INTO "matters" ("id", "title", "matterType", "status", "totalMinutes", "openedAt", "createdAt", "updatedAt", "clientId")
       VALUES ($1, 'Synthetic schema matter', 'CONTRACT', 'OPEN', 0, NOW(), NOW(), NOW(), $2)`,
      [ids.matter, ids.client],
    );
    await client.query(
      `INSERT INTO "cases" ("id", "caseNumber", "title", "caseType", "status", "priority", "receivedAt", "createdAt", "updatedAt", "clientId", "matterId", "createdById", "assignedLawyerId")
       VALUES ($1, 'TL-SCHEMA-001', 'Synthetic schema case', 'CONTRACT_REVIEW', 'CLIENT_INPUT', 'MEDIUM', NOW(), NOW(), NOW(), $2, $3, $4, $5)`,
      [ids.case, ids.client, ids.matter, ids.submitter, ids.reviewer],
    );
    await client.query(
      `INSERT INTO "tasks" ("id", "title", "taskType", "status", "priority", "requiredSkills", "caseId", "matterId", "assignedToId", "assignedById", "createdAt", "updatedAt")
       VALUES ($1, 'Synthetic schema task', 'OTHER', 'IN_PROGRESS', 'MEDIUM', ARRAY[]::TEXT[], $2, $3, $4, $5, NOW(), NOW())`,
      [ids.task, ids.case, ids.matter, ids.submitter, ids.reviewer],
    );
    await client.query(
      `INSERT INTO "documents" ("id", "name", "mimeType", "category", "currentVersion", "currentVersionInt", "isLatest", "createdAt", "updatedAt", "caseId", "clientId")
       VALUES
         ($1, 'Synthetic output one', 'application/pdf', 'OTHER', 1, 1, true, NOW(), NOW(), $3, $4),
         ($2, 'Synthetic output two', 'application/pdf', 'OTHER', 1, 1, true, NOW(), NOW(), $3, $4)`,
      [ids.documentOne, ids.documentTwo, ids.case, ids.client],
    );
    await client.query(
      `INSERT INTO "document_versions" ("id", "version", "name", "uploadedById", "createdAt", "documentId")
       VALUES
         ($1, 1, 'Synthetic version one', $3, NOW(), $4),
         ($2, 1, 'Synthetic version two', $3, NOW(), $5)`,
      [ids.versionOne, ids.versionTwo, ids.submitter, ids.documentOne, ids.documentTwo],
    );
    await client.query(
      `INSERT INTO "time_entries" ("id", "workType", "description", "minutes", "billable", "workDate", "createdAt", "updatedAt", "matterId", "userId", "taskId")
       VALUES
         ($1, 'REVIEW', 'Historical synthetic entry', 15, true, NOW(), NOW(), NOW(), $4, $5, NULL),
         ($2, 'DRAFTING', 'Task synthetic entry one', 30, true, NOW(), NOW(), NOW(), $4, $5, $6),
         ($3, 'REVIEW', 'Task synthetic entry two', 20, true, NOW(), NOW(), NOW(), $4, $5, $6)`,
      [ids.historicalTime, ids.taskTimeOne, ids.taskTimeTwo, ids.matter, ids.submitter, ids.task],
    );
    await client.query(
      `INSERT INTO "lawyer_handoff_packages" ("id", "caseId", "status", "packageType", "createdAt", "updatedAt")
       VALUES ($1, $2, 'DRAFT', 'STANDARD', NOW(), NOW())`,
      [ids.legacyHandoff, ids.case],
    );
    await client.query(
      `INSERT INTO "task_submissions" ("id", "taskId", "revisionNumber", "status", "createdById", "submittedById", "assignedReviewerId", "workSummary", "requestedAttention", "idempotencyKey", "createdAt", "updatedAt", "submittedAt", "returnedAt")
       VALUES ($1, $2, 1, 'RETURNED', $3, $3, $4, 'Synthetic first revision', 'DETAILED_REVIEW', 'tl-schema-submit-key-1', NOW(), NOW(), NOW(), NOW())`,
      [ids.submissionOne, ids.task, ids.submitter, ids.reviewer],
    );
    await client.query(
      `INSERT INTO "task_submissions" ("id", "taskId", "revisionNumber", "status", "createdById", "assignedReviewerId", "supersedesSubmissionId", "createdAt", "updatedAt")
       VALUES ($1, $2, 2, 'DRAFT', $3, $4, $5, NOW(), NOW())`,
      [ids.submissionTwo, ids.task, ids.submitter, ids.reviewer, ids.submissionOne],
    );
  });

  afterAll(async () => {
    await client?.end();
  });

  it('persists sequential revisions and their supersedes relation', async () => {
    const result = await client.query(
      `SELECT "revisionNumber", "supersedesSubmissionId" FROM "task_submissions" WHERE "taskId" = $1 ORDER BY "revisionNumber"`,
      [ids.task],
    );
    expect(result.rows).toEqual([
      { revisionNumber: 1, supersedesSubmissionId: null },
      { revisionNumber: 2, supersedesSubmissionId: ids.submissionOne },
    ]);
  });

  it('rejects a duplicate task revision number', async () => {
    await expect(
      client.query(
        `INSERT INTO "task_submissions" ("id", "taskId", "revisionNumber", "status", "createdById", "assignedReviewerId", "createdAt", "updatedAt")
         VALUES ('tl-schema-duplicate-revision', $1, 2, 'CANCELLED', $2, $3, NOW(), NOW())`,
        [ids.task, ids.submitter, ids.reviewer],
      ),
    ).rejects.toMatchObject({ code: '23505' });
  });

  it('rejects a duplicate submission idempotency key', async () => {
    await expect(
      client.query(
        `INSERT INTO "task_submissions" ("id", "taskId", "revisionNumber", "status", "createdById", "assignedReviewerId", "idempotencyKey", "createdAt", "updatedAt")
         VALUES ('tl-schema-duplicate-idempotency', $1, 3, 'CANCELLED', $2, $3, 'tl-schema-submit-key-1', NOW(), NOW())`,
        [ids.task, ids.submitter, ids.reviewer],
      ),
    ).rejects.toMatchObject({ code: '23505' });
  });

  it('rejects a second active draft for the task', async () => {
    await expect(
      client.query(
        `INSERT INTO "task_submissions" ("id", "taskId", "revisionNumber", "status", "createdById", "assignedReviewerId", "createdAt", "updatedAt")
         VALUES ('tl-schema-second-draft', $1, 3, 'DRAFT', $2, $3, NOW(), NOW())`,
        [ids.task, ids.submitter, ids.reviewer],
      ),
    ).rejects.toMatchObject({ code: '23505' });
  });

  it('allows multiple typed documents on one submission', async () => {
    await client.query(
      `INSERT INTO "task_submission_documents" ("id", "submissionId", "documentId", "documentVersionId", "role", "createdAt", "createdById")
       VALUES
         ('tl-schema-document-link-1', $1, $2, $3, 'PRIMARY_OUTPUT', NOW(), $6),
         ('tl-schema-document-link-2', $1, $4, $5, 'SUPPORTING_DOCUMENT', NOW(), $6)`,
      [ids.submissionOne, ids.documentOne, ids.versionOne, ids.documentTwo, ids.versionTwo, ids.submitter],
    );
    const result = await client.query(`SELECT COUNT(*)::int AS count FROM "task_submission_documents" WHERE "submissionId" = $1`, [ids.submissionOne]);
    expect(result.rows[0].count).toBe(2);
  });

  it('rejects a duplicate submission document role link', async () => {
    await expect(
      client.query(
        `INSERT INTO "task_submission_documents" ("id", "submissionId", "documentId", "role", "createdAt", "createdById")
         VALUES ('tl-schema-document-link-duplicate', $1, $2, 'PRIMARY_OUTPUT', NOW(), $3)`,
        [ids.submissionOne, ids.documentOne, ids.submitter],
      ),
    ).rejects.toMatchObject({ code: '23505' });
  });

  it('allows multiple time entries on one submitted revision', async () => {
    await client.query(
      `INSERT INTO "task_submission_time_entries" ("id", "submissionId", "timeEntryId", "createdAt")
       VALUES
         ('tl-schema-time-link-1', $1, $2, NOW()),
         ('tl-schema-time-link-2', $1, $3, NOW())`,
      [ids.submissionOne, ids.taskTimeOne, ids.taskTimeTwo],
    );
    const result = await client.query(`SELECT COUNT(*)::int AS count FROM "task_submission_time_entries" WHERE "submissionId" = $1`, [ids.submissionOne]);
    expect(result.rows[0].count).toBe(2);
  });

  it('prevents one frozen time entry from joining another revision', async () => {
    await expect(
      client.query(
        `INSERT INTO "task_submission_time_entries" ("id", "submissionId", "timeEntryId", "createdAt")
         VALUES ('tl-schema-time-link-duplicate', $1, $2, NOW())`,
        [ids.submissionTwo, ids.taskTimeOne],
      ),
    ).rejects.toMatchObject({ code: '23505' });
  });

  it('persists the explicitly assigned reviewer relation', async () => {
    const result = await client.query(
      `SELECT u."id" FROM "task_submissions" s JOIN "users" u ON u."id" = s."assignedReviewerId" WHERE s."id" = $1`,
      [ids.submissionOne],
    );
    expect(result.rows[0].id).toBe(ids.reviewer);
  });

  it('persists one immutable review decision relation', async () => {
    await client.query(
      `INSERT INTO "task_review_decisions" ("id", "submissionId", "reviewerId", "decision", "requestedCorrections", "requiresFullReview", "createdAt")
       VALUES ('tl-schema-decision-1', $1, $2, 'RETURNED', 'Synthetic correction request', true, NOW())`,
      [ids.submissionOne, ids.reviewer],
    );
    const result = await client.query(`SELECT "decision", "reviewerId" FROM "task_review_decisions" WHERE "submissionId" = $1`, [ids.submissionOne]);
    expect(result.rows[0]).toEqual({ decision: 'RETURNED', reviewerId: ids.reviewer });
  });

  it('rejects a second final decision for the same revision', async () => {
    await expect(
      client.query(
        `INSERT INTO "task_review_decisions" ("id", "submissionId", "reviewerId", "decision", "createdAt")
         VALUES ('tl-schema-decision-duplicate', $1, $2, 'APPROVED', NOW())`,
        [ids.submissionOne, ids.reviewer],
      ),
    ).rejects.toMatchObject({ code: '23505' });
  });

  it('rejects deleting a task that owns submission history', async () => {
    // PostgreSQL error code varies by minor version / FK enforcement path
    // (RESTRICT can surface as 23001 or foreign-key violation 23503).
    let error: any;
    try {
      await client.query(`DELETE FROM "tasks" WHERE "id" = $1`, [ids.task]);
    } catch (e) {
      error = e;
    }
    expect(error).toBeDefined();
    expect(['23001', '23503']).toContain(error.code);
  });

  it('rejects deleting a document linked to submission history', async () => {
    let error: any;
    try {
      await client.query(`DELETE FROM "documents" WHERE "id" = $1`, [ids.documentOne]);
    } catch (e) {
      error = e;
    }
    expect(error).toBeDefined();
    expect(['23001', '23503']).toContain(error.code);
  });

  it('keeps historical time entries valid without task attribution', async () => {
    const result = await client.query(`SELECT "taskId" FROM "time_entries" WHERE "id" = $1`, [ids.baselineTime]);
    expect(result.rows[0].taskId).toBeNull();
  });

  it('persists nullable task attribution on new time entries', async () => {
    const result = await client.query(`SELECT "taskId" FROM "time_entries" WHERE "id" = $1`, [ids.taskTimeOne]);
    expect(result.rows[0].taskId).toBe(ids.task);
  });

  it('leaves the legacy lawyer handoff package readable and unchanged', async () => {
    const result = await client.query(
      `SELECT "id", "caseId", "status", "packageType" FROM "lawyer_handoff_packages" WHERE "id" = $1`,
      [ids.baselineHandoff],
    );
    expect(result.rows[0]).toEqual({ id: ids.baselineHandoff, caseId: 'tl-baseline-case', status: 'DRAFT', packageType: 'STANDARD' });
  });

  it('keeps existing task rows valid without submission-specific columns', async () => {
    const result = await client.query(`SELECT "id", "status" FROM "tasks" WHERE "id" = $1`, [ids.baselineTask]);
    expect(result.rows[0]).toEqual({ id: ids.baselineTask, status: 'IN_PROGRESS' });
  });

  it('does not introduce sensitive content or integration fields', async () => {
    const result = await client.query(
      `SELECT LOWER("column_name") AS name
       FROM information_schema.columns
       WHERE table_schema = 'public'
         AND table_name IN ('task_submissions', 'task_submission_documents', 'task_review_decisions', 'task_submission_time_entries')`,
    );
    const columns = result.rows.map((row: { name: string }) => row.name);
    expect(columns).not.toEqual(expect.arrayContaining([
      'documentbody',
      'emailbody',
      'workspacetext',
      'rawproviderpayload',
      'storagepath',
      'authenticationtoken',
      'aiprompt',
      'airesult',
    ]));
  });
});
