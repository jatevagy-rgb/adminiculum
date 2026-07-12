import fs from 'fs';
import path from 'path';

const repoRoot = path.resolve(process.cwd(), '..');
const backendPortalRoot = path.join(repoRoot, 'Backend', 'src', 'modules', 'client-portal');
const frontendPortalRoot = path.join(repoRoot, 'Frontend', 'src', 'app', 'portal');

function readFile(relativePath: string): string {
  return fs.readFileSync(path.join(repoRoot, relativePath), 'utf8');
}

function stripComments(source: string): string {
  return source
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/(^|[^:])\/\/.*$/gm, '$1');
}

function walkFiles(directory: string): string[] {
  return fs.readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const fullPath = path.join(directory, entry.name);
    if (entry.isDirectory()) return walkFiles(fullPath);
    return [fullPath];
  });
}

function expectNotToContainAny(source: string, forbidden: string[]): void {
  for (const marker of forbidden) {
    expect(source).not.toContain(marker);
  }
}

function expectNotToMatchAny(source: string, forbidden: RegExp[]): void {
  for (const pattern of forbidden) {
    expect(source).not.toMatch(pattern);
  }
}

const prismaAccessMarkers = ['PrismaClient', '@prisma/client', 'prisma.'];
const internalModuleImportPatterns = [
  /from\s+['"][^'"]*\/modules\/cases/i,
  /from\s+['"][^'"]*\/modules\/documents/i,
  /from\s+['"][^'"]*\/modules\/tasks/i,
  /from\s+['"][^'"]*\/modules\/communications/i,
];

describe('client portal inert shell static guards', () => {
  it('keeps backend routes auth-first, gate-first, and unwired from portal internals', () => {
    const routes = readFile('Backend/src/modules/client-portal/routes.ts');

    expect(routes).toContain('authenticate');
    expect(routes).toContain('requireClientPortalRuntimeReady');
    expect(routes).toContain('CLIENT_PORTAL_NOT_ENABLED');
    expectNotToMatchAny(routes, [
      /from\s+['"]\.\/authorization['"]/,
      /from\s+['"]\.\/services['"]/,
      /from\s+['"]\.\/mappers['"]/,
    ]);
    expectNotToContainAny(routes, [...prismaAccessMarkers, 'workspaceText']);
  });

  it('keeps authz stubs fail-closed and isolated from services, mappers, routes, Prisma, and internal modules', () => {
    const authorization = readFile('Backend/src/modules/client-portal/authorization.ts');
    const executableAuthorization = stripComments(authorization);

    expect(authorization).toContain('CLIENT_PORTAL_PRINCIPAL_NOT_READY');
    expect(authorization).toContain('CLIENT_PORTAL_ACCESS_DENIED');
    expectNotToContainAny(executableAuthorization, [...prismaAccessMarkers, 'workspaceText']);
    expectNotToMatchAny(executableAuthorization, [
      /from\s+['"]\.\/services['"]/,
      /from\s+['"]\.\/mappers['"]/,
      /from\s+['"]\.\/routes['"]/,
      ...internalModuleImportPatterns,
    ]);
  });

  it('keeps service stubs fail-closed and isolated from authz, mappers, routes, Prisma, and internal modules', () => {
    const services = readFile('Backend/src/modules/client-portal/services.ts');
    const executableServices = stripComments(services);

    expect(services).toContain('CLIENT_PORTAL_SERVICE_NOT_IMPLEMENTED');
    expectNotToContainAny(executableServices, [...prismaAccessMarkers, 'workspaceText']);
    expectNotToMatchAny(executableServices, [
      /from\s+['"]\.\/authorization['"]/,
      /from\s+['"]\.\/mappers['"]/,
      /from\s+['"]\.\/routes['"]/,
      ...internalModuleImportPatterns,
    ]);
  });

  it('keeps mapper functions pure, allow-list based, and detached from Prisma/internal modules', () => {
    const mappers = readFile('Backend/src/modules/client-portal/mappers.ts');
    const executableMappers = stripComments(mappers);

    expectNotToContainAny(executableMappers, [...prismaAccessMarkers, 'workspaceText']);
    expectNotToMatchAny(executableMappers, internalModuleImportPatterns);
    expect(executableMappers).not.toMatch(/\.\.\.\s*source/);
  });

  it('keeps portal module files free of workspace text references in executable code', () => {
    const portalModuleFiles = ['routes.ts', 'authorization.ts', 'services.ts', 'mappers.ts', 'types.ts'];

    for (const fileName of portalModuleFiles) {
      const source = stripComments(fs.readFileSync(path.join(backendPortalRoot, fileName), 'utf8'));
      expect(source).not.toContain('workspaceText');
    }
  });

  it('keeps frontend portal static, synthetic, API-free, and upload/form-free', () => {
    const portalFiles = walkFiles(frontendPortalRoot).filter((filePath) =>
      /\.(ts|tsx)$/.test(filePath)
    );
    expect(portalFiles.length).toBeGreaterThan(0);

    const combinedPortalSource = portalFiles
      .map((filePath) => fs.readFileSync(filePath, 'utf8'))
      .join('\n');

    expect(combinedPortalSource).toContain('mockPortalData');
    expect(combinedPortalSource).toContain('PortalMockShell');
    expectNotToContainAny(combinedPortalSource, [
      'fetch(',
      '@/lib/api',
      'workspaceText',
      'type="file"',
      '<form',
      'form action',
      'Dashboard',
      'CaseDetail',
      'Litigation',
      'Workload',
      'Review',
      'Compare',
      'Anonymize',
    ]);
  });
});
