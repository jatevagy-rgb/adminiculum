# Backend graveyard

| Artifact/family | Evidence | Classification | Recommendation |
|---|---|---|---|
| `cases/workflow.ts` predecessor | current file plus archaeology lineage | DEAD_CODE / ARCHITECTURALLY_OBSOLETE | retain only compatibility evidence; remove later with proof |
| search/classification methods | API/backend references; no strong UI consumer read | BACKEND_ONLY / RECOVERABLE | reconnect or document deferral |
| handoff package service | `Backend/src/modules/handoff-packages/*` | BACKEND_ONLY | connect from case/document workspace |
| legal analysis service | `Backend/src/modules/legal-analyses/*` | BACKEND_ONLY / PARTIALLY_CONNECTED | preserve workspace panel |
| clause-library routes | `Backend/src/modules/clause-library/*`, `/clause-library` | PARTIALLY_CONNECTED | converge page and insertion semantics |
| duplicate workflow DTOs | workflow, work-item, task/review families | DUPLICATE | define canonical event/state contracts |
| Outlook normalize-only facade | communications routes and import service | DUPLICATE / GATED | keep separate from live Graph adapter |
| old mock portal services | `next-development`, `ops-pages-ux-cleanup-1` branch evidence | SECURITY_UNSAFE_DO_NOT_RECOVER | permanently abandon |
| old browser editor working-copy path | historical frontend and editor modules | PRODUCT_OBSOLETE | do not resurrect |

Unused models are not automatically deletable: check migrations, route mounts, tests, and historical recovery value first.
