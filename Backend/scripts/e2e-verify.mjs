/**
 * E2E Runtime Verification Script
 * 
 * Tests the core case → document → anonymization → rehydration flow
 * against the live backend API.
 * 
 * Usage:
 *   cd Backend
 *   node ../scripts/e2e-verify.mjs
 * 
 * Pre-requisites:
 *   - Backend running on port 3001
 *   - Azure AD auth configured
 *   - Test tenant with at least one active user
 */

const BASE_URL = 'http://localhost:3001/api/v1';

// ---- Auth token storage ----
let authToken = null;
let authHeaders = {};

// ---- Utility ----
function log(step, status, detail = '') {
  const icon = status === 'PASS' ? '✅' : status === 'FAIL' ? '❌' : '⏳';
  console.log(`${icon} [${step}] ${status}${detail ? ': ' + detail : ''}`);
}

async function request(method, path, body = null, headers = {}) {
  const opts = {
    method,
    headers: {
      'Content-Type': 'application/json',
      ...authHeaders,
      ...headers,
    },
  };
  if (body) opts.body = JSON.stringify(body);
  
  const res = await fetch(`${BASE_URL}${path}`, opts);
  const text = await res.text();
  let json;
  try { json = JSON.parse(text); } catch { json = text; }
  
  return { status: res.status, ok: res.ok, data: json, headers: res.headers };
}

// ---- Step A1: Login / Get Token ----
async function stepA1_Login() {
  // Try to get token via the auth endpoint
  // Note: Full Azure AD flow requires browser redirect.
  // This script tests the API paths assuming a valid token is available.
  // For now, attempt a lightweight auth probe:
  const res = await request('GET', '/auth/me');
  if (res.status === 401) {
    // Auth required — attempt device flow or use env token
    authToken = process.env.API_TOKEN || null;
    if (authToken) {
      authHeaders['Authorization'] = `Bearer ${authToken}`;
      const meRes = await request('GET', '/auth/me');
      if (meRes.ok) {
        log('A1', 'PASS', `Authenticated as ${meRes.data?.user?.email || meRes.data?.email || 'user'}`);
        return true;
      }
    }
    log('A1', 'FAIL', 'Azure AD auth required — set API_TOKEN env var or authenticate via browser first');
    log('A1', 'INFO', 'To get a token: open http://localhost:3001 in browser, login, copy token from network tab');
    return false;
  }
  if (res.ok) {
    authHeaders['Authorization'] = authHeaders['Authorization'] || '';
    log('A1', 'PASS', `Already authenticated`);
    return true;
  }
  log('A1', 'FAIL', `Auth probe returned ${res.status}`);
  return false;
}

// ---- Step A2: Get or Create a Case ----
async function stepA2_GetCase() {
  // List cases
  const listRes = await request('GET', '/cases?page=1&limit=10');
  if (!listRes.ok) {
    log('A2', 'FAIL', `List cases failed: ${listRes.status} ${JSON.stringify(listRes.data)}`);
    return null;
  }
  
  const cases = listRes.data?.data || [];
  if (cases.length === 0) {
    log('A2', 'FAIL', 'No cases found — create a case in the UI first');
    return null;
  }
  
  const testCase = cases[0];
  log('A2', 'PASS', `Found case: ${testCase.caseNumber} / ${testCase.id}`);
  
  // Verify using CUID (not caseNumber) for case-specific endpoints
  const byCuidRes = await request('GET', `/cases/${testCase.id}`);
  if (!byCuidRes.ok) {
    log('A2', 'FAIL', `getCaseById with CUID failed: ${byCuidRes.status}`);
    return null;
  }
  log('A2', 'PASS', `getCaseById(CUID) returned 200`);
  
  return testCase;
}

// ---- Step A3: Upload Document ----
async function stepA3_UploadDocument(caseId) {
  // Create a minimal test DOCX (ZIP with minimal content)
  // Or use a text file
  const testContent = 'This is a test client contract. Party A: John Doe. Party B: Acme Corp.';
  const base64 = Buffer.from(testContent).toString('base64');
  
  const uploadRes = await request('POST', '/documents/upload', {
    caseId,
    fileName: 'test-contract-upload.txt',
    fileContentBase64: base64,
    mimeType: 'text/plain',
    documentType: 'CLIENT_INPUT',
    folder: 'CLIENT_INPUT',
  });
  
  if (!uploadRes.ok) {
    log('A3', 'FAIL', `Upload failed: ${uploadRes.status} ${JSON.stringify(uploadRes.data)}`);
    return null;
  }
  
  const doc = uploadRes.data;
  log('A3', 'PASS', `Uploaded document: ${doc.id} — ${doc.fileName || 'unnamed'}`);
  
  if (doc.spWebUrl) {
    log('A3', 'PASS', `SharePoint URL: ${doc.spWebUrl}`);
  } else {
    log('A3', 'WARN', 'No SharePoint URL — upload was local only');
  }
  
  return doc.id;
}

