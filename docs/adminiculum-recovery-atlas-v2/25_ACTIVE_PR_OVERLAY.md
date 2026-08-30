# Active PR overlay

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
