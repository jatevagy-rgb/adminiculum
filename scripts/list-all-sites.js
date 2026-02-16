/**
 * List all SharePoint sites in the tenant
 */

const https = require('https');

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

async function graphGet(accessToken, path) {
  return new Promise((resolve) => {
    const options = {
      hostname: 'graph.microsoft.com',
      port: 443,
      path: path,
      method: 'GET',
      headers: { 'Authorization': `Bearer ${accessToken}` }
    };

    const req = https.request(options, (res) => {
      let body = '';
      res.on('data', chunk => body += chunk);
      res.on('end', () => {
        try {
          resolve(JSON.parse(body));
        } catch (e) {
          resolve({ error: e.message });
        }
      });
    });

    req.on('error', (e) => resolve({ error: e.message }));
    req.end();
  });
}

async function main() {
  console.log('🔐 Getting access token...\n');
  const accessToken = await getAccessToken();
  console.log('✅ Access token obtained\n');

  console.log('📋 Listing all sites in the tenant...\n');
  
  const result = await graphGet(accessToken, '/v1.0/sites?search=*');
  
  if (result.error) {
    console.log('❌ Error:', result.error);
    return;
  }

  if (result.value && result.value.length > 0) {
    console.log(`Found ${result.value.length} sites:\n`);
    
    result.value.forEach((site, index) => {
      console.log(`${index + 1}. ${site.name || site.displayName}`);
      console.log(`   ID: ${site.id}`);
      console.log(`   URL: ${site.webUrl}`);
      console.log('');
    });

    // Get drives for each site
    console.log('💾 Getting drives for each site...\n');
    
    for (const site of result.value) {
      const drives = await graphGet(accessToken, `/v1.0/sites/${site.id}/drives`);
      if (drives.value && drives.value.length > 0) {
        console.log(`📁 ${site.name || site.displayName}:`);
        drives.value.forEach(drive => {
          console.log(`   - ${drive.name} (ID: ${drive.id})`);
        });
        console.log('');
      }
    }
  } else {
    console.log('No sites found.');
  }
}

main().catch(console.error);
