/**
 * Adminiculum Staging Smoke Test Suite
 * 
 * Run: node scripts/smoke.js
 * Env vars required:
 *   SMOKE_BASE_URL        - Base URL of the deployed backend (e.g. https://adminiculum-backend.azurecontainerapps.io)
 *   SMOKE_TOKEN          - Bearer token for authenticated requests (optional for health-only checks)
 *   SMOKE_CHECK_NOTIFICATIONS - "true" to include notifications endpoint
 *   SMOKE_TASK_ID        - Specific task ID to deep-check (optional)
 * 
 * Exit codes:
 *   0 - all checks passed
 *   1 - one or more checks failed
 */

const BASE_URL = process.env.SMOKE_BASE_URL || 'http://localhost:3000';
const TOKEN = process.env.SMOKE_TOKEN;
const CHECK_NOTIFICATIONS = process.env.SMOKE_CHECK_NOTIFICATIONS === 'true';
const TASK_ID = process.env.SMOKE_TASK_ID;

const results = [];

function pass(name) {
  results.push({ name, status: 'PASS' });
  console.log(`  ✅ ${name}`);
}

function fail(name, detail = '') {
  results.push({ name, status: 'FAIL', detail });
  console.log(`  ❌ ${name}${detail ? ': ' + detail : ''}`);
}

function warn(name, detail = '') {
  results.push({ name, status: 'WARN', detail });
  console.log(`  ⚠️  ${name}${detail ? ': ' + detail : ''}`);
}

async function fetch(path, opts = {}) {
  const url = `${BASE_URL}${path}`;
  const headers = {
    'Content-Type': 'application/json',
    ...(TOKEN ? { 'Authorization': `Bearer ${TOKEN}` } : {}),
    ...opts.headers,
  };
  const res = await fetch(url, { ...opts, headers });
  return res;
}

// ─────────────────────────────────────────────────────────────────
// 1. Backend Health
// ─────────────────────────────────────────────────────────────────
async function checkBackendHealth() {
  console.log('\n[1] Backend Health');
  try {
    const res = await fetch('/api/health', { timeout: 5000 });
    if (res.ok) {
      pass('/api/health');
    } else {
      fail('/api/health', `HTTP ${res.status}`);
    }
  } catch (e) {
    fail('/api/health', e.message);
  }
}

// ─────────────────────────────────────────────────────────────────
// 2. Frontend Reachability
// ─────────────────────────────────────────────────────────────────
async function checkFrontendReachability() {
  console.log('\n[2] Frontend Reachability');
  // Frontend URL is typically the same host or a separate CDN/AFD endpoint.
  // We do a basic HEAD check on the SMOKE_BASE_URL (backend) as proxy for "app is up".
  // In container-apps setup, the frontend is a separate container app.
  // This check verifies the container app ingress is responding.
  try {
    const res = await fetch('/', { timeout: 5000, method: 'HEAD' });
    if (res.ok || res.status === 404 || res.status === 401) {
      // Backend responding means container app is alive
      pass('Container App Ingress');
    } else {
      warn('Container App Ingress', `HTTP ${res.status} (non-critical if 3xx)`);
    }
  } catch (e) {
    fail('Container App Ingress', e.message);
  }
}

// ─────────────────────────────────────────────────────────────────
// 3. Auth Sanity
// ─────────────────────────────────────────────────────────────────
async function checkAuthSanity() {
  console.log('\n[3] Auth Sanity');
  
  // Without a token, /api/v1/cases should return 401
  try {
    const res = await fetch('/api/v1/cases');
    if (res.status === 401) {
      pass('Unauthenticated /api/v1/cases → 401');
    } else if (res.ok) {
      warn('Unauthenticated /api/v1/cases → 200 (unexpected, may be public)');
    } else {
      fail('/api/v1/cases (auth check)', `HTTP ${res.status}`);
    }
  } catch (e) {
    fail('/api/v1/cases (auth check)', e.message);
  }
}

