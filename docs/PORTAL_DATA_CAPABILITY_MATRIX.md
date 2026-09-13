# PORTAL_DATA_CAPABILITY_MATRIX

Scope: only the fields required for the organizational portal HOME recomposition.
No schema/backend change was required — everything is recomposed from existing contracts.

| FIELD | SOURCE | AVAILABLE | TRUTHFUL | BACKEND_CHANGE_NEEDED |
|---|---|---|---|---|
| Customer name | `getPortalOrgHome()` → `home.customer.name` | yes | yes | no |
| Published matter count | `home.matters.length` | yes | yes | no |
| Customer-action count | `home.actions.length` | yes | yes | no |
| Last update date | `home.recentDocuments[].publishedAt` (max) | yes | yes | no |
| Actions (title, matter, deadline, CTA) | `home.actions[]` | yes | yes | no |
| Current matter (status, position, next step, waiting on) | `home.currentMatter` | yes | yes | no |
| Additional matters | `home.matters[]` | yes | yes | no |
| Customer action flag per matter | `matter.customerActionRequired` | yes | yes | no |
| Recent changes | `home.recentDocuments[]` | yes | yes | no |
| Recorded work | `getPortalWorkSummary()` → `totalMinutes` | yes | yes | no |
| Messages / contact | `home.contactSummary` (`openCount`, `unreadCount`, `latestPreview`) | yes | yes | no |
| Organization profile | `getPortalOrganizationCompany()` + `getPortalOrganizationSummary()` | yes | yes | no |

## Notes
- The previous failure was **visual composition**, not missing data: every section (including empty ones) rendered as an identical large card.
- Fix applied with **no API/schema change**: empty sections now render a compact inline state; active/actionable content precedes the organization profile; recorded work is only shown when `totalMinutes > 0` and is never labelled as savings/outcome.
- Individual/private portal (`ClientPortalShell` `INDIVIDUAL` branch) is untouched; only the `ORGANIZATION` branch renders `OrgHomeView`.
