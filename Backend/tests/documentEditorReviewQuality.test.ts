import {
  buildModeCReviewConfirmation,
  compareSavedSourcesLabel,
  DOCUMENT_COMMENT_DECISION,
  documentCommentUnavailableMessage,
  EDITOR_KEYBOARD_SHORTCUTS,
  editorLimitSummary,
  isNearTextLimit,
  MODE_C_REVIEW_WARNING,
  REVIEW_STATE_EXPORT_ONLY,
  shouldWarnBeforeReviewAction,
} from '../../Frontend/src/lib/editor/reviewQuality';
import { EDITOR_LIMITS } from '../../Frontend/src/lib/editor/editorModel';

describe('document editor review quality contract', () => {
  it('keeps comments document-level only with anchored comments unavailable', () => {
    expect(DOCUMENT_COMMENT_DECISION.branch).toBe('A');
    expect(DOCUMENT_COMMENT_DECISION.mutationSupport).toBe(true);
    expect(DOCUMENT_COMMENT_DECISION.anchoredComments).toBe(false);
    expect(documentCommentUnavailableMessage()).toContain('Dokumentumszintű megjegyzések');
    expect(documentCommentUnavailableMessage()).toContain('horgonyok nem támogatottak');
  });

  it('states the Mode C review boundary without claiming server persistence', () => {
    expect(REVIEW_STATE_EXPORT_ONLY).toEqual({
      persistenceMode: 'EXPORT_ONLY',
      serverSaved: false,
      reviewerCanAccessCurrentSession: false,
    });
    expect(MODE_C_REVIEW_WARNING).toContain('nincs az Adminiculum szerverére mentve');
    expect(MODE_C_REVIEW_WARNING).toContain('nem ehhez a helyi szerkesztési állapothoz');
    expect(MODE_C_REVIEW_WARNING).not.toMatch(/feltölt|automatikus|autosave/i);
  });

  it('requires review confirmation only for dirty local sessions', () => {
    expect(shouldWarnBeforeReviewAction(true)).toBe(true);
    expect(shouldWarnBeforeReviewAction(false)).toBe(false);
    expect(buildModeCReviewConfirmation(true)).toContain('mentetlen böngészős tartalom feltöltése nélkül');
  });

  it('uses truthful compare wording and documents keyboard coverage', () => {
    expect(compareSavedSourcesLabel()).toBe('Mentett források összehasonlítása');
    expect(compareSavedSourcesLabel()).not.toMatch(/track|változáskövetés|aktuális munkamenet/i);
    expect(EDITOR_KEYBOARD_SHORTCUTS.map((shortcut) => shortcut.keys)).toEqual(
      expect.arrayContaining(['Ctrl/Cmd+B', 'Ctrl/Cmd+I', 'Ctrl/Cmd+U', 'Ctrl/Cmd+F', 'Escape'])
    );
  });

  it('surfaces editor limits and near-limit thresholds', () => {
    expect(editorLimitSummary()).toContain(EDITOR_LIMITS.maxTotalTextLength.toLocaleString('hu-HU'));
    expect(isNearTextLimit(Math.floor(EDITOR_LIMITS.maxTotalTextLength * 0.8))).toBe(true);
    expect(isNearTextLimit(Math.floor(EDITOR_LIMITS.maxTotalTextLength * 0.5))).toBe(false);
  });
});
