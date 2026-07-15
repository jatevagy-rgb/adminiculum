import fs from 'fs';
import path from 'path';
import JSZip from 'jszip';
import {
  exportEditorDocumentToDocx,
  importDocxFileToEditorDocument,
  inspectDocxFile,
} from '../../Frontend/src/lib/editor/docxInterop';
import { EditorNode } from '../../Frontend/src/lib/editor/editorModel';

async function fileFromZip(zip: JSZip, name = 'test.docx'): Promise<File> {
  const blob = await zip.generateAsync({ type: 'blob', mimeType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' });
  return new File([blob], name, { type: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' });
}

async function minimalDocx(documentXml: string): Promise<File> {
  const zip = new JSZip();
  zip.file('[Content_Types].xml', '<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/></Types>');
  zip.folder('_rels')?.file('.rels', '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/></Relationships>');
  zip.folder('word')?.file('document.xml', documentXml);
  zip.folder('word')?.folder('_rels')?.file('document.xml.rels', '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"/>');
  return fileFromZip(zip);
}

const xmlDoc = (body: string) => `<?xml version="1.0" encoding="UTF-8"?><w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><w:body>${body}<w:sectPr/></w:body></w:document>`;

const sampleEditorDoc: EditorNode = {
  type: 'doc',
  content: [
    { type: 'heading', attrs: { level: 1 }, content: [{ type: 'text', text: 'Szerződés' }] },
    { type: 'legalClause', attrs: { cid: 'cTest1' }, content: [{ type: 'clauseHeading', content: [{ type: 'text', text: 'Első pont' }] }] },
    { type: 'paragraph', content: [{ type: 'text', text: 'Fél: ' }, { type: 'fieldToken', attrs: { fieldId: 'case.reference' } }] },
    { type: 'table', content: [{ type: 'tableRow', content: [{ type: 'tableCell', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Díj' }] }] }] }] },
    { type: 'pageBreak' },
  ],
};

describe('document editor DOCX interop', () => {
  it('imports a supported local DOCX subset into validated editor nodes', async () => {
    const file = await minimalDocx(
      xmlDoc([
        '<w:p><w:pPr><w:pStyle w:val="Heading1"/></w:pPr><w:r><w:t>Szerződés</w:t></w:r></w:p>',
        '<w:p><w:r><w:t>1. Általános rendelkezések</w:t></w:r></w:p>',
        '<w:tbl><w:tr><w:tc><w:p><w:r><w:t>Mező</w:t></w:r></w:p></w:tc></w:tr></w:tbl>',
        '<w:p><w:r><w:br w:type="page"/></w:r></w:p>',
      ].join(''))
    );

    const result = await importDocxFileToEditorDocument(file);
    expect(result.fidelity).toBe('FULLY_SUPPORTED_SUBSET');
    expect(result.document.content?.map((node) => node.type)).toEqual(['heading', 'legalClause', 'table', 'pageBreak']);
  });

  it('exports a valid DOCX package without macros, external relationships or storage ids', async () => {
    const result = await exportEditorDocumentToDocx(sampleEditorDoc, {
      filename: 'Teszt / szerződés.docx',
      context: { caseReference: 'CASE-1' },
    });
    expect(result.filename).toBe('Teszt - szerződés.docx');
    expect(result.blob.type).toBe('application/vnd.openxmlformats-officedocument.wordprocessingml.document');

    const file = new File([result.blob], result.filename, { type: result.blob.type });
    const inspection = await inspectDocxFile(file);
    expect(inspection.inspection.accepted).toBe(true);

    const zip = await JSZip.loadAsync(await result.blob.arrayBuffer());
    const names = Object.keys(zip.files);
    expect(names).toContain('word/document.xml');
    expect(names.some((name) => /vbaProject|embeddings/i.test(name))).toBe(false);
    const serialized = await zip.file('word/document.xml')?.async('string');
    expect(serialized).toContain('CASE-1');
    expect(serialized).not.toMatch(/spItemId|workspaceText|sharepoint/i);
  });

  it('rejects wrong extension, missing document.xml, macros and remote images', async () => {
    const wrong = new File([new Blob(['not zip'])], 'bad.doc', { type: 'application/msword' });
    expect((await inspectDocxFile(wrong)).inspection.accepted).toBe(false);

    const missing = await fileFromZip(new JSZip());
    expect((await inspectDocxFile(missing)).inspection.blockingErrors.some((entry) => entry.code === 'DOCX_PACKAGE_INVALID')).toBe(true);

    const macroZip = new JSZip();
    macroZip.folder('word')?.file('document.xml', xmlDoc('<w:p/>'));
    macroZip.folder('word')?.file('vbaProject.bin', 'macro');
    expect((await inspectDocxFile(await fileFromZip(macroZip))).inspection.blockingErrors.some((entry) => entry.code === 'DOCX_ACTIVE_CONTENT_REJECTED')).toBe(true);

    const remoteZip = new JSZip();
    remoteZip.folder('word')?.file('document.xml', xmlDoc('<w:p><w:r><w:t>x</w:t></w:r></w:p>'));
    remoteZip.folder('word')?.folder('_rels')?.file('document.xml.rels', '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/image" Target="https://example.com/a.png" TargetMode="External"/></Relationships>');
    expect((await inspectDocxFile(await fileFromZip(remoteZip))).inspection.blockingErrors.some((entry) => entry.code === 'DOCX_EXTERNAL_RELATIONSHIP_REJECTED')).toBe(true);
  });

  it('detects tracked changes/comments/headers as warnings, not fake live Word features', async () => {
    const zip = new JSZip();
    zip.folder('word')?.file('document.xml', xmlDoc('<w:p><w:ins><w:r><w:t>Új</w:t></w:r></w:ins><w:commentReference w:id="1"/></w:p>'));
    zip.folder('word')?.file('comments.xml', '<w:comments/>');
    zip.folder('word')?.file('header1.xml', '<w:hdr/>');
    const result = await inspectDocxFile(await fileFromZip(zip));
    expect(result.inspection.accepted).toBe(true);
    expect(result.inspection.detectedFeatures.trackedChanges).toBe(true);
    expect(result.inspection.warnings.map((warning) => warning.code)).toEqual(expect.arrayContaining(['TRACKED_CHANGES_FLATTENED', 'COMMENTS_REMOVED', 'HEADER_REMOVED']));
  });
});

describe('document editor DOCX static safety', () => {
  const docxInterop = path.join(__dirname, '..', '..', 'Frontend', 'src', 'lib', 'editor', 'docxInterop.ts');
  const workbench = path.join(__dirname, '..', '..', 'Frontend', 'src', 'components', 'editor', 'DocumentEditorWorkbench.tsx');

  it('uses no external converter, AI, n8n, Client Portal, server upload or browser persistence', () => {
    const source = `${fs.readFileSync(docxInterop, 'utf8')}\n${fs.readFileSync(workbench, 'utf8')}`.toLowerCase();
    for (const needle of ['cloudconvert', 'convertapi', 'openai', 'anthropic', 'n8n', '/portal', 'localstorage', 'sessionstorage', 'workspaceText'.toLowerCase(), 'graph.microsoft.com', 'sharepoint.com']) {
      expect(`${needle}:${source.includes(needle)}`).toBe(`${needle}:false`);
    }
    expect(source.includes('fetch(')).toBe(false);
  });
});
