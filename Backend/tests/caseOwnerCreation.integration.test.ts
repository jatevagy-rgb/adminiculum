import casesService from '../src/modules/cases/services';
import { prisma } from '../src/prisma/prisma.service';
import { randomUUID } from 'crypto';

// Optional customer-side case owner at creation (FINAL_CLOSURE_B3). Verifies the
// canonical CaseClientOwner persistence, report derivation, cross-client denial,
// eligibility, and capability-flag gating against real PG. Only MSAL token
// verification is bypassed (there is none here — the service is called directly);
// all validation and database operations are the production implementation.

const ids = {
  user: randomUUID(),
  clientA: randomUUID(),
  clientB: randomUUID(),
  personA: randomUUID(),
  personB: randomUUID(),
  inactivePersonA: randomUUID(),
};

async function createCaseWith(personId: string | null) {
  return casesService.createCase(
    {
      clientName: 'Synthetic client A',
      clientId: ids.clientA,
      matterType: 'OTHER',
      title: `Owner-at-creation ${randomUUID()}`,
      createdById: ids.user,
      clientOwnerPersonId: personId,
    },
    prisma,
    { provisionCaseFolders: false },
  );
}

beforeAll(async () => {
  const url = new URL(process.env.DATABASE_URL || '');
  if (url.hostname !== '127.0.0.1' || url.port !== '55483' || url.pathname !== '/adminiculum_replay_wf10') throw Error('Unsafe test DB');
  const identity = await prisma.$queryRaw<any[]>`SELECT current_database() db, current_user usr, inet_server_port() port`;
  expect(identity[0]).toMatchObject({ db: 'adminiculum_replay_wf10', usr: 'wf10_pgtest', port: 55483 });
  process.env.ENABLE_DURABLE_CASE_WORKSPACE = 'true';
  await prisma.user.create({ data: { id: ids.user, email: `${ids.user}@wf10.invalid`, name: 'Synthetic creator', role: 'LAWYER', status: 'ACTIVE', isActive: true, skills: [] } });
  await prisma.client.create({ data: { id: ids.clientA, name: 'Synthetic client A' } });
  await prisma.client.create({ data: { id: ids.clientB, name: 'Synthetic client B' } });
  await prisma.organizationPerson.create({ data: { id: ids.personA, clientId: ids.clientA, name: 'Client A owner', employmentStatus: 'ACTIVE' } });
  await prisma.organizationPerson.create({ data: { id: ids.personB, clientId: ids.clientB, name: 'Client B owner', employmentStatus: 'ACTIVE' } });
  await prisma.organizationPerson.create({ data: { id: ids.inactivePersonA, clientId: ids.clientA, name: 'Inactive client A person', employmentStatus: 'INACTIVE' } });
}, 30000);

afterAll(async () => { await prisma.$disconnect(); });

test('creation with owner persists canonical CaseClientOwner and derives in report', async () => {
  const created = await createCaseWith(ids.personA);
  const owner = await prisma.caseClientOwner.findUnique({ where: { caseId: created.id } });
  expect(owner?.personId).toBe(ids.personA);
  expect(owner?.clientId).toBe(ids.clientA);
  expect(owner?.revision).toBe(1);
  const event = await prisma.caseClientOwnerEvent.findFirst({ where: { caseId: created.id } });
  expect(event?.reason).toBe('CASE_CREATION_ASSIGNMENT');
  const { savedOwnerPersonId } = await import('../src/modules/case-workspace/owner.service');
  expect(await savedOwnerPersonId(prisma, created.id, ids.clientA)).toBe(ids.personA);
});

test('cross-client owner is denied and the case transaction rolls back', async () => {
  await expect(createCaseWith(ids.personB)).rejects.toThrow('OWNER_NOT_IN_CLIENT');
  expect(await prisma.case.count({ where: { clientId: ids.clientA, title: { contains: 'Owner-at-creation' } } })).toBe(1);
});

test('inactive person is denied as owner', async () => {
  await expect(createCaseWith(ids.inactivePersonA)).rejects.toThrow('OWNER_NOT_ELIGIBLE');
});

test('unknown person is denied as owner', async () => {
  await expect(createCaseWith(randomUUID())).rejects.toThrow('OWNER_PERSON_NOT_FOUND');
});

test('capability flag off leaves owner unpersisted', async () => {
  process.env.ENABLE_DURABLE_CASE_WORKSPACE = 'false';
  const created = await createCaseWith(ids.personA);
  expect(await prisma.caseClientOwner.findUnique({ where: { caseId: created.id } })).toBeNull();
  process.env.ENABLE_DURABLE_CASE_WORKSPACE = 'true';
});
