/**
 * Client-publication document preview hardening (CLIENT-PUB-ACCEPTANCE-1, Phase 4/5).
 *
 * Root cause of the production SharePoint `400 invalidRequest`: the Contract
 * Workspace TXT-version preview downloads the version binary, and a version with
 * an invalid storage reference (a directly-seeded synthetic smoke document) makes
 * SharePoint answer 400. The catch logged the raw ApiError — leaking the provider
 * message to the console — instead of a controlled state. These guards lock the
 * controlled behaviour: a failed preview shows a truthful "unavailable" surface,
 * runs once per version (no retry loop), and never logs the provider error body.
 */
import fs from 'fs';
import path from 'path';

const repoRoot = path.join(__dirname, '..', '..');
const page = fs.readFileSync(path.join(repoRoot, 'Frontend/src/app/cases/[caseId]/documents/page.tsx'), 'utf8');

describe('TXT version preview failure is a controlled state, not a raw provider error', () => {
  it('no longer logs the raw preview error to the console', () => {
    expect(page).not.toContain("console.error('TXT version preview failed:', err)");
    // The preview effect's catch must not console.error the provider body at all.
    const effectStart = page.indexOf('downloadDocumentVersion(selectedVersionDocumentId, selectedVersionStableId)');
    const effect = page.slice(effectStart, effectStart + 900);
    expect(effect).not.toMatch(/console\.(error|log)\(/);
  });

  it('sets a controlled unavailable state and renders a truthful surface', () => {
    expect(page).toContain('const [versionTextUnavailable, setVersionTextUnavailable]');
    expect(page).toContain('setVersionTextUnavailable(true)');
    // Reset before each attempt so it never sticks across version switches.
    expect(page).toContain('setVersionTextUnavailable(false)');
    expect(page).toContain('data-testid="version-preview-unavailable"');
    expect(page).toContain('Az előnézet jelenleg nem érhető el');
  });

  it('does not leak a storage identifier or provider body in the unavailable UI', () => {
    const i = page.indexOf('version-preview-unavailable');
    const block = page.slice(i, i + 600);
    expect(block).not.toMatch(/sharepoint|storageReference|spItemId|invalidRequest|Graph/i);
  });

  it('runs once per version (deps are version-scoped) — no retry loop', () => {
    expect(page).toContain('}, [selectedVersionDocumentId, selectedVersionStableId, canRenderTextVersion]);');
  });
});
