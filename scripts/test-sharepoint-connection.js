/**
 * Test SharePoint connection
 */

const https = require('https');

// Load environment variables from .env
require('dotenv').config();

const config = {
  tenantId: process.env.SP_TENANT_ID,
  clientId: process.env.SP_CLIENT_ID,
  clientSecret: process.env.SP_CLIENT_SECRET,
  siteId: process.env.SP_SITE_ID,
  driveId: process.env.SP_DRIVE_ID
};

console.log('📋 Configuration:');
console.log(`   Tenant ID: ${config.tenantId?.substring(0, 8)}...`);
console.log(`   Client ID: ${config.clientId?.substring(0, 8)}...`);
console.log(`   Site ID: ${config.siteId?.substring(0, 30)}...`);
console.log(`   Drive ID: ${config.driveId?.substring(0, 30)}...`);
console.log('');

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
          if (json.error) {
            reject(new Error(json.error_description || json.error));
          } else {
            resolve(json.access_token);
          }
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
          resolve({ status: res.statusCode, data: JSON.parse(body) });
        } catch (e) {
          resolve({ status: res.statusCode, data: body });
        }
      });
    });

    req.on('error', (e) => resolve({ error: e.message }));
    req.end();
  });
}

async function main() {
  try {
    // Step 1: Get access token
    console.log('🔐 Step 1: Getting access token...');
    const accessToken = await getAccessToken();
    console.log('✅ Access token obtained!\n');

    // Step 2: Test site access
    console.log('🔍 Step 2: Testing site access...');
    const siteResult = await graphGet(accessToken, `/v1.0/sites/${config.siteId}`);
    
    if (siteResult.data.error) {
      console.log('❌ Site access failed:', siteResult.data.error.message);
      return;
    }
    
    console.log('✅ Site accessible!');
    console.log(`   Name: ${siteResult.data.name || siteResult.data.displayName}`);
    console.log(`   URL: ${siteResult.data.webUrl}\n`);

    // Step 3: Test drive access
    console.log('💾 Step 3: Testing drive access...');
    const driveResult = await graphGet(accessToken, `/v1.0/sites/${config.siteId}/drives/${config.driveId}`);
    
    if (driveResult.data.error) {
      console.log('❌ Drive access failed:', driveResult.data.error.message);
      return;
    }
    
    console.log('✅ Drive accessible!');
    console.log(`   Name: ${driveResult.data.name}`);
    console.log(`   Type: ${driveResult.data.driveType}`);
    console.log(`   Created: ${driveResult.data.createdDateTime}\n`);

    // Step 4: List root folder
    console.log('📁 Step 4: Listing root folder...');
    const rootResult = await graphGet(accessToken, `/v1.0/sites/${config.siteId}/drives/${config.driveId}/root/children`);
    
    if (rootResult.data.error) {
      console.log('❌ Root folder access failed:', rootResult.data.error.message);
      return;
    }
    
    const items = rootResult.data.value || [];
    console.log(`✅ Found ${items.length} items in root folder:`);
    items.slice(0, 5).forEach(item => {
      console.log(`   - ${item.name} (${item.folder ? 'folder' : 'file'})`);
    });
    if (items.length > 5) {
      console.log(`   ... and ${items.length - 5} more`);
    }

    console.log('\n🎉 SharePoint connection test PASSED!');
    console.log('\n📝 Next steps:');
    console.log('   1. Create LegalCases site in SharePoint');
    console.log('   2. Update SP_SITE_ID and SP_DRIVE_ID in .env');
    console.log('   3. Restart the backend server');

  } catch (error) {
    console.log('❌ Error:', error.message);
  }
}

main();
