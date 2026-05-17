import { Document, Packer, Paragraph, TextRun, AlignmentType } from 'docx';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const templatesDir = path.join(__dirname, '..', 'templates');

function p(text, options = {}) {
  return new Paragraph({
    alignment: options.alignment || AlignmentType.LEFT,
    spacing: options.spacing || { after: 120 },
    children: [
      new TextRun({
        text,
        bold: Boolean(options.bold),
        size: options.size || 24,
        font: 'Times New Roman',
      }),
    ],
  });
}

function sectionTitle(text) {
  return p(text, { bold: true, size: 24, spacing: { before: 160, after: 120 } });
}

function buildAtveteliElismervenyDoc() {
  const children = [
    p('ÁTVÉTELI ELISMERVÉNY', { alignment: AlignmentType.CENTER, bold: true, size: 30, spacing: { after: 200 } }),
    p('Adásvételi szerződéshez kapcsolódó pénzügyi teljesítés visszaigazolása', { alignment: AlignmentType.CENTER, size: 20, spacing: { after: 260 } }),

    p('Kapcsolódó ügy azonosító: {{_bundle_case_ref}}'),
    p('Kapcsolódó fődokumentum: {{_bundle_main_title}}'),
    p('Dokumentum generálásának ideje: {{_bundle_generated_at}}', { spacing: { after: 220 } }),

    sectionTitle('1. Szerződés adatai'),
    p('Szerződés kelte: {{adasveteli_szerzodes_datuma}}'),
    p('Szerződés helye: {{szerzodes_helye}}'),

    sectionTitle('2. Felek adatai'),
    p('Eladó: {{elado_nev}}'),
    p('Vevő 1: {{vevo1_nev}}'),
    p('Vevő 2 (ha van): {{vevo2_nev}}'),

    sectionTitle('3. Ingatlan adatai'),
    p('Ingatlan címe: {{ingatlan_iranyitoszam}} {{ingatlan_telepules}}, {{ingatlan_utca}} {{ingatlan_hazszam}} {{ingatlan_emelet_ajto}}'),
    p('Helyrajzi szám: {{ingatlan_helyrajzi_szam}}'),

    sectionTitle('4. Átvétel tárgya'),
    p('Eladó jelen okirat aláírásával elismeri, hogy a Vevő(k)től az adásvételi szerződés {{onero_hivatkozas_pontja}} pontjában hivatkozott önerő/vételárrész összegét átvette.'),
    p('Átvett összeg (számmal): {{onero_osszeg_szam}} Ft'),
    p('Átvett összeg (betűvel): {{onero_osszeg_betu}}'),

    sectionTitle('5. Záró rendelkezések'),
    p('Jelen átvételi elismervény kizárólag az átvett összeg igazolására szolgál, és az adásvételi szerződés egyéb rendelkezéseit nem módosítja.'),

    p('Kelt: {{szerzodes_helye}}, {{szerzodes_datuma}}', { spacing: { before: 260, after: 360 } }),

    p('_______________________________', { alignment: AlignmentType.CENTER, spacing: { after: 40 } }),
    p('Eladó aláírása', { alignment: AlignmentType.CENTER, spacing: { after: 220 } }),

    p('Ellenjegyzem:', { spacing: { after: 80 } }),
    p('{{ugyved_nev}} ügyvéd'),
    p('KASZ: {{ugyved_kasz}}'),
    p('Ügyvédi iroda: {{ugyvedi_iroda_neve}} ({{ugyvedi_iroda_szekhelye}})'),
    p('Ellenjegyzés helye és ideje: {{ellenjegyzes_helye}}, {{ellenjegyzes_datuma}}'),
  ];

  return new Document({
    sections: [{ children }],
  });
}

