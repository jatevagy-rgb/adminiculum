/**
 * Rebuild Bejegyzesi Engedely DOCX from scratch using docx npm package
 * Fresh rebuild - no XML from broken DOCX
 */

import { Document, Packer, Paragraph, TextRun, HeadingLevel, AlignmentType } from 'docx';
import * as fs from 'fs';
import * as path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Extracted paragraphs from original DOCX
const paragraphs = [
  { text: "TULAJDONÁTRUHÁZÁSI NYILATKOZAT", alignment: AlignmentType.CENTER, bold: true, size: 28 },
  { text: "- BEJEGYZÉSI ENGEDÉLY -", alignment: AlignmentType.CENTER, bold: true, size: 24 },
  { text: "", alignment: AlignmentType.LEFT }, // empty
  { text: "{{elado_nev}} (születési név: {{elado_szul_nev}}, születési hely, idő: {{elado_szul_hely}}, {{elado_szul_ido}}, anyja neve: {{elado_anya_neve}}, személyi igazolvány száma: {{elado_szemelyi_ig}}, személyi azonosító jele: {{elado_szemelyi_szam}}, adóazonosító jele: {{elado_adoazonosito_jel}}, állampolgársága: {{elado_allampolgarsag}}, lakcím: {{elado_lakcim}}), mint Eladó - a továbbiakban: Eladó -", alignment: AlignmentType.BOTH, size: 24 },
  { text: "feltétlenül és visszavonhatatlanul hozzájárul ahhoz, hogy az ingatlan-nyilvántartásban a {{kormanyhivatal}} által vezetett {{ingatlan_telepules}} {{ingatlan_fekves}} {{ingatlan_helyrajzi_szam}} hrsz. alatt nyilvántartott, {{ingatlan_alapterulet}} m2 alapterületű \"{{ingatlan_tipus_neve}}\" megnevezésű ingatlan és a hozzá tartozó {{ingatlan_tulajdoni_hanyad}} eszmei tulajdoni hányad - a továbbiakban: Ingatlan - vonatkozásában, amely természetben {{ingatlan_iranyitoszam}} {{ingatlan_telepules}}, {{ingatlan_utca}} {{ingatlan_hazszam}} {{ingatlan_emelet_ajto}} szám alatt található,", alignment: AlignmentType.BOTH, size: 24 },
  { text: "{{vevo1_nev}} (születési név: {{vevo1_szul_nev}}, születési hely, idő: {{vevo1_szul_hely}}, {{vevo1_szul_ido}}, anyja neve: {{vevo1_anya_neve}}, személyi azonosító jele: {{vevo1_szemelyi_szam}}, személyi igazolvány száma: {{vevo1_szemelyi_ig}}, adóazonosító jele: {{vevo1_adoazonosito_jel}}, állampolgársága: {{vevo1_allampolgarsag}}, lakcím: {{vevo1_lakcim}}), mint Vevő 1,", alignment: AlignmentType.BOTH, size: 24 },
  { text: "és", alignment: AlignmentType.LEFT, size: 24 },
  { text: "{{vevo2_nev}} (születési név: {{vevo2_szul_nev}}, születési hely, idő: {{vevo2_szul_hely}}, {{vevo2_szul_ido}}, anyja neve: {{vevo2_anya_neve}}, személyi azonosító jele: {{vevo2_szemelyi_szam}}, személyi igazolvány száma: {{vevo2_szemelyi_ig}}, adóazonosító jele: {{vevo2_adoazonosito_jel}}, állampolgársága: {{vevo2_allampolgarsag}}, lakcím: {{vevo2_lakcim}}), mint Vevő 2 - a továbbiakban együtt: Vevők -", alignment: AlignmentType.BOTH, size: 24 },
  { text: "a Vevők tulajdonjoga az Ingatlan {{vevo1_tulajdoni_hanyad}} - {{vevo2_tulajdoni_hanyad}} tulajdoni hányadra, adásvétel jogcímén bejegyzésre kerüljön az ingatlan-nyilvántartásba.", alignment: AlignmentType.BOTH, size: 24 },
  { text: "Jelen nyilatkozat {{bejegyzesi_engedely_peldanyszam}} egymással mindenben megegyező eredeti példányban készült, amelyet az eljáró ügyvéd előtt elolvastunk, annak szövegét és jogi következményeit megértettük, majd mint akaratunkkal mindenben megegyezőt jóváhagyólag aláírtuk.", alignment: AlignmentType.BOTH, size: 24 },
  { text: "{{szerzodes_helye}}, {{szerzodes_datuma}}.", alignment: AlignmentType.LEFT, size: 24 },
  { text: "", alignment: AlignmentType.LEFT }, // empty
  { text: "____________________________", alignment: AlignmentType.CENTER, size: 24 },
  { text: "Eladó", alignment: AlignmentType.CENTER, size: 24 },
  { text: "", alignment: AlignmentType.LEFT }, // empty
  { text: "Készítettem és ellenjegyzem:", alignment: AlignmentType.LEFT, size: 24 },
  { text: "{{ugyved_nev}} ügyvéd", alignment: AlignmentType.LEFT, size: 24 },
  { text: "KASZ: {{ugyved_kasz}}", alignment: AlignmentType.LEFT, size: 24 },
  { text: "Ellenjegyzés helye és időpontja: {{szerzodes_helye}}, {{ellenjegyzes_datuma}}", alignment: AlignmentType.LEFT, size: 24 },
];

// Build document paragraphs
const docParagraphs = paragraphs.map(p => {
  return new Paragraph({
    alignment: p.alignment,
    children: [
      new TextRun({
        text: p.text,
        size: p.size, // in half-points (24 = 12pt)
        bold: p.bold || false,
        font: "Times New Roman",
      }),
    ],
  });
});

// Create document
const doc = new Document({
  sections: [{
    properties: {
      page: {
        size: {
          width: 12240, // twips (12240 = 8.5 inches)
          height: 15840, // 11 inches
        },
        margin: {
          top: 1247,
          right: 1417,
          bottom: 1247,
          left: 1417,
          header: 720,
          footer: 720,
          gutter: 0,
        },
      },
    },
    children: docParagraphs,
  }],
});

// Generate and save
async function main() {
  console.log("Generating fresh DOCX...");
  
  const buffer = await Packer.toBuffer(doc);
  
  const outputPath = path.join(__dirname, '..', 'templates', 'Bejegyzesi_engedely_rebuilt_v1.docx');
  
  fs.writeFileSync(outputPath, buffer);
  
  console.log(`✓ Rebuilt DOCX saved to: ${outputPath}`);
  console.log(`  File size: ${buffer.length} bytes`);
}

main().catch(console.error);
