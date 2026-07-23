/**
 * Text anchor construction for anchored annotations.
 *
 * IMPORTANT / HONEST LIMITATION: anchors are renderer-derived. The offsets are
 * computed against the text the client rendered for the exact selected
 * DocumentVersion. The server does NOT re-verify the selected text against the
 * stored file content, so an anchor is evidence of what the reviewer saw in this
 * renderer — it is not a server-verified position within the source document.
 * `rendererVersion` and `contentFingerprint` are stored so a future slice can
 * detect that an anchor was produced by a different renderer.
 */

export const MAX_SELECTED_TEXT = 4000;
export const MAX_CONTEXT = 500;
const CONTEXT_WINDOW = 120;

export type TextAnchorDraft = {
  anchorType: 'TEXT_RANGE';
  selectedText: string;
  textPrefix: string;
  textSuffix: string;
  startOffset: number | null;
  endOffset: number | null;
  rendererVersion: string;
  contentFingerprint?: string;
};

/** Whitespace-collapsing normalization, matching the server's normalizedSelectedText. */
export function normalizeSelectedText(value: string | null | undefined): string {
  if (!value) return '';
  return value.replace(/\s+/g, ' ').trim().toLowerCase();
}

/**
 * A stable, cheap fingerprint of the rendered version content. Deliberately not a
 * cryptographic digest and never the document body itself — it only needs to
 * change when the rendered content changes.
 */
export function buildContentFingerprint(versionText: string | null | undefined): string | undefined {
  if (!versionText) return undefined;
  return `txt:${versionText.length}:${versionText.slice(0, 24)}`;
}

export type TextAnchorRejection =
  | 'EMPTY_SELECTION'
  | 'WHITESPACE_ONLY'
  | 'SELECTION_TOO_LONG'
  | 'NO_RENDERED_TEXT'
  | 'NOT_FOUND_IN_VERSION';

export type TextAnchorResult =
  | { ok: true; anchor: TextAnchorDraft }
  | { ok: false; reason: TextAnchorRejection };

/**
 * Build a text anchor from a raw browser selection.
 *
 * Offsets are only reported when the selection can be located unambiguously in
 * the rendered version text; otherwise they are null and the anchor degrades to
 * a text-match anchor rather than asserting a false position.
 */
export function buildTextAnchor(params: {
  rawSelection: string | null | undefined;
  versionText: string | null | undefined;
  rendererVersion: string;
}): TextAnchorResult {
  const { rawSelection, versionText, rendererVersion } = params;

  if (rawSelection === null || rawSelection === undefined || rawSelection === '') {
    return { ok: false, reason: 'EMPTY_SELECTION' };
  }
  const selectedText = rawSelection.trim();
  if (!selectedText) return { ok: false, reason: 'WHITESPACE_ONLY' };
  if (selectedText.length > MAX_SELECTED_TEXT) return { ok: false, reason: 'SELECTION_TOO_LONG' };
  if (!versionText) return { ok: false, reason: 'NO_RENDERED_TEXT' };

  const startOffset = versionText.indexOf(selectedText);
  if (startOffset < 0) {
    // The selection is not present in the text of the selected version — e.g. a
    // stale selection kept across a version switch. Refuse rather than anchor it.
    return { ok: false, reason: 'NOT_FOUND_IN_VERSION' };
  }
  const endOffset = startOffset + selectedText.length;

  return {
    ok: true,
    anchor: {
      anchorType: 'TEXT_RANGE',
      selectedText,
      textPrefix: versionText.slice(Math.max(0, startOffset - CONTEXT_WINDOW), startOffset).slice(-MAX_CONTEXT),
      textSuffix: versionText.slice(endOffset, Math.min(versionText.length, endOffset + CONTEXT_WINDOW)).slice(0, MAX_CONTEXT),
      startOffset,
      endOffset,
      rendererVersion,
      contentFingerprint: buildContentFingerprint(versionText),
    },
  };
}

export const TEXT_ANCHOR_REJECTION_MESSAGES: Record<TextAnchorRejection, string> = {
  EMPTY_SELECTION: 'Nincs kijelölt szöveg.',
  WHITESPACE_ONLY: 'A kijelölés csak szóközt tartalmaz.',
  SELECTION_TOO_LONG: 'A kijelölt szöveg túl hosszú.',
  NO_RENDERED_TEXT: 'A verzió szövege nem érhető el.',
  NOT_FOUND_IN_VERSION: 'A kijelölés nem található a kiválasztott verzióban.',
};