function buildBirtokbaadasiJegyzokonyvDoc() {
  const children = [
    p('BIRTOKBAADÁSI / ÁTADÁS-ÁTVÉTELI JEGYZŐKÖNYV', { alignment: AlignmentType.CENTER, bold: true, size: 30, spacing: { after: 200 } }),
    p('Adásvételi szerződés teljesítéséhez kapcsolódó birtokátruházás rögzítése', { alignment: AlignmentType.CENTER, size: 20, spacing: { after: 260 } }),

    p('Kapcsolódó ügy azonosító: {{_bundle_case_ref}}'),
    p('Kapcsolódó fődokumentum: {{_bundle_main_title}}'),
    p('Dokumentum generálásának ideje: {{_bundle_generated_at}}', { spacing: { after: 220 } }),

    sectionTitle('1. Szerződés és felek'),
    p('Szerződés kelte: {{adasveteli_szerzodes_datuma}}'),
    p('Eladó: {{elado_nev}}'),
    p('Vevő 1: {{vevo1_nev}}'),
    p('Vevő 2 (ha van): {{vevo2_nev}}'),

    sectionTitle('2. Ingatlan azonosítása'),
    p('Cím: {{ingatlan_iranyitoszam}} {{ingatlan_telepules}}, {{ingatlan_utca}} {{ingatlan_hazszam}} {{ingatlan_emelet_ajto}}'),
    p('Helyrajzi szám: {{ingatlan_helyrajzi_szam}}'),
    p('Alapterület: {{ingatlan_alapterulet}} m²'),

    sectionTitle('3. Birtokbaadás ténye'),
    p('A felek rögzítik, hogy az ingatlan birtokbaadása az alábbi napon megtörtént:'),
    p('Birtokbaadás dátuma: {{birtokbaadas_datuma}}'),
    p('A birtokbaadás jogalapja az adásvételi szerződés {{leteti_hivatkozas_pontja}} pontja.'),

    sectionTitle('4. Mérőóra állások (amennyiben releváns)'),
    p('Villanyóra állás: {{meroora_aram}}'),
    p('Vízóra állás: {{meroora_viz}}'),

    sectionTitle('5. Átadott kulcsok és megjegyzések'),
    p('Átadott kulcsok száma: {{kulcsok_szama}}'),
    p('Megjegyzés: {{atadas_megjegyzes}}'),

    sectionTitle('6. Nyilatkozatok'),
    p('A felek kijelentik, hogy az ingatlan birtokbaadását és átvételét a fenti adatoknak megfelelően teljesítették.'),
    p('A felek tudomásul veszik, hogy a közüzemi átírás és egyéb üzemeltetési kötelezettségek a birtokbaadás napjától a Vevő(ke)t terhelik.'),

    p('Kelt: {{szerzodes_helye}}, {{szerzodes_datuma}}', { spacing: { before: 260, after: 300 } }),

    p('_______________________________', { alignment: AlignmentType.LEFT, spacing: { after: 40 } }),
    p('Eladó aláírása', { alignment: AlignmentType.LEFT, spacing: { after: 180 } }),

    p('_______________________________', { alignment: AlignmentType.LEFT, spacing: { after: 40 } }),
    p('Vevő(k) aláírása', { alignment: AlignmentType.LEFT, spacing: { after: 180 } }),

    p('Ellenjegyzem:', { spacing: { after: 80 } }),
    p('{{ugyved_nev}} ügyvéd'),
    p('KASZ: {{ugyved_kasz}}'),
    p('Ügyvédi iroda: {{ugyvedi_iroda_neve}} ({{ugyvedi_iroda_szekhelye}})'),
    p('Ellenjegyzés helye és ideje: {{ellenjegyzes_helye}}, {{ellenjegyzes_datuma}}'),
  ];

  return new Document({
    sections: [{ children }],
  });
}

async function writeDocx(document, outputFileName) {
  const outputPath = path.join(templatesDir, outputFileName);
  const buffer = await Packer.toBuffer(document);
  fs.writeFileSync(outputPath, buffer);
  console.log(`Created: ${outputPath}`);
}

async function main() {
  if (!fs.existsSync(templatesDir)) {
    fs.mkdirSync(templatesDir, { recursive: true });
  }

  await writeDocx(
    buildAtveteliElismervenyDoc(),
    'Atveteli_elismerveny_backend_ready_template.docx',
  );

  await writeDocx(
    buildBirtokbaadasiJegyzokonyvDoc(),
    'Birtokbaadasi_jegyzokonyv_backend_ready_template.docx',
  );
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
