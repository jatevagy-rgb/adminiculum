import { pathToFileURL } from 'node:url';

export const PILOT_FULL_ACCESS_EMAILS = Object.freeze([
  'csanad@trugly.eu',
  'szucs.amanda@balintfy.onmicrosoft.com',
  'sommer.anna@balintfy.onmicrosoft.com',
]);

export const TARGET_ROLE = 'ADMIN';

const normalizeEmail = (value) => String(value ?? '').trim().toLowerCase();

const sortedTargets = () => [...PILOT_FULL_ACCESS_EMAILS].sort();

const targetLookupWhere = () => ({
  OR: PILOT_FULL_ACCESS_EMAILS.map((email) => ({
    email: { equals: email, mode: 'insensitive' },
  })),
});

function validateTargets(users) {
  const allowed = new Set(PILOT_FULL_ACCESS_EMAILS.map(normalizeEmail));
  const byEmail = new Map();

  for (const user of users) {
    const key = normalizeEmail(user.email);
    if (!allowed.has(key)) {
      throw new Error(`pilot full access promotion aborted: query returned non-allowlisted user <${user.email}>`);
    }
    if (byEmail.has(key)) {
      throw new Error(`pilot full access promotion aborted: duplicate accounts for <${user.email}>`);
    }
    byEmail.set(key, user);
  }

  const missing = sortedTargets().filter((email) => !byEmail.has(normalizeEmail(email)));
  if (missing.length > 0) {
    throw new Error(`pilot full access promotion aborted: missing user(s): ${missing.join(', ')}`);
  }

  const inactive = sortedTargets().filter((email) => {
    const user = byEmail.get(normalizeEmail(email));
    return user.isActive === false || (user.status != null && String(user.status).toUpperCase() !== 'ACTIVE');
  });
  if (inactive.length > 0) {
    throw new Error(`pilot full access promotion aborted: inactive user(s): ${inactive.join(', ')}`);
  }

  const clientAccounts = sortedTargets().filter(
    (email) => String(byEmail.get(normalizeEmail(email)).role ?? '').toUpperCase() === 'CLIENT',
  );
  if (clientAccounts.length > 0) {
    throw new Error(`pilot full access promotion aborted: refusing to promote CLIENT account(s): ${clientAccounts.join(', ')}`);
  }

  return byEmail;
}

export async function runPilotFullAccessPromotion({ db, dryRun = false, log = () => {} } = {}) {
  if (!db?.user?.findMany || !db?.user?.update) {
    throw new Error('runPilotFullAccessPromotion requires an injected prisma-compatible db client');
  }

  const users = await db.user.findMany({ where: targetLookupWhere() });
  const byEmail = validateTargets(users);

  const plan = sortedTargets().map((email) => {
    const user = byEmail.get(normalizeEmail(email));
    const needsPromotion = String(user.role ?? '').toUpperCase() !== TARGET_ROLE;
    return {
      id: user.id,
      email: user.email,
      name: user.name,
      from: user.role,
      to: TARGET_ROLE,
      action: needsPromotion ? 'promote' : 'noop',
    };
  });

  log('pilot full access promotion plan (pre-write):');
  for (const entry of plan) {
    log(`- ${entry.email}: ${entry.from} -> ${entry.to} (${entry.action})`);
  }
  log(`dry run: ${dryRun ? 'yes' : 'no'}`);

  if (dryRun) {
    log('dry run complete: zero writes performed');
    return {
      dryRun: true,
      promoted: [],
      unchanged: plan.filter((entry) => entry.action === 'noop').map((entry) => entry.email),
      plan,
    };
  }

  const promoted = [];
  const unchanged = [];
  for (const entry of plan) {
    if (entry.action === 'noop') {
      unchanged.push(entry.email);
      continue;
    }
    await db.user.update({ where: { id: entry.id }, data: { role: TARGET_ROLE } });
    promoted.push(entry.email);
  }

  const readback = await db.user.findMany({ where: { id: { in: plan.map((entry) => entry.id) } } });
  const readbackById = new Map(readback.map((user) => [user.id, user]));
  const readbackFailures = [];
  for (const entry of plan) {
    const user = readbackById.get(entry.id);
    if (!user) {
      readbackFailures.push(`${entry.email}: not found in post-write readback`);
    } else if (String(user.role ?? '').toUpperCase() !== TARGET_ROLE) {
      readbackFailures.push(`${entry.email}: readback role is ${user.role}`);
    }
  }
  if (readbackFailures.length > 0) {
    throw new Error(`pilot full access promotion failed post-write readback: ${readbackFailures.join('; ')}`);
  }
  if (readback.length !== plan.length) {
    throw new Error(`pilot full access promotion failed post-write readback: expected ${plan.length} users, saw ${readback.length}`);
  }
  for (const entry of plan) {
    log(`readback ok: ${entry.email} -> ${TARGET_ROLE}`);
  }

  return { dryRun: false, promoted, unchanged, plan };
}

const invokedDirectly =
  Boolean(process.argv[1]) && import.meta.url === pathToFileURL(process.argv[1]).href;

if (invokedDirectly) {
  const dryRun = process.argv.includes('--dry-run');
  const { PrismaClient } = await import('@prisma/client');
  const prisma = new PrismaClient();
  try {
    const result = await runPilotFullAccessPromotion({ db: prisma, dryRun, log: console.log });
    if (dryRun) {
      console.log('pilot full access promotion dry run finished: zero writes');
    } else {
      console.log(
        `pilot full access promotion finished: promoted ${result.promoted.length}, unchanged ${result.unchanged.length}`,
      );
    }
  } catch (error) {
    console.error(error?.message ?? error);
    process.exitCode = 1;
  } finally {
    await prisma.$disconnect();
  }
}
