import { sanitizePublicOpenApiSpec } from '../src/openapi/publicSpec';

describe('public OpenAPI exposure sanitizer', () => {
  const sourceSpec = {
    swagger: '2.0',
    info: {
      title: 'Adminiculum API (Runtime Aligned)',
      description: 'Swagger 2.0 aligned to full runtime router map used for Power Apps UI deployment and verification.',
      version: '1.0-runtime-aligned',
    },
    paths: {
      '/api/v1/auth/me': { get: { summary: 'Get current user' } },
      '/api/v1/cases': { get: { summary: 'List cases' } },
      '/api/v1/migrate': { post: { summary: 'Run migration' } },
      '/api/v1/dbcheck': { get: { summary: 'Check DB' } },
      '/api/v1/contracts/generate': { post: { summary: 'Generate contract' } },
      '/api/v1/client-portal/summary/{clientId}': { get: { summary: 'Client summary' } },
      '/api/v1/documents/{id}/redact': { post: { summary: 'Redact document' } },
      '/api/v1/documents/{documentId}/anonymize': { post: { summary: 'Anonymize document' } },
      '/api/v1/tasks/auto-generate': { post: { summary: 'Auto-generate tasks' } },
    },
  };

  it('returns valid public metadata while preserving safe paths', () => {
    const sanitized = sanitizePublicOpenApiSpec(sourceSpec);

    expect(sanitized.swagger).toBe('2.0');
    expect(sanitized.paths['/api/v1/auth/me']).toBeDefined();
    expect(sanitized.paths['/api/v1/cases']).toBeDefined();
    expect(sanitized['x-adminiculum-public-openapi']).toMatchObject({
      sanitized: true,
      productionApplyReadiness: 'blocked',
      cpSchema1Readiness: 'blocked',
      corsBoundaryResolved: false,
    });
  });

  it('removes runtime admin paths from public metadata', () => {
    const sanitized = sanitizePublicOpenApiSpec(sourceSpec);

    expect(sanitized.paths['/api/v1/migrate']).toBeUndefined();
    expect(sanitized.paths['/api/v1/dbcheck']).toBeUndefined();
  });

  it('removes representative quarantined feature paths from public metadata', () => {
    const sanitized = sanitizePublicOpenApiSpec(sourceSpec);

    expect(sanitized.paths['/api/v1/contracts/generate']).toBeUndefined();
    expect(sanitized.paths['/api/v1/client-portal/summary/{clientId}']).toBeUndefined();
    expect(sanitized.paths['/api/v1/documents/{id}/redact']).toBeUndefined();
    expect(sanitized.paths['/api/v1/documents/{documentId}/anonymize']).toBeUndefined();
    expect(sanitized.paths['/api/v1/tasks/auto-generate']).toBeUndefined();
  });

  it('does not preserve stale Power Apps or connector framing in served metadata', () => {
    const sanitized = sanitizePublicOpenApiSpec(sourceSpec);
    const metadataText = JSON.stringify(sanitized.info).toLowerCase();

    expect(metadataText).not.toContain('power apps');
    expect(metadataText).not.toContain('custom connector');
    expect(metadataText).not.toContain('connector');
  });

  it('does not mutate the source spec', () => {
    const sanitized = sanitizePublicOpenApiSpec(sourceSpec);

    expect(sourceSpec.paths['/api/v1/migrate']).toBeDefined();
    expect(sanitized.paths['/api/v1/migrate']).toBeUndefined();
  });
});