// ---- Step A4: Verify Document in Case ----
async function stepA4_VerifyDocument(caseId, docId) {
  const docsRes = await request('GET', `/cases/${caseId}/documents`);
  if (!docsRes.ok) {
    log('A4', 'FAIL', `Get documents failed: ${docsRes.status}`);
    return false;
  }
  
  const docs = docsRes.data || [];
  const found = docs.find(d => d.id === docId);
  if (!found) {
    log('A4', 'FAIL', `Document ${docId} not found in case ${caseId}. Found: ${docs.map(d => d.id).join(', ')}`);
    return false;
  }
  
  log('A4', 'PASS', `Document verified in case: ${found.fileName || found.id}`);
  return true;
}

// ---- Step A5: Anonymize Document ----
async function stepA5_AnonymizeDocument(docId, caseId) {
  const anonRes = await request('POST', `/documents/${docId}/anonymize`, {
    caseId,
  });
  
  if (!anonRes.ok) {
    log('A5', 'FAIL', `Anonymize failed: ${anonRes.status} ${JSON.stringify(anonRes.data)}`);
    return null;
  }
  
  const result = anonRes.data;
  if (!result.anonymizedDocumentId) {
    log('A5', 'FAIL', `No anonymizedDocumentId in response: ${JSON.stringify(result)}`);
    return null;
  }
  
  if (!result.redactedItems || result.redactedItems.length === 0) {
    log('A5', 'WARN', `No PII found (redactedItems empty). Text may be too short or no entities detected.`);
  } else {
    log('A5', 'PASS', `Anonymized: ${result.redactedItems.length} items found`);
  }
  
  log('A5', 'PASS', `Anonymous doc: ${result.anonymizedDocumentId}`);
  
  // Return the anonymized document ID and the token map
  return {
    anonDocId: result.anonymizedDocumentId,
    anonDocName: result.name,
    redactedItems: result.redactedItems || [],
    tokenMap: result.tokenMap || {},
  };
}

// ---- Step A6: Verify Anonymous Doc in Case ----
async function stepA6_VerifyAnonymousDoc(caseId, anonDocId) {
  const anonRes = await request('GET', `/anonymous-documents?caseId=${caseId}`);
  if (!anonRes.ok) {
    log('A6', 'FAIL', `Get anonymous documents failed: ${anonRes.status}`);
    return false;
  }
  
  const docs = anonRes.data || [];
  const found = docs.find(d => d.id === anonDocId);
  if (!found) {
    log('A6', 'FAIL', `Anonymous doc ${anonDocId} not found`);
    return false;
  }
  
  log('A6', 'PASS', `Anonymous doc verified: ${found.name} — status: ${found.rehydrationStatus}`);
  return true;
}

// ---- Step A7: Simulate Rehydration (mock AI response) ----
async function stepA7_Rehydrate(anonDocId, redactedItems, tokenMap) {
  // Build a mock AI response: replace each [TOKEN_N] with original value
  // The backend's rehydration replaces tokens in the AI output
  // We need to simulate what the external AI would return
  
  if (redactedItems.length === 0) {
    log('A7', 'WARN', 'No tokens to rehydrate — using empty AI output');
  }
  
  // Construct AI output: replace tokens with their placeholders (simulating AI keeping placeholders)
  const aiOutput = redactedItems
    .map(item => `[${item.placeholder}]`)
    .join(' ');
  
  // Also try with some actual text
  const mockAiOutput = `Based on the provided document, the following entities were identified: ${aiOutput || 'No entities found in this document.'}`;
  
  const rehRes = await request('POST', `/anonymous-documents/${anonDocId}/import-ai-response`, {
    aiResponseText: mockAiOutput,
  });
  
  if (!rehRes.ok) {
    log('A7', 'FAIL', `Rehydration failed: ${rehRes.status} ${JSON.stringify(rehRes.data)}`);
    return null;
  }
  
  const rehResult = rehRes.data;
  if (!rehResult.rehydratedContent) {
    log('A7', 'FAIL', `No rehydratedContent in response`);
    return null;
  }
  
  log('A7', 'PASS', `Rehydration complete — resolved: ${rehResult.resolvedTokens}/${rehResult.totalTokens}`);
  
  // Check if rehydration actually worked
  if (redactedItems.length > 0) {
    const hasReplacements = rehResult.resolvedTokens > 0;
    if (hasReplacements) {
      log('A7', 'PASS', 'Tokens were replaced with real values');
    } else {
      log('A7', 'WARN', 'No substitutions made — token format may not match');
    }
  }
  
  return rehResult;
}

// ---- Step A8: Save Rehydrated Document ----
async function stepA8_SaveRehydrated(anonDocId) {
  const saveRes = await request('POST', `/anonymous-documents/${anonDocId}/save-as-document`);
  
  if (!saveRes.ok) {
    log('A8', 'FAIL', `Save failed: ${saveRes.status} ${JSON.stringify(saveRes.data)}`);
    return null;
  }
  
  const saved = saveRes.data;
  if (!saved.documentId) {
    log('A8', 'FAIL', `No documentId in save response`);
    return null;
  }
  
  log('A8', 'PASS', `Saved as document: ${saved.documentId} — ${saved.fileName || ''}`);
  return saved.documentId;
}

