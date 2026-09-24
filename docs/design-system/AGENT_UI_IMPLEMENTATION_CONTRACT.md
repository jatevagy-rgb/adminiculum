# Agent UI Implementation Contract

> **Target Audience**: All human developers and AI coding agents (Kilo, Codex, MiniMax, Antigravity) working on the Adminiculum codebase.
> **Scope**: All user-facing UI in `Frontend/src`.

---

## 1. Core Principles & Enforceable Rules

1. **Read the UI Source-of-Truth Before Product UI Work**
   - Review [ADMINICULUM_UI_SOURCE_OF_TRUTH.md](file:///C:/Users/drHUBAYGyulaMáté/OneDrive%20-%20Bálintfy%20és%20Társai%20Ügyvédi%20Iroda/WS/Documents/adminiculum/ADMINICULUM_UI_SOURCE_OF_TRUTH.md) and [adminiculum-design-bible.md](../../docs/adminiculum-design-bible.md).
   - Never invent arbitrary layouts when canonical patterns already exist.

2. **Use Canonical Primitives & Tokens**
   - Import all shared primitives directly from `@/components/ui`.
   - Never add raw hex color utilities (e.g. `bg-[#faf6ee]`, `text-[#082817]`, `border-[#e8ded1]`) to product components.
   - Use canonical tokens: `--adm-brand-green`, `--adm-canvas-white`, `--adm-canvas-subtle`, `--adm-border-canonical`, `--adm-text-primary`, `--adm-text-secondary`.

3. **Do Not Invent Route-Specific Palettes**
   - No route-local warm-sand/ivory themes.
   - `ClientColorKey` (blue, amber, emerald, purple, rose) is a **bounded exception** strictly reserved for client organizational categorization. Never use client tags to represent task/document workflow status.

4. **One Primary CTA Per Context**
   - Each page or major work context has at most **one** primary action (`AdminButton variant="primary"`).
   - Secondary actions must use `neutral` or `secondary`. Low-priority contextual links must use `QuietLink` or `ghost`.

5. **Comparable Operational Data → Table/Worklist Before Card Grid**
   - When users need to compare records (e.g. cases, clients, time entries, compliance controls), use `DataTable` or compact lists.
   - Never replace scan-friendly tabular records with tall marketing-style cards.

6. **Cards Are Grouping Devices, Not Default Layout**
   - Use `AdminPanel` (8px radius) or `Card` (12px radius) solely to group related functional areas.
   - Avoid nesting cards inside cards. Do not wrap individual fields in cards.

7. **No Invented Metrics or Workflow States**
   - Never show simulated AI scores, fake progress bars, or placeholder counters.
   - Show authentic backend data or honest empty states (`EmptyState`, `CompactState`).

8. **UI Copy Reflects Backend Truth in Concise Hungarian**
   - All user-facing copy must be precise Hungarian legal terminology.
   - No technical jargon (e.g. "DAG", "JSON error", "null").

9. **Customer and Workforce Views Are Separate User Jobs**
   - The workforce workspace (`/cases`, `/workload`, `/clients`) is an operational legal tool.
   - The customer portal (`/portal`) is an executive orientation summary. Do not blend the two.

10. **Responsive + Keyboard QA Required**
    - All controls must be reachable via `Tab` and have visible focus indicators (`focus-visible:ring-2`).
    - Test desktop (`1440x900`) and narrow mobile (`390x844`) layouts. Targets must be minimum 40x40px.

11. **Visual Regression Must Be Reviewed for Intentional Changes**
    - Any changes to shared components require running the visual regression suite.
    - Snapshot updates must be deliberate developer actions via `--update-snapshots`.

12. **Final Authority = Live User Acceptance**
    - No PR merge or production deploy without explicit live user acceptance testing.

---

## 2. Developer & Agent Tooling Quick Reference

| Tool / Target | Location / Command | Purpose |
|---|---|---|
| **Coded UI Showroom** | `Frontend/src/app/dev/showroom/page.tsx`<br>`GET /dev/showroom?view=all` | Interactive component gallery showing real production primitives and workspace patterns. |
| **Canonical Tokens** | `Frontend/src/components/ui/tokens.ts`<br>`Frontend/src/app/globals.css` | Formal token definitions, WCAG contrast verification, and `ClientColorKey` specs. |
| **UI Anti-Drift Guard** | `npm run guard:ui-drift`<br>`npm run guard:ui-drift:update` | CI scanner blocking new arbitrary hex colors, duplicate buttons, or excessive marketing radii. |
| **Visual Regression** | `npm run test:visual`<br>`npm run test:visual:update` | Playwright snapshot suite across Desktop (`1440x900`) and Mobile (`390x844`). |
| **A11y Smoke Tests** | `npm test` | Automated accessibility test suite verifying focus, ARIA, and contrast. |

---

## 3. Canonical Import Surface

```tsx
// ALWAYS import canonical components from "@/components/ui":
import {
  AdminButton,          // Primary, neutral, gold, ai, danger, ghost
  AdminBadge,           // Dot/text status tags
  AdminStatusPill,      // Rounded-full semantic status pills
  AdminPanel,           // 8px canonical workspace panel
  AdminSectionHeader,   // Section heading with eyebrow & action
  OperationalPageHeader,// H1 page header with count & primary CTA slot
  QuietLink,            // Accessible quiet secondary navigation link
  DataTable,            // Comparison data tables
  FormField,            // Accessible form field with label, error, helper
  Input, Select, Textarea,
  Alert,                // Info, success, warning, error notification strips
  EmptyState,           // Honest empty data placeholder
  CompactState,         // Low-profile state notice
  SafePanelError,       // Retryable section load error
  Modal,                // Accessible focus-trapped dialog
  ConfirmationDialog,   // Destructive action confirmation
  CANONICAL_TOKENS,     // Typed token references
} from "@/components/ui";
```
