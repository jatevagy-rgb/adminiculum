const fs = require('fs');
const https = require('https');
const yaml = require('js-yaml');

const host = process.env.VERIFY_HOST || 'adminiculumaustriaeast-01.azurewebsites.net';
const runtimeSpecPath = '/api/v1/openapi.json';
const outputPath = process.argv[2] || 'powerapps-swagger2-canonical-runtime-live.yaml';

const allowPrefixes = [
  '/api/v1/auth',
  '/api/v1/users',
  '/api/v1/cases',
  '/api/v1/clients',
  '/api/v1/tasks',
  '/api/v1/documents',
  '/api/v1/change-reports',
  '/api/v1/deadlines',
  '/api/v1/classification',
  '/api/v1/automation',
];

function requestJson(path) {
  return new Promise((resolve, reject) => {
    const req = https.request(
      {
        host,
        path,
        method: 'GET',
      },
      (res) => {
        let data = '';
        res.on('data', (chunk) => {
          data += chunk.toString();
        });
        res.on('end', () => {
          try {
            if ((res.statusCode || 0) < 200 || (res.statusCode || 0) >= 300) {
              reject(new Error(`Runtime OpenAPI fetch failed: HTTP ${res.statusCode} ${data.slice(0, 200)}`));
              return;
            }
            resolve(JSON.parse(data));
          } catch (err) {
            reject(err);
          }
        });
      },
    );

    req.on('error', reject);
    req.end();
  });
}

function toSwagger2(openapi3) {
  const servers = Array.isArray(openapi3.servers) ? openapi3.servers : [];
  const serverUrl = String(servers[0]?.url || `https://${host}/api/v1`);

  let hostValue = host;
  let basePath = '/';
  let schemes = ['https'];

  try {
    const u = new URL(serverUrl);
    hostValue = u.host || host;
    basePath = u.pathname || '/';
    schemes = [u.protocol.replace(':', '') || 'https'];
  } catch {
    // keep defaults
  }

  const out = {
    swagger: '2.0',
    info: {
      title: `${openapi3.info?.title || 'Adminiculum API'} (Runtime Live Canonical)`,
      version: String(openapi3.info?.version || '1.0'),
      description:
        'Power Apps canonical Swagger regenerated from live runtime OpenAPI and filtered to runtime-aligned UI route set.',
    },
    host: hostValue,
    basePath,
    schemes,
    consumes: ['application/json'],
    produces: ['application/json'],
    securityDefinitions: {
      bearerAuth: {
        type: 'apiKey',
        in: 'header',
        name: 'Authorization',
        description: 'Bearer {token}',
      },
    },
    security: [{ bearerAuth: [] }],
    paths: {},
  };

  const paths = openapi3.paths || {};
  for (const pathKey of Object.keys(paths)) {
    const fullPath = `${basePath === '/' ? '' : basePath}${pathKey}`.replace(/\/\/+/, '/');
    const shouldKeep = allowPrefixes.some((prefix) => fullPath.startsWith(prefix));
    if (!shouldKeep) continue;

    out.paths[fullPath] = {};
    for (const method of Object.keys(paths[pathKey])) {
      const op = paths[pathKey][method] || {};
      const opId = op.operationId || `${method}_${fullPath}`.replace(/[^a-zA-Z0-9_]/g, '_');
      out.paths[fullPath][method] = {
        summary: op.summary || opId,
        description: op.description || '',
        operationId: opId,
        consumes: ['application/json'],
        produces: ['application/json'],
        parameters: [],
        responses: {
          '200': {
            description: 'Success',
            schema: { type: 'object', additionalProperties: true },
          },
        },
      };
    }
    if (Object.keys(out.paths[fullPath]).length === 0) {
      delete out.paths[fullPath];
    }
  }

  return out;
}

async function main() {
  const runtimeOpenApi = await requestJson(runtimeSpecPath);
  const swagger2 = toSwagger2(runtimeOpenApi);
  fs.writeFileSync(outputPath, yaml.dump(swagger2, { lineWidth: -1, noRefs: false }), 'utf8');
  console.log(`Wrote ${outputPath} with ${Object.keys(swagger2.paths || {}).length} paths from runtime.`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});

