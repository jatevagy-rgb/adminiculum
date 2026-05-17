/**
 * Backend test: test rebuilt DOCX with contracts service
 */

import * as fs from 'fs';
import * as path from 'path';
import { fileURLToPath } from 'url';
import PizZip from 'pizzip';
import Docxtemplater from 'docxtemplater';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

async function main() {
  console.log("=== BACKEND SERVICE TEST ===\n");
  
  // Use the rebuilt DOCX
  const docPath = path.join(__dirname, '..', 'templates', 'Bejegyzesi_engedely_rebuilt_v1.docx');
  console.log(`Loading: ${docPath}`);
  
  const content = fs.readFileSync(docPath, 'binary');
  const zip = new PizZip(content);
  
  // Use the same config as backend service
  const doc = new Docxtemplater(zip, {
    delimiters: {
      start: '{{',
      end: '}}',
    },
  });
  
  // Test data (minimal, only required fields)
  const testData = {
    elado_nev: 'Teszt Elek',
    elado_szul_nev: 'Teszt',
    elado_szul_hely: 'Budapest',
    elado_szul_ido: '1990-01-01',
    elado_anya_neve: 'Teszt Mária',
    elado_szemelyi_ig: '123456AB',
    elado_szemelyi_szam: '1234567890',
    elado_adoazonosito_jel: '1234567890',
    elado_allampolgarsag: 'magyar',
    elado_lakcim: '1111 Budapest, Teszt utca 1.',
    kormanyhivatal: 'Budapesti Kormányhivatal',
    ingatlan_telepules: 'Budapest',
    ingatlan_fekves: 'II. kerület',
    ingatlan_helyrajzi_szam: '12345',
    ingatlan_alapterulet: '100',
    ingatlan_tipus_neve: 'lakás',
    ingatlan_tulajdoni_hanyad: '1/1',
    ingatlan_iranyitoszam: '1024',
    ingatlan_utca: 'Teszt út',
    ingatlan_hazszam: '10',
    ingatlan_emelet_ajto: 'fsz. 1.',
    vevo1_nev: 'Vevő Béla',
    vevo1_szul_nev: 'Vevő',
    vevo1_szul_hely: 'Budapest',
    vevo1_szul_ido: '1995-01-01',
    vevo1_anya_neve: 'Vevő Éva',
    vevo1_szemelyi_szam: '9876543210',
    vevo1_szemelyi_ig: '654321CD',
    vevo1_adoazonosito_jel: '9876543210',
    vevo1_allampolgarsag: 'magyar',
    vevo1_lakcim: '1111 Budapest, Vevő utca 2.',
    vevo2_nev: 'Vevő Cintia',
    vevo2_szul_nev: 'Vevő',
    vevo2_szul_hely: 'Budapest',
    vevo2_szul_ido: '1996-01-01',
    vevo2_anya_neve: 'Vevő Anna',
    vevo2_szemelyi_szam: '1122334455',
    vevo2_szemelyi_ig: '789012EF',
    vevo2_adoazonosito_jel: '1122334455',
    vevo2_allampolgarsag: 'magyar',
    vevo2_lakcim: '1111 Budapest, Vevő utca 3.',
    vevo1_tulajdoni_hanyad: '1/2',
    vevo2_tulajdoni_hanyad: '1/2',
    bejegyzesi_engedely_peldanyszam: '2',
    szerzodes_helye: 'Budapest',
    szerzodes_datuma: '2024. január 15.',
    ugyved_nev: 'Dr. Ügyvéd János',
    ugyved_kasz: '12345',
    ellenjegyzes_datuma: '2024. január 15.',
  };
  
  console.log("Setting test data...");
  doc.setData(testData);
  
  console.log("Rendering...");
  try {
    doc.render();
    console.log("✓ Document rendered successfully!");
    
    // Generate output
    const outBuf = doc.getZip().generate({ type: 'nodebuffer' });
    const outPath = path.join(__dirname, '..', 'uploads', 'generated', 'test_rebuilt_v1.docx');
    
    // Ensure directory exists
    const dir = path.dirname(outPath);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
    
    fs.writeFileSync(outPath, outBuf);
    console.log(`✓ Saved to: ${outPath}`);
    console.log(`  File size: ${outBuf.length} bytes`);
    
    console.log("\n=== BACKEND SERVICE TEST: SUCCESS ===");
    
  } catch (e) {
    console.error("Error rendering:", e.message);
    console.error(e.properties);
    process.exit(1);
  }
}

main().catch(console.error);