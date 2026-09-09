import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const workspace = readFileSync('src/app/clients/[clientId]/szamlazas/[preparationId]/BillingReviewWorkspace.tsx', 'utf8');
const draftWorkspace = readFileSync('src/app/clients/[clientId]/szamlazas/[preparationId]/szamlatervezet/InvoiceDraftWorkspace.tsx', 'utf8');
const api = readFileSync('src/lib/invoiceDraftsApi.ts', 'utf8');
const issuerSettings = readFileSync('src/app/settings/szamlazas/IssuerProfileSettings.tsx', 'utf8');

test('closed preparation exposes the Számlatervezet action next to the existing PDF button', () => {
  // Both actions live inside the closed-only branch; the open branch never shows them.
  const closedBranch = workspace.slice(workspace.indexOf('{!open && <>'));
  const openBranch = workspace.slice(workspace.indexOf('{open && <>'), workspace.indexOf('{!open && <>'));
  assert.match(closedBranch, /PDF letöltése/);
  assert.match(closedBranch, /Számlatervezet/);
  assert.doesNotMatch(openBranch, /Számlatervezet|PDF letöltése/);
  assert.match(workspace, /downloadBillingPreparationPdf\(preparationId\)/); // existing summary untouched
  assert.match(workspace, /createInvoiceDraft\(\{ billingPreparationId: preparationId \}\)/);
  assert.match(workspace, /\/szamlatervezet/);
});

test('draft workspace renders Hungarian draft markers, the missing-field list, and snapshot semantics', () => {
  assert.match(draftWorkspace, /Számlatervezet/);
  assert.match(draftWorkspace, /NEM SZÁMLA/);
  assert.match(draftWorkspace, /draft\.missing\.map/);
  assert.match(draftWorkspace, /INVOICE_DRAFT_INCOMPLETE/);
  assert.match(draftWorkspace, /Teljesítés dátuma/);
  assert.match(draftWorkspace, /Fizetési határidő/);
  assert.match(draftWorkspace, /ÁFA-kezelés/);
  assert.match(draftWorkspace, /downloadInvoiceDraftPdf\(draft\.id\)/);
  assert.match(draftWorkspace, /patchInvoiceDraft\(draft\.id,/);
  assert.match(draftWorkspace, /patchInvoiceDraftLine\(draft\.id, lineId, lineText\)/);
  // Explicit tax-number applicability selector + discard action.
  assert.match(draftWorkspace, /Adószám szükséges/);
  assert.match(draftWorkspace, /Nem alkalmazandó/);
  assert.match(draftWorkspace, /customerTaxNumberRequirement/);
  assert.match(draftWorkspace, /Tervezet elvetése/);
  assert.match(draftWorkspace, /discardInvoiceDraft\(draft\.id\)/);
  // Canonical applicability is not reviewer-overridable in the UI either.
  assert.match(draftWorkspace, /taxNumberCanonical/);
  // Issuer snapshot wording: profile edits only affect future drafts.
  assert.match(draftWorkspace, /Számlázói adatok beállítása/);
  assert.match(draftWorkspace, /INVOICE_ISSUER_PROFILE_INCOMPLETE/);
});

test('no frontend authoritative money arithmetic and no invoice identity wording', () => {
  for (const source of [api, draftWorkspace, workspace]) {
    assert.doesNotMatch(source, /netAmount\s*[*/+]|grossAmount\s*[*/+]|vatAmount\s*[*/+]/);
    assert.doesNotMatch(source, /parseFloat|parseInt\(|Number\([^)]*(netAmount|grossAmount|vatAmount|hourlyRate|netUnitPrice)/);
    assert.doesNotMatch(source, /invoiceNumber|Számlaszám|NAV/);
  }
});

test('api client covers issuer profile, draft lifecycle, line patch, and blob PDF', () => {
  assert.match(api, /\/invoice-drafts/);
  assert.match(api, /issuer-profile/);
  assert.match(api, /fetchApiBlob/);
  assert.match(api, /method: 'PUT'/);
  assert.match(api, /method: 'POST'/);
  assert.match(api, /method: 'PATCH'/);
  assert.match(api, /method: 'DELETE'/);
  assert.match(api, /TaxNumberRequirement/);
  // Draft status model: DRAFT only — no issued/issued-equivalent state anywhere.
  assert.doesNotMatch(api, /ISSUED|invoiceNumber/);
});

test('issuer profile settings page is ADMIN-gated and carries no invented identifiers', () => {
  assert.match(issuerSettings, /user\.role !== 'ADMIN'/);
  assert.match(issuerSettings, /Számlázói profil/);
  assert.doesNotMatch(issuerSettings, /Bálintfy/); // stored configuration, never a source literal
});
