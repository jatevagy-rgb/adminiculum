import fs from 'fs';
import path from 'path';
import PizZip from 'pizzip';
import Docxtemplater from 'docxtemplater';

const TEMPLATE_PATH = 'Backend/templates/Bejegyzesi_engedely_backend_ready_template_xmlfixed_v4.docx';
const OUTPUT_DIR = 'Backend/templates/isolation-tests';

if (!fs.existsSync(OUTPUT_DIR)) {
  fs.mkdirSync(OUTPUT_DIR, { recursive: true });
}

function directParseDocx(filePath) {
  try {
    const binary = fs.readFileSync(filePath, 'binary');
    const zip = new PizZip(binary);
    new Docxtemplater(zip);
    return { success: true, error: null };
  } catch (error) {
    return {
      success: false,
      error: { 
        message: error instanceof Error ? error.message : String(error),
        ...(error.properties ? { properties: error.properties } : {})
      },
    };
  }
}

function getTemplateErrorDetails(error) {
  return error || { message: 'Unknown error' };
}

function findPlaceholderParagraphs(xml) {
  const paragraphs = [];
  const paragraphRegex = /<w:p[\s\S]*?<\/w:p>/g;
  
  let match;
  while ((match = paragraphRegex.exec(xml)) !== null) {
    const paragraphXml = match[0];
    const start = match.index;
    const end = start + paragraphXml.length;
    
    // Check if paragraph contains placeholders
    if (/\{\{[^}]+\}\}/.test(paragraphXml)) {
      // Extract text content for identification
      const textContent = paragraphXml
        .replace(/<w:t[^>]*>/g, '')
        .replace(/<\/w:t>/g, '')
        .replace(/<[^>]+>/g, '')
        .replace(/</g, '<')
        .replace(/>/g, '>')
        .replace(/&/g, '&')
        .trim();
      
      paragraphs.push({
        start,
        end,
        xml: paragraphXml,
        textPreview: textContent.slice(0, 100),
        placeholderCount: (paragraphXml.match(/\{\{[^}]+\}\}/g) || []).length,
      });
    }
  }
  
  return paragraphs;
}

function createNeutralizedVariant(xml, paragraph) {
  const neutralizedXml = 
    xml.slice(0, paragraph.start) +
    '<w:p><w:r><w:t xml:space="preserve">BLOCK_NEUTRALIZED_FOR_ISOLATION</w:t></w:r></w:p>' +
    xml.slice(paragraph.end);
  
  return neutralizedXml;
}

function saveVariant(binary, xmlByPart, outputFilePath) {
  const zip = new PizZip(binary);
  for (const [partName, xml] of Object.entries(xmlByPart)) {
    zip.file(partName, xml);
  }
  fs.writeFileSync(outputFilePath, zip.generate({ type: 'nodebuffer' }));
}

// Main isolation test
console.log('=== DOCX Isolation Test (Simple) ===');
console.log(`Template: ${TEMPLATE_PATH}`);

const binary = fs.readFileSync(TEMPLATE_PATH, 'binary');
const zip = new PizZip(binary);
const partNames = zip.file(/word\/(document|header\d+|footer\d+)\.xml/).map((file) => file.name).sort();
const xmlByPart = Object.fromEntries(partNames.map((name) => [name, zip.file(name)?.asText() || '']));

console.log(`Parts found: ${partNames.join(', ')}`);
console.log('');

// Test original v4
const originalParse = directParseDocx(TEMPLATE_PATH);
const originalError = originalParse.success ? null : getTemplateErrorDetails(originalParse.error);

console.log('--- Original v4 Parse Result ---');
console.log(`Success: ${originalParse.success}`);
if (originalError) {
  console.log(`Error file: ${originalError?.properties?.file || 'unknown'}`);
  console.log(`Error offset: ${originalError?.properties?.offset || 'unknown'}`);
  console.log(`Error message: ${originalError?.message || 'unknown'}`);
  console.log(`Error id: ${originalError?.properties?.id || 'unknown'}`);
}
console.log('');

// Find all placeholder paragraphs in each part
const results = [];
let variantIndex = 0;

