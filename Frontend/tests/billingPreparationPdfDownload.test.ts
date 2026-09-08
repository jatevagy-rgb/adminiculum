import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const workspace = readFileSync('src/app/clients/[clientId]/szamlazas/[preparationId]/BillingReviewWorkspace.tsx', 'utf8');
const api = readFileSync('src/lib/billingPreparationsApi.ts', 'utf8');
const binaryApi = readFileSync('src/lib/api.ts', 'utf8');

test('PDF download is a CLOSED-only action using the selected preparation endpoint and Blob download', () => {
  assert.match(workspace, /!open && <>[\s\S]*PDF letöltése[\s\S]*Újranyitás/);
  assert.match(workspace, /open && <>[\s\S]*Előkészítés lezárása/);
  assert.match(workspace, /downloadBillingPreparationPdf\(preparationId\)/);
  assert.match(api, /fetchApiBlob\(`\$\{base\}\/\$\{encodeURIComponent\(preparationId\)\}\/pdf`\)/);
  assert.match(workspace, /URL\.createObjectURL\(blob\)/);
  assert.match(workspace, /link\.download = filename \|\| 'szamlazasi-osszesito\.pdf'/);
  assert.match(workspace, /URL\.revokeObjectURL\(url\)/);
  assert.match(binaryApi, /Authorization: `Bearer \$\{token\}`/);
});

test('download handling does not change billing state or add frontend money arithmetic', () => {
  const download = workspace.slice(workspace.indexOf('async function downloadPdf'), workspace.indexOf('\n  if (loading)'));
  assert.doesNotMatch(download, /setBillingPreparationStatus|toggleStatus|patchBillingItem|refreshBillingPreparation/);
  for (const source of [workspace, api, binaryApi]) {
    assert.doesNotMatch(source, /netAmount\s*[+*\/-]|Number\(.*netAmount|parseFloat\(.*netAmount|includedNetAmount\s*[+*\/-]/);
  }
});
