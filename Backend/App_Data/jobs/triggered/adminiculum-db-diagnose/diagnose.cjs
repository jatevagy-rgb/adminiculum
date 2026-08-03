// READ-ONLY production diagnostic. SELECT-only: never writes, never runs
// migrate/resolve, never edits _prisma_migrations. Emits sanitized JSON.
const { Client } = require('pg');
function sanitize(s){ return String(s==null?'':s).replace(/postgres(?:ql)?s?:\/\/[^\s'"`]+/gi,'[redacted]').replace(/(password|secret|token)=([^\s&]+)/gi,'$1=[redacted]'); }
const client = new Client({ connectionString: process.env.DATABASE_URL, ssl: /localhost|127\.0\.0\.1/.test(process.env.DATABASE_URL)?undefined:{rejectUnauthorized:false} });
(async () => {
  if (process.env.WEBSITE_SITE_NAME !== 'adminiculumbackend-b1-01') throw new Error('unexpected environment');
  await client.connect();
  const unfinished = await client.query(`SELECT migration_name, started_at, finished_at, rolled_back_at, applied_steps_count, left(logs,400) AS logs FROM "_prisma_migrations" WHERE finished_at IS NULL AND rolled_back_at IS NULL ORDER BY started_at`);
  const target = await client.query(`SELECT migration_name, started_at, finished_at, rolled_back_at, applied_steps_count, left(logs,800) AS logs FROM "_prisma_migrations" WHERE migration_name=$1 ORDER BY started_at DESC LIMIT 1`, ['20260515190000_add_lawyer_handoff_package']);
  const trig = await client.query(`SELECT migration_name, finished_at, rolled_back_at FROM "_prisma_migrations" WHERE migration_name=$1 ORDER BY started_at DESC LIMIT 1`, ['20260802200000_client_identity_grant_trigger_fix']);
  const objs = await client.query(`SELECT to_regclass('public.lawyer_handoff_packages') IS NOT NULL AS table_exists,
    EXISTS(SELECT 1 FROM pg_type WHERE typname='LawyerHandoffStatus') AS enum_status,
    EXISTS(SELECT 1 FROM pg_type WHERE typname='LawyerHandoffPackageType') AS enum_type,
    EXISTS(SELECT 1 FROM pg_type WHERE typname='LawyerHandoffDecision') AS enum_decision`);
  const map = rows => rows.map(r => ({ ...r, logs: r.logs===undefined?undefined:sanitize(r.logs) }));
  process.stdout.write(JSON.stringify({ READONLY_DIAGNOSTIC:true, unfinishedCount: unfinished.rowCount, unfinished: map(unfinished.rows), targetFailedMigration: target.rows[0]?{...target.rows[0], logs:sanitize(target.rows[0].logs)}:null, triggerMigration: trig.rows[0]||null, objects: objs.rows[0] })+"\n");
  await client.end();
})().catch(e => { process.stdout.write(JSON.stringify({ READONLY_DIAGNOSTIC:true, error: sanitize(e.message) })+"\n"); process.exitCode=1; });
