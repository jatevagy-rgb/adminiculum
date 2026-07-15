import JSZip from 'jszip';
import { clauseIdOf, computeClauseNumbers } from './clauseNumbering';
import { childrenOf, EditorNode, EDITOR_LIMITS, generateClauseId, isRecord } from './editorModel';
import { FieldResolutionContext, tokenDisplayText } from './fieldTokens';
import { validateEditorDocument } from './editorSchemaValidator';

export type DocxFidelityLevel = 'FULLY_SUPPORTED_SUBSET' | 'SUPPORTED_WITH_WARNINGS' | 'FLATTENED' | 'REJECTED';

export type DocxWarningCode =
  | 'CUSTOM_NUMBERING_NORMALIZED'
  | 'TRACKED_CHANGES_FLATTENED'
  | 'COMMENTS_REMOVED'
  | 'HEADER_REMOVED'
  | 'FOOTER_REMOVED'
  | 'FOOTNOTE_REMOVED'
  | 'ENDNOTE_REMOVED'
  | 'IMAGE_REMOVED'
  | 'EXTERNAL_LINK_REMOVED'
  | 'FIELD_CODE_FLATTENED'
  | 'CONTENT_CONTROL_FLATTENED'
  | 'TABLE_SIMPLIFIED'
  | 'PAGE_LAYOUT_APPROXIMATED'
  | 'UNKNOWN_ELEMENT_REMOVED'
  | 'HYPERLINK_FLATTENED'
  | 'UNRESOLVED_FIELD_TOKEN_MARKER';

export type DocxErrorCode =
  | 'DOCX_FILE_INVALID'
  | 'DOCX_FILE_TOO_LARGE'
  | 'DOCX_PACKAGE_INVALID'
  | 'DOCX_PACKAGE_TOO_COMPLEX'
  | 'DOCX_ACTIVE_CONTENT_REJECTED'
  | 'DOCX_EXTERNAL_RELATIONSHIP_REJECTED'
  | 'DOCX_IMPORT_UNSUPPORTED'
  | 'DOCX_IMPORT_FAILED'
  | 'DOCX_EXPORT_FAILED'
  | 'DOCX_EDITOR_CONTENT_INVALID';

export interface DocxImportWarning {
  code: DocxWarningCode;
  message: string;
}

export interface DocxImportError {
  code: DocxErrorCode;
  message: string;
}

export interface DocxInspectionResult {
  accepted: boolean;
  file: { name: string; sizeBytes: number; mimeType: string };
  package: { entryCount: number; totalUncompressedBytes: number | null; containsMainDocument: boolean };
  detectedFeatures: {
    macros: boolean;
    externalRelationships: boolean;
    embeddedObjects: boolean;
    remoteImages: boolean;
    comments: boolean;
    trackedChanges: boolean;
    footnotes: boolean;
    endnotes: boolean;
    headers: boolean;
    footers: boolean;
    fields: boolean;
    contentControls: boolean;
    images: boolean;
  };
  warnings: DocxImportWarning[];
  blockingErrors: DocxImportError[];
}

export interface DocxImportResult {
  document: EditorNode;
  inspection: DocxInspectionResult;
  fidelity: DocxFidelityLevel;
  warnings: DocxImportWarning[];
}

export interface DocxExportResult {
  blob: Blob;
  filename: string;
  fidelity: DocxFidelityLevel;
  warnings: DocxImportWarning[];
}

export const DOCX_LIMITS = {
  maxCompressedBytes: 10 * 1024 * 1024,
  maxEntries: 600,
  maxEntryBytes: 8 * 1024 * 1024,
  maxTotalUncompressedBytes: 30 * 1024 * 1024,
  maxWarnings: 25,
} as const;

const DOCX_MIME_TYPES = new Set([
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'application/octet-stream',
  '',
]);

