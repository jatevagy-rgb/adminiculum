---
name: adminiculum-visible-product-delivery
description: Use for every Adminiculum customer-facing or workforce-facing product feature, especially Client Portal, Grow, Compliance, Dashboard, Case Workspace, Document Workspace, Communication and Tasks. Enforces visible usable UI delivery instead of backend-only completion.
---

# Adminiculum Visible Product Delivery

BACKEND_DONE != PRODUCT_DONE.

A user-facing feature is not complete merely because:

schema exists
services exist
routes exist
DTOs exist
tests pass
CI is green

Before implementation identify:

VISIBLE_ENTRY_POINT=
CURRENT_VISIBLE_BEHAVIOR=
EXPECTED_VISIBLE_BEHAVIOR=
COMPLETE_USER_JOURNEY=
BACKEND_CAPABILITY=
FRONTEND_CONSUMER=

If a backend capability intentionally has no UI:

INFRASTRUCTURE_ONLY=YES

Do not call it a complete product feature.

For user-facing tasks:

VISIBLE PRODUCT CHANGE REQUIRED.

The task fails product acceptance if the target screen remains materially
unchanged.

Define the journey first:

ENTRY
→ CHOICE
→ ACTION
→ FEEDBACK
→ RESULT
→ PERSISTENCE
→ NEXT ACTION

Before MERGE_READY:

1. run the actual application/review environment
2. open the real user route
3. complete the intended journey with browser/Playwright when available
4. verify loading
5. verify empty state
6. verify success
7. verify validation/error state
8. refresh and verify persistence
9. verify navigation
10. check narrow/mobile viewport
11. smoke existing adjacent functionality

Explicitly detect:

DEAD_BACKEND
FAKE_UI
PARTIAL_JOURNEY
TECHNICAL_LEAK
INVISIBLE_DELIVERY

Do not expose:

database IDs
internal enum keys
rule AST terminology
technical schema names
raw backend errors
implementation jargon

Final report:

VISIBLE_ENTRY_POINT=
VISIBLE_BEFORE=
VISIBLE_AFTER=
USER_JOURNEY=
PLAYWRIGHT_OR_BROWSER_SMOKE=
LOADING_STATE=
EMPTY_STATE=
SUCCESS_STATE=
ERROR_STATE=
REFRESH_PERSISTENCE=
MOBILE_SMOKE=
BACKEND_TO_FRONTEND_CONNECTION=
DEAD_BACKEND=
FAKE_UI=
PARTIAL_JOURNEY=
TECHNICAL_LEAK=
SCREENSHOT_OR_BROWSER_EVIDENCE=
LIVE_USER_ACCEPTANCE=

CI does not determine whether the journey is usable.

LIVE_USER_ACCEPTANCE is final authority.