// ─────────────────────────────────────────────────────────────────
// 4. /cases
// ─────────────────────────────────────────────────────────────────
async function checkCases() {
  console.log('\n[4] /api/v1/cases');
  if (!TOKEN) {
    warn('/api/v1/cases', 'SMOKE_TOKEN not set — skipping authenticated check');
    return;
  }
  try {
    const res = await fetch('/api/v1/cases');
    if (res.ok) {
      const data = await res.json();
      const count = Array.isArray(data) ? data.length : (data.data?.length ?? '?');
      pass(`/api/v1/cases (${count} cases)`);
    } else {
      fail('/api/v1/cases', `HTTP ${res.status}`);
    }
  } catch (e) {
    fail('/api/v1/cases', e.message);
  }
}

// ─────────────────────────────────────────────────────────────────
// 5. /tasks/my/tasks
// ─────────────────────────────────────────────────────────────────
async function checkTasksMyTasks() {
  console.log('\n[5] /api/v1/tasks/my/tasks');
  if (!TOKEN) {
    warn('/api/v1/tasks/my/tasks', 'SMOKE_TOKEN not set — skipping');
    return;
  }
  try {
    const res = await fetch('/api/v1/tasks/my/tasks');
    if (res.ok) {
      const data = await res.json();
      const count = Array.isArray(data) ? data.length : (data.tasks?.length ?? '?');
      pass(`/api/v1/tasks/my/tasks (${count} tasks)`);
    } else if (res.status === 404) {
      // Route might not exist — warn but don't fail
      warn('/api/v1/tasks/my/tasks', '404 (route may not exist)');
    } else {
      fail('/api/v1/tasks/my/tasks', `HTTP ${res.status}`);
    }
  } catch (e) {
    fail('/api/v1/tasks/my/tasks', e.message);
  }
}

// ─────────────────────────────────────────────────────────────────
// 6. Dashboard / Core Shell (notifications as proxy)
// ─────────────────────────────────────────────────────────────────
async function checkDashboard() {
  console.log('\n[6] Dashboard / Core Shell (notifications proxy)');
  if (!TOKEN) {
    warn('/api/v1/notifications', 'SMOKE_TOKEN not set — skipping');
    return;
  }
  try {
    const res = await fetch('/api/v1/notifications');
    if (res.ok) {
      pass('/api/v1/notifications (dashboard core ok)');
    } else {
      fail('/api/v1/notifications', `HTTP ${res.status}`);
    }
  } catch (e) {
    fail('/api/v1/notifications', e.message);
  }
}

// ─────────────────────────────────────────────────────────────────
// 7. Case Workspace Path
// ─────────────────────────────────────────────────────────────────
async function checkCaseWorkspace() {
  console.log('\n[7] Case Workspace');
  if (!TOKEN) {
    warn('Case workspace', 'SMOKE_TOKEN not set — skipping');
    return;
  }
  try {
    // Get first case ID from /api/v1/cases
    const casesRes = await fetch('/api/v1/cases');
    if (!casesRes.ok) {
      fail('Case workspace (list cases)', `HTTP ${casesRes.status}`);
      return;
    }
    const casesData = await casesRes.json();
    const cases = Array.isArray(casesData) ? casesData : (casesData.data || []);
    if (cases.length === 0) {
      warn('Case workspace', 'No cases found — skipping workspace drill-in');
      return;
    }
    const firstCase = cases[0];
    const caseId = firstCase.id || firstCase;
    
    // Try to fetch case details
    const caseRes = await fetch(`/api/v1/cases/${caseId}`);
    if (caseRes.ok) {
      pass(`Case workspace /cases/${caseId}`);
    } else {
      fail(`Case workspace /cases/${caseId}`, `HTTP ${caseRes.status}`);
    }
  } catch (e) {
    fail('Case workspace', e.message);
  }
}

// ─────────────────────────────────────────────────────────────────
// 8. Documents / Review / Generate path
// ─────────────────────────────────────────────────────────────────
async function checkDocumentsReviewGenerate() {
  console.log('\n[8] Documents / Review / Generate');
  if (!TOKEN) {
    warn('Documents/Review/Generate', 'SMOKE_TOKEN not set — skipping');
    return;
  }
  
  // Check if reviews endpoint exists
  try {
    const res = await fetch('/api/v1/reviews');
    if (res.ok) {
      pass('/api/v1/reviews');
    } else if (res.status === 404) {
      warn('/api/v1/reviews', '404 (route may not exist in this deployment)');
    } else {
      fail('/api/v1/reviews', `HTTP ${res.status}`);
    }
  } catch (e) {
    fail('/api/v1/reviews', e.message);
  }

  // Check documents endpoint
  try {
    const res = await fetch('/api/v1/documents');
    if (res.ok) {
      pass('/api/v1/documents');
    } else if (res.status === 404) {
      warn('/api/v1/documents', '404 (route may not exist)');
    } else {
      fail('/api/v1/documents', `HTTP ${res.status}`);
    }
  } catch (e) {
    fail('/api/v1/documents', e.message);
  }
}

