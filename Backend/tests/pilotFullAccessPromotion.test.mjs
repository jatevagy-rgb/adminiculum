import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

import {
  PILOT_FULL_ACCESS_EMAILS,
  TARGET_ROLE,
  runPilotFullAccessPromotion,
} from '../scripts/promote-pilot-full-access.mjs';

const SEED_SOURCE = readFileSync(
  new URL('../scripts/seed-core-team-users.mjs', import.meta.url),
  'utf8',
);

const TARGET_EMAILS = [
  'csanad@trugly.eu',
  'szucs.amanda@balintfy.onmicrosoft.com',
  'sommer.anna@balintfy.onmicrosoft.com',
];

const TARGET_IDS = ['target-1', 'target-2', 'target-3'];

const normalizeEmail = (value) => String(value ?? '').trim().toLowerCase();

const BASE_USERS = [
  {
    id: 'admin-1',
    name: 'Main Admin',
    email: 'hubay.mate@balintfy.onmicrosoft.hu',
    role: 'ADMIN',
    status: 'ACTIVE',
    isActive: true,
  },
  {
    id: 'target-1',
    name: 'Csanád',
    email: 'csanad@trugly.eu',
    role: 'COLLAB_LAWYER',
    status: 'ACTIVE',
    isActive: true,
  },
  {
    id: 'target-2',
    name: 'Szűcs Amanda',
    email: 'szucs.amanda@balintfy.onmicrosoft.com',
    role: 'LAWYER',
    status: 'ACTIVE',
    isActive: true,
  },
  {
    id: 'target-3',
    name: 'Sommer Anna',
    email: 'sommer.anna@balintfy.onmicrosoft.com',
    role: 'LAWYER',
    status: 'ACTIVE',
    isActive: true,
  },
  {
    id: 'worker-4',
    name: 'Fourth Workforce',
    email: 'fourth.workforce@balintfy.onmicrosoft.com',
    role: 'LAWYER',
    status: 'ACTIVE',
    isActive: true,
  },
  {
    id: 'client-1',
    name: 'Client User',
    email: 'client.user@example-client.hu',
    role: 'CLIENT',
    status: 'ACTIVE',
    isActive: true,
  },
];

function createFakeDb(seedUsers = BASE_USERS) {
  const users = seedUsers.map((user) => ({ ...user }));
  const updateCalls = [];

  const matchesWhere = (user, where) => {
    if (!where) return true;
    if (Array.isArray(where.OR)) {
      return where.OR.some(
        (clause) => normalizeEmail(user.email) === normalizeEmail(clause.email.equals),
      );
    }
    if (where.id && Array.isArray(where.id.in)) {
      return where.id.in.includes(user.id);
    }
    return false;
  };

  return {
    users,
    updateCalls,
    user: {
      async findMany({ where } = {}) {
        return users.filter((user) => matchesWhere(user, where)).map((user) => ({ ...user }));
      },
      async update({ where, data }) {
        updateCalls.push({ id: where.id, data: { ...data } });
        const user = users.find((candidate) => candidate.id === where.id);
        if (user) Object.assign(user, data);
        return user ? { ...user } : null;
      },
    },
  };
}

const roleOf = (db, id) => db.users.find((user) => user.id === id)?.role;

test('allowlist is exactly the three pilot emails and target role is ADMIN', () => {
  assert.equal(PILOT_FULL_ACCESS_EMAILS.length, 3);
  assert.deepEqual([...PILOT_FULL_ACCESS_EMAILS].sort(), [...TARGET_EMAILS].sort());
  assert.equal(TARGET_ROLE, 'ADMIN');
});

test('valid run promotes only the three allowlisted users and prints the pre-write plan', async () => {
  const db = createFakeDb();
  const lines = [];
  const result = await runPilotFullAccessPromotion({
    db,
    log: (line) => lines.push(String(line)),
  });

  assert.deepEqual([...result.promoted].sort(), [...TARGET_EMAILS].sort());
  assert.equal(db.updateCalls.length, 3);
  for (const call of db.updateCalls) {
    assert.ok(TARGET_IDS.includes(call.id), `unexpected update target ${call.id}`);
    assert.deepEqual(call.data, { role: 'ADMIN' });
  }
  for (const id of TARGET_IDS) {
    assert.equal(roleOf(db, id), 'ADMIN');
  }
  for (const email of TARGET_EMAILS) {
    assert.ok(
      lines.some((line) => line.includes(email)),
      `pre-write plan must mention ${email}`,
    );
  }
});