function emptyFeatures(): DocxInspectionResult['detectedFeatures'] {
  return {
    macros: false,
    externalRelationships: false,
    embeddedObjects: false,
    remoteImages: false,
    comments: false,
    trackedChanges: false,
    footnotes: false,
    endnotes: false,
    headers: false,
    footers: false,
    fields: false,
    contentControls: false,
    images: false,
  };
}

function warn(warnings: DocxImportWarning[], code: DocxWarningCode, message: string): void {
  if (warnings.length < DOCX_LIMITS.maxWarnings && !warnings.some((item) => item.code === code)) warnings.push({ code, message });
}

function error(errors: DocxImportError[], code: DocxErrorCode, message: string): void {
  if (errors.length < DOCX_LIMITS.maxWarnings && !errors.some((item) => item.code === code)) errors.push({ code, message });
}

function isDocxName(name: string): boolean {
  return /\.docx$/i.test(name) && !/\.docm$/i.test(name);
}

function hasUnsafeZipPath(name: string): boolean {
  return name.startsWith('/') || name.startsWith('\\') || name.includes('../') || name.includes('..\\') || /^[A-Za-z]:/.test(name);
}

function decodeXml(value: string): string {
  return value
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&amp;/g, '&');
}

function escapeXml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

function stripTags(xml: string): string {
  return decodeXml(
    Array.from(xml.matchAll(/<w:t[^>]*>([\s\S]*?)<\/w:t>/g))
      .map((match) => match[1])
      .join('')
  );
}

function textNode(text: string, marks?: EditorNode['marks']): EditorNode | null {
  if (!text) return null;
  return marks?.length ? { type: 'text', text, marks } : { type: 'text', text };
}

function paragraphContentFromXml(xml: string): EditorNode[] {
  const content: EditorNode[] = [];
  const runRegex = /<w:r\b[\s\S]*?<\/w:r>|<w:hyperlink\b[\s\S]*?<\/w:hyperlink>/g;
  const matches = Array.from(xml.matchAll(runRegex));
  const segments = matches.length ? matches.map((match) => match[0]) : [xml];

  for (const segment of segments) {
    if (/<w:br\b[^>]*w:type="page"/.test(segment)) {
      continue;
    }
    const text = stripTags(segment);
    if (!text) continue;
    const marks: EditorNode['marks'] = [];
    if (/<w:b\b/.test(segment)) marks.push({ type: 'bold' });
    if (/<w:i\b/.test(segment)) marks.push({ type: 'italic' });
    if (/<w:u\b/.test(segment)) marks.push({ type: 'underline' });
    if (/<w:strike\b|<w:dstrike\b/.test(segment)) marks.push({ type: 'strike' });
    const node = textNode(text, marks);
    if (node) content.push(node);
  }

  return content;
}

function paragraphToNode(xml: string, warnings: DocxImportWarning[]): EditorNode | null {
  if (/<w:br\b[^>]*w:type="page"/.test(xml)) return { type: 'pageBreak' };

  const text = stripTags(xml).trim();
  if (!text) return null;

  const styleMatch = xml.match(/<w:pStyle\b[^>]*w:val="([^"]+)"/);
  const style = styleMatch?.[1] || '';
  const headingMatch = style.match(/^Heading([1-3])$/i);
  if (headingMatch) {
    return { type: 'heading', attrs: { level: Number(headingMatch[1]) }, content: paragraphContentFromXml(xml) };
  }

  const typedClause = text.match(/^(\d+(?:\.\d+){0,2})[.)]?\s+(.+)$/);
  if (typedClause) {
    const level = typedClause[1].split('.').length;
    const title = typedClause[2];
    return {
      type: 'legalClause',
      attrs: { cid: generateClauseId() },
      content: [{ type: 'clauseHeading', content: [{ type: 'text', text: title }] }],
    };
  }

  if (/<w:numPr\b/.test(xml)) {
    warn(warnings, 'CUSTOM_NUMBERING_NORMALIZED', 'A DOCX számozás egyszerű listaként vagy bekezdésként lett normalizálva.');
    return { type: 'paragraph', content: paragraphContentFromXml(xml) };
  }

  return { type: 'paragraph', content: paragraphContentFromXml(xml) };
}

