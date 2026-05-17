/**
 * Debug: dump rebuilt DOCX XML to inspect using JSZip
 */

import JSZip from 'jszip';
import * as fs from 'fs';
import * as path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

async function main() {
  const docPath = path.join(__dirname, '..', 'templates', 'Bejegyzesi_engedely_rebuilt_v1.docx');
  const outPath = path.join(__dirname, '..', 'tmp', 'rebuilt_doc.xml');

  const content = fs.readFileSync(docPath);
  const zip = await JSZip.loadAsync(content);
  
  const xml = await zip.file('word/document.xml').async('string');
  
  fs.writeFileSync(outPath, xml, 'utf8');
  
  console.log(`XML written to: ${outPath}`);
  console.log(`Size: ${xml.length} chars`);
  console.log(`\n=== First 5000 characters ===`);
  console.log(xml.substring(0, 5000));
}

main().catch(console.error);