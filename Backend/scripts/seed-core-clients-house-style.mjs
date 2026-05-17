import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

const CORE_CLIENTS = [
  {
    name: 'BlackBelt Technology Kft.',
    email: 'aczifra@t-online.hu',
    phone: '70/9309191',
    address: '1027 Budapest, Ganz utca 16. 3. em., Magyarország',
    taxNumber: '24334934-2-41',
    companyRegistrationNumber: '01-09-356381',
    contactPerson: 'Sövegjártó Róbert',
    authorizedRepresentative: 'Sövegjártó Róbert',
    profile: {
      officialName: 'BlackBelt Technology Kft.',
      shortName: 'BlackBelt',
      registeredSeat: '1027 Budapest, Ganz utca 16. 3. em., Magyarország',
      taxNumber: '24334934-2-41',
      registrationNumber: '01-09-356381',
      contactPerson: 'Sövegjártó Róbert',
      contactEmail: 'aczifra@t-online.hu',
      contactPhone: '70/9309191',
      preferredLanguage: 'HU',
      documentLanguageMode: 'HU_ONLY',
      headerAssetPath: '/client-house-style/blackbelt-header.png',
      headerDescription: 'BlackBelt ügyfélfejléc/arculati minta',
      brandingNotes: 'munkajogi / sales bonus / KPI / fedezeti szabályzat jelleg; római számos nagy fejezetek; részletes pontozott rendelkezések; employer-side, risk-conscious drafting; ne sugalljon automatikus bónuszjogosultságot; definíciós / fogalomtár jellegű szerkezet, ha indokolt.',
    },
  },
  {
    name: 'Saubermacher-Magyarország Kft.',
    address: '1181 Budapest, Zádor u. 5.',
    taxNumber: '13559212-2-43',
    companyRegistrationNumber: '03-09-113748',
    profile: {
      officialName: 'Saubermacher-Magyarország Kft.',
      shortName: 'Saubermacher',
      registeredSeat: '1181 Budapest, Zádor u. 5.',
      taxNumber: '13559212-2-43',
      registrationNumber: '03-09-113748',
      preferredLanguage: 'HU',
      documentLanguageMode: 'HU_ONLY',
      headerAssetPath: '/client-house-style/saubermacher-header.png',
      headerDescription: 'Saubermacher ügyfélfejléc/arculati minta',
      brandingNotes: 'magyar formális jogi irat; munkáltatói oldali, kockázatérzékeny megfogalmazás; Mt.-hivatkozások munkajogi iratoknál; Bosch / hulladékgazdálkodási ügyeknél EN-HU párhuzamos, tükrözött szerkezet.',
    },
  },
];

const normalize = (value) => String(value || '')
  .toLocaleLowerCase('hu-HU')
  .normalize('NFD')
  .replace(/[\u0300-\u036f]/g, '')
  .replace(/[^a-z0-9]+/g, ' ')
  .trim();

const isCoreClient = (client) => {
  const value = normalize(`${client.name} ${client.company || ''}`);
  return value.includes('blackbelt') || value.includes('saubermacher') || value.includes('sauber macher');
};

async function upsertClientWithProfile(core) {
  const existing = await prisma.client.findFirst({
    where: {
      OR: [
        { name: core.name },
        ...(core.taxNumber ? [{ taxNumber: core.taxNumber }] : []),
        ...(core.companyRegistrationNumber ? [{ companyRegistrationNumber: core.companyRegistrationNumber }] : []),
      ],
    },
    orderBy: { createdAt: 'asc' },
  });

  const data = {
    name: core.name,
    email: core.email ?? null,
    phone: core.phone ?? null,
    address: core.address,
    taxNumber: core.taxNumber,
    companyRegistrationNumber: core.companyRegistrationNumber,
    contactPerson: core.contactPerson ?? null,
    authorizedRepresentative: core.authorizedRepresentative ?? null,
  };

  const client = existing
    ? await prisma.client.update({ where: { id: existing.id }, data })
    : await prisma.client.create({ data });

  await prisma.clientHouseStyleProfile.upsert({
    where: { clientId: client.id },
    update: core.profile,
    create: { clientId: client.id, ...core.profile },
  });

  console.log(`upserted core client: ${client.name} (${client.id})`);
}

async function main() {
  for (const core of CORE_CLIENTS) {
    await upsertClientWithProfile(core);
  }

  const clients = await prisma.client.findMany({ orderBy: { name: 'asc' } });
  const nonCore = clients.filter((client) => !isCoreClient(client));
  if (nonCore.length === 0) {
    console.log('non-core/test clients: none');
  } else {
    console.log('non-core/test clients present, not deleted:');
    for (const client of nonCore) {
      console.log(`- ${client.name} (${client.id})`);
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
