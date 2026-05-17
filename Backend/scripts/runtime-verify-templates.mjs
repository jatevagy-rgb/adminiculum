import 'dotenv/config';
import fs from 'fs';
import path from 'path';
import contractsServiceModule from '../src/modules/contracts/services.ts';
const contractsService = contractsServiceModule?.default || contractsServiceModule;
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();
const templatesDir = 'C:/Users/hubay/Documents/Adminiculum/Backend/templates';

const mappings = [
  {
    id: 'c926deb4-e028-4275-8bde-46323899d8d5',
    docId: 'reg_consent',
    file: 'Bejegyzesi_engedely_backend_ready_template.docx',
    payload: {
      szerzodes_helye: 'Budapest',
      szerzodes_datuma: '2026-03-29',
      elado_nev: 'Minta Eladó',
      elado_szul_nev: 'Eladó Születési Név',
      elado_anya_neve: 'Eladó Anyja',
      elado_szul_hely: 'Budapest',
      elado_szul_ido: '1980-01-01',
      elado_lakcim: '1111 Budapest Teszt utca 1.',
      elado_szemelyi_ig: 'AA123456',
      elado_szemelyi_szam: '123456AB',
      elado_adoazonosito_jel: '1234567890',
      elado_allampolgarsag: 'magyar',
      vevo1_nev: 'Vevő 1',
      vevo1_szul_nev: 'Vevő 1 szül',
      vevo1_anya_neve: 'Vevő 1 anyja',
      vevo1_szul_hely: 'Győr',
      vevo1_szul_ido: '1990-02-02',
      vevo1_lakcim: '2222 Budapest Próba utca 2.',
      vevo1_szemelyi_ig: 'BB123456',
      vevo1_szemelyi_szam: '654321CD',
      vevo1_adoazonosito_jel: '1111111111',
      vevo1_allampolgarsag: 'magyar',
      vevo1_tulajdoni_hanyad: '1/1',
      vevo2_nev: '',
      vevo2_szul_nev: '',
      vevo2_anya_neve: '',
      vevo2_szul_hely: '',
      vevo2_szul_ido: '',
      vevo2_lakcim: '',
      vevo2_szemelyi_ig: '',
      vevo2_szemelyi_szam: '',
      vevo2_adoazonosito_jel: '',
      vevo2_allampolgarsag: '',
      vevo2_tulajdoni_hanyad: '',
      ingatlan_alapterulet: '72',
      ingatlan_emelet_ajto: '2/4',
      ingatlan_fekves: 'belterület',
      ingatlan_hazszam: '10',
      ingatlan_helyrajzi_szam: '12345/6',
      ingatlan_iranyitoszam: '1111',
      ingatlan_telepules: 'Budapest',
      ingatlan_tipus_neve: 'lakás',
      ingatlan_tulajdoni_hanyad: '1/1',
      ingatlan_utca: 'Teszt utca',
      kormanyhivatal: 'Budapest Főváros Kormányhivatala',
      bejegyzesi_engedely_peldanyszam: '6',
      ellenjegyzes_datuma: '2026-03-29',
      ugyved_kasz: 'KASZ-123',
      ugyved_nev: 'Dr. Teszt Ügyvéd',
    },
  },
  {
    id: 'f8c6fb92-5903-4322-8ab6-4db60bcb0404',
    docId: 'escrow_cert',
    file: 'Leteti_igazolas_backend_ready_template.docx',
    payload: {
      adasveteli_szerzodes_datuma: '2026-03-29',
      bejegyzesi_engedely_benyujtasi_hatarido_nap: '15',
      bejegyzesi_engedely_peldanyszam: '6',
      elado_adoazonosito_jel: '1234567890',
      elado_allampolgarsag: 'magyar',
      elado_anya_neve: 'Eladó Anyja',
      elado_lakcim: '1111 Budapest Teszt utca 1.',
      elado_nev: 'Minta Eladó',
      elado_szemelyi_ig: 'AA123456',
      elado_szemelyi_szam: '123456AB',
      elado_szul_hely: 'Budapest',
      elado_szul_ido: '1980-01-01',
      elado_szul_nev: 'Eladó Születési Név',
      ingatlan_alapterulet: '72',
      ingatlan_emelet_ajto: '2/4',
      ingatlan_fekves: 'belterület',
      ingatlan_hazszam: '10',
      ingatlan_helyrajzi_szam: '12345/6',
      ingatlan_iranyitoszam: '1111',
      ingatlan_telepules: 'Budapest',
      ingatlan_tipus_neve: 'lakás',
      ingatlan_utca: 'Teszt utca',
      kormanyhivatal: 'Budapest Főváros Kormányhivatala',
      leteti_hivatkozas_pontja: '8. pont',
      szerzodes_datuma: '2026-03-29',
      szerzodes_helye: 'Budapest',
      ugyved_kasz: 'KASZ-123',
      ugyved_nev: 'Dr. Teszt Ügyvéd',
      ugyvedi_iroda_neve: 'Teszt Ügyvédi Iroda',
      ugyvedi_iroda_szekhelye: '1111 Budapest Iroda utca 3.',
      vevo1_adoazonosito_jel: '1111111111',
      vevo1_allampolgarsag: 'magyar',
      vevo1_anya_neve: 'Vevő 1 anyja',
      vevo1_lakcim: '2222 Budapest Próba utca 2.',
      vevo1_nev: 'Vevő 1',
      vevo1_szemelyi_ig: 'BB123456',
      vevo1_szemelyi_szam: '654321CD',
      vevo1_szul_hely: 'Győr',
      vevo1_szul_ido: '1990-02-02',
      vevo1_szul_nev: 'Vevő 1 szül',
      vevo1_tulajdoni_hanyad: '1/1',
    },
  },
  {
    id: 'e05b2c0e-c40a-4bd4-ad47-17cc865e1b95',
    docId: 'own_funds',
    file: 'Onero_nyilatkozat_backend_ready_template.docx',
    payload: {
      adasveteli_szerzodes_datuma: '2026-03-29',
      elado_adoazonosito_jel: '1234567890',
      elado_allampolgarsag: 'magyar',
      elado_anya_neve: 'Eladó Anyja',
      elado_lakcim: '1111 Budapest Teszt utca 1.',
      elado_nev: 'Minta Eladó',
      elado_szemelyi_ig: 'AA123456',
      elado_szemelyi_szam: '123456AB',
      elado_szul_hely: 'Budapest',
      elado_szul_ido: '1980-01-01',
      elado_szul_nev: 'Eladó Születési Név',
      ellenjegyzes_datuma: '2026-03-29',
      ellenjegyzes_helye: 'Budapest',
      ingatlan_alapterulet: '72',
      ingatlan_emelet_ajto: '2/4',
      ingatlan_fekves: 'belterület',
      ingatlan_hazszam: '10',
      ingatlan_helyrajzi_szam: '12345/6',
      ingatlan_iranyitoszam: '1111',
      ingatlan_telepules: 'Budapest',
      ingatlan_tipus_neve: 'lakás',
      ingatlan_utca: 'Teszt utca',
      kormanyhivatal: 'Budapest Főváros Kormányhivatala',
      onero_hivatkozas_pontja: '5. pont',
      onero_osszeg_betu: 'tizenötmillió forint',
      onero_osszeg_szam: '15000000',
      szerzodes_datuma: '2026-03-29',
      szerzodes_helye: 'Budapest',
      ugyved_kasz: 'KASZ-123',
      ugyved_nev: 'Dr. Teszt Ügyvéd',
      vevo1_adoazonosito_jel: '1111111111',
      vevo1_allampolgarsag: 'magyar',
      vevo1_anya_neve: 'Vevő 1 anyja',
      vevo1_lakcim: '2222 Budapest Próba utca 2.',
      vevo1_nev: 'Vevő 1',
      vevo1_szemelyi_ig: 'BB123456',
      vevo1_szemelyi_szam: '654321CD',
      vevo1_szul_hely: 'Győr',
      vevo1_szul_ido: '1990-02-02',
      vevo1_szul_nev: 'Vevő 1 szül',
    },
  },
  {
    id: '1de2bb7f-8559-4588-b892-d78300a7f213',
    docId: 'iny_request',
    file: 'INY_kerelem_backend_ready_template.docx',
    payload: {
      egyeb_megjegyzes: '',
      fizetesi_mod: 'átutalás',
      igazgatasi_szolgaltatasi_dij: '10600',
      ingatlan_dij: '0',
      ingatlan_fekves: 'belterület',
      ingatlan_helyrajzi_szam: '12345/6',
      ingatlan_nyilvantartasi_iktatoszam: 'IKT-123',
      ingatlan_telepules: 'Budapest',
      jogi_kepviselo_neve: 'Dr. Teszt Ügyvéd',
      jogi_kepviselo_szekhelye: '1111 Budapest Iroda utca 3.',
      jogi_kepviselo_tarhely: 'KRID123',
      kerelem_datuma: '2026-03-29',
      kerelem_helye: 'Budapest',
      kerelem_targya: 'Tulajdonjog bejegyzése',
      kerelmezo1_adoazonosito_jel: '1111111111',
      kerelmezo1_nev: 'Vevő 1',
      kerelmezo1_szemelyi_azonosito: '654321CD',
      kerelmezo1_szul_nev: 'Vevő 1 szül',
      kerelmezo2_adoazonosito_jel: '',
      kerelmezo2_nev: '',
      kerelmezo2_szemelyi_azonosito: '',
      kerelmezo2_szul_nev: '',
      kerelmezo3_adoazonosito_jel: '',
      kerelmezo3_nev: '',
      kerelmezo3_szemelyi_azonosito: '',
      kerelmezo3_szul_nev: '',
      mellekletek_felsorolasa: 'adásvételi szerződés; bejegyzési engedély',
      mentesseg_jogalapja: 'nincs',
      mezogazdasagi_jovahagyas_nyilatkozat: 'nem releváns',
      soron_kivuli_igenyles: 'nem',
    },
  },
  {
    id: '76f91d0f-fe66-4fef-bfca-8043750e967f',
    docId: 'main_sale_osztatlan',
    file: 'adasveteli_backend_ready_osztatlan_template_backend_hu_fixed.docx',
    payload: {
      szerzodes_helye: 'Budapest',
      szerzodes_datuma: '2026-03-29',
      elado_nev: 'Minta Eladó',
      elado_szul_nev: 'Eladó Születési Név',
      elado_anya_neve: 'Eladó Anyja',
      elado_szul_hely: 'Budapest',
      elado_szul_ido: '1980-01-01',
      elado_lakcim: '1111 Budapest Teszt utca 1.',
      elado_szemelyi_ig: 'AA123456',
      elado_szemelyi_szam: '123456AB',
      elado_adoazonosito_jel: '1234567890',
      elado_allampolgarsag: 'magyar',
      vevo_nev: 'Minta Vevő',
      vevo_szul_nev: 'Vevő Születési Név',
      vevo_anya_neve: 'Vevő Anyja',
      vevo_szul_hely: 'Győr',
      vevo_szul_ido: '1990-02-02',
      vevo_lakcim: '2222 Budapest Próba utca 2.',
      vevo_szemelyi_ig: 'BB123456',
      vevo_szemelyi_szam: '654321CD',
      vevo_adoazonosito_jel: '1111111111',
      vevo_allampolgarsag: 'magyar',
      ingatlan_telepules: 'Budapest',
      ingatlan_helyrajzi_szam: '12345/6',
      ingatlan_iranyitoszam: '1111',
      ingatlan_utca: 'Teszt utca',
      ingatlan_hazszam: '10',
      ingatlan_emelet_ajto: '2/4',
      ingatlan_alapterulet: 72,
      ingatlan_tipus_neve: 'lakás',
      ingatlan_tulajdoni_hanyad: '1/2',
      kozos_tulajdoni_hanyad: '1/2',
      tulajdoni_lap_sorszam: 'TL-123',
      kormanyhivatal: 'Budapest Főváros Kormányhivatala',
      belterulet: 72,
      vetelar: 52500000,
      birtokbaadas_datuma: '2026-04-30',
    },
  },
];