for (const partName of partNames) {
  const xml = xmlByPart[partName];
  const paragraphs = findPlaceholderParagraphs(xml);
  
  console.log(`--- ${partName}: Found ${paragraphs.length} placeholder paragraphs ---`);
  
  for (let i = 0; i < paragraphs.length; i++) {
    const paragraph = paragraphs[i];
    variantIndex++;
    const variantName = `v5${String.fromCharCode(96 + variantIndex)}`; // v5a, v5b, v5c, etc.
    const variantFileName = `Bejegyzesi_engedely_backend_ready_template_xmlfixed_${variantName}.docx`;
    const variantFilePath = path.join(OUTPUT_DIR, variantFileName);
    
    console.log(`\nParagraph ${i + 1}:`);
    console.log(`  Text preview: ${paragraph.textPreview}`);
    console.log(`  Placeholder count: ${paragraph.placeholderCount}`);
    console.log(`  XML length: ${paragraph.xml.length} chars`);
    
    // Create variant with this paragraph neutralized
    const neutralizedXml = createNeutralizedVariant(xml, paragraph);
    const modifiedXmlByPart = { ...xmlByPart, [partName]: neutralizedXml };
    saveVariant(binary, modifiedXmlByPart, variantFilePath);
    
    // Test the variant
    const variantParse = directParseDocx(variantFilePath);
    const variantError = variantParse.success ? null : getTemplateErrorDetails(variantParse.error);
    
    console.log(`  Variant ${variantName} parse: ${variantParse.success ? 'SUCCESS' : 'FAILED'}`);
    if (variantError) {
      console.log(`    Error file: ${variantError?.properties?.file || 'unknown'}`);
      console.log(`    Error offset: ${variantError?.properties?.offset || 'unknown'}`);
      console.log(`    Error message: ${variantError?.message || 'unknown'}`);
    }
    
    results.push({
      variantName,
      variantFilePath,
      partName,
      paragraphIndex: i,
      paragraphTextPreview: paragraph.textPreview,
      paragraphPlaceholderCount: paragraph.placeholderCount,
      parseSuccess: variantParse.success,
      errorFile: variantError?.properties?.file || null,
      errorOffset: variantError?.properties?.offset || null,
      errorMessage: variantError?.message || null,
      errorId: variantError?.properties?.id || null,
      originalErrorFile: originalError?.properties?.file || null,
      originalErrorOffset: originalError?.properties?.offset || null,
      originalErrorId: originalError?.properties?.id || null,
    });
  }
}

// Summary
console.log('\n=== ISOLATION TEST SUMMARY ===');
console.log(`Original v4 parse: ${originalParse.success ? 'SUCCESS' : 'FAILED'}`);
if (originalError) {
  console.log(`Original error: ${originalError?.properties?.file}:${originalError?.properties?.offset} (${originalError?.properties?.id || originalError?.message})`);
}
console.log('');

const successfulVariants = results.filter(r => r.parseSuccess);
const failedVariants = results.filter(r => !r.parseSuccess);

console.log(`Successful variants (error disappeared): ${successfulVariants.length}`);
for (const r of successfulVariants) {
  console.log(`  ${r.variantName}: ${r.partName} paragraph ${r.paragraphIndex + 1} - "${r.paragraphTextPreview}"`);
}

console.log(`\nFailed variants (error persists): ${failedVariants.length}`);
for (const r of failedVariants) {
  const errorChanged = r.errorFile !== r.originalErrorFile || 
                        r.errorOffset !== r.originalErrorOffset ||
                        r.errorId !== r.originalErrorId;
  console.log(`  ${r.variantName}: ${r.partName} paragraph ${r.paragraphIndex + 1} - "${r.paragraphTextPreview}"`);
  if (errorChanged) {
    console.log(`    ERROR CHANGED: ${r.errorFile}:${r.errorOffset} (${r.errorId || r.errorMessage})`);
  } else {
    console.log(`    Error unchanged`);
  }
}

// Save results
const resultsPath = path.join(OUTPUT_DIR, 'isolation-results.json');
fs.writeFileSync(resultsPath, JSON.stringify({
  originalParse,
  originalError,
  results,
  successfulVariants: successfulVariants.map(r => ({
    variantName: r.variantName,
    partName: r.partName,
    paragraphIndex: r.paragraphIndex,
    paragraphTextPreview: r.paragraphTextPreview,
  })),
  failedVariants: failedVariants.map(r => ({
    variantName: r.variantName,
    partName: r.partName,
    paragraphIndex: r.paragraphIndex,
    paragraphTextPreview: r.paragraphTextPreview,
    errorChanged: r.errorFile !== r.originalErrorFile || 
                  r.errorOffset !== r.originalErrorOffset ||
                  r.errorId !== r.originalErrorId,
    errorFile: r.errorFile,
    errorOffset: r.errorOffset,
    errorId: r.errorId,
  })),
}, null, 2));

console.log(`\nResults saved to: ${resultsPath}`);
console.log('Done.');