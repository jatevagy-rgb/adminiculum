import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

const CORE_TEAM = [
  {
    name: 'dr. HUBAY Gyula Máté',
    email: 'hubay.mate@balintfy.onmicrosoft.hu',
    role: 'ADMIN',
    title: 'partner / admin',
    skills: ['partner review', 'ügyvédi review', 'munkaterv', 'pilot admin'],
  },
  {
    name: 'Csanád',
    email: 'csanad@trugly.eu',
    role: 'COLLAB_LAWYER',
    title: 'ügyvéd',
    skills: ['ügyvédi javítás', 'véglegesítés', 'review'],
  },
  {
    name: 'Szűcs Amanda',
    email: 'szucs.amanda@balintfy.onmicrosoft.com',
    role: 'LAWYER',
    title: 'ügyvéd',
    skills: ['előkészítés', 'iratellenőrzés', 'munkapéldány'],
  },
  {
    name: 'Sommer Anna',
    email: 'sommer.anna@balintfy.onmicrosoft.com',
    role: 'LAWYER',
    title: 'ügyvéd',
    skills: ['előkészítés', 'jogi kutatás', 'iratellenőrzés'],
  },
];

const CORE_EMAILS = new Set(CORE_TEAM.map((user) => user.email));

const isStalePilotTestUser = (user) => {
  const value = `${user.name || ''} ${user.email || ''}`
    .toLocaleLowerCase('hu-HU')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '');
  return (
    value.includes('autotest') ||
    value.includes('admin user') ||
    value.includes('azure ad user') ||
    value.includes('bundle verify') ||
    value.includes('cases debug') ||
    value.includes('dash debug') ||
    value.includes('debug cases') ||
    value.includes('debug verify') ||
    value.includes('debugcases') ||
    value.includes('edit mode tester') ||
    value.includes('l3 final') ||
    value.includes('l3 pilot') ||
    value.includes('patch') ||
    value.includes('shape login') ||
    value.includes('teszt ugyved') ||
    value.includes('test attorney') ||
    value.includes('test user') ||
    value.includes('@adminiculum.local') ||
    value.includes('@local.test') ||
    value.includes('@example.com')
  );
};

async function main() {
  for (const user of CORE_TEAM) {
    const saved = await prisma.user.upsert({
      where: { email: user.email },
      update: {
        name: user.name,
        role: user.role,
        status: 'ACTIVE',
        isActive: true,
        department: user.title,
        skills: user.skills,
      },
      create: {
        name: user.name,
        email: user.email,
        role: user.role,
        status: 'ACTIVE',
        isActive: true,
        department: user.title,
        skills: user.skills,
      },
    });
    console.log(`upserted team user: ${saved.name} (${saved.email})`);
  }

  const users = await prisma.user.findMany({ orderBy: { email: 'asc' } });
  const nonCore = users.filter((user) => !CORE_EMAILS.has(user.email));
  const staleTestUsers = nonCore.filter(isStalePilotTestUser);
  for (const user of staleTestUsers) {
    await prisma.user.update({
      where: { id: user.id },
      data: {
        status: 'INACTIVE',
        isActive: false,
      },
    });
    console.log(`deactivated stale pilot test user: ${user.name} <${user.email}>`);
  }

  if (nonCore.length === 0) {
    console.log('non-core/debug users: none');
  } else {
    console.log('non-core/debug users present, not deleted:');
    for (const user of nonCore) {
      const state = staleTestUsers.some((stale) => stale.id === user.id) ? 'INACTIVE after this seed' : user.status;
      console.log(`- ${user.name} <${user.email}> (${user.role}, ${state})`);
    }
  }
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
