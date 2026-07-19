# Task Lifecycle Frontend Artifact Comparison

Date: 2026-07-19

## Artifacts

| Artifact | SHA-256 | Bytes | Files | ZIP entries | Result |
| --- | --- | ---: | ---: | ---: | --- |
| Failed task-lifecycle candidate | `987a77f4ef0ad27142ce440d4d06230e57937951e00edbb759b67fa2e733768c` | 2,425,996 | 121 | 175 | Transport-interrupted before activation |
| Known-good SOL56 rollback | `68ec4754616a1b61dfa8aefdb28790605afc7333f2a2d5d3f7cfdb45ee746ae5` | 2,403,293 | 117 | 117 | Previously deployed successfully |
| Corrected recovery artifact | `3c41d5efa4c040c1b11acbbb7b5caa587d7941d5208e7c8116360b96fb4afeaa` | 2,417,597 | 122 | 122 | Deployed successfully |

## Packaging Contract

All three artifacts use the proven Oryx source model:

- `package.json`, `package-lock.json`, and `next.config.mjs` are at ZIP root;
- application source is rooted at `src/`;
- `public/` and `scripts/` are root directories;
- `.next` is absent because App Service/Oryx builds it;
- `node_modules`, `Backend`, root `docs`, `.git`, SQL, migrations, and secret environment files are absent;
- no wrapper directory is present;
- maximum relative path length is 67 characters.

The failed and known-good artifacts have identical hashes for `package.json`, `package-lock.json`, and `next.config.mjs`. Their common-source differences are expected accepted frontend changes. The failed artifact adds five task-lifecycle files and changes ten existing frontend files relative to the known-good runtime. It removes no required deployment metadata.

## Layout Diff

- Failed-only runtime files: `TaskReviewWorkspace.tsx`, `TaskSubmissionWorkspace.tsx`, `WorkflowDialog.tsx`, `taskLifecycleApi.ts`, and `taskWorkflowPresentation.ts`.
- Known-good-only file: the older embedded `release-manifest.json`.
- Corrected versus failed artifact: only a fresh `release-manifest.json` is added; every failed-artifact runtime file is retained.
- Directory-entry count differs because the failed ZIP records explicit directory entries. This does not affect extraction or Oryx discovery.

## Environment And Contamination Review

The source package necessarily contains the production-bundle guard literals and a development URL example in source comments. These are not embedded production runtime targets. Clean production builds of the exact artifact produced zero `localhost:3001` and zero `/api/v1/auth/login` matches in `.next/server` and `.next/static`.

No actual secret literal, database URL, clone identifier, absolute Windows source path, backend source, docs, screenshot, test output, prior ZIP, or environment file was present in the corrected artifact.

## Assessment

The failed artifact was not malformed. The corrected artifact preserves the successful Oryx packaging contract and adds exact provenance without introducing a third packaging model.
