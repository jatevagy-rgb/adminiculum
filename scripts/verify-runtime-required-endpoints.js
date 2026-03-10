const https = require('https');

const HOST = process.env.VERIFY_HOST || 'adminiculumaustriaeast-01.azurewebsites.net';

const checks = [
  { method: 'GET', path: '/api/v1/auth/me' },
  { method: 'GET', path: '/api/v1/cases' },
  { method: 'GET', path: '/api/v1/clients' },
  { method: 'GET', path: '/api/v1/tasks' },
  { method: 'POST', path: '/api/v1/automation/events', body: {} },
  { method: 'POST', path: '/api/v1/documents', body: {} },
];

function request({ method, path, body }) {
  return new Promise((resolve) => {
    const bodyText = body ? JSON.stringify(body) : null;

    const req = https.request(
      {
        host: HOST,
        path,
        method,
        headers: bodyText
          ? {
              'Content-Type': 'application/json',
              'Content-Length': Buffer.byteLength(bodyText),
            }
          : {},
      },
      (res) => {
        let data = '';
        res.on('data', (chunk) => {
          data += chunk.toString();
        });
        res.on('end', () => {
          resolve({
            status: res.statusCode || 0,
            body: data.slice(0, 300),
          });
        });
      },
    );

    req.on('error', (err) => {
      resolve({ status: 0, body: String(err && err.message ? err.message : err) });
    });

    if (bodyText) req.write(bodyText);
    req.end();
  });
}

async function main() {
  let router404 = 0;

  for (const check of checks) {
    // eslint-disable-next-line no-await-in-loop
    const result = await request(check);
    const endpointNotFound =
      result.status === 404 && /Endpoint not found/i.test(result.body || '');

    if (endpointNotFound) router404 += 1;

    console.log(
      `${check.method} ${check.path} -> ${result.status}${
        endpointNotFound ? ' [ROUTER_404]' : ''
      } :: ${result.body}`,
    );
  }

  if (router404 > 0) {
    console.error(`Failed: ${router404} required endpoint(s) returned router-level 404.`);
    process.exit(1);
  }

  console.log('Success: required endpoint set is mounted (no router-level 404).');
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});

