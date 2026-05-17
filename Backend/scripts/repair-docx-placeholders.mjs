import fs from 'fs';
import path from 'path';
import PizZip from 'pizzip';
import Docxtemplater from 'docxtemplater';
import 'dotenv/config';
import contractsServiceModule from '../src/modules/contracts/services.ts';
import { PrismaClient } from '@prisma/client';

const contractsService = contractsServiceModule?.default || contractsServiceModule;
const prisma = new PrismaClient();
const reportDir = path.resolve('tmp');
if (!fs.existsSync(reportDir)) {
  fs.mkdirSync(reportDir, { recursive: true });
}
const reportPath = path.join(reportDir, 'docx-repair-report.json');

const files = [
  {
    name: 'Bejegyzési engedély',
    originalPath: 'templates/Bejegyzesi_engedely_backend_ready_template.docx',
    path: 'templates/Bejegyzesi_engedely_backend_ready_template_xmlfixed_v3.docx',
    outputPath: 'templates/Bejegyzesi_engedely_backend_ready_template_xmlfixed_v4.docx',
    templateId: 'c926deb4-e028-4275-8bde-46323899d8d5'
  },
];

function extractSnippet(xml, needle, radius = 180) {
  const index = xml.indexOf(needle);
  if (index === -1) {
    return null;
  }
  return xml.slice(Math.max(0, index - radius), Math.min(xml.length, index + needle.length + radius));
}

function reconstructText(xmlSnippet) {
  return xmlSnippet
    .replace(/<w:tab[^>]*\/>/g, '\t')
    .replace(/<w:br[^>]*\/>/g, '\n')
    .replace(/<[^>]+>/g, '')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&amp;/g, '&');
}

function findFirstOccurrence(parts, needle) {
  for (const [partName, xml] of parts) {
    const index = xml.indexOf(needle);
    if (index !== -1) {
      return { partName, index, snippet: extractSnippet(xml, needle), xml };
    }
  }
  return null;
}

function getRunSpans(xml) {
  const spans = [];
  const regex = /<w:r[\s\S]*?<\/w:r>/g;
  for (const match of xml.matchAll(regex)) {
    spans.push({ start: match.index, end: match.index + match[0].length, xml: match[0] });
  }
  return spans;
}

function getCoveringRunCluster(xml, index) {
  const runs = getRunSpans(xml);
  const cluster = runs.filter((run) => run.end >= index - 40 && run.start <= index + 80);
  if (!cluster.length) {
    return null;
  }
  return {
    start: cluster[0].start,
    end: cluster[cluster.length - 1].end,
    xml: xml.slice(cluster[0].start, cluster[cluster.length - 1].end),
  };
}

function getTemplateErrorDetails(error) {
  const source = contractsService.serializeTemplateError
    ? contractsService.serializeTemplateError(error)
    : { properties: { errors: [] }, message: error instanceof Error ? error.message : String(error) };
  const nested = source?.properties?.errors || [];
  return nested[0] || source;
}

function classifyBreakPattern(clusterXml) {
  const hasMultipleRuns = (clusterXml.match(/<w:r[\s>]/g) || []).length > 1;
  const hasMultipleTextNodes = (clusterXml.match(/<w:t[^>]*>/g) || []).length > 1;
  const hasDuplicateBraces = /\{\{\{|\}\}\}/.test(clusterXml);
  const hasBlockTag = /#has_|\/has_|IF_HAS_/.test(clusterXml);
  const hasWrappers = /bookmark|smartTag|hyperlink|proofErr/.test(clusterXml);

  if (hasDuplicateBraces) return 'duplicated literal braces';
  if (hasBlockTag) return 'malformed block tag';
  if (hasMultipleTextNodes || hasMultipleRuns) return 'split across <w:t>/<w:r> runs';
  if (hasWrappers) return 'wrapped by additional Word XML nodes';
  return 'placeholder merged with surrounding XML/text';
}

function inferReplacementToken(text) {
  const normalized = text.replace(/\s+/g, '');
  if (normalized.includes('elado_nev') || normalized.includes('{{elad')) return '{{elado_nev}}';
  if (normalized.includes('vevo_nev') || normalized.includes('{{vevo')) return '{{vevo_nev}}';
  if (normalized.includes('ugyved_nev') || normalized.includes('{{ugyv')) return '{{ugyved_nev}}';
  if (normalized.includes('ugyved_kasz')) return '{{ugyved_kasz}}';
  if (normalized.includes('szerzodes_helye')) return '{{szerzodes_helye}}';
  if (normalized.includes('szerzodes_datuma')) return '{{szerzodes_datuma}}';
  if (normalized.includes('#has_title_retention') || normalized.includes('IF_HAS_TITLE_RETENTION')) return '{{#has_title_retention}}';
  if (normalized.includes('/has_title_retention')) return '{{/has_title_retention}}';
  return null;
}

function findInterestingPart(xmlByPart) {
  const parts = Object.entries(xmlByPart);
  const preferred = parts.find(([, xml]) => xml.includes('{{elad'))
    || parts.find(([, xml]) => xml.includes('{{'))
    || parts[0];
  return preferred;
}

