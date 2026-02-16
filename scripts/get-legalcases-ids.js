/**
 * Get LegalCases Site and Drive IDs directly
 */

const https = require('https');
require('dotenv').config();

const config = {
  tenantId: process.env.SP_TENANT_ID,
  clientId: process.env.SP_CLIENT_ID,
  clientSecret: process.env.SP_CLIENT_SECRET
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
          if (json.error) reject(new Error(json.error_description));
          else resolve(json.access_token);
        } catch (e) { reject(e); }
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
        try { resolve(JSON.parse(body)); }
        catch (e) { resolve({ error: 'parse error', raw: body }); }
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

  // Get LegalCases site
  console.log('🔍 Getting LegalCases site...\n');
  const site = await graphGet(accessToken, '/v1.0/sites/balintfy.sharepoint.com:/sites/LegalCases');
  
  if (site.error) {
    console.log('❌ Error:', site.error);
    return;
  }

  console.log('✅ Site found!');
  console.log(`   Name: ${site.name || site.displayName}`);
  console.log(`   ID: ${site.id}`);
  console.log(`   URL: ${site.webUrl}\n`);

  // Get drives
  console.log('💾 Getting drives...\n');
  const drives = await graphGet(accessToken, `/v1.0/sites/${site.id}/drives`);
  
  if (drives.error) {
    console.log('❌ Error getting drives:', drives.error);
    console.log('Trying default drive...');
    const defaultDrive = await graphGet(accessToken, `/v1.0/sites/${site.id}/drive`);
    if (defaultDrive.id) {
      console.log(`✅ Default Drive ID: ${defaultDrive.id}\n`);
      console.log('📋 Add to .env:\n');
      console.log(`SP_SITE_ID=${site.id}`);
      console.log(`SP_DRIVE_ID=${defaultDrive.id}`);
      console.log(`USE_LOCAL_FALLBACK=false`);
    }
    return;
  }

  if (drives.value && drives.value.length > 0) {
    console.log(`✅ Found ${drives.value.length} drive(s):`);
    drives.value.forEach((d, i) => {
      console.log(`   ${i + 1}. ${d.name} (ID: ${d.id})`);
    });
    console.log('\n📋 Add to .env:\n');
    console.log(`SP_SITE_ID=${site.id}`);
    console.log(`SP_DRIVE_ID=${drives.value[0].id}`);
    console.log(`USE_LOCAL_FALLBACK=false`);
  } else {
    console.log('⚠️ No drives found. Trying default drive...');
    const defaultDrive = await graphGet(accessToken, `/v1.0/sites/${site.id}/drive`);
    if (defaultDrive.id) {
      console.log(`✅ Default Drive ID: ${defaultDrive.id}\n`);
      console.log('📋 Add to .env:\n');
      console.log(`SP_SITE_ID=${site.id}`);
      console.log(`SP_DRIVE_ID=${defaultDrive.id}`);
      console.log(`USE_LOCAL_FALLBACK=false`);
    }
  }
}

main().catch(console.error);
