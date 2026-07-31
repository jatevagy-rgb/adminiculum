# Client Portal V0.1 → V0.2 Decision Matrix

| Area | V0.1 baseline | V0.2 decision | Release posture |
| --- | --- | --- | --- |
| Portal access | External identity grant controls read-only visibility. | Keep identity grants as the only customer authorization source. | Required |
| Matter status | Shows published matter title/status/next step. | Add explicit current summary, waiting state, next step, contact label and visible update timestamp. | Required |
| Documents | Published immutable document snapshots are readable/downloadable. | Keep read-only publication model; submitted files enter matter documents only after internal review and scan-clean state. | Required |
| Action requests | Public action request display exists. | Keep action requests, but client interaction requests become the preferred response path. | Required |
| Customer questions | Not part of V0.1. | Allow bounded question creation and client-safe thread listing. | Required |
| Data forms | Not part of V0.1. | Allow published request fields to be answered and submitted. | Required |
| Uploads | Not part of V0.1. | Allow PDF/JPEG/PNG customer upload into quarantine; server-side scan controls acceptance. | Required |
| Internal queues | Not part of V0.1. | Show operational queue summaries in portal admin without exposing internal notes to customers. | Required |
| Notification delivery | Not part of V0.1. | Persist delivery queue and retry status; production completion requires real mail provider. | Provider-dependent |
| Malware scanning | Not part of V0.1. | Persist scan/quarantine lifecycle; production completion requires real scanner provider. | Provider-dependent |
| External workflow app | Out of scope. | Do not implement in V0.2; future webhook bridge can be evaluated separately. | Deferred |
| Contract workspace redesign | Out of scope. | Do not change as part of portal V0.2; summarize separately before a dedicated workspace task. | Deferred |
