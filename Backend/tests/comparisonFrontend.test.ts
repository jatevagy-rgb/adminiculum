/**
 * Structured comparison frontend (STRUCTURED-DOC-COMPARISON-1, Phases 7–18).
 *
 * Pure-model unit tests (labels/tones/progress/version-identity/polling) plus
 * structural guards over the extracted components, the workspace wiring, the
 * annotation-race invariant, and the absence of editor/AI/portal affordances.
 */
import fs from 'fs';
import path from 'path';

const repoRoot = path.join(__dirname, '..', '..');
const read = (rel: string) => fs.readFileSync(path.join(repoRoot, rel), 'utf8');
const C = 'Frontend/src/components/documents/comparison';

// The model imports only *types* from comparisonApi (erased at runtime), so it
// loads with no dependency on the aliased API layer.
import {
  changeTypeLabel, reviewStateLabel, categoryLabel, comparisonStatusLabel,
  isPollingStatus, isTerminalStatus, reviewProgress, versionIdentity, changeTypeTone,
  COMPARISON_STATUS_LABELS, CHANGE_TYPE_LABELS,
} from '../../Frontend/src/lib/documents/comparisonModel';

describe('canonical model', () => {
  it('labels every enum in Hungarian and never leaks raw values', () => {
    expect(changeTypeLabel('MOVE_CANDIDATE')).toBe('Lehetséges áthelyezés');
    expect(changeTypeLabel('FORMAT_ONLY')).toBe('Csak formázás');
    expect(reviewStateLabel('NEEDS_DISCUSSION')).toBe('Megbeszélendő');
    expect(categoryLabel('GOVERNING_LAW')).toBe('Irányadó jog');
    expect(categoryLabel('UNCLASSIFIED')).toBe('Besorolatlan');
    expect(comparisonStatusLabel('IDENTICAL')).toBe('Nincs tartalmi eltérés');
    // No label value is a raw SCREAMING_SNAKE enum.
    for (const v of [...Object.values(COMPARISON_STATUS_LABELS), ...Object.values(CHANGE_TYPE_LABELS)]) {
      expect(v).not.toMatch(/^[A-Z_]+$/);
    }
  });

  it('marks a move candidate as uncertain, never a confirmed move', () => {
    expect(changeTypeLabel('MOVE_CANDIDATE').toLowerCase()).toContain('lehetséges');
    expect(changeTypeTone('MOVE_CANDIDATE')).toBe('navy');
  });

  it('drives controlled polling that stops at every terminal status', () => {
    expect(isPollingStatus('PENDING')).toBe(true);
    expect(isPollingStatus('PROCESSING')).toBe(true);
    for (const s of ['READY', 'IDENTICAL', 'UNSUPPORTED', 'FAILED', 'SUPERSEDED'] as const) {
      expect(isPollingStatus(s)).toBe(false);
      expect(isTerminalStatus(s)).toBe(true);
    }
  });

  it('computes reviewed progress safely', () => {
    expect(reviewProgress({ insert: 0, delete: 0, replace: 0, formatOnly: 0, moveCandidate: 0, total: 0, reviewed: 0 })).toMatchObject({ pct: 0 });
    expect(reviewProgress({ insert: 0, delete: 0, replace: 0, formatOnly: 0, moveCandidate: 0, total: 4, reviewed: 1 })).toMatchObject({ reviewed: 1, total: 4, pct: 25 });
  });

  it('keeps selected/current version identity distinct and flags historical target', () => {
    expect(versionIdentity({ baseVersionNumber: 1, targetVersionNumber: 3, currentVersionNumber: 3 }).targetIsHistorical).toBe(false);
    expect(versionIdentity({ baseVersionNumber: 1, targetVersionNumber: 2, currentVersionNumber: 3 }).targetIsHistorical).toBe(true);
  });
});

describe('component extraction (no new monolith)', () => {
  const files: Record<string, string> = {
    workspace: read(`${C}/ComparisonWorkspace.tsx`),
    header: read(`${C}/header.tsx`),
    views: read(`${C}/views.tsx`),
    rail: read(`${C}/rail.tsx`),
    filters: read(`${C}/filters.tsx`),
    states: read(`${C}/states.tsx`),
    hooks: read(`${C}/useComparison.ts`),
    api: read('Frontend/src/lib/documents/comparisonApi.ts'),
  };

  it('exports the required components and hooks', () => {
    const all = Object.values(files).join('\n');
    for (const name of [
      'ComparisonWorkspace', 'ComparisonHeader', 'VersionPairSelector', 'ComparisonStatusPanel',
      'ComparisonToolbar', 'UnifiedComparisonView', 'SideBySideComparisonView', 'ChangeSegmentRow',
      'ChangeNavigator', 'ChangeReviewRail', 'ChangeFilters', 'ComparisonEmptyState',
      'ComparisonProcessingState', 'ComparisonIdenticalState', 'ComparisonUnsupportedState',
      'ComparisonFailedState', 'ComparisonTechnicalDetails',
      'useDocumentComparison', 'useComparisonSegments', 'useComparisonSegmentMutation', 'useComparisonKeyboardNavigation',
    ]) {
      expect(all).toContain(`export function ${name}`);
    }
  });

  it('keeps the orchestrator small — composition, not a 1000-line block', () => {
    expect(files.workspace.split('\n').length).toBeLessThan(200);
  });

  it('parses transport envelopes only in the api client, not in components', () => {
    // Components import from the typed client; they never call fetchApi directly.
    for (const key of ['workspace', 'header', 'views', 'rail', 'filters', 'states']) {
      expect(files[key]).not.toContain('fetchApi');
    }
    expect(files.api).toContain('fetchApi');
    expect(files.api).toContain('ComparisonConflictError');
  });
});

