type OpenApiSpec = Record<string, any>;

const QUARANTINED_PUBLIC_PATH_PATTERNS: RegExp[] = [
  /^\/api\/v1\/migrate(?:\/|$)/i,
  /^\/api\/v1\/dbcheck(?:\/|$)/i,
  /^\/api\/v1\/contracts(?:\/|$)/i,
  /^\/api\/v1\/client-portal(?:\/|$)/i,
  /^\/api\/v1\/documents(?:\/|$)/i,
  /^\/api\/v1\/anonymous-documents(?:\/|$)/i,
  /^\/api\/v1\/clients\/[^/]+\/redaction-profile(?:\/|$)/i,
  /^\/api\/v1\/change-reports(?:\/|$)/i,
  /^\/api\/v1\/deadlines\/extract(?:\/|$)/i,
  /^\/api\/v1\/legal-analyses(?:\/|$)/i,
  /^\/api\/v1\/generation-drafts(?:\/|$)/i,
  /^\/api\/v1\/clause-library(?:\/|$)/i,
  /^\/api\/v1\/timesheet-reports(?:\/|$)/i,
  /^\/api\/v1\/matters(?:\/|$)/i,
  /^\/api\/v1\/time-entries(?:\/|$)/i,
  /^\/api\/v1\/automation(?:\/|$)/i,
  /^\/api\/v1\/workgroups(?:\/|$)/i,
  /^\/api\/v1\/clients\/[^/]+\/workgroups(?:\/|$)/i,
  /^\/api\/v1\/clients\/[^/]+\/workload-summary(?:\/|$)/i,
  /^\/api\/v1\/tasks\/auto-generate(?:\/|$)/i,
  /^\/api\/v1\/documents\/[^/]+\/classify(?:\/|$)/i,
  /^\/api\/v1\/documents\/[^/]+\/classification(?:\/|$)/i,
];

function normalizePath(pathName: string): string {
  if (pathName.startsWith('/api/v1/')) {
    return pathName;
  }
  return `/api/v1${pathName.startsWith('/') ? pathName : `/${pathName}`}`;
}

export function isQuarantinedPublicOpenApiPath(pathName: string): boolean {
  const normalized = normalizePath(pathName);
  return QUARANTINED_PUBLIC_PATH_PATTERNS.some((pattern) => pattern.test(normalized));
}

function cloneSpec(spec: OpenApiSpec): OpenApiSpec {
  return JSON.parse(JSON.stringify(spec || {}));
}

export function sanitizePublicOpenApiSpec(spec: OpenApiSpec): OpenApiSpec {
  const sanitized = cloneSpec(spec);
  const paths = sanitized.paths || {};
  const publicPaths: Record<string, any> = {};
  let removedPathCount = 0;

  for (const [pathName, pathSpec] of Object.entries(paths)) {
    if (isQuarantinedPublicOpenApiPath(pathName)) {
      removedPathCount += 1;
      continue;
    }
    publicPaths[pathName] = pathSpec;
  }

  sanitized.paths = publicPaths;
  sanitized.info = {
    ...(sanitized.info || {}),
    title: 'Adminiculum API (Public Metadata)',
    description:
      'Public API metadata sanitized to exclude quarantined, disabled, stale, internal, future, document/AI, Client Portal, contract generation, and runtime administration operations.',
  };
  sanitized['x-adminiculum-public-openapi'] = {
    sanitized: true,
    removedPathCount,
    productionApplyReadiness: 'blocked',
    cpSchema1Readiness: 'blocked',
    corsBoundaryResolved: false,
  };

  return sanitized;
}
