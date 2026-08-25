import { execSync } from 'child_process';

// SEC-0A hardening: this is a DESTRUCTIVE script. It must never be able to
// target production and must require an explicit opt-in. Use the canonical
// migration WebJob for production.
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
  console.error('ERROR: destructive reset requires ALLOW_DESTRUCTIVE_RESET=true and a non-production target.');
  process.exit(1);
}

console.log('=== Adminiculum Staging Migration Reset & Apply ===');
console.log('Database:', DATABASE_URL.replace(/:[^:@]+@/, ':***@'));
console.log('');

console.log('Running prisma migrate reset --force...');
try {
  const result = execSync('npx prisma migrate reset --force', {
    env: {
      ...process.env,
      DATABASE_URL: DATABASE_URL
    },
    cwd: process.cwd(),
    encoding: 'utf8'
  });
  console.log(result);
  console.log('\nMigration reset and apply completed successfully!');
} catch (err) {
  console.error('Migration stdout:', err.stdout);
  console.error('Migration stderr:', err.stderr);
  console.error('\nMigration failed with exit code:', err.status);
  process.exit(1);
}