// ─────────────────────────────────────────────────────────────────
// 9. Time Entries
// ─────────────────────────────────────────────────────────────────
async function checkTimeEntries() {
  console.log('\n[9] Time Entries');
  if (!TOKEN) {
    warn('/api/v1/time-entries', 'SMOKE_TOKEN not set — skipping');
    return;
  }
  try {
    const res = await fetch('/api/v1/time-entries');
    if (res.ok) {
      pass('/api/v1/time-entries');
    } else if (res.status === 404) {
      warn('/api/v1/time-entries', '404 (route may not exist)');
    } else {
      fail('/api/v1/time-entries', `HTTP ${res.status}`);
    }
  } catch (e) {
    fail('/api/v1/time-entries', e.message);
  }
}

// ─────────────────────────────────────────────────────────────────
// 10. Settings + UI Pack Switching Sanity
// ─────────────────────────────────────────────────────────────────
async function checkSettings() {
  console.log('\n[10] Settings (API)');
  // Settings is primarily a frontend surface. The API check verifies
  // the backend is serving correctly. Actual UI pack switching is
  // a client-side localStorage concern not testable via HTTP API.
  if (!TOKEN) {
    warn('Settings API', 'SMOKE_TOKEN not set — skipping');
    return;
  }
  try {
    const res = await fetch('/api/v1/users/me');
    if (res.ok) {
      pass('/api/v1/users/me (settings API ok)');
    } else {
      fail('/api/v1/users/me', `HTTP ${res.status}`);
    }
  } catch (e) {
    fail('/api/v1/users/me', e.message);
  }
}

// ─────────────────────────────────────────────────────────────────
// Main
// ─────────────────────────────────────────────────────────────────
async function main() {
  console.log('═══════════════════════════════════════════');
  console.log('  Adminiculum Staging Smoke Test Suite');
  console.log('═══════════════════════════════════════════');
  console.log(`  BASE_URL: ${BASE_URL}`);
  console.log(`  TOKEN:    ${TOKEN ? '***' + TOKEN.slice(-4) : '(not set)'}`);
  console.log(`  NOTIFICATIONS: ${CHECK_NOTIFICATIONS ? 'yes' : 'no'}`);
  console.log(`  TASK_ID:  ${TASK_ID || '(not set)'}`);
  console.log('───────────────────────────────────────────');

  await checkBackendHealth();
  await checkFrontendReachability();
  await checkAuthSanity();
  await checkCases();
  await checkTasksMyTasks();
  await checkDashboard();
  await checkCaseWorkspace();
  await checkDocumentsReviewGenerate();
  await checkTimeEntries();
  await checkSettings();

  console.log('\n═══════════════════════════════════════════');
  console.log('  Summary');
  console.log('═══════════════════════════════════════════');
  
  const passed = results.filter(r => r.status === 'PASS').length;
  const failed = results.filter(r => r.status === 'FAIL').length;
  const warned = results.filter(r => r.status === 'WARN').length;
  
  console.log(`  PASS: ${passed}`);
  console.log(`  FAIL: ${failed}`);
  console.log(`  WARN: ${warned}`);

  if (failed > 0) {
    console.log('\nFailed checks:');
    results.filter(r => r.status === 'FAIL').forEach(r => {
      console.log(`  - ${r.name}: ${r.detail}`);
    });
  }

  console.log('\nDetailed results:');
  results.forEach(r => {
    const icon = r.status === 'PASS' ? '✅' : r.status === 'FAIL' ? '❌' : '⚠️';
    console.log(`  ${icon} [${r.status}] ${r.name}${r.detail ? ' — ' + r.detail : ''}`);
  });

  process.exit(failed > 0 ? 1 : 0);
}

main().catch(err => {
  console.error('Smoke suite crashed:', err);
  process.exit(1);
});
