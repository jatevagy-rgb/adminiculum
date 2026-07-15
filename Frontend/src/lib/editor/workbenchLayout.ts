/**
 * Workbench layout state — DOCUMENT-EDITOR-WORKBENCH-UX-LAYOUT-OVERHAUL-1
 *
 * Pure, dependency-free helpers for the editor workbench chrome state:
 * outline rail, side panel, focus mode, zoom. State lives in React memory for
 * the current session only — deliberately NO browser durable storage of any
 * kind. Responsive defaults follow the documented breakpoints:
 *
 *   ≥1440px : outline open,   side panel open
 *   ≥1280px : outline closed, side panel open
 *   <1280px : outline closed, side panel closed
 *
 * Focus mode hides both rails but remembers what was open, so exiting focus
 * mode ("Panelek visszaállítása") restores the previous arrangement.
 */

export interface WorkbenchLayoutState {
  outlineOpen: boolean;
  sidePanelOpen: boolean;
  focusMode: boolean;
  /** Rail state remembered while focus mode is active. */
  restoreOutline: boolean;
  restoreSidePanel: boolean;
}

export const SIDE_PANEL_WIDTH_PX = 340;
export const SIDE_PANEL_MIN_WIDTH_PX = 280;
export const SIDE_PANEL_MAX_WIDTH_PX = 440;
export const OUTLINE_WIDTH_PX = 240;

export const OUTLINE_DEFAULT_MIN_VIEWPORT = 1440;
export const SIDE_PANEL_DEFAULT_MIN_VIEWPORT = 1280;

export function defaultWorkbenchLayout(viewportWidth: number): WorkbenchLayoutState {
  const outlineOpen = viewportWidth >= OUTLINE_DEFAULT_MIN_VIEWPORT;
  const sidePanelOpen = viewportWidth >= SIDE_PANEL_DEFAULT_MIN_VIEWPORT;
  return {
    outlineOpen,
    sidePanelOpen,
    focusMode: false,
    restoreOutline: outlineOpen,
    restoreSidePanel: sidePanelOpen,
  };
}

export function toggleOutline(state: WorkbenchLayoutState): WorkbenchLayoutState {
  if (state.focusMode) {
    // Opening a rail from focus mode leaves focus mode deliberately.
    return { ...state, focusMode: false, outlineOpen: true, sidePanelOpen: state.restoreSidePanel, restoreOutline: true };
  }
  const outlineOpen = !state.outlineOpen;
  return { ...state, outlineOpen, restoreOutline: outlineOpen };
}

export function toggleSidePanel(state: WorkbenchLayoutState): WorkbenchLayoutState {
  if (state.focusMode) {
    return { ...state, focusMode: false, sidePanelOpen: true, outlineOpen: state.restoreOutline, restoreSidePanel: true };
  }
  const sidePanelOpen = !state.sidePanelOpen;
  return { ...state, sidePanelOpen, restoreSidePanel: sidePanelOpen };
}

export function enterFocusMode(state: WorkbenchLayoutState): WorkbenchLayoutState {
  if (state.focusMode) return state;
  return {
    outlineOpen: false,
    sidePanelOpen: false,
    focusMode: true,
    restoreOutline: state.outlineOpen,
    restoreSidePanel: state.sidePanelOpen,
  };
}

/** "Panelek visszaállítása" — restores the pre-focus rail arrangement. */
export function exitFocusMode(state: WorkbenchLayoutState): WorkbenchLayoutState {
  if (!state.focusMode) return state;
  return {
    outlineOpen: state.restoreOutline,
    sidePanelOpen: state.restoreSidePanel,
    focusMode: false,
    restoreOutline: state.restoreOutline,
    restoreSidePanel: state.restoreSidePanel,
  };
}

export function toggleFocusMode(state: WorkbenchLayoutState): WorkbenchLayoutState {
  return state.focusMode ? exitFocusMode(state) : enterFocusMode(state);
}

// ---------------------------------------------------------------------------
// Zoom
// ---------------------------------------------------------------------------

export const EDITOR_ZOOM_OPTIONS = [
  { value: 0.75, label: '75%' },
  { value: 0.9, label: '90%' },
  { value: 1, label: '100%' },
  { value: 1.1, label: '110%' },
  { value: -1, label: 'Szélességhez igazítás' },
] as const;

export const A4_PAGE_WIDTH_PX = 794;
export const FIT_WIDTH_SENTINEL = -1;
const FIT_WIDTH_GUTTER_PX = 48;
const MIN_ZOOM = 0.5;
const MAX_ZOOM = 1.6;

/**
 * Effective zoom for the canvas. Fit-width derives from the document
 * viewport's current width; fixed zooms pass through. Chrome (header, toolbar,
 * panels, status bar) is never zoomed.
 */
export function computeEffectiveZoom(params: { zoom: number; fitWidth: boolean; containerWidth: number }): number {
  if (!params.fitWidth) return params.zoom;
  if (params.containerWidth <= 0) return 1;
  const raw = (params.containerWidth - FIT_WIDTH_GUTTER_PX) / A4_PAGE_WIDTH_PX;
  return Math.min(Math.max(raw, MIN_ZOOM), MAX_ZOOM);
}
