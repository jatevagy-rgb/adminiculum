import { execSync } from 'child_process';

// SEC-0A hardening: this is a DESTRUCTIVE script. Destructive reset permission is
// bound to the ACTUAL parsed database target, not merely an environment label.
// Approvals: DATABASE_URL must parse, ALLOW_DESTRUCTIVE_RESET=true, and an
// explicit APPROVED_DESTRUCTIVE_TARGET ("host:database") must exactly match the
// parsed host+db. Production-like (Azure-managed) targets fail closed regardless
// of NODE_ENV. Never print credentials.
const DATABASE_URL = process.env.DATABASE_URL;

if (!DATABASE_URL) {
  console.error('ERROR: DATABASE_URL env var is required.');
  process.exit(1);
}

if (String(process.env.NODE_ENV || '').toLowerCase() === 'production') {
  console.error('ERROR: apply-staging-migration must NEVER run in production. Use the canonical migration WebJob.');
  process.exit(1);
}

if (process.env.ALLOW_DESTRUCTIVE_RESET !== 'true') {
  console.error('ERROR: destructive reset requires ALLOW_DESTRUCTIVE_RESET=true.');
  process.exit(1);
}

let target;
try {
  target = new URL(DATABASE_URL);
} catch {
  console.error('ERROR: DATABASE_URL is not a valid URL; refusing destructive reset.');
  process.exit(1);
}

const host = target.hostname.toLowerCase();
const database = target.pathname.replace(/^\//, '').split('?')[0].toLowerCase();
const approved = String(process.env.APPROVED_DESTRUCTIVE_TARGET || '').toLowerCase();
const approvedSignature = `${host}:${database}`;

if (!approved || approved !== approvedSignature) {
  console.error('ERROR: destructive reset target not approved. Set APPROVED_DESTRUCTIVE_TARGET=host:database exactly matching the parsed target.');
  process.exit(1);
}

// Production-like (Azure-managed PostgreSQL) targets fail closed regardless of NODE_ENV.
if (/\.database\.azure\.com$/.test(host)) {
  console.error('ERROR: Azure-managed database host is not an approved destructive-reset target.');
  process.exit(1);
}

console.log('=== Adminiculum Staging Migration Reset & Apply ===');
console.log('Approved destructive target verified (host/db only, no credentials).');
console.log('');

console.log('Running prisma migrate reset --force...');
try {
  const result = execSync('npx prisma migrate reset --force', {
    env: { ...process.env, DATABASE_URL: DATABASE_URL },
    cwd: process.cwd(),
    encoding: 'utf8',
  });
  console.log(result);
  console.log('\nMigration reset and apply completed successfully!');
} catch (err) {
  console.error('Migration stdout:', err.stdout);
  console.error('Migration stderr:', err.stderr);
  console.error('\nMigration failed with exit code:', err.status);
  process.exit(1);
}
