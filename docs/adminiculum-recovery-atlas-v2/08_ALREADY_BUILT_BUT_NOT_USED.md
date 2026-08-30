# Already built but not currently used

These are roadmap accelerators, not claims of live acceptance.

| Capability | Evidence | Current condition | Action |
|---|---|---|---|
| immutable document versions | `ce55a80`; current documents module | canonical and surfaced | do not rebuild |
| anchored annotations | `7c9a23e`; annotations routes/UI | canonical | deepen only if needed |
| document review lifecycle | `d1d8fd6`; review module/routes | canonical, queue UX uneven | surface/reconnect |
| DOCX/PDF extraction | `509412d`; extractor | recovery branch; backend exists | replay safely |
| structured comparison | comparison module/diff engine | canonical/recovery split | converge |
| anonymize/rehydrate | SEC-0B1, anonymize modules/modal | canonical, security-sensitive | keep |
| portal membership/onboarding | `9809c4c`, `35ca0e6` | canonical | keep, do not recreate |
| organization compliance flow | Phase 6/7 branches and current modules | canonical | keep |
| work-package definitions/runtime | `ddb7459`, `f8e91d4`, PR96 | canonical foundation + active recovery | merge, do not rebuild |
| Outlook Graph inbound | `b88fb84`, `dbf229e` | gated and live-unproven | configure/prove separately |
| search/classification services | current API/backend evidence | no strong UI path found | reconnect or explicitly defer |
| handoff package | `778105e`, current route/service | backend/route evidence, weak surface | reconnect |
| timesheet reports | current timesheet module and `/time-entries` | surfaced, billing not proven | keep |
| task review/decision | task submission/review modules | canonical | keep |

## Anti-rebuild rule

The roadmap should not create new versions of these concepts until the evidence index confirms the existing implementation is architecturally unsuitable or security-obsolete.
