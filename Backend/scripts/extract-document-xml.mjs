import fs from 'fs';
import path from 'path';
import PizZip from 'pizzip';

const TEMPLATE_PATH = 'Backend/templates/Bejegyzesi_engedely_backend_ready_template_xmlfixed_v4.docx';

function extractDocumentXml() {
  try {
    const binary = fs.readFileSync(TEMPLATE_PATH);
    const zip = new PizZip(binary);
    const documentXml = zip.file('word/document.xml').asText();
    
    console.log('=== DOCUMENT.XML CONTENT ===');
    console.log('Length:', documentXml.length, 'characters');
    console.log('');
    
    // Show content around offset 53
    const start = Math.max(0, 53 - 30);
    const end = Math.min(documentXml.length, 53 + 30);
    const snippet = documentXml.slice(start, end);
    
    console.log(`Content around offset 53:`);
    console.log(`Position ${start}-${end}:`);
    console.log(JSON.stringify(snippet));
    console.log('');
    
    // Show the exact characters at offset 50-60
    const exactSnippet = documentXml.slice(50, 60);
    console.log(`Exact chars 50-60: ${JSON.stringify(exactSnippet)}`);
    console.log(`Char codes: [...${Array.from(exactSnippet, c => c.charCodeAt(0)).join(', ')}]`);
    console.log('');
    
    // Look for the problematic pattern mentioned in the error
    console.log('Searching for "{{elad" pattern:');
    const eladPos = documentXml.indexOf('{{elad');
    if (eladPos !== -1) {
      console.log(`Found "{{elad" at position ${eladPos}`);
      const context = documentXml.slice(Math.max(0, eladPos - 20), Math.min(documentXml.length, eladPos + 20));
      console.log(`Context: ${JSON.stringify(context)}`);
    } else {
      console.log('Pattern "{{elad" not found');
    }
    
    // Look for duplicate patterns
    console.log('\nChecking for duplicate braces:');
    const openBracesMatches = documentXml.match(/\{\{/g);
    const closeBracesMatches = documentXml.match(/\}\}/g);
    const openBraces = openBracesMatches ? openBracesMatches.length : 0;
    const closeBraces = closeBracesMatches ? closeBracesMatches.length : 0;
    console.log(`Found {{ count: ${openBraces}}`);
    console.log(`Found }} count: ${closeBraces}`);
    
    // Save full XML for inspection
    fs.writeFileSync('Backend/templates/document.xml.extracted', documentXml);
    console.log('\nFull document.xml saved to: Backend/templates/document.xml.extracted');
    
  } catch (error) {
    console.error('Error:', error);
  }
}

extractDocumentXml();