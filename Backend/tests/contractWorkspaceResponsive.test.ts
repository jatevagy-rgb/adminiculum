/**
 * Contract Workspace responsive shell (CONTRACT-WS-SHELL-AND-COCKPIT-1).
 *
 * The workspace overflowed horizontally at 768px and 390px because the app-shell
 * sidebar stayed 260px wide and the workspace grid used fixed-width tracks
 * (320/300/360px) with children that could not shrink. These guards encode the
 * localized fix — a collapsing sidebar, shrinkable grid tracks (minmax(0,…)) and
 * min-w-0 content — so the overflow cannot silently return. The authoritative
 * width proof is the production acceptance measurement; this locks the mechanism.
 */
import fs from 'fs';
import path from 'path';

const repoRoot = path.join(__dirname, '..', '..');
const read = (rel: string) => fs.readFileSync(path.join(repoRoot, rel), 'utf8');

const sidebar = read('Frontend/src/components/Sidebar.tsx');
const topbar = read('Frontend/src/components/TopBar.tsx');
const workspace = read('Frontend/src/app/cases/[caseId]/documents/page.tsx');
const header = read('Frontend/src/components/documents/workContext/DocumentWorkspaceHeader.tsx');

describe('app shell collapses instead of forcing overflow', () => {
  it('shrinks the sidebar to an icon rail below the md breakpoint', () => {
    // Not a fixed 260px at every width — narrow rail on small screens, full on md+.
    expect(sidebar).toContain('w-20 md:w-[260px]');
    expect(sidebar).toContain('shrink-0');
  });

  it('hides sidebar labels/headers/profile text on small screens, keeping icons', () => {
    expect(sidebar).toContain('hidden md:block');
    expect(sidebar).toContain('hidden md:inline');
    expect(sidebar).toContain('justify-center md:justify-start');
  });

  it('keeps the top bar from overflowing: truncation, min-w-0 and wrapping', () => {
    expect(topbar).toContain('min-w-0');
    expect(topbar).toContain('truncate');
    expect(topbar).toContain('flex-wrap');
  });
});

describe('workspace grid can shrink rather than overflow', () => {
  it('makes every fixed-width grid track shrinkable with minmax(0, …)', () => {
    expect(workspace).toContain('minmax(0,320px)');
    expect(workspace).toContain('minmax(0,300px)');
    expect(workspace).toContain('minmax(0,360px)');
    // No bare fixed track that cannot shrink below its content.
    expect(workspace).not.toContain('lg:grid-cols-[minmax(0,1fr)_300px]');
    expect(workspace).not.toContain('xl:grid-cols-[minmax(0,1fr)_360px]');
    expect(workspace).not.toContain('xl:grid-cols-[320px_minmax(0,1fr)]');
  });

  it('lets the main column and its children shrink (min-w-0 throughout)', () => {
    expect(workspace).toContain('min-h-0 min-w-0 flex-1 flex-col');
    // The content section and inner grids carry min-w-0.
    expect((workspace.match(/min-w-0/g) || []).length).toBeGreaterThan(10);
  });

  it('makes form controls full-width and shrinkable so long values cannot widen the viewport', () => {
    expect(workspace).toContain('w-full min-w-0 rounded border');
  });

  it('reduces workspace padding on small screens', () => {
    expect(workspace).toContain('p-3 sm:p-4 lg:p-5');
  });
});

describe('the work-context header itself reflows', () => {
  it('constrains the header and its blocks with min-w-0 / max-w-full and wrapping', () => {
    expect(header).toContain('min-w-0 max-w-full');
    expect(header).toContain('flex min-w-0 flex-wrap');
  });
});
