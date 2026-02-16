/**
 * Check token scopes and permissions
 */

const https = require('https');
const jwt = require('jsonwebtoken');

const config = {
  tenantId: process.env.SP_TENANT_ID || '18b56834-dfea-4931-bdf8-e5ebb0cb4e0f',
  clientId: process.env.SP_CLIENT_ID || '82b50ec7-3e89-48aa-af74-4831e1c651cd',
  clientSecret: process.env.SP_CLIENT_SECRET || 'O2O8Q~J6VGpoXqQqRYn-lwuvVFWWv8DMpKdSXcSV'
};

async function getAccessToken() {
  return new Promise((resolve, reject) => {
    const postData = new URLSearchParams({
      client_id: config.clientId,
      client_secret: config.clientSecret,
      scope: 'https://graph.microsoft.com/.default',
      grant_type: 'client_credentials'
    }).toString();

    const options = {
      hostname: 'login.microsoftonline.com',
      port: 443,
      path: `/${config.tenantId}/oauth2/v2.0/token`,
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        'Content-Length': Buffer.byteLength(postData)
      }
    };

    const req = https.request(options, (res) => {
      let body = '';
      res.on('data', chunk => body += chunk);
      res.on('end', () => {
        try {
          const json = JSON.parse(body);
          resolve(json.access_token);
        } catch (e) {
          reject(e);
        }
      });
    });

    req.on('error', reject);
    req.write(postData);
    req.end();
  });
}

function decodeToken(token) {
  try {
    const decoded = jwt.decode(token);
    console.log('🔍 Token decoded:');
    console.log('   Issuer:', decoded.iss);
    console.log('   Audience:', decoded.aud);
    console.log('   Scopes:', decoded.scp || decoded.roles);
    return decoded;
  } catch (e) {
    console.error('Failed to decode token:', e.message);
    return null;
  }
}

async function checkApiPermissions(accessToken) {
  const tests = [
    { path: '/v1.0/sites/root', name: 'Sites Root' },
    { path: '/v1.0/me', name: 'User Info (delegated)' },
    { path: '/v1.0/drive/root', name: 'OneDrive Root' },
  ];

  console.log('\n🧪 Testing API endpoints:\n');

  for (const test of tests) {
    try {
      const result = await new Promise((resolve) => {
        const options = {
          hostname: 'graph.microsoft.com',
          port: 443,
          path: test.path,
          method: 'GET',
          headers: { 'Authorization': `Bearer ${accessToken}` }
        };

        const req = https.request(options, (res) => {
          let body = '';
          res.on('data', chunk => body += chunk);
          res.on('end', () => {
            resolve({ status: res.statusCode, body: body.substring(0, 200) });
          });
        });

        req.on('error', (e) => resolve({ error: e.message }));
        req.end();
      });

      if (result.error) {
        console.log(`❌ ${test.name}: ${result.error}`);
      } else if (result.status === 200) {
        console.log(`✅ ${test.name}: OK`);
      } else {
        console.log(`❌ ${test.name}: HTTP ${result.status} - ${result.body}`);
      }
    } catch (e) {
      console.log(`❌ ${test.name}: ${e.message}`);
    }
  }
}

async function main() {
  console.log('🔐 Getting access token...\n');
  const accessToken = await getAccessToken();
  console.log('✅ Token received\n');

  decodeToken(accessToken);
  await checkApiPermissions(accessToken);
}

main().catch(console.error);