function targetedRepair(xml) {
  let repaired = xml;
  const changes = [];

  const brokenPatterns = [
    { label: 'elado_nev', regex: /\{\{elad[^{}]*_nev\}\}/g, replacement: '{{elado_nev}}' },
    { label: 'vevo_nev', regex: /\{\{vevo[^{}]*_nev\}\}/g, replacement: '{{vevo_nev}}' },
    { label: 'ugyved_nev', regex: /\{\{ugyv[^{}]*_nev\}\}/g, replacement: '{{ugyved_nev}}' },
    { label: 'ugyved_kasz', regex: /\{\{ugyv[^{}]*kasz\}\}/g, replacement: '{{ugyved_kasz}}' },
    { label: 'szerzodes_helye', regex: /\{\{szer[^{}]*elye\}\}/g, replacement: '{{szerzodes_helye}}' },
    { label: 'szerzodes_datuma', regex: /\{\{szer[^{}]*tuma\}\}/g, replacement: '{{szerzodes_datuma}}' },
    { label: 'has_title_retention_open', regex: /\{\{#?IF_HAS_TITLE_RETENTION\}\}/g, replacement: '{{#has_title_retention}}' },
    { label: 'has_title_retention_close', regex: /\{\{\/?has_title_retention\}\}/g, replacement: '{{/has_title_retention}}' },
  ];

  for (const pattern of brokenPatterns) {
    repaired = repaired.replace(pattern.regex, (match) => {
      changes.push({ before: match, after: pattern.replacement, label: pattern.label });
      return pattern.replacement;
    });
  }

  return { repaired, changes };
}

function buildPayload(variableNames) {
  const payload = {
    szerzodes_helye: 'Budapest',
    szerzodes_datuma: '2026-03-29',
    elado_nev: 'Minta Eladó',
    elado_szul_nev: 'Eladó Születési Név',
    elado_anya_neve: 'Eladó Anyja',
    elado_szul_hely: 'Budapest',
    elado_szul_ido: '1980-01-01',
    elado_lakcim: '1111 Budapest Teszt utca 1.',
    elado_szemelyi_ig: 'AA123456',
    elado_szemelyi_szam: '123456AB',
    elado_adoazonosito_jel: '1234567890',
    elado_allampolgarsag: 'magyar',
    vevo_nev: 'Minta Vevő',
    vevo_szul_nev: 'Vevő Születési Név',
    vevo_anya_neve: 'Vevő Anyja',
    vevo_szul_hely: 'Győr',
    vevo_szul_ido: '1990-02-02',
    vevo_lakcim: '2222 Budapest Próba utca 2.',
    vevo_szemelyi_ig: 'BB123456',
    vevo_szemelyi_szam: '654321CD',
    vevo_adoazonosito_jel: '1111111111',
    vevo_allampolgarsag: 'magyar',
    ugyved_nev: 'Dr. Teszt Ügyvéd',
    ugyved_kasz: 'KASZ-123',
    ingatlan_helyrajzi_szam: '12345/6',
    ingatlan_iranyitoszam: '1111',
    ingatlan_telepules: 'Budapest',
    ingatlan_utca: 'Teszt utca',
    ingatlan_hazszam: '10',
    ingatlan_emelet_ajto: '2/4',
    ingatlan_alapterulet: '72',
    ingatlan_tipus_neve: 'lakás',
    ingatlan_tulajdoni_hanyad: '1/2',
    vetelar: '52500000',
    birtokbaadas_datuma: '2026-04-30',
  };

  for (const name of variableNames) {
    if (payload[name] === undefined) {
      payload[name] = '';
    }
  }

  return payload;
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
      error: contractsService.serializeTemplateError
        ? contractsService.serializeTemplateError(error)
        : { message: error instanceof Error ? error.message : String(error) },
    };
  }
}

const reports = [];

for (const item of files) {
  const originalFilePath = path.resolve(item.originalPath);
  const v3FilePath = path.resolve(item.path);
  const repairedFilePath = path.resolve(item.outputPath);
  const binary = fs.readFileSync(v3FilePath, 'binary');
  const zip = new PizZip(binary);
  const partNames = zip.file(/word\/(document|header\d+|footer\d+)\.xml/).map((file) => file.name).sort();
  const xmlByPart = Object.fromEntries(partNames.map((name) => [name, zip.file(name)?.asText() || '']));

  const parseV3 = directParseDocx(v3FilePath);
  const firstV3Error = getTemplateErrorDetails(parseV3.error);
  const focusPartName = firstV3Error?.properties?.file || 'word/document.xml';
  const focusXml = xmlByPart[focusPartName];
  const errorOffset = Number(firstV3Error?.properties?.offset || focusXml.indexOf('{{elad'));
  const cluster = getCoveringRunCluster(focusXml, errorOffset) || {
    start: Math.max(0, errorOffset - 80),
    end: Math.min(focusXml.length, errorOffset + 160),
    xml: focusXml.slice(Math.max(0, errorOffset - 80), Math.min(focusXml.length, errorOffset + 160)),
  };

  const breakPattern = classifyBreakPattern(cluster.xml);
  const replacementToken = inferReplacementToken(reconstructText(cluster.xml));
  let repairedXml = focusXml;
  const changedSpans = [];

  if (replacementToken) {
    const replacementRun = `<w:r><w:t xml:space="preserve">${replacementToken}</w:t></w:r>`;
    repairedXml = `${focusXml.slice(0, cluster.start)}${replacementRun}${focusXml.slice(cluster.end)}`;
    changedSpans.push({ before: cluster.xml, after: replacementRun });
  }

  const repairedZip = new PizZip(binary);
  repairedZip.file(focusPartName, repairedXml);
  fs.writeFileSync(repairedFilePath, repairedZip.generate({ type: 'nodebuffer' }));

  const repairedBinary = fs.readFileSync(repairedFilePath, 'binary');
  const repairedZipRead = new PizZip(repairedBinary);
  const repairedParts = repairedZipRead.file(/word\/(document|header\d+|footer\d+)\.xml/).map((file) => [file.name, file.asText()]);
  const firstOpenOriginal = findFirstOccurrence(Object.entries(xmlByPart), '{{');
  const firstEladOriginal = findFirstOccurrence(Object.entries(xmlByPart), '{{elad');
  const firstOpenRepaired = findFirstOccurrence(repairedParts, '{{');
  const firstEladRepaired = findFirstOccurrence(repairedParts, '{{elad');
  const standaloneParse = directParseDocx(repairedFilePath);
  const nextStandaloneError = standaloneParse.success ? null : getTemplateErrorDetails(standaloneParse.error);

  const template = await prisma.contractTemplate.findUnique({ where: { id: item.templateId } });
  const variableNames = Array.isArray(template?.variables) ? template.variables.map((v) => v.name) : [];
  const payload = buildPayload(variableNames);
  const originalTemplatePath = template?.templatePath;
  if (template) {
    await prisma.contractTemplate.update({ where: { id: item.templateId }, data: { templatePath: repairedFilePath } });
  }
  const preview = await contractsService.generatePreview({ templateId: item.templateId, data: payload });
  const generated = await contractsService.generateContract({ templateId: item.templateId, caseId: '1', title: `${item.name} repair retest`, data: payload });
  if (template && originalTemplatePath) {
    await prisma.contractTemplate.update({ where: { id: item.templateId }, data: { templatePath: originalTemplatePath } });
  }

  reports.push({
    templateName: item.name,
    originalFilePath,
    v3FilePath,
    repairedFilePath,
    earliestSurvivingMalformedTokenFamilyInV3: firstV3Error?.properties?.id || firstV3Error?.message || null,
    standaloneParseResult: standaloneParse,
    backendPreviewResult: { success: preview.success, error: preview.error || null },
    backendGenerateResult: { success: generated.success, error: generated.error || null },
    standaloneFilePathUsed: repairedFilePath,
    backendFilePathUsed: repairedFilePath,
    originalDocumentXmlHead200: focusXml.slice(0, 200),
    repairedDocumentXmlHead200: (repairedParts.find(([part]) => part === focusPartName)?.[1] || '').slice(0, 200),
    originalFirstOpenSnippet: firstOpenOriginal?.snippet || null,
    repairedFirstOpenSnippet: firstOpenRepaired?.snippet || null,
    originalFirstEladSnippet: firstEladOriginal?.snippet || 'not found',
    repairedFirstEladSnippet: firstEladRepaired?.snippet || 'not found',
    repairedEarliestSurvivingFailingZone: firstEladRepaired?.snippet || firstOpenRepaired?.snippet || null,
    firstFailingTokenChanged: Boolean((firstEladOriginal?.snippet || '') !== (firstEladRepaired?.snippet || '') || changedSpans.length),
    firstThreeModifiedSpans: changedSpans.slice(0, 3),
    modifiedSpansRelativePosition: changedSpans.length ? 'covers earliest failing token' : 'no rewritten span recorded',
    breakPattern,
    nextStandaloneRawError: nextStandaloneError,
    nextBackendRawError: generated.success ? null : (generated.rawError || preview.rawError || null),
    firstErrorMovedForward: Boolean(nextStandaloneError && Number(nextStandaloneError?.properties?.offset) > Number(firstV3Error?.properties?.offset || 0)),
    finalAnswer: standaloneParse.success || Boolean(nextStandaloneError && Number(nextStandaloneError?.properties?.offset) > Number(firstV3Error?.properties?.offset || 0))
      ? 'Yes, the first failing token itself got fixed in v4.'
      : 'No, the first failing token itself did not get fixed in v4.',
  });
}

fs.writeFileSync(reportPath, JSON.stringify(reports, null, 2));
console.log(JSON.stringify({
  reportPath,
  templates: reports.map((r) => ({
    templateName: r.templateName,
    repairedFilePath: r.repairedFilePath,
    standaloneParseResult: r.standaloneParseResult,
    backendPreviewResult: r.backendPreviewResult,
    backendGenerateResult: r.backendGenerateResult,
    finalAnswer: r.finalAnswer,
  })),
}, null, 2));
await prisma.$disconnect();
