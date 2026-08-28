import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';

const require = createRequire(import.meta.url);
const SOURCE_MODULE = new URL('../src/modules/compliance/requirementRuleService.ts', import.meta.url);
const COMPILED_MODULE = new URL('../dist/modules/compliance/requirementRuleService.js', import.meta.url);

export function isHostedRuntime() {
  return Boolean(process.env.WEBSITE_SITE_NAME || process.env.AZURE_FUNCTIONS_ENVIRONMENT || process.env.K_SERVICE);
}

export function resolveRequirementRuleServiceUrl(hosted = false) {
  return hosted ? COMPILED_MODULE : SOURCE_MODULE;
}

function normalizeModule(moduleNamespace) {
  return moduleNamespace?.default && typeof moduleNamespace.default === 'object'
    ? moduleNamespace.default
    : moduleNamespace;
}

export async function loadRequirementRuleService({ hosted = false } = {}) {
  const moduleUrl = resolveRequirementRuleServiceUrl(hosted);
  if (hosted) {
    // The production TypeScript build is CommonJS; require it through the
    // current .mjs module boundary so plain Node never evaluates raw .ts.
    return normalizeModule(require(fileURLToPath(moduleUrl)));
  }
  return normalizeModule(await import(moduleUrl.href));
}
