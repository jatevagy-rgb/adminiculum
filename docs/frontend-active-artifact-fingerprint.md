# Frontend Active Artifact Fingerprint

Active deployment ID: `d21de1cb-46a1-4994-8bcd-45749c42d14e`
App Service: `adminiculumfrontend-austriaeast-01`
Status: active, complete
Classification: `UNIQUE_COMMIT_MATCH_HIGH_CONFIDENCE`
Repository match: `dc0780e feat(frontend): add communication create-case intake action`

## Artifact Summary

| Field | Value |
|---|---|
| ZIP SHA-256 | `53081a3cc46dc28e97b12c6f82b403fc2bcfdc304a9b737672c4a560c226e8dc` |
| ZIP size | 330,015,029 bytes |
| File count | 4,178 |
| Source maps | 0 |
| Deployment received | `2026-06-30T20:41:28Z` |
| Deployment completed | `2026-06-30T20:52:39Z` |

## Manifest Files Present

- `.next/app-build-manifest.json`
- `.next/BUILD_ID`
- `.next/prerender-manifest.json`
- `.next/required-server-files.json`
- `.next/routes-manifest.json`
- `.next/server/app-paths-manifest.json`
- `.next/server/middleware-manifest.json`
- `oryx-manifest.toml`
- `package-lock.json`
- `package.json`

## Dependency Fingerprint

| Dependency | Artifact value |
|---|---|
| `next` | `15.2.4` |
| `react` | `19.2.1` |
| `react-dom` | `19.2.1` |
| `@tiptap/react` | `^3.26.0` |
| `typescript` | `^5.8.2` |
| `jszip` | absent |
| `@tiptap/extension-table` | absent |

## Route Fingerprint

The active artifact exposes 28 frontend route entries, including:

- `/`
- `/cases`
- `/cases/[caseId]`
- `/cases/[caseId]/communications`
- `/cases/[caseId]/documents`
- `/cases/[caseId]/review/[documentId]`
- `/cases/[caseId]/review/[documentId]/edit`
- `/clause-library`
- `/deadlines`
- `/documents/compare`
- `/editor-lab`
- `/litigation-workspace`
- `/notifications`
- `/tasks`
- `/time-entries`

Routes absent from the active artifact:

- `/documents/[documentId]/edit`
- `/intake`
- `/workload`
- `/portal/*`

## Marker Table

| Marker | Present in artifact? | First repository commit containing marker | Last repository commit before change | Confidence |
|---|---|---|---|---|
| `src/app/notifications/page.tsx` content tuple | Yes | `dc0780e` in deployment window | Previous notification intake commits differ | High |
| `Dashboard.tsx` content | Yes | Compatible through `dc0780e` | Later July workflow commits change surrounding app | Medium |
| `CaseDetail.tsx` content | Yes | Compatible through `dc0780e` | Later workflow/editor changes differ | Medium |
| `/documents/[documentId]/edit` route | No | `a8aca78` | Artifact is before professional editor route | High |
| `jszip` dependency | No | `77a90a7` | Artifact is before DOCX interop dependency | High |
| `@tiptap/extension-table` dependency | No | `a376a80` | Artifact is before table extension dependency | High |
| `/portal/*` frontend routes | No | `0f5d923` and follow-ups | Artifact is before mock portal shell | High |
| `/intake` route | No | `a319255` | Artifact is before workflow intake page | High |
| `/workload` route | No | `d49d410` | Artifact is before workload page | High |

## Commit Match

Within the deployment-date window (`2026-06-28` through `2026-07-01`), the normalized tuple of these files uniquely matched `dc0780e`:

- `src/app/notifications/page.tsx`
- `src/components/Dashboard.tsx`
- `src/components/CaseDetail.tsx`
- `src/app/time-entries/page.tsx`
- `src/app/deadlines/page.tsx`
- `src/app/clause-library/page.tsx`
- `src/app/litigation-workspace/page.tsx`

This supports `UNIQUE_COMMIT_MATCH_HIGH_CONFIDENCE`, but not `EXACT_COMMIT_PROVEN` because no full embedded git SHA exists.
