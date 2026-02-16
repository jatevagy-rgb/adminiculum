/**
 * Get SharePoint Site and Drive IDs - Try different URL formats
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

async function tryGetSite(accessToken, path) {
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
          const json = JSON.parse(body);
          if (json.id) {
            resolve({ success: true, data: json });
          } else {
            resolve({ success: false, error: json.error?.message || 'Unknown error' });
          }
        } catch (e) {
          resolve({ success: false, error: e.message });
        }
      });
    });

    req.on('error', (e) => resolve({ success: false, error: e.message }));
    req.end();
  });
}

async function main() {
  console.log('🔐 Getting access token...\n');
  const accessToken = await getAccessToken();
  console.log('✅ Access token obtained\n');

  console.log('🔍 Trying different URL formats...\n');

  // Different ways to reference the site
  // Note: The actual tenant hostname is balintfy.sharepoint.com (discovered from root site)
  const sitePaths = [
    '/v1.0/sites/balintfy.sharepoint.com:/sites/LegalCases',
    '/v1.0/sites/18b56834-dfea-4931-bdf8-e5ebb0cb4e0f:/sites/LegalCases',
    '/v1.0/sites/balintfy.sharepoint.com',
    '/v1.0/sites/root',
    '/v1.0/sites/root:/sites/LegalCases'
  ];

  for (const path of sitePaths) {
    const result = await tryGetSite(accessToken, path);
    if (result.success) {
      console.log(`✅ FOUND: ${path}`);
      console.log(`   ID: ${result.data.id}`);
      console.log(`   Name: ${result.data.name || result.data.displayName}`);
      console.log(`   WebUrl: ${result.data.webUrl}\n`);

      // Now get the drive ID
      if (result.data.id) {
        console.log('💾 Getting drives...');
        const driveResult = await tryGetSite(accessToken, `/v1.0/sites/${result.data.id}/drives`);
        if (driveResult.success && driveResult.data.value?.length > 0) {
          console.log(`✅ Drive ID: ${driveResult.data.value[0].id}`);
          console.log(`   Drive Name: ${driveResult.data.value[0].name}\n`);

          console.log('📋 Add to .env:\n');
          console.log(`SP_SITE_ID=${result.data.id}`);
          console.log(`SP_DRIVE_ID=${driveResult.data.value[0].id}`);
          console.log(`USE_LOCAL_FALLBACK=false`);
          console.log('\n✅ Done! Update your .env file with these values.');
          process.exit(0);
        } else if (driveResult.success) {
          // Try getting the default drive directly
          console.log('   Trying default drive...');
          const defaultDrive = await tryGetSite(accessToken, `/v1.0/sites/${result.data.id}/drive`);
          if (defaultDrive.success && defaultDrive.data.id) {
            console.log(`✅ Drive ID: ${defaultDrive.data.id}`);
            console.log(`   Drive Name: ${defaultDrive.data.name}\n`);

            console.log('📋 Add to .env:\n');
            console.log(`SP_SITE_ID=${result.data.id}`);
            console.log(`SP_DRIVE_ID=${defaultDrive.data.id}`);
            console.log(`USE_LOCAL_FALLBACK=false`);
            console.log('\n✅ Done! Update your .env file with these values.');
            process.exit(0);
          }
        }
      }
    } else {
      console.log(`❌ ${path}: ${result.error}`);
    }
  }

  console.log('\n⚠️  Could not find the site automatically.');
  console.log('📝 Please get the Site ID and Drive ID from Azure Portal:');
  console.log('   1. Go to https://yourtenant.sharepoint.com/sites/LegalCases');
  console.log('   2. Copy the URL');
  console.log('   3. Use Graph Explorer: https://developer.microsoft.com/graph/graph-explorer');
}

main().catch(console.error);
