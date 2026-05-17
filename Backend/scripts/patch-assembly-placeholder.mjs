/**
 * Patch 1B: Inject {{assembled_contract_body}} into the ADASVETEL v4 template
 * 
 * Finds the anchor paragraph "{{szerzodes_pontok_szama}}" and inserts a new
 * paragraph containing {{assembled_contract_body}} immediately BEFORE it.
 * 
 * Anchor context (found in word/document.xml):
 *   </w:p><w:p><w:pPr><w:spacing w:after="120"/><w:ind w:firstLine="357"/>
 *   <w:jc w:val="both"/></w:pPr><w:r><w:rPr/><w:t>Jelen adásvételi szerződés {{szerzodes_pontok_szama}}
 * 
 * The new paragraph uses the same paragraph properties (justified, first-line indent)
 * as the surrounding closing provisions.
 */

import * as fs from 'fs';
import * as path from 'path';

const SRC = path.join(process.cwd(), 'templates', 'adasveteli_backend_ready_osztatlan_template_backend_hu_fixed_xmlfixed_v4.docx');
const DST = path.join(process.cwd(), 'templates', 'adasveteli_backend_ready_osztatlan_template_backend_hu_fixed_xmlfixed_v4.docx');

// Dynamic import for ESM modules
const { default: PizZip } = await import('pizzip');

if (!fs.existsSync(SRC)) {
  console.error('Source template not found:', SRC);
  process.exit(1);
}

// Read the docx
const inputBuffer = fs.readFileSync(SRC);
const zip = new PizZip(inputBuffer);
const docXml = zip.file('word/document.xml');

if (!docXml) {
  console.error('word/document.xml not found in archive');
  process.exit(1);
}

let xml = docXml.asText();

// Check if placeholder already exists
if (xml.includes('assembled_contract_body')) {
  console.log('✓ {{assembled_contract_body}} already exists in template — no patch needed.');
  process.exit(0);
}

// The anchor: the paragraph that contains "Jelen adásvételi szerződés {{szerzodes_pontok_szama}}"
// We need to insert BEFORE this paragraph.
// The paragraph tag structure is:
//   </w:p><w:p><w:pPr><w:spacing w:after="120"/><w:ind w:firstLine="357"/><w:jc w:val="both"/></w:pPr>
//     <w:r><w:rPr/><w:t>Jelen adásvételi szerződés {{szerzodes_pontok_szama}}
//
// We insert a new paragraph BEFORE the <w:p> that contains "Jelen adásvételi szerződés"
//
// New paragraph XML — mirrors existing closing-provision paragraph style:
//   <w:p>
//     <w:pPr><w:spacing w:after="120"/><w:ind w:firstLine="357"/><w:jc w:val="both"/></w:pPr>
//     <w:r><w:rPr/><w:t>{{assembled_contract_body}}</w:t></w:r>
//   </w:p>
const anchorText = 'Jelen adásvételi szerződés {{szerzodes_pontok_szama}}';
const anchorIdx = xml.indexOf(anchorText);

if (anchorIdx === -1) {
  console.error('Anchor text not found in template:', anchorText);
  process.exit(1);
}

console.log('✓ Found anchor at index:', anchorIdx);

// Find the start of the <w:p> that contains this anchor
// Search backwards from anchorIdx for "</w:p><w:p>" or the start of the document
// The paragraph that contains "Jelen adásvételi szerződés" starts with <w:p> (possibly preceded by </w:p>)
let insertAt = anchorIdx;

// Search backwards for the <w:p> tag of this paragraph
// We look for "</w:p>" followed by "<w:p>" at anchorIdx or just before anchorIdx
const precedingClose = xml.lastIndexOf('</w:p>', anchorIdx);
const precedingOpen = xml.lastIndexOf('<w:p>', anchorIdx);

if (precedingOpen > precedingClose) {
  // The <w:p> at precedingOpen is the start of the paragraph containing the anchor
  insertAt = precedingOpen;
} else {
  // Paragraph start is at document start or there's no closing tag before
  // Find the <w:p> that must be before anchorIdx
  const possibleParagraphStart = xml.lastIndexOf('<w:p>', anchorIdx);
  if (possibleParagraphStart !== -1) {
    insertAt = possibleParagraphStart;
  }
}

// Actually, the cleanest approach: find "</w:p>" immediately before the anchor paragraph
// and insert AFTER that closing tag (i.e., at the start of the target paragraph)
const closeBeforeAnchor = xml.lastIndexOf('</w:p>', anchorIdx);
// We want to insert BEFORE the <w:p> that starts the anchor paragraph
// So we insert at closeBeforeAnchor (after the previous paragraph's </w:p>)

// CORRECTION: We want to insert the new paragraph AFTER closeBeforeAnchor (which is the end of the previous paragraph)
// and BEFORE the <w:p> that contains the anchor
// So the insertion point is: closeBeforeAnchor + len('</w:p>')
const insertionPoint = closeBeforeAnchor + '</w:p>'.length;

const newParagraphXml = `<w:p><w:pPr><w:spacing w:after="120"/><w:ind w:firstLine="357"/><w:jc w:val="both"/></w:pPr><w:r><w:rPr/><w:t>{{assembled_contract_body}}</w:t></w:r></w:p>`;

const newXml = xml.slice(0, insertionPoint) + newParagraphXml + xml.slice(insertionPoint);

// Verify the placeholder is now in the XML
if (!newXml.includes('assembled_contract_body')) {
  console.error('ERROR: Placeholder not found after patch!');
  process.exit(1);
}

// Count occurrences
const count = (newXml.match(/assembled_contract_body/g) || []).length;
console.log(`✓ Placeholder count in XML: ${count} (expected 1)`);

// Write back to zip
zip.file('word/document.xml', newXml);

// Save the modified docx (overwrite the original)
const outputBuffer = zip.generate({ type: 'nodebuffer', compression: 'DEFLATE' });
fs.writeFileSync(DST, outputBuffer);

console.log('✓ Patched template written to:', DST);
console.log('  File size:', outputBuffer.length, 'bytes');
