/**
 * Runtime behavioural tests for the frontend annotation capability, geometry and
 * anchor modules. These import and EXECUTE the real frontend modules (they are
 * pure TypeScript with no DOM dependency) rather than string-matching source.
 */
import {
  resolveAnnotationFormat,
  resolveAnnotationCapabilities,
  hasNoCreationCapability,
  TEXT_RENDERER_VERSION,
  NO_RENDERER_VERSION,
} from '../../Frontend/src/lib/annotations/annotationCapabilities';
import {
  clamp01,
  toNormalizedPoint,
  toNormalizedRect,
  isValidNormalizedRect,
  isValidNormalizedPoint,
  isAllowedPageRotation,
  toOverlayStyle,
} from '../../Frontend/src/lib/annotations/annotationGeometry';
import {
  buildTextAnchor,
  normalizeSelectedText,
} from '../../Frontend/src/lib/annotations/annotationAnchors';

describe('format resolution prefers MIME over extension', () => {
  it('resolves by MIME type', () => {
    expect(resolveAnnotationFormat({ mimeType: 'text/plain' })).toBe('TXT');
    expect(resolveAnnotationFormat({ mimeType: 'application/pdf' })).toBe('PDF');
    expect(resolveAnnotationFormat({ mimeType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' })).toBe('DOCX');
  });

  it('does not let a misleading extension override a real MIME type', () => {
    expect(resolveAnnotationFormat({ mimeType: 'application/pdf', fileName: 'trap.txt' })).toBe('PDF');
  });

  it('falls back to extension only for generic/missing MIME', () => {
    expect(resolveAnnotationFormat({ mimeType: 'application/octet-stream', fileName: 'a.txt' })).toBe('TXT');
    expect(resolveAnnotationFormat({ fileName: 'a.pdf' })).toBe('PDF');
    expect(resolveAnnotationFormat({ mimeType: 'image/png', fileName: 'a.txt' })).toBe('UNKNOWN');
  });
});

describe('capability matrix is truthful about the current renderer', () => {
  it('TXT supports text range but never page geometry', () => {
    const caps = resolveAnnotationCapabilities({ mimeType: 'text/plain', textRendered: true });
    expect(caps.canRender).toBe(true);
    expect(caps.canCreateTextRange).toBe(true);
    expect(caps.canNavigateToTextAnchor).toBe(true);
    expect(caps.canCreatePageRectangle).toBe(false);
    expect(caps.canCreatePageEllipse).toBe(false);
    expect(caps.canCreatePagePoint).toBe(false);
    expect(caps.rendererVersion).toBe(TEXT_RENDERER_VERSION);
  });

  it('PDF offers NO creation tools because there is no real renderer', () => {
    const caps = resolveAnnotationCapabilities({ mimeType: 'application/pdf' });
    expect(caps.canRender).toBe(false);
    expect(hasNoCreationCapability(caps)).toBe(true);
    expect(caps.supportsZoomAlignedOverlays).toBe(false);
    expect(caps.rendererVersion).toBe(NO_RENDERER_VERSION);
    expect(caps.explanation).toMatch(/megjelenítő/i);
  });

  it('DOCX offers NO creation tools because there is no real renderer', () => {
    const caps = resolveAnnotationCapabilities({ mimeType: 'application/msword' });
    expect(caps.canRender).toBe(false);
    expect(hasNoCreationCapability(caps)).toBe(true);
    expect(caps.explanation).toBeTruthy();
  });

  it('denies text capability when the version text failed to render', () => {
    const caps = resolveAnnotationCapabilities({ mimeType: 'text/plain', textRendered: false });
    expect(caps.canCreateTextRange).toBe(false);
    expect(caps.canRender).toBe(false);
    expect(caps.explanation).toBeTruthy();
  });

  it('unknown formats expose no tools', () => {
    expect(hasNoCreationCapability(resolveAnnotationCapabilities({ mimeType: 'image/png' }))).toBe(true);
  });

  it('no format currently claims zoom-aligned overlays (no paginated renderer exists)', () => {
    for (const mime of ['text/plain', 'application/pdf', 'application/msword']) {
      expect(resolveAnnotationCapabilities({ mimeType: mime }).supportsZoomAlignedOverlays).toBe(false);
    }
  });
});

describe('geometry normalization', () => {
  const bounds = { left: 100, top: 50, width: 400, height: 200 };

  it('converts viewport pixels into normalized 0..1 coordinates', () => {
    expect(toNormalizedPoint(300, 150, bounds)).toEqual({ x: 0.5, y: 0.5 });
  });

  it('clamps positions outside the surface into range', () => {
    const p = toNormalizedPoint(-500, 99999, bounds);
    expect(p.x).toBe(0);
    expect(p.y).toBe(1);
    expect(isValidNormalizedPoint(p)).toBe(true);
  });

  it('builds an order-independent rect from two corners', () => {
    const a = toNormalizedRect({ x: 0.6, y: 0.6 }, { x: 0.2, y: 0.1 });
    expect(a.x).toBeCloseTo(0.2);
    expect(a.y).toBeCloseTo(0.1);
    expect(a.width).toBeCloseTo(0.4);
    expect(a.height).toBeCloseTo(0.5);
  });

  it('never lets a rect escape the page bounds', () => {
    const r = toNormalizedRect({ x: 0.9, y: 0.9 }, { x: 5, y: 5 });
    expect(r.x + r.width).toBeLessThanOrEqual(1);
    expect(r.y + r.height).toBeLessThanOrEqual(1);
  });

  it('rejects zero-area and degenerate shapes', () => {
    expect(isValidNormalizedRect({ x: 0.1, y: 0.1, width: 0, height: 0.2 })).toBe(false);
    expect(isValidNormalizedRect({ x: 0.1, y: 0.1, width: 0.2, height: 0 })).toBe(false);
    expect(isValidNormalizedRect({ x: 0.1, y: 0.1, width: 0.0001, height: 0.2 })).toBe(false);
  });

  it('rejects out-of-bounds and non-finite rects', () => {
    expect(isValidNormalizedRect({ x: 0.9, y: 0.1, width: 0.5, height: 0.2 })).toBe(false);
    expect(isValidNormalizedRect({ x: NaN, y: 0.1, width: 0.2, height: 0.2 })).toBe(false);
    expect(isValidNormalizedRect({ x: -0.1, y: 0.1, width: 0.2, height: 0.2 })).toBe(false);
  });

  it('accepts a valid rect', () => {
    expect(isValidNormalizedRect({ x: 0.1, y: 0.2, width: 0.3, height: 0.4 })).toBe(true);
  });

  it('renders overlays as percentages so they survive zoom and resize', () => {
    expect(toOverlayStyle({ x: 0.25, y: 0.5, width: 0.1, height: 0.2 }))
      .toEqual({ left: '25%', top: '50%', width: '10%', height: '20%' });
  });

  it('clamp01 handles non-finite input', () => {
    expect(clamp01(Number.NaN)).toBe(0);
    expect(clamp01(Infinity)).toBe(1);
  });

  it('allows only 0/90/180/270 rotations', () => {
    for (const r of [0, 90, 180, 270, null, undefined]) expect(isAllowedPageRotation(r as number)).toBe(true);
    for (const r of [1, 45, 360, -90]) expect(isAllowedPageRotation(r)).toBe(false);
  });
});

describe('text anchor construction', () => {
  const versionText = 'Az első bekezdés. A második bekezdés tartalma. A harmadik.';
  const rendererVersion = TEXT_RENDERER_VERSION;

  it('rejects an empty selection', () => {
    expect(buildTextAnchor({ rawSelection: '', versionText, rendererVersion }))
      .toMatchObject({ ok: false, reason: 'EMPTY_SELECTION' });
  });

  it('rejects a whitespace-only selection', () => {
    expect(buildTextAnchor({ rawSelection: '   \n\t ', versionText, rendererVersion }))
      .toMatchObject({ ok: false, reason: 'WHITESPACE_ONLY' });
  });

  it('rejects an oversized selection', () => {
    expect(buildTextAnchor({ rawSelection: 'x'.repeat(5000), versionText, rendererVersion }))
      .toMatchObject({ ok: false, reason: 'SELECTION_TOO_LONG' });
  });

  it('rejects a stale selection that is absent from the selected version', () => {
    expect(buildTextAnchor({ rawSelection: 'egy másik verzió szövege', versionText, rendererVersion }))
      .toMatchObject({ ok: false, reason: 'NOT_FOUND_IN_VERSION' });
  });

  it('rejects when no version text is rendered', () => {
    expect(buildTextAnchor({ rawSelection: 'valami', versionText: null, rendererVersion }))
      .toMatchObject({ ok: false, reason: 'NO_RENDERED_TEXT' });
  });

  it('builds a complete anchor with ordered offsets and bounded context', () => {
    const result = buildTextAnchor({ rawSelection: 'második bekezdés', versionText, rendererVersion });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const a = result.anchor;
    expect(a.anchorType).toBe('TEXT_RANGE');
    expect(a.selectedText).toBe('második bekezdés');
    expect(a.startOffset).toBeGreaterThanOrEqual(0);
    expect(a.endOffset).toBeGreaterThan(a.startOffset as number);
    expect(versionText.slice(a.startOffset as number, a.endOffset as number)).toBe('második bekezdés');
    expect(a.textPrefix.length).toBeLessThanOrEqual(500);
    expect(a.textSuffix.length).toBeLessThanOrEqual(500);
    expect(a.rendererVersion).toBe(TEXT_RENDERER_VERSION);
    expect(a.contentFingerprint).toContain('txt:');
  });

  it('normalizes selected text consistently with the server', () => {
    expect(normalizeSelectedText('  Az   ELSŐ\n bekezdés ')).toBe('az első bekezdés');
    expect(normalizeSelectedText(null)).toBe('');
  });
});
