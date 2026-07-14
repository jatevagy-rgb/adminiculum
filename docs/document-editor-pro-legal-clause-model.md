# Document Editor Pro — Legal Clause Model

Package: DOCUMENT-EDITOR-PRO-CONTRACT-WORKBENCH-1

## Structure

`legalClause` is a nested structural node:

```
legalClause(cid) := clauseHeading? (paragraph | bulletList | orderedList | blockquote | table)+ legalClause*
```

- `cid` is a stable generated identifier (`^c[A-Za-z0-9_-]{3,40}$`), never
  user-typed and never displayed.
- Maximum nesting: 3 levels (1. / 1.1. / 1.1.1.).
- Nested list presets inside clauses additionally provide `a) b) c)`
  (`listStyle: lower-alpha`) and `(i) (ii) (iii)` (`listStyle: lower-roman`).

## Numbering is derived, never stored

`computeClauseNumbers(doc)` (in `Frontend/src/lib/editor/clauseNumbering.ts`)
walks the structure and produces `cid → "2.1."` labels. Consumers:

1. **Canvas**: a ProseMirror decoration plugin re-runs the same walk on every
   document change and stamps `data-clause-no` on each clause; CSS renders the
   hanging number. The number is not part of the document and cannot be edited.
2. **Outline**: `extractOutline(doc)` — same labels, stable keys.
3. **Plain-text export/copy**: numbers are prefixed at serialization time.
4. **HTML export**: numbers are emitted as `<span class="clause-no">`.

Therefore insert/move/delete automatically renumber every affected clause, and
serialized content never duplicates generated numbering (unit-asserted).

## Operations (pure JSON transforms)

`insertClauseBefore / insertClauseAfter / addSubclause / moveClauseUp /
moveClauseDown / promoteClause / demoteClause / duplicateClause /
deleteClause` — each takes `(doc, cid)` and returns
`{ ok, doc?, error?, focusClauseId? }`. The workbench applies results via
`setContent` and refocuses the affected clause.

Guards:

- depth > 3 rejected (including subtree depth on demote);
- demote without a previous sibling clause rejected (no orphan levels /
  illegal jumps);
- move up/down only among clause siblings;
- duplicate assigns fresh `cid`s to the whole subtree;
- `findDuplicateClauseIds` / `repairDuplicateClauseIds` detect and repair
  duplicated ids;
- a `ClauseIdIntegrity` appendTransaction plugin assigns fresh ids when
  editing operations (e.g. Enter-splitting a clause) copy attributes.

## Why not CSS-counter-only numbering

CSS counters cannot both increment a parent scope and reset a child scope on
the same element for directly nested clause nodes, and they cannot feed the
outline, plain-text or HTML exports. The shared pure engine + decorations give
one deterministic source of truth, unit-tested in
`Backend/tests/editorClauseNumbering.test.ts` (15 tests).
