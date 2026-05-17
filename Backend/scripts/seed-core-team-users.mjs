import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

const CORE_TEAM = [
  {
    name: 'Dr. Hubay Gyula',
    email: 'hubay.gyula@adminiculum.local',
    role: 'PARTNER',
    title: 'partner',
    skills: ['partner review', 'ügyvédi review', 'munkaterv'],
  },
  {
    name: 'Dr. Trufly Csanád',
    email: 'trufly.csanad@adminiculum.local',
    role: 'LAWYER',
    title: 'ügyvéd',
    skills: ['ügyvédi javítás', 'véglegesítés', 'review'],
  },
  {
    name: 'Dr. Szűcs Amanda',
    email: 'szucs.amanda@adminiculum.local',
    role: 'TRAINEE',
    title: 'ügyvédjelölt',
    skills: ['előkészítés', 'iratellenőrzés', 'munkapéldány'],
  },
  {
    name: 'Dr. Sommer Anna',
    email: 'sommer.anna@adminiculum.local',
    role: 'TRAINEE',
    title: 'ügyvédjelölt',
    skills: ['előkészítés', 'jogi kutatás', 'iratellenőrzés'],
  },
  {
    name: 'Dr. Hubay Gyula Máté',
    email: 'hubay.gyula.mate@adminiculum.local',
    role: 'TRAINEE',
    title: 'ügyvédjelölt',
    skills: ['előkészítés', 'adminisztratív támogatás', 'iratellenőrzés'],
  },
];

const CORE_EMAILS = new Set(CORE_TEAM.map((user) => user.email));

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
  if (nonCore.length === 0) {
    console.log('non-core/debug users: none');
  } else {
    console.log('non-core/debug users present, not deleted:');
    for (const user of nonCore) {
      console.log(`- ${user.name} <${user.email}> (${user.role}, ${user.status})`);
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
