/**
 * Client Portal Documents — Slice 2 (customer-safe document tags).
 *
 * Locks the two derived customer-facing classifications:
 *  - `clientUploaded` — true ONLY for CLIENT_UPLOAD / CLIENT_PORTAL
 *    (never lawyer uploads, e-mail/SharePoint imports, generated or imported
 *    sources);
 *  - `isCompliancePolicy` — true ONLY when a canonical ComplianceDocument with
 *    audience CLIENT_POLICY backs the published document (INTERNAL_ANALYSIS
 *    never qualifies).
 *
 * Both are derived in the projection; the raw uploadSource enum and the raw
 * ComplianceDocument audience never leave the portal DTO. Classification is
 * bound to the EXACT published documentVersionId, not the current version.
 */
import fs from 'fs';
import path from 'path';
import { isCustomerUploadedSource } from '../src/modules/client-publication/publicationService';

const service = fs.readFileSync(path.join(__dirname, '..', 'src', 'modules', 'client-publication', 'publicationService.ts'), 'utf8');

function slice(from: string, to: string): string {
  const start = service.indexOf(from);
  const end = service.indexOf(to, start);
  expect(start).toBeGreaterThanOrEqual(0);
  expect(end).toBeGreaterThan(start);
  return service.slice(start, end);
}

const listPortalDocumentsSource = () => slice('export async function listPortalDocuments(', 'export async function getPortalDocument(');
const getPortalDocumentSource = () => slice('export async function getPortalDocument(', 'export async function authorizePortalDocumentDownload(');
const toPortalDocumentSource = () => slice('function toPortalDocument(', 'function toPortalAction(');

describe('clientUploaded classification (canonical upload sources)', () => {
  it.each([
    ['CLIENT_UPLOAD', true],
    ['CLIENT_PORTAL', true],
  ])('%s -> clientUploaded=true', (source, expected) => {
    expect(isCustomerUploadedSource(source)).toBe(expected);
  });

  it.each([
    'LAWYER_UPLOAD',
    'EMAIL_IMPORT',
    'SHAREPOINT',
    'GENERATED',
    'WORKSPACE_SAVE',
    'IMPORT',
    'EXTERNAL',
  ])('%s -> clientUploaded=false', (source) => {
    expect(isCustomerUploadedSource(source)).toBe(false);
  });

  it('fails closed on unknown, null or missing sources', () => {
    expect(isCustomerUploadedSource('SOME_FUTURE_SOURCE')).toBe(false);
    expect(isCustomerUploadedSource(null)).toBe(false);
    expect(isCustomerUploadedSource(undefined)).toBe(false);
  });
});

describe('projection SQL keeps the publication gate and exact published version', () => {
  it('classifies from the exact published version, not the current one', () => {
    const src = listPortalDocumentsSource();
    expect(src).toMatch(/JOIN document_versions v ON v\.id=p\."documentVersionId"/);
    expect(src).toMatch(/v\."uploadSource"::text AS "uploadSource"/);
  });

  it('keeps the PUBLISHED publication gate for the list', () => {
    expect(listPortalDocumentsSource()).toMatch(/p\.status='PUBLISHED'::"ClientPublicationStatus"/);
  });

  it('derives isCompliancePolicy via EXISTS on CLIENT_POLICY only (no row multiplication)', () => {
    const src = listPortalDocumentsSource();
    expect(src).toMatch(/EXISTS\s*\(\s*SELECT 1 FROM compliance_documents cd/);
    expect(src).toMatch(/cd\.audience = 'CLIENT_POLICY'::"ComplianceDocumentAudience"/);
    expect(src).not.toMatch(/JOIN\s+compliance_documents/);
    expect(src).not.toContain('INTERNAL_ANALYSIS');
  });

  it('keeps the same safe projection on the single-document read', () => {
    const src = getPortalDocumentSource();
    expect(src).toMatch(/v\."uploadSource"::text AS "uploadSource"/);
    expect(src).toMatch(/cd\.audience = 'CLIENT_POLICY'::"ComplianceDocumentAudience"/);
  });
});

describe('portal DTO never exposes raw provenance', () => {
  it('maps uploadSource and compliance rows to derived booleans only', () => {
    const src = toPortalDocumentSource();
    expect(src).toContain('clientUploaded: isCustomerUploadedSource(row.uploadSource)');
    expect(src).toContain('isCompliancePolicy: row.isCompliancePolicy === true');
  });

  it('never emits raw uploadSource, audience or compliance metadata keys', () => {
    const src = toPortalDocumentSource();
    expect(src).not.toMatch(/uploadSource\s*:/);
    expect(src).not.toMatch(/audience\s*:/);
    expect(src).not.toMatch(/ComplianceDocument\s*:/);
  });

  it('keeps the client-safe assertion on the extended DTO', () => {
    expect(toPortalDocumentSource()).toContain('assertNoForbiddenPortalFields(dto)');
  });
});
