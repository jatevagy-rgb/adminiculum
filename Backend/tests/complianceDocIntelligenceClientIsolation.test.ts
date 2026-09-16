/**
 * CDI-1 — client-boundary regression proof (no database required).
 *
 * The internal clause/anchor relations must be unreachable from every
 * customer-facing surface. This suite proves that structurally (no customer
 * module references the relation or its internal fields) and at the DTO level
 * (the canonical portal document publication DTO can never carry them), and it
 * pins the ingestion trigger wiring so a CLIENT_POLICY link cannot start
 * internal metadata extraction.
 *
 * The database-backed proof of the client-safe compliance read model lives in
 * complianceDocIntelligence.integration.test.ts.
 */
import { describe, expect, it } from '@jest/globals';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { assertNoForbiddenPortalFields, toClientDocumentPublicationDTO } from '../src/modules/client-publication/publicationService';

const backendRoot = join(__dirname, '..');
const srcRoot = join(backendRoot, 'src');

function readSource(relativePath: string): string {
  return readFileSync(join(srcRoot, relativePath), 'utf8');
}

/** Every module that produces or serves a customer-visible payload. */
const CLIENT_FACING_MODULES = [
  'modules/compliance/clientSafeComplianceService.ts',
  'modules/compliance/clientSafeComplianceRoutes.ts',
  'modules/compliance/companyGrowthNarrative.ts',
  'modules/compliance/safeTopicRegistry.ts',
  'modules/client-publication/publicationService.ts',
  'modules/client-publication/internalCasePortalPublication.service.ts',
  'modules/client-publication/publication.routes.ts',
];

const INTERNAL_TOKENS = [
  'ComplianceDocumentClauseAnchor',
  'complianceDocumentClauseAnchor',
  'compliance_document_clause_anchor',
  'anchorKey',
  'anchorStableId',
  'anchorDisplay',
  'ingestWarnings',
  'rowDigest',
  'compliance-doc-intelligence',
  // C3A canonical binding metadata (internal-only).
  'legalSourceBindingStatus',
  'canonicalLegalSourceVersionId',
  'canonicalCitation',
  'canonicalTitle',
  'bindingOrigin',
  'bindingReason',
  'legalSourceBinding',
];

describe('CDI-1 client isolation — structural boundary', () => {
  it.each(CLIENT_FACING_MODULES)('%s never references the internal relation', (modulePath) => {
    const source = readSource(modulePath);
    for (const token of INTERNAL_TOKENS) {
      expect(`${modulePath}:${source.includes(token) ? token : ''}`).toBe(`${modulePath}:`);
    }
  });

  it('does not expose the internal relation on a client-portal route path', () => {
    const indexSource = readSource('index.ts');
    // The internal read surface is mounted under its own internal prefix only.
    expect(indexSource).toContain("app.use('/api/v1/compliance-intelligence'");
    expect(indexSource).not.toContain("'/api/v1/client-portal/compliance-intelligence'");
  });
});

describe('CDI-1 client isolation — canonical publication DTO', () => {
  it('maps only its allow-listed fields and drops anything else', () => {
    const contaminated = {
      id: 'publication-1',
      caseId: 'case-1',
      clientId: 'client-1',
      documentId: 'document-1',
      documentVersionId: 'version-1',
      status: 'PUBLISHED',
      clientFacingTitle: 'Adatkezelési szabályzat',
      audienceSnapshot: {},
      sourceFingerprint: 'fingerprint',
      revision: 1,
      // Internal analysis metadata that must never survive the mapping.
      anchorKey: 'LEGAL|SID=la_baa4796f2169',
      anchorDisplay: 'GDPR 28. cikk (3)',
      anchorStableId: 'la_baa4796f2169',
      rationale: 'A controller-processor jogviszony kotelezo tartalma.',
      eli: 'http://data.europa.eu/eli/reg/2016/679/oj',
      celex: '32016R0679',
      ecli: 'EU:C:2023:949',
      decisionId: 'NAIH-19-18/2024',
      authorityLocator: 'paras=217-241',
      sourceUrl: 'https://naih.hu/hatarozatok-vegzesek?download=1427',
      rowDigest: 'a'.repeat(64),
      ingestWarnings: ['ANCHOR_KEY_UNRESOLVED'],
    };

    const dto = toClientDocumentPublicationDTO(contaminated);
    const serialized = JSON.stringify(dto);
    expect(dto.clientFacingTitle).toBe('Adatkezelési szabályzat');
    for (const token of [
      'anchorKey',
      'anchorDisplay',
      'anchorStableId',
      'rationale',
      'rowDigest',
      'ingestWarnings',
      'la_baa4796f2169',
      'GDPR 28. cikk (3)',
      'data.europa.eu',
      'NAIH-19-18/2024',
    ]) {
      expect(serialized).not.toContain(token);
    }
    expect(() => assertNoForbiddenPortalFields(dto)).not.toThrow();
  });
});

describe('CDI-1 ingestion trigger wiring', () => {
  const documentRoutes = readSource('modules/documents/routes.ts');
  const complianceDocumentService = readSource('modules/compliance/complianceDocumentService.ts');

  it('triggers derived ingestion from both document version upload paths', () => {
    const uploadCalls = documentRoutes.match(/scheduleInternalAnalysisIngestion\(/g) ?? [];
    expect(uploadCalls.length).toBe(2);
    expect(documentRoutes).toContain("from '../compliance-doc-intelligence/service'");
  });

  it('triggers ingestion only for the INTERNAL_ANALYSIS audience', () => {
    const guardIndex = complianceDocumentService.indexOf("if (input.audience === 'INTERNAL_ANALYSIS')");
    const callIndex = complianceDocumentService.indexOf('scheduleInternalAnalysisIngestion(input.documentId');
    expect(guardIndex).toBeGreaterThan(-1);
    expect(callIndex).toBeGreaterThan(guardIndex);
    // The linkage result must not depend on ingestion succeeding.
    expect(complianceDocumentService).toMatch(/try\s*\{\s*scheduleInternalAnalysisIngestion/);
  });
});
