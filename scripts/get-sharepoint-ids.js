/**
 * SharePoint Site és Drive ID Lekérő Szkript
 * Futtatás: node scripts/get-sharepoint-ids.js
 * 
 * Használat:
 * 1. Állítsd be a SP_TENANT_ID, SP_CLIENT_ID, SP_CLIENT_SECRET értékeket
 * 2. Állítsd be a SITE_URL-t (pl. https://baltars.sharepoint.com/sites/LegalCases)
 * 3. Futtasd: node scripts/get-sharepoint-ids.js
 */

const https = require('https');

// ============================================
// KONFIGURÁCIÓ - Állítsd be ezeket az értékeket!
// ============================================
const CONFIG = {
  tenantId: '18b56834-dfea-4931-bdf8-e5ebb0cb4e0f',
  clientId: '82b50ec7-3e89-48aa-af74-4831e1c651cd',
  clientSecret: 'O2O8Q~J6VGpoXqQqRYn-lwuvVFWWv8DMpKdSXcSV',
  // A SharePoint site URL (domain + path)
  siteUrl: 'https://baltars.sharepoint.com/sites/LegalCases'
};

// ============================================
// OAuth Token Lekérése (Client Credentials Flow)
// ============================================
async function getAccessToken() {
  return new Promise((resolve, reject) => {
    const postData = new URLSearchParams({
      client_id: CONFIG.clientId,
      client_secret: CONFIG.clientSecret,
      scope: 'https://graph.microsoft.com/.default',
      grant_type: 'client_credentials'
    }).toString();

    const options = {
      hostname: 'login.microsoftonline.com',
      path: `/${CONFIG.tenantId}/oauth2/v2.0/token`,
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        'Content-Length': Buffer.byteLength(postData)
      }
    };

    const req = https.request(options, (res) => {
      let data = '';
      res.on('data', (chunk) => data += chunk);
      res.on('end', () => {
        try {
          const json = JSON.parse(data);
          if (json.access_token) {
            resolve(json.access_token);
          } else {
            reject(new Error(`Token error: ${JSON.stringify(json)}`));
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

// ============================================
// Graph API Hívás
// ============================================
async function graphGet(accessToken, endpoint) {
  return new Promise((resolve, reject) => {
    const options = {
      hostname: 'graph.microsoft.com',
      path: `/v1.0${endpoint}`,
      method: 'GET',
      headers: {
        'Authorization': `Bearer ${accessToken}`,
        'Content-Type': 'application/json'
      }
    };

    const req = https.request(options, (res) => {
      let data = '';
      res.on('data', (chunk) => data += chunk);
      res.on('end', () => {
        try {
          resolve(JSON.parse(data));
        } catch (e) {
          reject(e);
        }
      });
    });

    req.on('error', reject);
    req.end();
  });
}

// ============================================
// Site ID Lekérése URL-ből - Több módszer
// ============================================
async function getSiteId(accessToken, siteUrl) {
  // A site URL-ből kinyerjük a hostname és a path-ot
  const url = new URL(siteUrl);
  const hostname = url.hostname;
  const sitePath = url.pathname === '/' ? '' : url.pathname;
  
  console.log(`   Hostname: ${hostname}`);
  console.log(`   Path: ${sitePath}`);
  
  // Próbáljuk meg a search endpoint-ot
  console.log(`\n🔍 Próbálom a search endpoint-ot...`);
  try {
    const searchResult = await graphGet(accessToken, `/sites?search=${encodeURIComponent(sitePath.replace(/\//g, ''))}`);
    if (searchResult.value && searchResult.value.length > 0) {
      console.log(`   Search eredmények: ${searchResult.value.length}`);
      return {
        id: searchResult.value[0].id,
        name: searchResult.value[0].name,
        webUrl: searchResult.value[0].webUrl
      };
    }
  } catch (e) {
    console.log(`   Search hiba: ${e.message}`);
  }
  
  // Próbáljuk meg a root site-ot
  console.log(`\n🔍 Próbálom a root site endpoint-ot...`);
  try {
    const rootResult = await graphGet(accessToken, '/sites/root');
    console.log(`   Root site: ${rootResult.name}`);
    return {
      id: rootResult.id,
      name: rootResult.name,
      webUrl: rootResult.webUrl
    };
  } catch (e) {
    console.log(`   Root site hiba: ${e.message}`);
  }
  
  // Próbáljuk a hostname:path formátumot
  console.log(`\n🔍 Próbálom a hostname:path formátumot...`);
  try {
    // Távolítsuk el a leading slash-t a path-ból
    const cleanPath = sitePath.startsWith('/') ? sitePath.substring(1) : sitePath;
    const endpoint = cleanPath 
      ? `/sites/${hostname}:/${cleanPath}` 
      : `/sites/root`;
    console.log(`   Endpoint: ${endpoint}`);
    const result = await graphGet(accessToken, endpoint);
    return {
      id: result.id,
      name: result.name,
      webUrl: result.webUrl
    };
  } catch (e) {
    console.log(`   hostname:path hiba: ${e.message}`);
  }
  
  throw new Error('Nem sikerült megtalálni a SharePoint site-ot');
}

// ============================================
// Drive ID Lekérése Site ID-ből
// ============================================
async function getDriveId(accessToken, siteId) {
  console.log(`\n🔍 Drive ID lekérése a site-hoz: ${siteId}`);
  const result = await graphGet(accessToken, `/sites/${siteId}/drives`);
  
  // Általában az első drive a "Documents"
  const drive = result.value[0];
  
  return {
    id: drive.id,
    name: drive.name,
    webUrl: drive.webUrl,
    driveType: drive.driveType
  };
}

// ============================================
// FŐ FÜGGVÉNY
// ============================================
async function main() {
  console.log('='.repeat(60));
  console.log('📋 SharePoint Site és Drive ID Lekérő');
  console.log('='.repeat(60));
  console.log(`\n📍 Site URL: ${CONFIG.siteUrl}`);
  console.log(`🏢 Tenant ID: ${CONFIG.tenantId}`);
  console.log(`🔑 Client ID: ${CONFIG.clientId}`);
  
  try {
    // 1. Token lekérése
    console.log('\n📝 1. lépés: OAuth token lekérése...');
    const accessToken = await getAccessToken();
    console.log('✅ Token sikeresen lekérve!');
    
    // 2. Site ID lekérése
    console.log('\n📝 2. lépés: Site ID lekérése...');
    const site = await getSiteId(accessToken, CONFIG.siteUrl);
    console.log('✅ Site ID sikeresen lekérve!');
    console.log(`   Site ID: ${site.id}`);
    console.log(`   Site Name: ${site.name}`);
    console.log(`   Web URL: ${site.webUrl}`);
    
    // 3. Drive ID lekérése
    console.log('\n📝 3. lépés: Drive ID lekérése...');
    const drive = await getDriveId(accessToken, site.id);
    console.log('✅ Drive ID sikeresen lekérve!');
    console.log(`   Drive ID: ${drive.id}`);
    console.log(`   Drive Name: ${drive.name}`);
    console.log(`   Drive Type: ${drive.driveType}`);
    
    // Összefoglaló
    console.log('\n' + '='.repeat(60));
    console.log('📊 EREDMÉNYEK - Másold be ezeket a .env fájlba:');
    console.log('='.repeat(60));
    console.log(`\nSP_TENANT_ID="${CONFIG.tenantId}"`);
    console.log(`SP_CLIENT_ID="${CONFIG.clientId}"`);
    console.log(`SP_CLIENT_SECRET="${CONFIG.clientSecret}"`);
    console.log(`SP_SITE_ID="${site.id}"`);
    console.log(`SP_DRIVE_ID="${drive.id}"`);
    console.log(`SHAREPOINT_SITE_URL="${CONFIG.siteUrl}"`);
    console.log('\n');
    
  } catch (error) {
    console.error('\n❌ HIBA:', error.message);
    process.exit(1);
  }
}

main();
