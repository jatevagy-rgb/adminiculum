# 13 — "Fake Completion" Report

> Capabilities that could have been called "implemented" because code/schema/routes existed, but were never truly end-to-end usable. Classified so they are not mistaken for shipped features.

| CAPABILITY | What exists | Why NOT end-to-end usable | Classification |
|---|---|---|---|
| Outlook communication refresh (UI "frissítés") | Real sync button (`CommunicationsOverview.tsx`) → `runOutlookSync()` → live Graph reader | Feature-gated OFF by default (`ENABLE_OUTLOOK_IMPORT='true'`) + requires `OUTLOOK_GRAPH_*` env; otherwise 501 | **UI_WITHOUT_LIVE_INTEGRATION (by default)** |
| Outlook import / dry-run endpoints | `POST /outlook/import-dry-run`, `POST /outlook/import` | Normalize a provider-shaped/mock payload only — never opens a Graph connection | **ROUTE_WITHOUT_ACTUAL_PROVIDER** |
| Communication unread / reply / thread | none surfaced (honest empty states) | No schema, no model — intentionally honest | **HONEST_EMPTY_STATE (not fake)** |
| Case → portal visibility | internal intake create cases | no grant/publication for internal matters → never portal-visible | **BACKEND_WITHOUT_PRODUCT_UX (path)**, PARTIAL |
| Version-history UI | DocumentVersion backend + `versions` prop | presentation not surfaced from the case page | **BACKEND_WITHOUT_NAVIGATION** |
| Document text-diff (compare) | structured compare + metadata compare | DOCX/PDF gated as non-text; only metadata/structured TXT-ish compare exists; AGENTS.md even claims "metadata-only" | **MOCK_ONLY / INCOMPLETE** |
| Billing foundation | TimeEntry + Matter | no invoice/export engine — placeholder only | **PLACEHOLDER_ONLY** |
| Case-level reviewer | DocumentReview reviewer | never assigned at case creation | **MISSING** |
| Client portal uploads/documents (mock) | `mockPortalData` on divergent branches | not canonical; synthetic data | **FIXTURE_ONLY / NEVER_MERGED** |
| Outlook progress/delta/subscription | none | no delta token/subscription/webhook | **NOT_REAL** |
| Outgoing mail (send) | none | no Graph sendMail | **NOT_REAL** |
| Communication Attachment → Document | attachment metadata (`url`/`spItemId`) | no attach→document gateway; documentId link only at comm creation | **PARTIAL** |
| Global attention inbox (notifications) | `Notification` model + attention category infra | not fully surfaced as a cross-capability attention center | **BACKEND_PARTIAL + UI_PARTIAL** |
| Shared / audience attention categories | `shared-attention-category-*` docs + some code | multiple branches ahead, partially merged; runtime wiring uncertain | **PARTIALLY_REPLAY / UNPROVEN** |
| `searchDocuments` / `classifyDocument` | API exists | no UI | **BACKEND_ONLY** |
| Compliance evaluation → task automation | findings→task bridging (phase7b/7d) | STRONGLY_INDICATED by branches/routes; not deeply verified | **STRONGLY_INDICATED (unverified)** |

## How to read this

These are NOT "broken features to rip out". They are honest gap markers: the product openly shows empty states where no real persistence exists (good), and several backend capabilities are real but simply not (yet) surfaced or connected end-to-end. The highest-leverage "fake→real" conversions are: (1) DOCX/PDF **text-diff** via existing extractor, (2) **case→workpackage** on modern paths, (3) **version-history** presentation, (4) **case→portal** for internal intake, and (5) enabling + credentialing the real **Outlook sync**.
