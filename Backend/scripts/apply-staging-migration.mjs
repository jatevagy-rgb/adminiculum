import { execSync } from 'child_process';
import path from 'path';

if ([process.env.NODE_ENV, process.env.ADMINICULUM_RUNTIME_ENVIRONMENT]
  .some((value) => String(value || '').toLowerCase() === 'production')) {
  console.error('ERROR: apply-staging-migration must never run in production.');
  process.exit(1);
}

// IMPORTANT: Set DATABASE_URL env var before running.
// Example: DATABASE_URL='postgresql://user:pass@host:5432/db?sslmode=require' node apply-staging-migration.mjs
const DATABASE_URL = process.env.DATABASE_URL;

if (!DATABASE_URL) {
  console.error('ERROR: DATABASE_URL env var is required.');
  console.error('Example: DATABASE_URL=\'postgresql://user:pass@host:5432/db?sslmode=require\' node apply-staging-migration.mjs');
  process.exit(1);
}

console.log('=== Adminiculum Staging Migration Reset & Apply ===');
console.log('Database:', DATABASE_URL.replace(/:[^:@]+@/, ':***@'));
console.log('');

// Use prisma migrate reset --force to reset the database and reapply all migrations
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
