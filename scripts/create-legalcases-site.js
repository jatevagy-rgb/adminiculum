/**
 * Create LegalCases SharePoint site via Graph API
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

async function graphPost(accessToken, path, data) {
  return new Promise((resolve) => {
    const postData = JSON.stringify(data);
    
    const options = {
      hostname: 'graph.microsoft.com',
      port: 443,
      path: path,
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(postData)
      }
    };

    const req = https.request(options, (res) => {
      let body = '';
      res.on('data', chunk => body += chunk);
      res.on('end', () => {
        try {
          resolve(JSON.parse(body));
        } catch (e) {
          resolve({ error: e.message, raw: body });
        }
      });
    });

    req.on('error', (e) => resolve({ error: e.message }));
    req.write(postData);
    req.end();
  });
}

async function main() {
  console.log('🔐 Getting access token...\n');
  const accessToken = await getAccessToken();
  console.log('✅ Access token obtained\n');

  console.log('🏗️  Creating LegalCases site...\n');
  
  // Create a new SharePoint site
  const siteData = {
    displayName: "LegalCases",
    description: "Legal document management site for Adminiculum",
    webUrl: "https://balintfy.sharepoint.com/sites/LegalCases"
  };

  // Note: Creating sites requires Sites.ReadWrite.All permission
  // and may require additional permissions
  const result = await graphPost(accessToken, '/v1.0/sites/root/sites', siteData);
  
  if (result.error) {
    console.log('❌ Error creating site:', result.error);
    console.log('\n📝 You may need to create the site manually:');
    console.log('   1. Go to https://balintfy.sharepoint.com');
    console.log('   2. Click "+ Create site"');
    console.log('   3. Choose "Team site"');
    console.log('   4. Name it "LegalCases"');
    console.log('   5. After creation, run: node scripts/get-sharepoint-ids.js');
    return;
  }

  console.log('✅ Site created successfully!');
  console.log(`   ID: ${result.id}`);
  console.log(`   Name: ${result.displayName}`);
  console.log(`   URL: ${result.webUrl}`);
  
  console.log('\n📋 Add to .env:\n');
  console.log(`SP_SITE_ID=${result.id}`);
  console.log(`USE_LOCAL_FALLBACK=false`);
}

main().catch(console.error);
