import fs from 'node:fs/promises';

const baseUrl = String(process.env.ADMINICULUM_HOSTED_BASE_URL || '').replace(/\/+$/, '');
const token = process.env.ADMINICULUM_HOSTED_WORKFORCE_TOKEN;
const caseId = process.env.ADMINICULUM_HOSTED_CASE_ID;
const testFile = process.env.ADMINICULUM_HOSTED_TEST_FILE;

if (!baseUrl || !token || !caseId || !testFile) {
  console.error('Required: ADMINICULUM_HOSTED_BASE_URL, ADMINICULUM_HOSTED_WORKFORCE_TOKEN, ADMINICULUM_HOSTED_CASE_ID, ADMINICULUM_HOSTED_TEST_FILE');
  process.exit(2);
}

const fileName = testFile.split(/[\\/]/).pop() || 'Demo_Munkaszerzodes_minta.docx';
const fileContent = (await fs.readFile(testFile)).toString('base64');
const response = await fetch(`${baseUrl}/api/v1/documents`, {
  method: 'POST',
  headers: {
    Accept: 'application/json',
    Authorization: `Bearer ${token}`,
    'Content-Type': 'application/json',
  },
  body: JSON.stringify({
    caseId,
    fileName,
    fileContent,
    mimeType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    documentType: 'CLIENT_INPUT',
    folder: 'CLIENT_INPUT',
  }),
});

let payload = {};
try {
  payload = await response.json();
} catch {
  payload = {};
}

console.log('LIVE_UPLOAD_REQUEST=POST /api/v1/documents');
console.log(`LIVE_UPLOAD_STATUS=${response.status}`);
console.log(`LIVE_UPLOAD_SAFE_ERROR=${typeof payload.code === 'string' ? payload.code : 'NONE'}`);

if (!response.ok) {
  process.exit(1);
}

const documentId = typeof payload.id === 'string' ? payload.id : '';
console.log(`DOCUMENT_ID=${documentId || 'UNKNOWN'}`);

if (documentId) {
  const versionsResponse = await fetch(`${baseUrl}/api/v1/documents/${encodeURIComponent(documentId)}/versions`, {
    headers: { Accept: 'application/json', Authorization: `Bearer ${token}` },
  });
  let versionsPayload = [];
  try {
    versionsPayload = await versionsResponse.json();
  } catch {
    versionsPayload = [];
  }
  const versions = Array.isArray(versionsPayload)
    ? versionsPayload
    : Array.isArray(versionsPayload.versions)
      ? versionsPayload.versions
      : [];
  const firstVersionId = versions.find((version) => typeof version?.id === 'string')?.id || 'UNKNOWN';
  console.log(`DOCUMENT_VERSION_ID=${firstVersionId}`);
  console.log(`WORKSPACE_URL=${baseUrl.replace(/\/api\/v1$/, '')}/cases/${encodeURIComponent(caseId)}/documents?documentId=${encodeURIComponent(documentId)}`);
}
