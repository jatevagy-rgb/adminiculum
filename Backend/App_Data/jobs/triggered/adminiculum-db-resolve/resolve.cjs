// One-off: runs ONLY the prisma-standard `migrate resolve --rolled-back` for the
// pre-baseline failed migration. No manual _prisma_migrations SQL, no db push,
// no mark-applied. Guarded to the exact migration name and site.
const { spawnSync } = require('node:child_process');
const path = require('node:path');
const appRoot = process.env.MIGRATION_WEBJOB_ROOT || path.resolve(__dirname, '../../../..');
const prismaBin = path.join(appRoot, 'node_modules', '.bin', 'prisma');
const schemaPath = path.join(appRoot, 'prisma', 'schema.prisma');
const MIGRATION = '20260515190000_add_lawyer_handoff_package';
function sanitize(s){ return String(s==null?'':s).replace(/postgres(?:ql)?s?:\/\/[^\s'"`]+/gi,'[redacted]').replace(/(password|secret|token)=([^\s&]+)/gi,'$1=[redacted]').slice(-3000); }
function emit(o){ process.stdout.write(JSON.stringify(o)+"\n"); }
try {
  if (process.env.WEBSITE_SITE_NAME !== 'adminiculumbackend-b1-01') throw new Error('unexpected environment');
  if (!process.env.DATABASE_URL) throw new Error('database configuration missing');
  const r = spawnSync(prismaBin, ['migrate','resolve','--rolled-back', MIGRATION, '--schema', schemaPath], { cwd: appRoot, env: process.env, encoding: 'utf8', shell: false });
  if (r.status !== 0) throw new Error('prisma migrate resolve failed: ' + sanitize(r.stderr || r.stdout));
  emit({ RESOLVE: true, migration: MIGRATION, state: 'ROLLED_BACK', exitCode: r.status, stdout: sanitize(r.stdout) });
} catch (e) { emit({ RESOLVE: true, migration: MIGRATION, state: 'FAILED', error: sanitize(e.message) }); process.exitCode = 1; }
