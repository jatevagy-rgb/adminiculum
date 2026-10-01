import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

// Structural contract for the rate-free client work-report surface:
//   1. the new /work-report page is wired to the workforce shell and API
//   2. the frontend projection carries no monetary fields
//   3. the backend routes enforce case read access and the PDF is rate-free
//   4. honest states: zero time, ambiguous time, excluded time, "Nincs megadva"

const page = readFileSync('src/app/work-report/page.tsx', 'utf8');
const api = readFileSync('src/lib/workReportApi.ts', 'utf8');
const nav = readFileSync('src/lib/navigation.ts', 'utf8');
const sidebar = readFileSync('src/components/Sidebar.tsx', 'utf8');
const routes = readFileSync('../Backend/src/modules/work-reports/routes.ts', 'utf8');
const pdf = readFileSync('../Backend/src/modules/work-reports/pdf.ts', 'utf8');
const service = readFileSync('../Backend/src/modules/work-reports/service.ts', 'utf8');

const MONEY_FIELD = /\b(hourlyRate|netAmount|vatRate|vatAmount|grossAmount|rateVersionId|rateOverride|includedNetAmount)\s*[:=]/;

test('work-report page wires shell, journey and download', () => {
  assert.match(page, /section="work-report"/);
  assert.match(page, /<PageHeader/);
  assert.match(page, /listWorkReportCases/);
  assert.match(page, /listWorkReportOwnerCandidates/);
  assert.match(page, /getWorkReportCase/);
  assert.match(page, /downloadWorkReportPdf/);
  assert.match(page, /PDF letöltése/);
  assert.match(page, /type="month"/);
});

test('work-report page is a valid Next.js page: only the default export', () => {
  assert.match(page, /export default function WorkReportPage/);
  assert.doesNotMatch(page, /export\s+function\s+WorkReportPageContent/);
  assert.doesNotMatch(page, /export\s+\{/);
});

test('work-report page uses semantic tokens, no arbitrary hex colors', () => {
  assert.doesNotMatch(page, /(?:bg|text|border|ring|fill|stroke)-\[#[0-9a-fA-F]{3,8}\]/);
  assert.match(page, /var\(--adm-text-primary\)/);
  assert.match(page, /var\(--adm-text-secondary\)/);
  assert.match(page, /var\(--adm-border-canonical\)/);
});

test('work-report page distinguishes honest time states', () => {
  assert.match(page, /Ehhez az ügyhöz a kiválasztott időszakban nincs rögzített/);
  assert.match(page, /Bizonytalan hozzárendelésű idő/);
  assert.match(page, /Kizárt munkaidő/);
  assert.match(page, /Nincs megadva/);
  assert.match(page, /Ügyfélnek közzétett tájékoztatások/);
});

test('frontend projection exposes no monetary fields', () => {
  assert.doesNotMatch(api, MONEY_FIELD);
  assert.doesNotMatch(page, MONEY_FIELD);
});

test('navigation exposes the new work-report section', () => {
  assert.match(nav, /"work-report"/);
  assert.match(sidebar, /"work-report": "\/work-report"/);
  assert.match(sidebar, /"work-report", "communications"/);
});

test('backend report routes require workforce + case read access', () => {
  assert.match(routes, /requireWorkforceUser/);
  assert.match(routes, /requireCaseReadAccess/);
  assert.match(routes, /WORK_REPORT_INVALID_PERIOD/);
  assert.match(routes, /application\/pdf/);
});

test('backend routes validate the report-level owner and the issuer configuration', () => {
  assert.match(routes, /ownerPersonId/);
  assert.match(routes, /WORK_REPORT_OWNER_NOT_IN_CLIENT/);
  assert.match(routes, /WORK_REPORT_ISSUER_CONFIGURATION_REQUIRED/);
  assert.match(routes, /listReportOwnerCandidates/);
});

test('backend report service never reads billing or rate models', () => {
  assert.doesNotMatch(service, /hourlyRateVersion|billingPreparation|invoiceDraft|netAmountForMinutes/);
  assert.match(service, /requestedByOrganizationPerson/);
  assert.match(service, /PUBLISHED/);
  assert.match(service, /buildCaseReadScope/);
});

test('PDF renderer prints no rate or money labels and marks itself as a report', () => {
  assert.doesNotMatch(pdf, /Óradíj|Nettó|ÁFA|Bruttó|Ft/);
  assert.match(pdf, /nem számla/);
  assert.match(pdf, /MUNKAÓRA-KIMUTATÁS/);
});

test('PDF renderer receives only the client-export projection, never internal diagnostics', () => {
  assert.doesNotMatch(pdf, /ambiguousRows|excludedRows|ambiguousMinutes|excludedMinutes/);
  assert.match(pdf, /ClientWorkReportExport/);
  assert.match(routes, /projectClientWorkReportExport/);
  assert.doesNotMatch(routes, /renderClientWorkReportPdf\(report\)/);
});

test('PDF renderer uses the configured law firm as issuer, never Adminiculum as the issuer', () => {
  assert.match(pdf, /issuer\.legalName/);
  assert.match(pdf, /Author: issuer\.legalName/);
  assert.match(pdf, /Creator: 'Adminiculum'/);
  assert.match(pdf, /Készült az Adminiculum rendszerében/);
  assert.match(pdf, /WORK_REPORT_ISSUER_CONFIGURATION_REQUIRED/);
  assert.doesNotMatch(pdf, /'Adminiculum', margin, y/);
});

test('client-export PDF never prints raw work descriptions', () => {
  assert.doesNotMatch(pdf, /Munkavégzés leírása/);
  assert.doesNotMatch(pdf, /row\.description/);
  assert.match(pdf, /munkaleírásokat nem tartalmazza/);
});

test('internal review shows full descriptions while the export preview omits them', () => {
  assert.match(page, /Belső áttekintés/);
  assert.match(page, /Munkavégzés leírása/);
  assert.match(page, /row\.description/);
  const previewBlock = page.slice(page.indexOf('Ügyfél-export előnézete'), page.indexOf('Bizonytalan hozzárendelésű idő'));
  assert.match(previewBlock, /az ügyfélnek készülő kivonat a belső munkaleírásokat nem tartalmazza/i);
  assert.match(previewBlock, /Munkatárs/);
  assert.match(previewBlock, /Típus/);
  assert.match(previewBlock, /Időtartam/);
  assert.doesNotMatch(previewBlock, /Munkavégzés leírása/);
  assert.doesNotMatch(previewBlock, /row\.description/);
  assert.doesNotMatch(previewBlock, /requesterName|organizationGroupName|departmentName/);
  assert.match(previewBlock, /row\.workDate/);
  assert.match(previewBlock, /row\.workerName/);
  assert.match(previewBlock, /row\.workTypeLabel/);
  assert.match(previewBlock, /row\.minutes/);
});

test('export preview renders the same server-side projection the PDF uses', () => {
  assert.match(page, /exportPreview/);
  assert.match(page, /report\.exportPreview\.rows/);
  assert.match(page, /issuerMissing/);
  assert.match(page, /officeIdentifierNote/);
});

test('report page offers the report-level client-side owner, never a fake persisted assignment', () => {
  assert.match(page, /Ügygazda az ügyfélnél/);
  assert.match(page, /ez a kiválasztás ehhez a jelentéshez tartozik/i);
  assert.match(page, /person\.personId/);
  assert.match(page, /WORK_REPORT_OWNER_NOT_IN_CLIENT/);
  assert.match(page, /reportSeq/);
  assert.match(page, /casesSeq/);
});