const updates = [];
const results = [];

for (const item of mappings) {
  const row = await prisma.contractTemplate.findUnique({ where: { id: item.id } });
  if (!row) {
    throw new Error(`Missing row ${item.id}`);
  }

  const newTemplatePath = path.join(templatesDir, item.file).replace(/\\/g, '/');
  await prisma.contractTemplate.update({
    where: { id: item.id },
    data: {
      templatePath: newTemplatePath,
      originalFileName: item.file,
    },
  });

  updates.push({
    id: item.id,
    oldTemplatePath: row.templatePath,
    newTemplatePath,
  });

  const updated = await prisma.contractTemplate.findUnique({ where: { id: item.id } });
  const payload = { ...item.payload };
  for (const variable of (updated?.variables || [])) {
    if (payload[variable.name] === undefined) {
      payload[variable.name] = '';
    }
  }

  const preview = await contractsService.generatePreview({ templateId: item.id, data: payload });
  const generated = await contractsService.generateContract({
    templateId: item.id,
    caseId: '1',
    title: `${item.docId} runtime verify`,
    data: payload,
  });

  const previewRawError = preview.rawError || null;
  const generateRawError = generated.rawError || null;
  const previewStage = previewRawError?.properties?.errors?.length ? 'parse stage' : 'render stage';
  const generateStage = generateRawError?.properties?.errors?.length ? 'parse stage' : 'render stage';
  const firstPreviewIssue = previewRawError?.properties?.errors?.[0] || null;
  const firstGenerateIssue = generateRawError?.properties?.errors?.[0] || null;

  results.push({
    templateName: row.name,
    previewRawError: previewRawError,
    generateRawError: generateRawError,
    previewStage,
    generateStage,
    firstActionableMalformedTag: firstPreviewIssue || firstGenerateIssue,
  });
}

console.log(JSON.stringify({ updates, results }, null, 2));
await prisma.$disconnect();
