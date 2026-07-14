# Document Editor Template Assembly Acceptance

## Manual Acceptance Checklist

- [ ] Empty template catalog: editor shows unavailable/readiness state, not fake rows.
- [ ] Generation feature disabled: capability endpoint returns false availability and no service calls.
- [ ] Authorized template catalog: remains disabled in editor until DTO/approval package exists.
- [ ] Template with no variables: no runtime generation from editor.
- [ ] Required manual variable: no arbitrary value submission from editor.
- [ ] Safe case variable: future-only; not implemented.
- [ ] Safe client variable: future-only; not implemented.
- [ ] Missing required variable: future-only; not implemented.
- [ ] Invalid variable: future-only; not implemented.
- [ ] Preview without generation: future-only; existing preview is not used.
- [ ] Generation failure: no editor generation route is called.
- [ ] Generated valid DOCX: manual download then local import only.
- [ ] Generated DOCX with import warnings: warnings shown by local DOCX importer.
- [ ] Dangerous generated DOCX rejection: local DOCX security layer rejects it.
- [ ] Dirty editor before template import: confirmation required before replacement.
- [ ] Import confirmation: user-controlled.
- [ ] Imported template remains unsaved: Mode C warning remains visible.
- [ ] DOCX re-export: local file export only.
- [ ] Review warning: panel states current editor content is not server-saved.
- [ ] Clause catalog unavailable: no dynamic catalog shown.
- [ ] Clause insertion: only existing local insertion presets.
- [ ] Keyboard navigation: no blocking modal added.
- [ ] Common laptop width: readiness panel wraps.
- [ ] `/portal` unchanged.
- [ ] Dependency audit result documented.

## Automated Acceptance

- Contracts capability endpoint auth-first and side-effect-free.
- Editor static guards continue to reject persistence, AI/n8n, external conversion, Client Portal, and storage-path leakage.
- Frontend typecheck/build pass.
- Backend typecheck/tests pass.
- Production-env bundle guard passes.