describe('lifecycle states, views, filters, rail', () => {
  const workspace = read(`${C}/ComparisonWorkspace.tsx`);
  const states = read(`${C}/states.tsx`);
  const views = read(`${C}/views.tsx`);
  const rail = read(`${C}/rail.tsx`);
  const filters = read(`${C}/filters.tsx`);

  it('renders every backend lifecycle state', () => {
    for (const t of ['cmp-empty', 'cmp-processing', 'cmp-identical', 'cmp-unsupported', 'cmp-failed']) {
      expect(states).toContain(`data-testid="${t}"`);
    }
    expect(workspace).toContain("comparison.status === \"PENDING\"");
    expect(workspace).toContain("comparison.status === \"IDENTICAL\"");
    expect(workspace).toContain("comparison.status === \"UNSUPPORTED\"");
    expect(workspace).toContain("comparison.status === \"FAILED\"");
  });

  it('offers unified and side-by-side views with explicit non-colour markers', () => {
    expect(views).toContain('data-testid="cmp-unified"');
    expect(views).toContain('data-testid="cmp-side-by-side"');
    // Text markers carry meaning independent of colour.
    expect(views).toContain('MARKER');
    expect(views).toContain('Bizonytalan'); // move candidate uncertainty
    expect(views).toContain('break-words'); // long excerpts wrap
    expect(views).toContain('grid-cols-1 gap-2 sm:grid-cols-2'); // stacks on mobile
  });

  it('filters by type, category, review-state and unreviewed-only, distinct from identical', () => {
    for (const t of ['cmp-filter-type', 'cmp-filter-category', 'cmp-filter-review']) {
      expect(filters).toContain(`data-testid="${t}"`);
    }
    expect(filters).toContain('Csak átnézetlen');
    expect(views).toContain('data-testid="cmp-filtered-empty"'); // filtered-empty != identical
  });

  it('review rail edits category/state/rationale with conflict handling; manual category source', () => {
    expect(rail).toContain('data-testid="cmp-category"');
    expect(rail).toContain('data-testid="cmp-review-state"');
    expect(rail).toContain('data-testid="cmp-rationale"');
    expect(rail).toContain('data-testid="cmp-conflict"');
    expect(rail).toContain('2000'); // bounded rationale
    // Manual category source is set server-side on category change; client shows source.
    expect(rail).toContain('categorySourceLabel');
  });

  it('navigation and keyboard support', () => {
    expect(filters).toContain('data-testid="cmp-prev"');
    expect(filters).toContain('data-testid="cmp-next"');
    expect(read(`${C}/useComparison.ts`)).toContain('useComparisonKeyboardNavigation');
    expect(read(`${C}/useComparison.ts`)).toMatch(/ArrowDown|ArrowUp/);
  });
});

describe('forbidden affordances and safe transport', () => {
  const stripComments = (src: string) => src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*/g, '');
  const all = stripComments(['ComparisonWorkspace.tsx', 'header.tsx', 'views.tsx', 'rail.tsx', 'filters.tsx', 'states.tsx']
    .map((f) => read(`${C}/${f}`)).join('\n') + read('Frontend/src/lib/documents/comparisonApi.ts'));

  it('has no document-content editor, no AI control, no client-publication action', () => {
    expect(all).not.toMatch(/contentEditable|execCommand|TipTap|useEditor/);
    expect(all).not.toMatch(/\bAI\b|OpenAI|prompt\(|gpt/i);
    expect(all).not.toMatch(/Client ?Portal|publikál|Kiküldés ügyfélnek|publish/i);
  });

  it('never displays raw enums directly in JSX', () => {
    const jsx = ['header.tsx', 'views.tsx', 'rail.tsx', 'filters.tsx'].map((f) => read(`${C}/${f}`)).join('\n');
    for (const raw of ['MOVE_CANDIDATE', 'FORMAT_ONLY', 'NEEDS_DISCUSSION', 'GOVERNING_LAW', 'UNCLASSIFIED']) {
      // Allowed inside value props / switch cases, but never as a bare JSX text node ">RAW<".
      expect(jsx).not.toContain(`>${raw}<`);
    }
  });
});

describe('workspace + annotation-race integration in the Contract Workspace', () => {
  const page = read('Frontend/src/app/cases/[caseId]/documents/page.tsx');

  it('wires ComparisonWorkspace for uploaded documents with multiple versions', () => {
    expect(page).toContain('import { ComparisonWorkspace }');
    expect(page).toContain('<ComparisonWorkspace');
    expect(page).toContain('versions.length >= 2');
    expect(page).toContain('data-testid="cmp-workspace-section"');
  });

  it('gates annotation loading on the version belonging to the selected document and versions loaded', () => {
    expect(page).toContain('const annotationVersionEligible =');
    expect(page).toContain('!isLoadingVersions');
    expect(page).toContain('selectedVersion.documentId === selectedUploadedDocument.id');
    expect(page).toContain('versions.some((v) => v.id === selectedVersion.id)');
    expect(page).toContain('if (annotationVersionEligible && selectedUploadedDocument?.id && selectedVersion?.id)');
    // No arbitrary timeout used to paper over the race.
    const raceBlock = page.slice(page.indexOf('annotationVersionEligible'), page.indexOf('annotationVersionEligible') + 1200);
    expect(raceBlock).not.toMatch(/setTimeout|sleep/);
  });
});
