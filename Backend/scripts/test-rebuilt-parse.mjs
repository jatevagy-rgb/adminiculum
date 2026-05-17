/**
 * Standalone parse test for rebuilt Bejegyzesi Engedely DOCX
 * Tests if Docxtemplater can parse the fresh DOCX
 */

import PizZip from 'pizzip';
import Docxtemplater from 'docxtemplater';
import * as fs from 'fs';
import * as path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

async function main() {
  console.log("=== STANDALONE PARSE TEST ===\n");
  
  const docPath = path.join(__dirname, '..', 'templates', 'Bejegyzesi_engedely_rebuilt_v1.docx');
  
  console.log(`Loading: ${docPath}`);
  const content = fs.readFileSync(docPath);
  
  console.log(`File size: ${content.length} bytes`);
  
  try {
    // Initialize PizZip
    const zip = new PizZip(content);
    console.log("✓ PizZip initialized");
    
    // Initialize Docxtemplater with explicit delimiters
    const doc = new Docxtemplater(zip, {
      paragraphLoop: true,
      linebreaks: true,
      delimiters: { start: '{{', end: '}}' }
    });
    console.log("✓ Docxtemplater initialized");
    
    // Try to get the full text (this triggers the parser)
    const text = doc.getFullText();
    console.log(`✓ Document parsed, ${text.length} characters`);
    
    // Check for placeholders
    const placeholderRegex = /\{\{[^}]+\}\}/g;
    const placeholders = text.match(placeholderRegex) || [];
    const uniquePlaceholders = [...new Set(placeholders)];
    
    console.log(`\n✓ Found ${placeholders.length} placeholder instances (${uniquePlaceholders.length} unique):`);
    uniquePlaceholders.slice(0, 10).forEach(p => console.log(`  - ${p}`));
    if (uniquePlaceholders.length > 10) {
      console.log(`  ... and ${uniquePlaceholders.length - 10} more`);
    }
    
    console.log("\n=== STANDALONE PARSE: SUCCESS ===");
    
  } catch (error) {
    console.error("\n=== STANDALONE PARSE: FAILED ===");
    console.error("Error:", error.message);
    if (error.properties) {
      console.error("Properties:", JSON.stringify(error.properties, null, 2));
    }
    process.exit(1);
  }
}

main().catch(console.error);