# Release Readiness Feature Flag Matrix

Date: 2026-07-15
Current HEAD: `6800b13`

Production values are recorded as known only when prior docs state them. This task did not read or change Azure settings.

| Feature | Flag(s) | Current production value | Required release value | Runtime behavior when off | Runtime behavior when on | Release decision |
|---|---|---|---|---|---|---|
| Communications persistence | `ENABLE_COMMUNICATIONS_PERSISTENCE` | Documented previously as `true` | Keep current | Mutating/detail communication persistence may be gated | Communication intake/persistence available | Keep current; do not change. |
| Outlook import | `ENABLE_OUTLOOK_IMPORT` | Documented absent/off | Off | Dry-run/write import return 501 after auth | Mock/provider import endpoints enabled | Keep off unless separately approved. |
| Client Portal | `ENABLE_CLIENT_PORTAL`, `ENABLE_CLIENT_PORTAL_OWNERSHIP_MODEL`, `ENABLE_CLIENT_PORTAL_RUNTIME_READY` | Off/unknown; design says parked | Off | Portal APIs fail closed / unavailable | Requires ownership/runtime readiness | Keep parked; no enablement. |
| Document processing | `ENABLE_DOCUMENT_PROCESSING` | Unknown/off posture | No new enablement | Editor server content/save routes unavailable | Document processing routes may operate | Keep Mode C export-only unless separately approved. |
| Document AI privacy model | `ENABLE_DOCUMENT_AI_PRIVACY_MODEL` | Unknown/off posture | No new enablement | AI/privacy-dependent routes unavailable | Legal analyses/anonymize AI flows may operate | Keep off/unchanged. |
| AI anonymization | `ENABLE_AI_ANONYMIZATION` | Unknown | No new enablement | Anonymization pack unavailable | AI anonymization routes enabled | Not part of this release. |
| Contract generation | `ENABLE_CONTRACT_GENERATION` | Unknown/gated posture | No new enablement | Generation disabled | Contract generation routes enabled | Keep gated; contracts family quarantined. |
| Contract generation storage | `ENABLE_CONTRACT_GENERATION_STORAGE_MODEL` | Unknown/off posture | Off unless approved | Storage-dependent behavior unavailable | Storage model paths enabled | Keep off/unchanged. |
| Generation drafts | `ENABLE_GENERATION_DRAFT` | Unknown | No new enablement | Draft routes return disabled | Draft read/write enabled | Not release-critical; baseline still blocked. |
| Clause library | `ENABLE_CLAUSE_LIBRARY` | Unknown; visual QA covered enabled/disabled states | Keep approved value | Truthful unavailable state | Clause routes/UI available | Do not change. |
| Handoff packages | `ENABLE_HANDOFF_PACKAGES` | Unknown | Keep approved value | Handoff package writes disabled | Handoff package routes enabled | Do not change. |
| Legal analyses | `ENABLE_LEGAL_ANALYSES`, `ENABLE_DOCUMENT_AI_PRIVACY_MODEL` | Unknown/off posture | Off unless approved | Analysis routes unavailable | Legal analysis routes enabled | Keep quarantined. |
| Client house style | `ENABLE_CLIENT_HOUSE_STYLE` | Unknown | Keep current | House-style routes disabled | House-style routes enabled | Internal keep candidate, not deploy approval. |
| Timesheet reports | `ENABLE_TIMESHEET_REPORT_PERSISTENCE` | Unknown | Keep current | Persistence disabled/unavailable | Report persistence enabled | Not release gate unless route smoke requires. |
| Runtime admin routes | `ENABLE_RUNTIME_ADMIN_ROUTES` | Unknown/off recommended | Off | `/migrate`/`dbcheck` gated | Operational routes available after auth/admin gate | Keep off unless separate ops approval. |
| News feed | `ENABLE_NEWS_FEED` | Unknown | Keep current | News-feed disabled if false | News feed enabled | Not release-critical. |
| Local dev auth | `NEXT_PUBLIC_ENABLE_LOCAL_DEV_AUTH`, `DEV_LOGIN_*`, `LOCAL_DEV_LOGIN_*` | Must be off/absent in production | Off/absent | Real MSAL/API auth path | Local-dev bypass visible/usable | Must never be enabled in prod. |

Release posture: no flag changes are authorized by this readiness package.
