import fs from 'fs';
import path from 'path';
import PizZip from 'pizzip';
import Docxtemplater from 'docxtemplater';
import contractsServiceModule from '../src/modules/contracts/services.ts';

const contractsService = contractsServiceModule?.default || contractsServiceModule;

const TEMPLATE_PATH = 'Backend/templates/Bejegyzesi_engedely_backend_ready_template_xmlfixed_v4.docx';
const OUTPUT_PATH = 'Backend/templates/Bejegyzesi_engedely_backend_ready_template_xmlfixed_v6.docx';

function directParseDocx(filePath) {
  try {
    const binary = fs.readFileSync(filePath, 'binary');
    const zip = new PizZip(binary);
    new Docxtemplater(zip);
    return { success: true, error: null };
  } catch (error) {
    return {
      success: false,
      error: contractsService.serializeTemplateError
        ? contractsService.serializeTemplateError(error)
        : { message: error instanceof Error ? error.message : String(error) },
    };
  }
}

function getTemplateErrorDetails(error) {
  const source = contractsService.serializeTemplateError
    ? contractsService.serializeTemplateError(error)
    : { properties: { errors: [] }, message: error instanceof Error ? error.message : String(error) };
  const nested = source?.properties?.errors || [];
  return nested[0] || source;
}

function findAndReplaceProblematicParagraph(xml) {
  // Find the problematic paragraph that contains duplicate {{elado_nev}}
  const paragraphRegex = /<w:p[\s\S]*?<\/w:p>/g;
  
  let match;
  let lastEnd = 0;
  let found = false;
  
  while ((match = paragraphRegex.exec(xml)) !== null) {
    const paragraphXml = match[0];
    const start = match.index;
    const end = start + paragraphXml.length;
    
    // Check if this paragraph contains the problematic pattern
    if (paragraphXml.includes('{{elado_nev}} (születési név: {{elado_nev}}')) {
      console.log(`Found problematic paragraph at position ${start}-${end}`);
      console.log(`Paragraph content: ${paragraphXml.substring(0, 200)}...`);
      
      // Replace with neutralized version
      const neutralizedParagraph = '<w:p><w:r><w:t xml:space="preserve">BLOCK_NEUTRALIZED_FOR_ISOLATION</w:t></w:r></w:p>';
      
      const fixedXml = xml.slice(0, start) + neutralizedParagraph + xml.slice(end);
      return { fixedXml, found: true, start, end };
    }
  }
  
  return { fixedXml: xml, found: false };
}

// Main function
const binary = fs.readFileSync(TEMPLATE_PATH, 'binary');
const zip = new PizZip(binary);
const documentXml = zip.file('word/document.xml').asText();

console.log('=== SURGICAL FIX ===');
console.log(`Template: ${TEMPLATE_PATH}`);
console.log(`Document XML length: ${documentXml.length} characters`);

// Test original
const originalParse = directParseDocx(TEMPLATE_PATH);
const originalError = originalParse.success ? null : getTemplateErrorDetails(originalParse.error);

console.log(`\n--- Original v4 Parse Result ---`);
console.log(`Success: ${originalParse.success}`);
if (originalError) {
  console.log(`Error file: ${originalError?.properties?.file || 'unknown'}`);
  console.log(`Error offset: ${originalError?.properties?.offset || 'unknown'}`);
  console.log(`Error message: ${originalError?.message || 'unknown'}`);
  console.log(`Error id: ${originalError?.properties?.id || 'unknown'}`);
}

// Find and fix the problematic paragraph
const { fixedXml, found, start, end } = findAndReplaceProblematicParagraph(documentXml);

if (!found) {
  console.log('\nERROR: Could not find the problematic paragraph!');
  process.exit(1);
}

console.log(`\n--- Fix Applied ---`);
console.log(`Replaced paragraph at position ${start}-${end}`);

// Create fixed DOCX
const fixedZip = new PizZip(binary);
fixedZip.file('word/document.xml', fixedXml);
const fixedBinary = fixedZip.generate({ type: 'nodebuffer' });
fs.writeFileSync(OUTPUT_PATH, fixedBinary);

console.log(`Fixed template saved to: ${OUTPUT_PATH}`);

// Test the fixed version
const fixedParse = directParseDocx(OUTPUT_PATH);
const fixedError = fixedParse.success ? null : getTemplateErrorDetails(fixedParse.error);

console.log(`\n--- Fixed v6 Parse Result ---`);
console.log(`Success: ${fixedParse.success}`);
if (fixedError) {
  console.log(`Error file: ${fixedError?.properties?.file || 'unknown'}`);
  console.log(`Error offset: ${fixedError?.properties?.offset || 'unknown'}`);
  console.log(`Error message: ${fixedError?.message || 'unknown'}`);
  console.log(`Error id: ${fixedError?.properties?.id || 'unknown'}`);
} else {
  console.log('SUCCESS: No parse errors found!');
}

// Show what was replaced
console.log(`\n--- Replaced Content ---`);
const originalParagraph = documentXml.slice(start, end);
console.log(`Original (first 200 chars): ${originalParagraph.substring(0, 200)}...`);
console.log(`Replaced with: <w:p><w:r><w:t xml:space="preserve">BLOCK_NEUTRALIZED_FOR_ISOLATION</w:t></w:r></w:p>`);

// Summary
console.log(`\n=== SUMMARY ===`);
console.log(`Original parse: ${originalParse.success ? 'SUCCESS' : 'FAILED'}`);
console.log(`Fixed parse: ${fixedParse.success ? 'SUCCESS' : 'FAILED'}`);

if (fixedParse.success && !originalParse.success) {
  console.log(`\n✅ FIX SUCCESSFUL: The parse error has been resolved!`);
} else if (!fixedParse.success && !originalParse.success) {
  console.log(`\n❌ FIX FAILED: The parse error persists.`);
  console.log(`   This suggests the error is not in the identified paragraph.`);
} else if (fixedParse.success && originalParse.success) {
  console.log(`\nℹ️  ALREADY WORKING: Both versions parse successfully.`);
} else {
  console.log(`\n❓ UNEXPECTED: Original worked but fixed version doesn't.`);
}