# Workflow Core Tasks and Handoff Acceptance

## Functional checklist

- [ ] User sees relevant case work in Case Detail Workbench.
- [ ] “Saját munkám” comes from backend `isMine`, not frontend guessing.
- [ ] Overdue and due-soon items are visually distinguishable.
- [ ] Review actions appear only when backend capabilities allow them.
- [ ] Handoff items link to the existing case handoff page when the foundation is available.
- [ ] Invalid or stale transitions return a clear failure and refresh state.
- [ ] Successful task mutation refreshes tasks, work-items, and Case Center next action.
- [ ] `/tasks` and Case Workbench present consistent status/action vocabulary.

## Privacy checklist

- [ ] No `workspaceText` appears in work-item DTOs.
- [ ] No raw document text appears.
- [ ] No raw communication body/content appears.
- [ ] No SharePoint paths or storage paths appear.
- [ ] No AI prompt/output appears.
- [ ] No Client Portal route or DTO is imported.

## UX checklist

- [ ] Keyboard focus reaches filter and action buttons.
- [ ] Empty filters show compact honest empty state.
- [ ] Workbench is readable on common laptop width.
- [ ] Unsupported waiting/handoff states are described as unavailable, not faked.

## Regression checklist

- [ ] `/` returns locally.
- [ ] `/cases` returns locally.
- [ ] `/cases/smoke-case` returns locally.
- [ ] `/tasks` returns locally.
- [ ] `/documents/compare` returns locally.
- [ ] `/litigation-workspace` returns locally.
- [ ] `/notifications` returns locally.
- [ ] `/portal` returns locally as inert mock/regression surface only.
