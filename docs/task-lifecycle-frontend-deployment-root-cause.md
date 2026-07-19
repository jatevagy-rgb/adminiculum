# Task Lifecycle Frontend Deployment Root Cause

Date: 2026-07-19
Failed deployment: `a27dcd43-96a9-44de-bcde-8657a4bb4bb6`
Primary category: `FRONTEND_DEPLOYMENT_TRANSPORT`

## Executive Summary

The failed task-lifecycle frontend artifact was structurally valid and reached a successful Next.js compile. The authoritative Kudu traces prove that deployment transport orchestration started a second OneDeploy publish while the first build was still running, and the rollback publish also began before the first deployment had completed. Kudu then stopped the failed deployment because the SCM container restarted. The candidate never reached output copy or activation.

The recovery therefore changed no runtime source or package metadata. It used the same proven Oryx source layout with one asynchronous publish request and separate read-only Kudu polling, with no retry or concurrent management operation.

## Authoritative Evidence

- Kudu received the failed deployment at `2026-07-19T16:45:47Z`, started it at `16:45:48Z`, and ended it at `17:15:01Z` with status `3`, complete, inactive.
- The first incoming publish trace was recorded at `16:45:42Z` for `/api/publish?type=zip&restart=True&clean=True`.
- A second incoming publish trace was recorded at `16:50:38Z` for the same endpoint while the first Oryx build was still running. It created temporary deployment `3fc3f4ba-09b7-4de3-a496-bb13c75ca126` against the same shared extraction location.
- The rollback deployment `f1ab9847-fb1a-4e7f-9c8a-e103904c2711` was received at `17:05:34Z`, also before the failed deployment ended.
- Kudu status text states: `Deployment has been stopped due to SCM container restart` and warns against management and deployment operations in quick succession.
- Extraction succeeded for the 2.31 MB ZIP and Oryx selected Node `20.20.2`, TypeScript, and Next.js.
- `npm install` succeeded. Next.js `15.5.20` compiled successfully before lint/type validation continued.
- The log contains no `Preparing output`, destination-copy completion, post-deploy restart trigger, or activation for the failed candidate.

## Excluded Causes

- `FRONTEND_ARTIFACT_STRUCTURE`: excluded by successful extraction, root metadata discovery, dependency installation, and compile.
- `FRONTEND_ORYX_BUILD`: excluded as primary cause because compilation succeeded and the process was interrupted externally.
- `FRONTEND_BUILD_OUTPUT_MISSING`: excluded because output preparation was never reached.
- `FRONTEND_PACKAGE_METADATA`: excluded because package and lock metadata match the previously successful artifact.
- `FRONTEND_ENV_INJECTION`: excluded by production app settings and clean local bundle verification.
- `FRONTEND_ZIP_EXTRACTION`: excluded by the extraction trace.
- `FRONTEND_KUDU_ACTIVATION`: excluded as primary cause because activation was never attempted.

## Recovery Control

The corrected operation used `az webapp deploy` with `--async true` and `--track-status false`, followed by read-only Kudu polling. The successful trace contains one incoming publish request plus its background continuation, not a second incoming request. No blind retry was issued when the local CLI process timed out after upload.

Classification: `FRONTEND_DEPLOYMENT_TRANSPORT`