function tableToNode(xml: string, warnings: DocxImportWarning[]): EditorNode {
  const rows = Array.from(xml.matchAll(/<w:tr\b[\s\S]*?<\/w:tr>/g)).slice(0, EDITOR_LIMITS.maxTableRows);
  if (rows.length === EDITOR_LIMITS.maxTableRows) warn(warnings, 'TABLE_SIMPLIFIED', 'A táblázat túl nagy volt, ezért a V1 határok szerint egyszerűsítve lett.');
  return {
    type: 'table',
    content: rows.map((rowMatch) => {
      const cells = Array.from(rowMatch[0].matchAll(/<w:tc\b[\s\S]*?<\/w:tc>/g)).slice(0, EDITOR_LIMITS.maxTableCols);
      return {
        type: 'tableRow',
        content: cells.map((cellMatch) => {
          const paragraphNodes = Array.from(cellMatch[0].matchAll(/<w:p\b[\s\S]*?<\/w:p>/g))
            .map((p) => paragraphToNode(p[0], warnings))
            .filter(Boolean) as EditorNode[];
          return { type: 'tableCell', content: paragraphNodes.length ? paragraphNodes : [{ type: 'paragraph' }] };
        }),
      } as EditorNode;
    }),
  };
}

function inspectDocumentXml(xml: string, features: DocxInspectionResult['detectedFeatures'], warnings: DocxImportWarning[]): void {
  if (/<w:ins\b|<w:del\b|<w:moveFrom\b|<w:moveTo\b/.test(xml)) {
    features.trackedChanges = true;
    warn(warnings, 'TRACKED_CHANGES_FLATTENED', 'A változáskövetés nem marad élő Word-korrektúra; a látható szöveg laposítva importálódik.');
  }
  if (/<w:commentRangeStart\b|<w:commentReference\b/.test(xml)) {
    features.comments = true;
    warn(warnings, 'COMMENTS_REMOVED', 'A Word megjegyzések nem importálódnak dokumentumszintű kommentként.');
  }
  if (/<w:footnoteReference\b/.test(xml)) {
    features.footnotes = true;
    warn(warnings, 'FOOTNOTE_REMOVED', 'A lábjegyzet-hivatkozások nem támogatottak a V1 importban.');
  }
  if (/<w:endnoteReference\b/.test(xml)) {
    features.endnotes = true;
    warn(warnings, 'ENDNOTE_REMOVED', 'A végjegyzet-hivatkozások nem támogatottak a V1 importban.');
  }
  if (/<w:instrText\b|<w:fldChar\b/.test(xml)) {
    features.fields = true;
    warn(warnings, 'FIELD_CODE_FLATTENED', 'A Word mezőkódok nem futnak le; csak látható szövegük maradhat meg.');
  }
  if (/<w:sdt\b/.test(xml)) {
    features.contentControls = true;
    warn(warnings, 'CONTENT_CONTROL_FLATTENED', 'A Word content control elemek egyszerű tartalomként lettek kezelve.');
  }
  if (/<a:blip\b|<w:drawing\b|<w:pict\b/.test(xml)) {
    features.images = true;
    warn(warnings, 'IMAGE_REMOVED', 'A képek nem importálódnak a V1 szerkesztői modellbe.');
  }
}

async function readZipText(zip: JSZip, name: string): Promise<string> {
  return (await zip.file(name)?.async('string')) || '';
}

