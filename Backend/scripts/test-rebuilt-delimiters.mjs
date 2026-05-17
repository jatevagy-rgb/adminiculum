/**
 * Try Docxtemplater with explicit options
 */

import PizZip from 'pizzip';
import Docxtemplater from 'docxtemplater';
import * as fs from 'fs';
import * as path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

async function main() {
  console.log("=== DOCXTEMPLATER DEBUG TEST ===\n");
  
  const docPath = path.join(__dirname, '..', 'templates', 'Bejegyzesi_engedely_rebuilt_v1.docx');
  const content = fs.readFileSync(docPath);
  
  const zip = new PizZip(content);
  
  // Try with explicit delimiters
  const doc = new Docxtemplater(zip, {
    paragraphLoop: true,
    linebreaks: true,
    delimiters: { start: '{{', end: '}}' }
  });
  
  console.log("Docxtemplater created successfully");
  
  // Try to get text
  try {
    const text = doc.getFullText();
    console.log(`Text extracted: ${text.length} chars`);
    console.log(`\n=== First 500 chars of text ===`);
    console.log(text.substring(0, 500));
    
    // Count placeholders
    const matches = text.match(/\{\{[^}]+\}\}/g);
    console.log(`\n=== Found ${matches ? matches.length : 0} placeholders ===`);
    if (matches) {
      console.log(matches.slice(0, 20));
    }
    
    console.log("\n=== SUCCESS ===");
  } catch (e) {
    console.error("Error getting full text:", e.message);
    console.error(e.properties);
  }
}

main().catch(console.error);