// ---- Step A9: Verify Saved Document ----
async function stepA9_VerifySavedDoc(caseId, savedDocId) {
  const docsRes = await request('GET', `/cases/${caseId}/documents`);
  if (!docsRes.ok) {
    log('A9', 'FAIL', `Get documents failed: ${docsRes.status}`);
    return false;
  }
  
  const docs = docsRes.data || [];
  const found = docs.find(d => d.id === savedDocId);
  if (!found) {
    log('A9', 'FAIL', `Saved document ${savedDocId} not found in case`);
    return false;
  }
  
  log('A9', 'PASS', `Saved document verified: ${found.fileName || found.id} — ${found.documentType || 'unknown type'}`);
  
  // Also check anonymous doc status updated
  const anonRes = await request('GET', `/anonymous-documents?caseId=${caseId}`);
  if (anonRes.ok) {
    const anonDoc = (anonRes.data || []).find(d => d.id === savedDocId || d.id === found.linkedAnonymousDocumentId);
    if (anonDoc && anonDoc.rehydrationStatus) {
      log('A9', 'PASS', `Rehydration status: ${anonDoc.rehydrationStatus}`);
    }
  }
  
  return true;
}

// ---- Secondary Flow B: Generate Contract ----
async function stepB1_ListTemplates() {
  const tplRes = await request('GET', '/templates');
  if (!tplRes.ok) {
    log('B1', 'FAIL', `List templates failed: ${tplRes.status}`);
    return null;
  }
  
  const templates = tplRes.data?.templates || tplRes.data || [];
  if (templates.length === 0) {
    log('B1', 'FAIL', 'No templates found');
    return null;
  }
  
  log('B1', 'PASS', `Found ${templates.length} template(s): ${templates.map(t => t.name || t.id).join(', ')}`);
  return templates[0];
}

async function stepB2_GenerateContract(caseId, templateId) {
  const genRes = await request('POST', '/contracts/generate', {
    caseId,
    templateId,
    title: `Test Contract - ${new Date().toISOString()}`,
    variableValues: {},
  });
  
  if (!genRes.ok) {
    log('B2', 'FAIL', `Generate failed: ${genRes.status} ${JSON.stringify(genRes.data)}`);
    return null;
  }
  
  const contract = genRes.data?.contract || genRes.data;
  if (!contract?.id) {
    log('B2', 'FAIL', `No contract.id in response: ${JSON.stringify(genRes.data)}`);
    return null;
  }
  
  log('B2', 'PASS', `Generated contract: ${contract.id} — ${contract.fileName || contract.title || 'untitled'}`);
  return contract.id;
}

// ---- Main Runner ----
async function main() {
  console.log('='.repeat(60));
  console.log('E2E VERIFICATION — Adminiculum Legal Workflow');
  console.log('='.repeat(60));
  console.log('');

  // A1: Auth
  const authed = await stepA1_Login();
  if (!authed) {
    log('E2E', 'FAIL', 'Cannot proceed without auth — start backend and authenticate in browser first');
    process.exit(1);
  }

  // A2: Get case
  const testCase = await stepA2_GetCase();
  if (!testCase) {
    log('E2E', 'FAIL', 'Cannot proceed without a case — create one in the UI first');
    process.exit(1);
  }
  const caseId = testCase.id;

  // A3: Upload document
  const docId = await stepA3_UploadDocument(caseId);
  if (!docId) {
    log('E2E', 'FAIL', 'Upload step failed — cannot continue flow');
    process.exit(1);
  }

  // A4: Verify document
  await stepA4_VerifyDocument(caseId, docId);

  // A5: Anonymize
  const anonResult = await stepA5_AnonymizeDocument(docId, caseId);
  if (!anonResult) {
    log('E2E', 'FAIL', 'Anonymize step failed — cannot continue flow');
    process.exit(1);
  }

  // A6: Verify anonymous doc
  await stepA6_VerifyAnonymousDoc(caseId, anonResult.anonDocId);

  // A7: Rehydrate (mock AI response)
  const rehResult = await stepA7_Rehydrate(anonResult.anonDocId, anonResult.redactedItems, anonResult.tokenMap);
  if (!rehResult) {
    log('E2E', 'FAIL', 'Rehydration step failed');
    process.exit(1);
  }

  // A8: Save rehydrated
  const savedDocId = await stepA8_SaveRehydrated(anonResult.anonDocId);
  if (!savedDocId) {
    log('E2E', 'FAIL', 'Save step failed');
    process.exit(1);
  }

  // A9: Verify saved
  await stepA9_VerifySavedDoc(caseId, savedDocId);

  // Secondary Flow B
  console.log('');
  console.log('-'.repeat(40));
  console.log('SECONDARY FLOW: Generate Contract');
  console.log('-'.repeat(40));
  
  const template = await stepB1_ListTemplates();
  if (template) {
    await stepB2_GenerateContract(caseId, template.id);
  }

  console.log('');
  console.log('='.repeat(60));
  log('E2E', 'COMPLETE', 'See results above');
  console.log('='.repeat(60));
}

main().catch(err => {
  console.error('Script error:', err);
  process.exit(1);
});