export async function inspectDocxFile(file: File): Promise<{ zip?: JSZip; inspection: DocxInspectionResult }> {
  const warnings: DocxImportWarning[] = [];
  const blockingErrors: DocxImportError[] = [];
  const features = emptyFeatures();
  let zip: JSZip | undefined;

  if (!isDocxName(file.name)) error(blockingErrors, 'DOCX_FILE_INVALID', 'Csak .docx fájl importálható.');
  if (!DOCX_MIME_TYPES.has(file.type)) error(blockingErrors, 'DOCX_FILE_INVALID', 'A fájl MIME típusa nem DOCX-kompatibilis.');
  if (file.size > DOCX_LIMITS.maxCompressedBytes) error(blockingErrors, 'DOCX_FILE_TOO_LARGE', 'A DOCX fájl túl nagy a helyi importhoz.');

  try {
    if (blockingErrors.length === 0) zip = await JSZip.loadAsync(await file.arrayBuffer());
  } catch {
    error(blockingErrors, 'DOCX_PACKAGE_INVALID', 'A DOCX ZIP csomag nem olvasható.');
  }

  const entries = zip ? Object.values(zip.files) : [];
  let totalUncompressedBytes = 0;
  if (zip) {
    if (entries.length > DOCX_LIMITS.maxEntries) error(blockingErrors, 'DOCX_PACKAGE_TOO_COMPLEX', 'A DOCX túl sok ZIP bejegyzést tartalmaz.');
    for (const entry of entries) {
      if (hasUnsafeZipPath(entry.name)) error(blockingErrors, 'DOCX_PACKAGE_INVALID', 'A DOCX ZIP csomag nem biztonságos bejegyzést tartalmaz.');
      const unsafeSize = (entry as unknown as { _data?: { uncompressedSize?: number } })._data?.uncompressedSize || 0;
      totalUncompressedBytes += unsafeSize;
      if (unsafeSize > DOCX_LIMITS.maxEntryBytes) error(blockingErrors, 'DOCX_PACKAGE_TOO_COMPLEX', 'Egy DOCX ZIP bejegyzés túl nagy.');
      if (/vbaProject\.bin$/i.test(entry.name) || /\.docm$/i.test(entry.name)) {
        features.macros = true;
        error(blockingErrors, 'DOCX_ACTIVE_CONTENT_REJECTED', 'Makrókat tartalmazó dokumentum nem importálható.');
      }
      if (/^word\/embeddings\//i.test(entry.name) || /oleObject/i.test(entry.name)) {
        features.embeddedObjects = true;
        error(blockingErrors, 'DOCX_ACTIVE_CONTENT_REJECTED', 'Beágyazott objektumot tartalmazó dokumentum nem importálható.');
      }
      if (/^word\/comments\.xml$/i.test(entry.name)) features.comments = true;
      if (/^word\/footnotes\.xml$/i.test(entry.name)) features.footnotes = true;
      if (/^word\/endnotes\.xml$/i.test(entry.name)) features.endnotes = true;
      if (/^word\/header\d+\.xml$/i.test(entry.name)) features.headers = true;
      if (/^word\/footer\d+\.xml$/i.test(entry.name)) features.footers = true;
      if (/^word\/media\//i.test(entry.name)) features.images = true;
    }
    if (totalUncompressedBytes > DOCX_LIMITS.maxTotalUncompressedBytes) error(blockingErrors, 'DOCX_PACKAGE_TOO_COMPLEX', 'A DOCX kicsomagolt mérete túl nagy.');

    const relFiles = entries.filter((entry) => /\.rels$/i.test(entry.name));
    for (const relFile of relFiles) {
      const relXml = await readZipText(zip, relFile.name);
      if (/TargetMode="External"/i.test(relXml)) {
        features.externalRelationships = true;
        if (/image/i.test(relXml)) {
          features.remoteImages = true;
          error(blockingErrors, 'DOCX_EXTERNAL_RELATIONSHIP_REJECTED', 'Távoli képet vagy külső kapcsolatot tartalmazó DOCX nem importálható automatikusan.');
        } else {
          warn(warnings, 'EXTERNAL_LINK_REMOVED', 'A külső hivatkozások nem kerülnek élő kapcsolatként importálásra.');
        }
      }
    }

    if (features.headers) warn(warnings, 'HEADER_REMOVED', 'A fejléc nem része a V1 szerkesztői importnak.');
    if (features.footers) warn(warnings, 'FOOTER_REMOVED', 'A lábléc és oldalszám nem része a V1 szerkesztői importnak.');
    if (features.footnotes) warn(warnings, 'FOOTNOTE_REMOVED', 'A lábjegyzetek nem támogatottak a V1 importban.');
    if (features.endnotes) warn(warnings, 'ENDNOTE_REMOVED', 'A végjegyzetek nem támogatottak a V1 importban.');
    if (features.images) warn(warnings, 'IMAGE_REMOVED', 'A beágyazott képek nem kerülnek be a szerkesztői modellbe.');

    const documentXml = await readZipText(zip, 'word/document.xml');
    inspectDocumentXml(documentXml, features, warnings);
  }

  const containsMainDocument = Boolean(zip?.file('word/document.xml'));
  if (zip && !containsMainDocument) error(blockingErrors, 'DOCX_PACKAGE_INVALID', 'A DOCX nem tartalmaz word/document.xml állományt.');

  return {
    zip,
    inspection: {
      accepted: blockingErrors.length === 0,
      file: { name: file.name, sizeBytes: file.size, mimeType: file.type },
      package: { entryCount: entries.length, totalUncompressedBytes: totalUncompressedBytes || null, containsMainDocument },
      detectedFeatures: features,
      warnings,
      blockingErrors,
    },
  };
}

export async function importDocxFileToEditorDocument(file: File): Promise<DocxImportResult> {
  const { zip, inspection } = await inspectDocxFile(file);
  if (!inspection.accepted || !zip) {
    return { document: { type: 'doc', content: [{ type: 'paragraph' }] }, inspection, fidelity: 'REJECTED', warnings: inspection.warnings };
  }

  try {
    const xml = await readZipText(zip, 'word/document.xml');
    const body = xml.match(/<w:body\b[\s\S]*?<\/w:body>/)?.[0] || xml;
    const nodes: EditorNode[] = [];
    const blockRegex = /<w:p\b[\s\S]*?<\/w:p>|<w:tbl\b[\s\S]*?<\/w:tbl>/g;
    for (const match of body.matchAll(blockRegex)) {
      const block = match[0];
      if (block.startsWith('<w:tbl')) nodes.push(tableToNode(block, inspection.warnings));
      else {
        const node = paragraphToNode(block, inspection.warnings);
        if (node) nodes.push(node);
      }
      if (nodes.length > EDITOR_LIMITS.maxNodes) break;
    }
    const document: EditorNode = { type: 'doc', content: nodes.length ? nodes : [{ type: 'paragraph' }] };
    const validation = validateEditorDocument(document);
    if (!validation.ok) {
      inspection.blockingErrors.push({ code: 'DOCX_IMPORT_FAILED', message: 'Az importált tartalom nem felel meg a szerkesztői sémának.' });
      inspection.accepted = false;
      return { document: { type: 'doc', content: [{ type: 'paragraph' }] }, inspection, fidelity: 'REJECTED', warnings: inspection.warnings };
    }
    const fidelity: DocxFidelityLevel = inspection.warnings.length ? 'SUPPORTED_WITH_WARNINGS' : 'FULLY_SUPPORTED_SUBSET';
    return { document, inspection, fidelity, warnings: inspection.warnings };
  } catch {
    inspection.accepted = false;
    inspection.blockingErrors.push({ code: 'DOCX_IMPORT_FAILED', message: 'A DOCX import sikertelen volt.' });
    return { document: { type: 'doc', content: [{ type: 'paragraph' }] }, inspection, fidelity: 'REJECTED', warnings: inspection.warnings };
  }
}

function renderRun(node: EditorNode, context: FieldResolutionContext, warnings: DocxImportWarning[]): string {
  let text = '';
  if (node.type === 'text') text = node.text || '';
  else if (node.type === 'fieldToken' && isRecord(node.attrs) && typeof node.attrs.fieldId === 'string') {
    const value = tokenDisplayText(node.attrs.fieldId, context);
    text = value;
    if (value.startsWith('{{')) warn(warnings, 'UNRESOLVED_FIELD_TOKEN_MARKER', 'A feloldatlan mező token jelölőként került a DOCX exportba.');
  } else if (node.type === 'hardBreak') return '<w:r><w:br/></w:r>';
  else return childrenOf(node).map((child) => renderRun(child, context, warnings)).join('');

  const marks = node.marks || [];
  const rPr = [
    marks.some((mark) => mark.type === 'bold') ? '<w:b/>' : '',
    marks.some((mark) => mark.type === 'italic') ? '<w:i/>' : '',
    marks.some((mark) => mark.type === 'underline') ? '<w:u w:val="single"/>' : '',
    marks.some((mark) => mark.type === 'strike') ? '<w:strike/>' : '',
  ].join('');
  return `<w:r>${rPr ? `<w:rPr>${rPr}</w:rPr>` : ''}<w:t xml:space="preserve">${escapeXml(text)}</w:t></w:r>`;
}

function renderParagraph(children: EditorNode[], context: FieldResolutionContext, warnings: DocxImportWarning[], style?: string): string {
  const pPr = style ? `<w:pPr><w:pStyle w:val="${style}"/></w:pPr>` : '';
  return `<w:p>${pPr}${children.map((child) => renderRun(child, context, warnings)).join('')}</w:p>`;
}

function renderBlocks(nodes: EditorNode[], context: FieldResolutionContext, warnings: DocxImportWarning[], numbers: Map<string, string>): string {
  return nodes
    .map((node) => {
      switch (node.type) {
        case 'paragraph':
          return renderParagraph(childrenOf(node), context, warnings);
        case 'heading': {
          const level = isRecord(node.attrs) && typeof node.attrs.level === 'number' ? Math.min(Math.max(node.attrs.level, 1), 3) : 1;
          return renderParagraph(childrenOf(node), context, warnings, `Heading${level}`);
        }
        case 'legalClause': {
          const cid = clauseIdOf(node);
          const number = (cid && numbers.get(cid)) || '';
          const inner = childrenOf(node);
          const headingNode = inner.find((child) => child.type === 'clauseHeading');
          const headingText = headingNode ? childrenOf(headingNode) : [];
          return [
            renderParagraph([{ type: 'text', text: number ? `${number} ` : '' }, ...headingText], context, warnings),
            renderBlocks(inner.filter((child) => child !== headingNode), context, warnings, numbers),
          ].join('');
        }
        case 'clauseHeading':
          return renderParagraph(childrenOf(node), context, warnings);
        case 'bulletList':
        case 'orderedList':
          warn(warnings, 'CUSTOM_NUMBERING_NORMALIZED', 'A lista számozása/bekezdése egyszerű DOCX bekezdésként exportálódott.');
          return childrenOf(node)
            .map((item, index) => renderParagraph([{ type: 'text', text: node.type === 'bulletList' ? '• ' : `${index + 1}. ` }, ...childrenOf(item).flatMap(childrenOf)], context, warnings))
            .join('');
        case 'table':
          return `<w:tbl><w:tblPr><w:tblW w:w="0" w:type="auto"/><w:tblBorders><w:top w:val="single" w:sz="4"/><w:left w:val="single" w:sz="4"/><w:bottom w:val="single" w:sz="4"/><w:right w:val="single" w:sz="4"/><w:insideH w:val="single" w:sz="4"/><w:insideV w:val="single" w:sz="4"/></w:tblBorders></w:tblPr>${childrenOf(node)
            .map((row) => `<w:tr>${childrenOf(row).map((cell) => `<w:tc><w:tcPr><w:tcW w:w="2400" w:type="dxa"/></w:tcPr>${renderBlocks(childrenOf(cell), context, warnings, numbers) || '<w:p/>'}</w:tc>`).join('')}</w:tr>`)
            .join('')}</w:tbl>`;
        case 'horizontalRule':
          return renderParagraph([{ type: 'text', text: '――――――――――' }], context, warnings);
        case 'pageBreak':
          return '<w:p><w:r><w:br w:type="page"/></w:r></w:p>';
        case 'blockquote':
          return renderBlocks(childrenOf(node), context, warnings, numbers);
        default:
          return renderBlocks(childrenOf(node), context, warnings, numbers);
      }
    })
    .join('');
}

function safeFilename(name?: string | null): string {
  const base = (name || 'adminiculum-szerzodestervezet').replace(/\.docx$/i, '').replace(/[<>:"/\\|?*\u0000-\u001f]+/g, '-').trim();
  return `${(base || 'adminiculum-szerzodestervezet').slice(0, 90)}.docx`;
}

export async function exportEditorDocumentToDocx(
  doc: EditorNode,
  options: { filename?: string | null; context?: FieldResolutionContext } = {}
): Promise<DocxExportResult> {
  const validation = validateEditorDocument(doc);
  if (!validation.ok) throw new Error('DOCX_EDITOR_CONTENT_INVALID');

  const warnings: DocxImportWarning[] = [{ code: 'PAGE_LAYOUT_APPROXIMATED', message: 'A DOCX export A4 jellegű, de nem Word-perfect tördelés.' }];
  const numbers = computeClauseNumbers(doc);
  const documentBody = renderBlocks(childrenOf(doc), options.context || {}, warnings, numbers);
  const documentXml = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><w:body>${documentBody}<w:sectPr><w:pgSz w:w="11906" w:h="16838"/><w:pgMar w:top="1440" w:right="1440" w:bottom="1440" w:left="1440"/></w:sectPr></w:body></w:document>`;

  const zip = new JSZip();
  zip.file('[Content_Types].xml', `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/><Override PartName="/word/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.styles+xml"/></Types>`);
  zip.folder('_rels')?.file('.rels', `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/></Relationships>`);
  zip.folder('word')?.file('document.xml', documentXml);
  zip.folder('word')?.file('styles.xml', `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><w:styles xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:style w:type="paragraph" w:styleId="Heading1"><w:name w:val="heading 1"/><w:basedOn w:val="Normal"/><w:pPr><w:outlineLvl w:val="0"/></w:pPr><w:rPr><w:b/><w:sz w:val="32"/></w:rPr></w:style><w:style w:type="paragraph" w:styleId="Heading2"><w:name w:val="heading 2"/><w:basedOn w:val="Normal"/><w:pPr><w:outlineLvl w:val="1"/></w:pPr><w:rPr><w:b/><w:sz w:val="28"/></w:rPr></w:style><w:style w:type="paragraph" w:styleId="Heading3"><w:name w:val="heading 3"/><w:basedOn w:val="Normal"/><w:pPr><w:outlineLvl w:val="2"/></w:pPr><w:rPr><w:b/><w:sz w:val="25"/></w:rPr></w:style></w:styles>`);
  zip.folder('word')?.folder('_rels')?.file('document.xml.rels', `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"/>`);

  const blob = await zip.generateAsync({ type: 'blob', mimeType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document', compression: 'DEFLATE' });
  return { blob, filename: safeFilename(options.filename), fidelity: warnings.length > 1 ? 'SUPPORTED_WITH_WARNINGS' : 'FULLY_SUPPORTED_SUBSET', warnings };
}

export function summarizeDocxWarnings(warnings: DocxImportWarning[]): string {
  if (!warnings.length) return 'Nincs import/export figyelmeztetés a támogatott részhalmazban.';
  return warnings.map((item) => `• ${item.message}`).join('\n');
}
