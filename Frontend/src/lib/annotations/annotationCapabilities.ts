/**
 * Central renderer capability resolver for anchored document annotations.
 *
 * TRUTHFULNESS RULE: a capability is only reported as supported when the
 * production renderer genuinely provides it. Support is never inferred from a
 * file extension alone — it is derived from the renderer that will actually be
 * used to display the selected immutable DocumentVersion.
 *
 * Verified state of the current viewer (Slice 2):
 *   - TXT  : rendered as real text from the exact stored version → stable
 *            character offsets → TEXT_RANGE anchors are genuine.
 *   - PDF  : NOT rendered. The viewer shows a placeholder card. There is no
 *            page surface, no page count, no text layer.
 *   - DOCX : NOT rendered. Same placeholder card.
 *
 * Because no format currently renders real document pages, page geometry
 * (rectangle / ellipse / point) is NOT supported for any format. Drawing shapes
 * onto the placeholder card would normalize coordinates against a container that
 * has no relationship to the real document page — an anchor that points at
 * nothing. Such simulated anchors are deliberately disabled.
 */

export type AnnotationDocumentFormat = 'TXT' | 'PDF' | 'DOCX' | 'UNKNOWN';

export type AnnotationRendererCapabilities = {
  format: AnnotationDocumentFormat;
  /** The renderer displays the real historical version content. */
  canRender: boolean;
  canCreateTextRange: boolean;
  canCreatePageRectangle: boolean;
  canCreatePageEllipse: boolean;
  canCreatePagePoint: boolean;
  canNavigateToTextAnchor: boolean;
  canNavigateToPageAnchor: boolean;
  supportsZoomAlignedOverlays: boolean;
  /** Identifies the renderer that produced an anchor; stored on the annotation. */
  rendererVersion: string;
  /** User-facing reason shown when creation tools are unavailable. */
  explanation?: string;
};

/** Renderer identifiers persisted onto annotations as `rendererVersion`. */
export const TEXT_RENDERER_VERSION = 'txt-readonly-v1';
export const NO_RENDERER_VERSION = 'unrendered-v1';

const NO_CREATION = {
  canCreateTextRange: false,
  canCreatePageRectangle: false,
  canCreatePageEllipse: false,
  canCreatePagePoint: false,
} as const;

/**
 * Resolve the document format. MIME type is authoritative; the file extension is
 * only a fallback when the MIME type is missing or generic.
 */
export function resolveAnnotationFormat(input: {
  mimeType?: string | null;
  fileName?: string | null;
}): AnnotationDocumentFormat {
  const mime = (input.mimeType || '').toLowerCase().trim();
  if (mime === 'text/plain') return 'TXT';
  if (mime === 'application/pdf') return 'PDF';
  if (
    mime === 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' ||
    mime === 'application/msword'
  ) {
    return 'DOCX';
  }

  // Fallback only for missing/generic MIME types (e.g. application/octet-stream).
  if (!mime || mime === 'application/octet-stream') {
    const ext = (input.fileName || '').toLowerCase().split('.').pop() || '';
    if (ext === 'txt') return 'TXT';
    if (ext === 'pdf') return 'PDF';
    if (ext === 'doc' || ext === 'docx') return 'DOCX';
  }
  return 'UNKNOWN';
}

/**
 * The single source of truth for which annotation tools may be offered.
 *
 * `textRendered` reports whether the text of the exact selected version was
 * actually loaded — capability is denied if the renderer could not produce it,
 * so a failed text load never yields a fake TEXT_RANGE tool.
 */
export function resolveAnnotationCapabilities(input: {
  mimeType?: string | null;
  fileName?: string | null;
  textRendered?: boolean;
}): AnnotationRendererCapabilities {
  const format = resolveAnnotationFormat(input);

  if (format === 'TXT') {
    const rendered = input.textRendered !== false;
    return {
      format,
      canRender: rendered,
      ...NO_CREATION,
      canCreateTextRange: rendered,
      canNavigateToTextAnchor: rendered,
      canNavigateToPageAnchor: false,
      // No paginated surface exists for plain text, so there is nothing to zoom-align.
      supportsZoomAlignedOverlays: false,
      rendererVersion: rendered ? TEXT_RENDERER_VERSION : NO_RENDERER_VERSION,
      explanation: rendered
        ? undefined
        : 'A verzió szövege nem tölthető be, ezért most nem rögzíthető horgony.',
    };
  }

  if (format === 'PDF' || format === 'DOCX') {
    return {
      format,
      canRender: false,
      ...NO_CREATION,
      canNavigateToTextAnchor: false,
      canNavigateToPageAnchor: false,
      supportsZoomAlignedOverlays: false,
      rendererVersion: NO_RENDERER_VERSION,
      explanation:
        `A ${format} formátumhoz jelenleg nincs beépített dokumentum-megjelenítő, ezért nem hozható létre ` +
        'megbízható horgony. A meglévő annotációk olvashatók az oldalsávban, és a fájl változatlanul letölthető.',
    };
  }

  return {
    format: 'UNKNOWN',
    canRender: false,
    ...NO_CREATION,
    canNavigateToTextAnchor: false,
    canNavigateToPageAnchor: false,
    supportsZoomAlignedOverlays: false,
    rendererVersion: NO_RENDERER_VERSION,
    explanation: 'Ehhez a formátumhoz nem támogatott az annotáció létrehozása.',
  };
}

/** True when no annotation can be created for the current version. */
export function hasNoCreationCapability(caps: AnnotationRendererCapabilities): boolean {
  return (
    !caps.canCreateTextRange &&
    !caps.canCreatePageRectangle &&
    !caps.canCreatePageEllipse &&
    !caps.canCreatePagePoint
  );
}
