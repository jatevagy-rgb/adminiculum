/**
 * Pure workbench layout-state tests — DOCUMENT-EDITOR-WORKBENCH-UX-LAYOUT-OVERHAUL-1.
 *
 * The layout module is framework-free and holds no persistence: outline rail,
 * side panel, focus mode and zoom are session-memory state with deterministic
 * responsive defaults.
 */

import {
  A4_PAGE_WIDTH_PX,
  computeEffectiveZoom,
  defaultWorkbenchLayout,
  EDITOR_ZOOM_OPTIONS,
  enterFocusMode,
  exitFocusMode,
  FIT_WIDTH_SENTINEL,
  OUTLINE_DEFAULT_MIN_VIEWPORT,
  SIDE_PANEL_DEFAULT_MIN_VIEWPORT,
  SIDE_PANEL_MAX_WIDTH_PX,
  SIDE_PANEL_MIN_WIDTH_PX,
  SIDE_PANEL_WIDTH_PX,
  toggleFocusMode,
  toggleOutline,
  toggleSidePanel,
} from '../../Frontend/src/lib/editor/workbenchLayout';

describe('responsive workbench defaults', () => {
  it('1920/1440: outline and side panel open', () => {
    for (const width of [1920, 1440]) {
      const layout = defaultWorkbenchLayout(width);
      expect(layout).toMatchObject({ outlineOpen: true, sidePanelOpen: true, focusMode: false });
    }
  });

  it('1366/1280: outline defaults collapsed, side panel open', () => {
    for (const width of [1366, 1280]) {
      const layout = defaultWorkbenchLayout(width);
      expect(layout).toMatchObject({ outlineOpen: false, sidePanelOpen: true, focusMode: false });
    }
  });

  it('below 1280: both support rails default collapsed (document stays usable)', () => {
    const layout = defaultWorkbenchLayout(1100);
    expect(layout).toMatchObject({ outlineOpen: false, sidePanelOpen: false, focusMode: false });
  });

  it('breakpoints are the documented ones', () => {
    expect(OUTLINE_DEFAULT_MIN_VIEWPORT).toBe(1440);
    expect(SIDE_PANEL_DEFAULT_MIN_VIEWPORT).toBe(1280);
  });
});

describe('rail toggles', () => {
  it('toggle flips and remembers restore state', () => {
    let layout = defaultWorkbenchLayout(1920);
    layout = toggleOutline(layout);
    expect(layout.outlineOpen).toBe(false);
    layout = toggleSidePanel(layout);
    expect(layout.sidePanelOpen).toBe(false);
    layout = toggleOutline(layout);
    expect(layout.outlineOpen).toBe(true);
  });

  it('toggles are pure (input state untouched)', () => {
    const original = defaultWorkbenchLayout(1920);
    const snapshot = { ...original };
    toggleOutline(original);
    toggleSidePanel(original);
    enterFocusMode(original);
    expect(original).toEqual(snapshot);
  });
});

describe('focus mode', () => {
  it('hides both rails and restores the previous arrangement on exit', () => {
    let layout = defaultWorkbenchLayout(1920);
    layout = toggleSidePanel(layout); // user closed the side panel
    layout = enterFocusMode(layout);
    expect(layout).toMatchObject({ focusMode: true, outlineOpen: false, sidePanelOpen: false });

    layout = exitFocusMode(layout);
    expect(layout).toMatchObject({ focusMode: false, outlineOpen: true, sidePanelOpen: false });
  });

  it('toggleFocusMode round-trips deterministically', () => {
    const initial = defaultWorkbenchLayout(1440);
    const roundTripped = toggleFocusMode(toggleFocusMode(initial));
    expect(roundTripped).toEqual(initial);
  });

  it('opening a rail from focus mode leaves focus mode', () => {
    let layout = enterFocusMode(defaultWorkbenchLayout(1920));
    layout = toggleOutline(layout);
    expect(layout.focusMode).toBe(false);
    expect(layout.outlineOpen).toBe(true);
    expect(layout.sidePanelOpen).toBe(true); // restored
  });

  it('enter/exit are idempotent', () => {
    const layout = defaultWorkbenchLayout(1920);
    expect(exitFocusMode(layout)).toEqual(layout);
    const focused = enterFocusMode(layout);
    expect(enterFocusMode(focused)).toEqual(focused);
  });
});

describe('zoom', () => {
  it('fixed zoom levels pass through unchanged (chrome never zooms)', () => {
    for (const value of [0.75, 0.9, 1, 1.1]) {
      expect(computeEffectiveZoom({ zoom: value, fitWidth: false, containerWidth: 1200 })).toBe(value);
    }
  });

  it('fit-width derives from the document viewport width with sane bounds', () => {
    const wide = computeEffectiveZoom({ zoom: 1, fitWidth: true, containerWidth: A4_PAGE_WIDTH_PX * 2 });
    expect(wide).toBeLessThanOrEqual(1.6);
    const narrow = computeEffectiveZoom({ zoom: 1, fitWidth: true, containerWidth: 300 });
    expect(narrow).toBeGreaterThanOrEqual(0.5);
    const unknown = computeEffectiveZoom({ zoom: 1, fitWidth: true, containerWidth: 0 });
    expect(unknown).toBe(1);
  });

  it('zoom options cover the required levels plus fit-width', () => {
    const values = EDITOR_ZOOM_OPTIONS.map((option) => option.value);
    expect(values).toEqual(expect.arrayContaining([0.75, 0.9, 1, 1.1, FIT_WIDTH_SENTINEL]));
  });
});

describe('panel sizing contract', () => {
  it('side panel width sits inside the documented min/max band', () => {
    expect(SIDE_PANEL_WIDTH_PX).toBeGreaterThanOrEqual(SIDE_PANEL_MIN_WIDTH_PX);
    expect(SIDE_PANEL_WIDTH_PX).toBeLessThanOrEqual(SIDE_PANEL_MAX_WIDTH_PX);
    expect(SIDE_PANEL_WIDTH_PX).toBeGreaterThanOrEqual(320);
    expect(SIDE_PANEL_WIDTH_PX).toBeLessThanOrEqual(360);
  });
});
