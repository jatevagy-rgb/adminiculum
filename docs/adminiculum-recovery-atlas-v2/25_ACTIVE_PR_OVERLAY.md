# Active PR overlay

Authoritative current overlay (GitHub metadata, 2026-08-30):

| PR | exact head | state | recovery capability | canonical accounting |
|---|---|---|---|---|
| 92 | `971d08883aa00317ebe743299079cc1cd23baba4` | open draft | portal identity/workspace resolution | active recovery; PR92 remains merge candidate |
| 94 | `957d23569e317bfdf07453f0437249d6bf860284` | open draft | DOCX/PDF extraction/comparison | active recovery |
| 95 | `146539d7116ca90b5ce6086cffe6467ececb6ebe` | open draft | Outlook inbound + communication case creation | active recovery; stale body wording; sync DTO exposes configured mailbox identifier |
| 96 | `f417adae020f27bedc26f12c40ca9e0486a3d2e5` | open draft | Work Package runtime | active recovery |
| 97 | `116f0c868c4f07df2a1a436dd6cd3e31001ca357` | open draft | production ClamAV service | active recovery; provisioning remains unproven |
| 98 | `eceaf33235cb0f880fbb07dac46e7b03839e2eaf` | open draft | Case → Case Type → Work Package | stacked recovery on PR96 |

PR93's adapter is the contract consumed by PR97 but is not duplicated in the
table as a second active head. PR99 is this documentation branch and is not a
product capability. No active branch is counted as canonical.

| PR | Branch/head evidence | Recovers | Depends on | Remaining gap |
|---|---|---|---|---|
| PR92 | portal identity recovery branch; exact prior review heads | portal/workspace identity binding | current portal model | external/live acceptance |
| PR93 | production scanner adapter lineage | scanner contract/provider boundary | scanner service | deployment/live network |
| PR94 | `recovery/document-docx-pdf-text-diff` | DOCX/PDF extraction and comparison | document auth/storage | canonical merge/live proof |
| PR95 | `recovery/outlook-v1-inbound-workbench` | Outlook status/inbound/create-case path | communications auth | exact assignee/client semantics and Graph runtime |
| PR96 | `codex/work-package-runtime-current-canonical` | operational Work Package runtime | schema/current tasks | canonical merge |
| PR97 | `infra/production-malware-scanner-service` | external scanner service/delivery | Azure provisioning | live scanner |
| PR98 | `recovery/case-work-package-productization-current` | Case → Type → Work Package → Task modern flow | PR96 | open draft, not canonical |

Do not double-count a capability merely because multiple PRs carry the same historical lineage. PR98 is stacked on PR96 per authoritative PR metadata.
