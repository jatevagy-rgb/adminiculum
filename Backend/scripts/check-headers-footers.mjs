import fs from 'fs';
import path from 'path';
import PizZip from 'pizzip';

const TEMPLATE_PATH = 'Backend/templates/Bejegyzesi_engedely_backend_ready_template_xmlfixed_v4.docx';

function checkHeadersFooters() {
  try {
    const binary = fs.readFileSync(TEMPLATE_PATH);
    const zip = new PizZip(binary);
    
    console.log('=== CHECKING HEADERS AND FOOTERS ===');
    
    // Get all files
    const files = Object.keys(zip.files);
    console.log(`Total files in DOCX: ${files.length}`);
    
    // Filter for headers and footers
    const headerFiles = files.filter(f => f.startsWith('word/header'));
    const footerFiles = files.filter(f => f.startsWith('word/footer'));
    
    console.log(`Header files found: ${headerFiles.length}`);
    console.log(`Footer files found: ${footerFiles.length}`);
    
    // Check headers
    for (const headerFile of headerFiles) {
      try {
        const headerXml = zip.file(headerFile).asText();
        console.log(`\n--- ${headerFile} ---`);
        console.log(`Length: ${headerXml.length} chars`);
        
        // Check for placeholders
        const placeholderMatches = headerXml.match(/\{\{[^}]+\}\}/g);
        if (placeholderMatches && placeholderMatches.length > 0) {
          console.log(`Placeholders found: ${placeholderMatches.join(', ')}`);
          // Show context around first placeholder
          const firstPlaceholder = headerXml.indexOf('{{');
          if (firstPlaceholder !== -1) {
            const context = headerXml.slice(Math.max(0, firstPlaceholder - 30), Math.min(headerXml.length, firstPlaceholder + 50));
            console.log(`Context: ${JSON.stringify(context)}`);
          }
        } else {
          console.log('No placeholders found');
        }
      } catch (error) {
        console.log(`Error reading ${headerFile}: ${error.message}`);
      }
    }
    
    // Check footers
    for (const footerFile of footerFiles) {
      try {
        const footerXml = zip.file(footerFile).asText();
        console.log(`\n--- ${footerFile} ---`);
        console.log(`Length: ${footerXml.length} chars`);
        
        // Check for placeholders
        const placeholderMatches = footerXml.match(/\{\{[^}]+\}\}/g);
        if (placeholderMatches && placeholderMatches.length > 0) {
          console.log(`Placeholders found: ${placeholderMatches.join(', ')}`);
          // Show context around first placeholder
          const firstPlaceholder = footerXml.indexOf('{{');
          if (firstPlaceholder !== -1) {
            const context = footerXml.slice(Math.max(0, firstPlaceholder - 30), Math.min(footerXml.length, firstPlaceholder + 50));
            console.log(`Context: ${JSON.stringify(context)}`);
          }
        } else {
          console.log('No placeholders found');
        }
      } catch (error) {
        console.log(`Error reading ${footerFile}: ${error.message}`);
      }
    }
    
  } catch (error) {
    console.error('Error:', error);
  }
}

checkHeadersFooters();