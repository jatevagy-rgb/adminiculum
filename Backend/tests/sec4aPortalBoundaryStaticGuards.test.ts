import fs from 'node:fs';
import path from 'node:path';

const root = path.resolve(__dirname, '..');

function read(rel: string): string {
  return fs.readFileSync(path.join(root, rel), 'utf8');
}

// Customer-callable DTO builders (real files). Internal fields must never be
// surfaced to a Client Portal customer.
const CUSTOMER_DTO_BUILDERS = [
  'src/modules/compliance/clientSafeComplianceService.ts',
  'src/modules/client-workspace/companyProfileAnswerService.ts',
  'src/modules/client-workspace/orgCompanyService.ts',
  'src/modules/client-workspace/organizationalCaseService.ts',
  'src/modules/client-workspace/leadershipSummaryService.ts',
  'src/modules/client-publication/publicationService.ts',
];

// Fields that are definitively internal and must never be projected into a
// customer DTO. Absence as a declared DTO member is safe to assert.
const FORBIDDEN_MEMBER = [
  'ruleAst',
  'requirementId',
  'ruleId',
  'spItemId',
  'spWebUrl',
  'storageReference',
  'sourceFingerprint',
  'internalNote',
];

describe('SEC-4A portal boundary static guards', () => {
  it.each(CUSTOMER_DTO_BUILDERS)('does not expose forbidden internal members in %s', (file) => {
    const content = read(file);
    for (const snippet of FORBIDDEN_MEMBER) {
      // Must not appear as a declared DTO property (e.g. `ruleAst: string;` or
      // `spItemId: String|null`). Internal selection/import is acceptable; a
      // declared member in a customer DTO builder is an accidental exposure.
      const member = new RegExp(`\\b${snippet}\\s*[:?]`);
      expect(content).not.toMatch(member);
    }
  });

  it('keeps the client-safe compliance DTO on opaque topic ids, never internal ids/severity', () => {
    const service = read('src/modules/compliance/clientSafeComplianceService.ts');
    expect(service).toContain('topicId');
    expect(service).toContain('topicLabel');
    expect(service).toContain('shortExplanation');
    // Documented: customer surface never exposes internal severity.
    expect(service).not.toMatch(/severity\s*[:?]/);
  });

  it('keeps the company-profile discovery customer-safe (no raw fact-definition id)', () => {
    const svc = read('src/modules/client-workspace/companyProfileAnswerService.ts');
    expect(svc).toContain('questionKey');
    expect(svc).not.toMatch(/factDefinitionId\s*[:?]/); // no raw DB id in customer DTO
  });

  it('does not allow arbitrary cross-origin credentialed requests in CORS', () => {
    const cors = read('src/config/cors.ts');
    // Only the no-Origin guard may return callback(null, true). There must be no
    // blanket `return callback(null, true);` fallthrough that accepts any origin.
    const blanketTrues = cors.split('callback(null, true)').length - 1;
    expect(blanketTrues).toBe(1);
    expect(cors).toContain('productionAllowedOrigins.includes(origin)');
    expect(cors).toContain('localhost');
  });

  it('keeps customer and workforce auth boundaries separate', () => {
    const portalAuth = read('src/middleware/clientPortalAuth.ts');
    expect(portalAuth).toMatch(/authenticateClientPortal|requireActiveClientPortalSession/);
    const workforceAuth = read('src/middleware/auth.ts');
    expect(workforceAuth).toMatch(/export const authenticate/);
    // The portal router routes through the customer auth gate (portalRead).
    const clientPortal = read('src/routes/clientPortal.ts');
    expect(clientPortal).toMatch(/portalRead\(req, res\)/);
  });
});
