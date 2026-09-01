import { PrismaClient } from '@prisma/client';
import * as crypto from 'crypto';

const prisma = new PrismaClient();

function stableId(key: string): string {
  return crypto.createHash('sha256').update(`DEMO_KFT_2026_${key}`).digest('hex').substring(0, 36);
}

const CLIENT_ID = stableId('client');

async function teardown() {
  console.log('Teardown existing Demo Kft data...');
  await prisma.clientFact.deleteMany({ where: { clientId: CLIENT_ID } });
  await prisma.developmentInitiative.deleteMany({ where: { clientId: CLIENT_ID } });
  await prisma.assessment.deleteMany({ where: { clientId: CLIENT_ID } });
  await prisma.clientObligation.deleteMany({ where: { clientId: CLIENT_ID } });
  await prisma.contractRecord.deleteMany({ where: { clientId: CLIENT_ID } });
  await prisma.organizationPersonResponsibility.deleteMany({ where: { organizationPerson: { clientId: CLIENT_ID } } });
  await prisma.organizationPerson.deleteMany({ where: { clientId: CLIENT_ID } });
  await prisma.client.deleteMany({ where: { id: CLIENT_ID } });
}

async function seed() {
  console.log('Seeding Demo Kft client...');
  await prisma.client.create({
    data: {
      id: CLIENT_ID,
      name: 'Demo Kft.',
      taxNumber: '12345678-2-41',
      companyRegistrationNumber: '01-09-987654',
      address: '1138 Budapest, Váci út 140.',
      colorKey: 'AMBER',
      relationshipMode: 'PORTAL_CENTRIC',
      portalAccessEnabled: true,
      connectedSystemState: 'Demo Kft. – Vállalati Portál'
    }
  });

  console.log('Seeding facts...');
  const facts = [
    { type: 'EMPLOYEE_COUNT', value: '47' },
    { type: 'MAIN_ACTIVITY', value: 'B2B egyedi szoftverfejlesztés, felhõalapú SaaS platform üzemeltetés és integrációs tanácsadás' },
    { type: 'IMPORTANT_IT_SYSTEM', value: 'B2B ügyfélportál, Shopify Plus B2B áruház, AWS felhõinfrastruktúra és Jira/Confluence vállalatirányítás' },
    { type: 'SENSITIVE_DATA_USAGE', value: 'Munkavállalói HR-adatok, B2B ügyfélkapcsolattartók adatai, felhasználói hozzáférési és audit naplók kezelése' },
    { type: 'AI_USAGE', value: 'GitHub Copilot integráció a fejlesztõi környezetben, belsõ kísérleti LLM asszisztens az ügyfélszolgálati tudásbázishoz' },
    { type: 'REVENUE_BAND', value: '850 millió - 1,2 milliárd HUF' },
    { type: 'OPERATING_COUNTRY', value: 'Magyarország, Németország, Ausztria (DACH régió)' },
    { type: 'CERTIFICATION', value: 'ISO/IEC 27001 felkészülés folyamatban' },
  ];
  for (const [idx, f] of facts.entries()) {
    await prisma.clientFact.create({
      data: {
        id: stableId(`fact_${idx}`),
        clientId: CLIENT_ID,
        type: f.type,
        value: f.value,
        validFrom: new Date('2024-01-01'),
        verificationStatus: 'CLIENT_PROVIDED'
      }
    });
  }

  console.log('Seeding organization...');
  const ceoId = stableId('person_ceo');
  const hrId = stableId('person_hr');
  const cfoId = stableId('person_cfo');
  const cooId = stableId('person_coo');
  await prisma.organizationPerson.createMany({
    data: [
      { id: ceoId, clientId: CLIENT_ID, name: 'Péterfi János', jobTitle: 'Ügyvezetõ (CEO)' },
      { id: hrId, clientId: CLIENT_ID, name: 'Kiss Boglárka', jobTitle: 'HR vezetõ', managerPersonId: ceoId },
      { id: cfoId, clientId: CLIENT_ID, name: 'Kovács András', jobTitle: 'Pénzügyi vezetõ', managerPersonId: ceoId },
      { id: cooId, clientId: CLIENT_ID, name: 'Szabó Levente', jobTitle: 'Operációs vezetõ', managerPersonId: ceoId },
    ]
  });

  await prisma.organizationPersonResponsibility.createMany({
    data: [
      { id: stableId('resp_1'), organizationPersonId: ceoId, type: 'MANAGEMENT', description: 'Társasági ügyvezetés és törvényes képviselet' },
      { id: stableId('resp_2'), organizationPersonId: ceoId, type: 'APPROVAL', description: 'Stratégiai szerzõdések jóváhagyása' },
      { id: stableId('resp_3'), organizationPersonId: hrId, type: 'HR', description: 'Munkajogi és személyügyi folyamatok vezetése' },
      { id: stableId('resp_4'), organizationPersonId: hrId, type: 'DATA_PROTECTION', description: 'Belsõ adatvédelmi kapcsolattartó' },
      { id: stableId('resp_5'), organizationPersonId: cfoId, type: 'FINANCE', description: 'Pénzügyi tervezés és kontrolling' },
      { id: stableId('resp_6'), organizationPersonId: cfoId, type: 'CONTRACT_OWNER', description: 'Bérleti és pénzügyi szerzõdések felelõse' },
      { id: stableId('resp_7'), organizationPersonId: cooId, type: 'OPERATIONS', description: 'Infrastruktúra és IT üzemeltetés' },
      { id: stableId('resp_8'), organizationPersonId: cooId, type: 'OBLIGATION_OWNER', description: 'SLA és IT biztonsági kötelezettségek gazdája' },
    ]
  });

  console.log('Seeding contracts...');
  const contract1Id = stableId('contract_1');
  const contract2Id = stableId('contract_2');
  const contract3Id = stableId('contract_3');
  await prisma.contractRecord.createMany({
    data: [
      { id: contract1Id, clientId: CLIENT_ID, title: 'B2B SaaS és Egyedi Fejlesztési Keretszerzõdés', contractType: 'B2B_SUPPLY', status: 'ACTIVE', effectiveDate: new Date('2025-06-01'), nextCriticalDate: new Date('2026-11-30'), businessOwnerPersonId: cooId },
      { id: contract2Id, clientId: CLIENT_ID, title: 'Irodabérleti Szerzõdés (Váci Greens B)', contractType: 'LEASE', status: 'ACTIVE', effectiveDate: new Date('2024-01-01'), nextCriticalDate: new Date('2027-06-30'), businessOwnerPersonId: cfoId },
      { id: contract3Id, clientId: CLIENT_ID, title: 'Felhõ Infrastruktúra Szolgáltatási Szerzõdés', contractType: 'IT_SYSTEM', status: 'ACTIVE', effectiveDate: new Date('2025-01-01'), autoRenewal: true, businessOwnerPersonId: cooId },
    ]
  });

  console.log('Seeding obligations...');
  await prisma.clientObligation.createMany({
    data: [
      { id: stableId('ob_1'), clientId: CLIENT_ID, title: 'Havi SLA (99.5%) és incidensriport készítése', description: 'SLA report havonta', status: 'OPEN', frequencyCode: 'MONTHLY', nextDueDate: new Date('2026-09-30'), ownerPersonId: cooId },
      { id: stableId('ob_2'), clientId: CLIENT_ID, title: 'Éves IT biztonsági audit igazolás átadása', description: 'Audit igazolás', status: 'OPEN', frequencyCode: 'ANNUAL', nextDueDate: new Date('2026-11-30'), ownerPersonId: cooId },
      { id: stableId('ob_3'), clientId: CLIENT_ID, title: 'Havi bérleti díj és üzemeltetési díjelõleg fizetése', description: 'Bérlet', status: 'OPEN', frequencyCode: 'MONTHLY', nextDueDate: new Date('2026-09-10'), ownerPersonId: cfoId },
      { id: stableId('ob_4'), clientId: CLIENT_ID, title: 'Éves GDPR DPA és SCC megfelelõségi ellenõrzés', description: 'AWS GDPR', status: 'OPEN', frequencyCode: 'ANNUAL', nextDueDate: new Date('2026-12-15'), ownerPersonId: hrId },
    ]
  });

  console.log('Seeding initiatives...');
  const init1Id = stableId('init_1');
  const init2Id = stableId('init_2');
  await prisma.developmentInitiative.createMany({
    data: [
      { id: init1Id, clientId: CLIENT_ID, title: 'Munkajogi és Munkavédelmi Megfelelõségi Program 2026', status: 'ACTIVE', priority: 'HIGH', clientOwnerPersonId: hrId },
      { id: init2Id, clientId: CLIENT_ID, title: 'ISO 27001 és B2B Biztonsági Megfelelõségi Felkészülés', status: 'PLANNED', priority: 'MEDIUM', clientOwnerPersonId: cooId },
    ]
  });

  console.log('Seeding assessments...');
  const ass1Id = stableId('ass_1');
  const ass2Id = stableId('ass_2');
  await prisma.assessment.createMany({
    data: [
      { id: ass1Id, clientId: CLIENT_ID, type: 'HR_GOVERNANCE', title: '2026. évi Munkajogi és HR Megfelelõségi Felmérés', status: 'COMPLETED' },
      { id: ass2Id, clientId: CLIENT_ID, type: 'DIGITAL_MATURITY', title: 'Belsõ AI Használat és Adatvédelmi Átvilágítás (AI Governance)', status: 'IN_PROGRESS' },
    ]
  });

  console.log('Demo Kft seeded successfully.');
}

async function main() {
  if (process.env.ADMINICULUM_DEMO_CONTENT_ENABLED !== 'true') {
    console.error('Safety guard: ADMINICULUM_DEMO_CONTENT_ENABLED is not set to true. Aborting demo seed.');
    process.exit(1);
  }
  await teardown();
  await seed();
}

main().catch(e => {
  console.error(e);
  process.exit(1);
}).finally(async () => {
  await prisma.$disconnect();
});
