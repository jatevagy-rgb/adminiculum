# DOCX Template Inventory Discrepancy

Date: 2026-07-16
Release branch: `release/editor-ops-workflow-1`

## Classification

`DOCUMENTATION_COUNT_ERROR`

## Finding

Documentation references 22 DOCX templates, but the repository contains exactly 20 tracked DOCX template files under `Backend/templates/`.

The 20 tracked files are:

- `Backend/templates/adasveteli_backend_ready_osztatlan_template_backend_hu_fixed_xmlfixed_v3.docx`
- `Backend/templates/adasveteli_backend_ready_osztatlan_template_backend_hu_fixed_xmlfixed_v4.docx`
- `Backend/templates/adasveteli_backend_ready_osztatlan_template_backend_hu_fixed.docx`
- `Backend/templates/adasveteli_sablon.docx`
- `Backend/templates/Atveteli_elismerveny_backend_ready_template.docx`
- `Backend/templates/Bejegyzesi_engedely_backend_ready_template_xmlfixed_v3.docx`
- `Backend/templates/Bejegyzesi_engedely_backend_ready_template_xmlfixed_v4.docx`
- `Backend/templates/Bejegyzesi_engedely_backend_ready_template_xmlfixed_v6.docx`
- `Backend/templates/Bejegyzesi_engedely_backend_ready_template.docx`
- `Backend/templates/Bejegyzesi_engedely_rebuilt_v1.docx`
- `Backend/templates/Birtokbaadasi_jegyzokonyv_backend_ready_template.docx`
- `Backend/templates/INY_kerelem_backend_ready_template_xmlfixed_v3.docx`
- `Backend/templates/INY_kerelem_backend_ready_template_xmlfixed_v4.docx`
- `Backend/templates/INY_kerelem_backend_ready_template.docx`
- `Backend/templates/Leteti_igazolas_backend_ready_template_xmlfixed_v3.docx`
- `Backend/templates/Leteti_igazolas_backend_ready_template_xmlfixed_v4.docx`
- `Backend/templates/Leteti_igazolas_backend_ready_template.docx`
- `Backend/templates/Onero_nyilatkozat_backend_ready_template_xmlfixed_v3.docx`
- `Backend/templates/Onero_nyilatkozat_backend_ready_template_xmlfixed_v4.docx`
- `Backend/templates/Onero_nyilatkozat_backend_ready_template.docx`

## Documentation References To 22

The following docs reference 22 templates:

- `docs/CODEX_REPO_READINESS.md`
- `docs/adminiculum-expanded-feature-board-inventory.md`
- `docs/adminiculum-page-function-inventory-for-claude-design.md`
- `AGENTS.md`

## History Check

`git log --all --name-only -- Backend/templates` found only the same 20 DOCX filenames. No historical deleted DOCX files beyond these 20 were found.

## Missing Two Names

No concrete filenames for the alleged missing two templates were found in docs or git history. The discrepancy appears to be a count/documentation error rather than two identifiable missing tracked assets.

## Local / Generated / Untracked Check

- Release worktree: no untracked DOCX template files under `Backend/templates/`.
- Primary hotfix worktree: no untracked DOCX template files under `Backend/templates/`.
- No DOCX files were copied into this release.

## Release Impact

The narrow release includes no changes under `Backend/templates/` relative to the reconstructed release baseline. Editor functionality added in this release is browser-local DOCX interoperability and does not depend on the production contract template inventory.

## Decision

Do not add template files in this release. Correct the documentation count in a separate docs cleanup if desired.