test('email lookup is case-insensitive', async () => {
  const db = createFakeDb(
    BASE_USERS.map((user) => {
      if (user.id === 'target-1') return { ...user, email: 'Csanad@Trugly.EU' };
      if (user.id === 'target-2') return { ...user, email: 'SZUCS.AMANDA@BALINTFY.ONMICROSOFT.COM' };
      return user;
    }),
  );

  await runPilotFullAccessPromotion({ db, log: () => {} });

  assert.deepEqual([...db.updateCalls.map((call) => call.id)].sort(), [...TARGET_IDS].sort());
  for (const id of TARGET_IDS) {
    assert.equal(roleOf(db, id), 'ADMIN');
  }
});

test('missing pilot user aborts with zero writes', async () => {
  const db = createFakeDb(
    BASE_USERS.filter((user) => user.email !== 'csanad@trugly.eu'),
  );

  await assert.rejects(
    () => runPilotFullAccessPromotion({ db, log: () => {} }),
    /missing user/i,
  );

  assert.equal(db.updateCalls.length, 0);
  assert.equal(roleOf(db, 'target-2'), 'LAWYER');
  assert.equal(roleOf(db, 'target-3'), 'LAWYER');
});

test('inactive pilot user aborts with zero writes', async () => {
  const db = createFakeDb(
    BASE_USERS.map((user) =>
      user.email === 'sommer.anna@balintfy.onmicrosoft.com'
        ? { ...user, status: 'INACTIVE', isActive: false }
        : user,
    ),
  );

  await assert.rejects(
    () => runPilotFullAccessPromotion({ db, log: () => {} }),
    /inactive/i,
  );

  assert.equal(db.updateCalls.length, 0);
  assert.equal(roleOf(db, 'target-1'), 'COLLAB_LAWYER');
  assert.equal(roleOf(db, 'target-2'), 'LAWYER');
});

test('dry run performs zero writes', async () => {
  const db = createFakeDb();

  const result = await runPilotFullAccessPromotion({ db, dryRun: true, log: () => {} });

  assert.equal(result.dryRun, true);
  assert.equal(db.updateCalls.length, 0);
  assert.equal(roleOf(db, 'target-1'), 'COLLAB_LAWYER');
  assert.equal(roleOf(db, 'target-2'), 'LAWYER');
  assert.equal(roleOf(db, 'target-3'), 'LAWYER');
});

test('already ADMIN pilot users are a no-op', async () => {
  const db = createFakeDb(
    BASE_USERS.map((user) =>
      TARGET_EMAILS.includes(normalizeEmail(user.email)) ? { ...user, role: 'ADMIN' } : user,
    ),
  );

  const result = await runPilotFullAccessPromotion({ db, log: () => {} });

  assert.equal(db.updateCalls.length, 0);
  assert.deepEqual(result.promoted, []);
  assert.equal(result.unchanged.length, 3);
});

test('fourth workforce user and main admin stay unchanged', async () => {
  const db = createFakeDb();

  await runPilotFullAccessPromotion({ db, log: () => {} });

  assert.equal(roleOf(db, 'worker-4'), 'LAWYER');
  assert.equal(roleOf(db, 'admin-1'), 'ADMIN');
  assert.ok(
    db.updateCalls.every((call) => !['worker-4', 'admin-1', 'client-1'].includes(call.id)),
  );
});

test('CLIENT users are never touched', async () => {
  const db = createFakeDb();

  await runPilotFullAccessPromotion({ db, log: () => {} });

  assert.equal(roleOf(db, 'client-1'), 'CLIENT');
  assert.ok(db.updateCalls.every((call) => call.id !== 'client-1'));
});

test('refuses to promote an allowlisted account holding CLIENT role', async () => {
  const db = createFakeDb(
    BASE_USERS.map((user) => (user.id === 'target-1' ? { ...user, role: 'CLIENT' } : user)),
  );

  await assert.rejects(
    () => runPilotFullAccessPromotion({ db, log: () => {} }),
    /CLIENT/i,
  );

  assert.equal(db.updateCalls.length, 0);
  assert.equal(roleOf(db, 'target-1'), 'CLIENT');
});

test('post-write readback failure fails the run', async () => {
  const db = createFakeDb();
  db.user.update = async ({ where, data }) => {
    db.updateCalls.push({ id: where.id, data: { ...data } });
    const user = db.users.find((candidate) => candidate.id === where.id);
    return user ? { ...user } : null;
  };

  await assert.rejects(
    () => runPilotFullAccessPromotion({ db, log: () => {} }),
    /readback/i,
  );
});

test('core team seed assigns ADMIN to all three pilot emails and keeps the main admin', () => {
  for (const email of TARGET_EMAILS) {
    const escaped = email.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    assert.match(
      SEED_SOURCE,
      new RegExp(`email:\\s*'${escaped}',\\s*role:\\s*'ADMIN'`),
      `seed must set ADMIN for ${email}`,
    );
  }
  assert.match(
    SEED_SOURCE,
    /email:\s*'hubay\.mate@balintfy\.onmicrosoft\.hu',\s*role:\s*'ADMIN'/,
  );
});
