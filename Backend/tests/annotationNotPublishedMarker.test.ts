/**
 * Regression: CLIENT_EXPLANATION_DRAFT must carry a PERSISTENT "Nem publikált"
 * state marker.
 *
 * The original implementation communicated this only through a textarea
 * placeholder, which disappears the moment the reviewer types — leaving no
 * indication that the draft is unpublished. Nothing in this slice publishes
 * anything, and CLIENT_CANDIDATE visibility is not publication, so the marker
 * must be visible wherever a client-explanation draft is shown.
 */
import fs from 'fs';
import path from 'path';

const repoRoot = path.join(__dirname, '..', '..');
const read = (rel: string) => fs.readFileSync(path.join(repoRoot, rel), 'utf8');

const badge = read('Frontend/src/components/documents/annotations/NotPublishedBadge.tsx');
const page = read('Frontend/src/app/cases/[caseId]/documents/page.tsx');

describe('NotPublishedBadge component', () => {
  it('renders the exact required label', () => {
    expect(badge).toContain('Nem publikált');
    expect(badge).toContain('NOT_PUBLISHED_LABEL');
  });

  it('is identifiable for acceptance and carries an explanatory title', () => {
    expect(badge).toContain('data-testid="annotation-not-published"');
    expect(badge).toMatch(/title=/);
  });

  it('exposes a predicate keyed on the annotation type', () => {
    expect(badge).toContain('export function isClientExplanationDraft');
    expect(badge).toContain('CLIENT_EXPLANATION_DRAFT');
  });

  it('offers no publish affordance (marker only, never an action)', () => {
    // The prose comment may discuss publication; what must not exist is a control.
    expect(badge).not.toMatch(/<button/);
    expect(badge).not.toMatch(/onClick/);
    expect(badge).not.toMatch(/publishAnnotation|publishToClient|Publikálás/);
  });
});

describe('the marker is wired into every client-explanation surface', () => {
  it('is imported by the documents workspace', () => {
    expect(page).toContain('NotPublishedBadge');
    expect(page).toContain('isClientExplanationDraft');
  });

  it('renders in the annotation list card, the detail panel and the draft editor', () => {
    const occurrences = (page.match(/<NotPublishedBadge/g) || []).length;
    expect(occurrences).toBeGreaterThanOrEqual(3);
  });

  it('is gated on the client-explanation-draft type, not shown for every annotation', () => {
    expect(page).toContain('isClientExplanationDraft(annotation.annotationType)');
    expect(page).toContain('isClientExplanationDraft(selectedAnnotation.annotationType)');
  });

  it('no longer relies on a disappearing placeholder to convey the state', () => {
    expect(page).not.toContain('Ügyfélmagyarázat-tervezet, nem publikált');
  });

  it('still exposes no publish control anywhere in the workspace', () => {
    expect(page).not.toMatch(/Publikálás|publishAnnotation|publishToClient/);
  });
});

/**
 * Regression: found during authenticated production acceptance. Switching V1 -> V2
 * kept the previously selected V1 annotation id, so the comments effect re-fired
 * against the NEW version with the OLD annotation id. The API correctly answered
 * 404 (version scoping held), but the client logged an error for a request that
 * should never have been made.
 */
describe('annotation selection does not survive a version switch', () => {
  it('clears the selected annotation and its comments whenever the version changes', () => {
    const effectStart = page.indexOf('const refreshAnnotations');
    const marker = page.indexOf('}, [selectedUploadedDocument?.id, selectedVersion?.id, refreshAnnotations]);', effectStart);
    expect(marker).toBeGreaterThan(-1);
    const effect = page.slice(page.lastIndexOf('useEffect(', marker), marker);
    // The reset must happen unconditionally, not only in the "no document" branch.
    expect(effect).toContain('setSelectedAnnotationId(null)');
    expect(effect).toContain('setAnnotationComments([])');
    const guardIndex = effect.indexOf('if (selectedUploadedDocument?.id && selectedVersion?.id)');
    expect(effect.indexOf('setSelectedAnnotationId(null)')).toBeLessThan(guardIndex);
  });

  it('never requests comments for an annotation outside the selected version', () => {
    // Clearing state in a sibling effect is not enough: both effects run in the
    // same commit, so the comment fetch must itself be gated on the annotation
    // being present in the version-scoped list.
    const i = page.indexOf('getDocumentAnnotationComments(');
    const effect = page.slice(page.lastIndexOf('useEffect(', i), i);
    expect(effect).toContain('annotations.some((annotation) => annotation.id === selectedAnnotationId)');
    expect(effect).toContain('selectionBelongsToVersion');
    // and the guard must react to the annotation list changing
    const deps = page.slice(i, i + 900);
    expect(deps).toContain('selectedAnnotationId, annotations]');
  });
});
