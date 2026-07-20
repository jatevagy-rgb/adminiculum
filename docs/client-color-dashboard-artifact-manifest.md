# Client Color Dashboard Artifact Manifest

Runtime source for both artifacts: `30fd4bb8f1f3e3e46edb944501a69f7f6c81779b`

Branch: `release/editor-ops-workflow-1`

Required migration head: `20260719120000_add_client_color_key`

| Component | Artifact | SHA-256 | Payload files | Payload SHA-256 | Target |
| --- | --- | --- | ---: | --- | --- |
| Backend | `adminiculum-backend-client-color-dashboard-30fd4bb8.zip` | `9d83d2682b9bc2265a82c54dea40783779056dd8c0556379535bb94b2df8ebcd` | 156 | `a32e22b4dfb57f2ac492808576e7b494e7adb67cd05fe4026425945b4956f80d` | `adminiculumbackend-b1-01` |
| Frontend | `adminiculum-frontend-client-color-dashboard-30fd4bb8.zip` | `abbdbe30274e611074cbf57765dda46bafefaa597fddec3afa0b924a460e4848` | 125 | `90f41c6990365b93e163b702c542b11047d6aaef1fae05b0f4a582bf99666a5c` | `adminiculumfrontend-austriaeast-01` |

Both artifacts used clean Oryx source-root contracts and explicit allowlists. External sidecar manifests contain the immutable final ZIP hashes; embedded manifests contain the exact runtime source, branch, migration head, target, payload file count/hash, and compatibility metadata. A ZIP cannot truthfully contain its own final byte hash, so embedded `artifactSha256` points to the sidecar by design.

Artifact directories and screenshot evidence remained outside the repository and were not committed.
