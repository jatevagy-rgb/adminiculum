# Adminiculum Presentation Demo Harness — README

This directory contains the fixture, safe reset, and healthcheck harness for the Adminiculum live presentation.

> [!IMPORTANT]
> **Synthetic compliance content:** All legal and compliance data namespaced under `DEMO_PRESENTATION_` or containing `[DEMO]` is purely synthetic. The workflow, database structures, and UI updates are fully real and persist to PostgreSQL.

---

## 1. Quick Start Setup

To initialize or completely restore the presentation to its clean initial state:

1. Make sure your local PostgreSQL database is running.
2. In the `Backend` folder, ensure you have configured your `.env` file (copied from `.env.test` or `.env.example`).
3. Set the required safety environment variable:
   ```bash
   # Windows (PowerShell)
   $env:DEMO_RESET_ENABLED="true"
   # Windows (cmd)
   set DEMO_RESET_ENABLED=true
   ```
4. Run the reset command:
   ```bash
   npm run demo:presentation:reset
   ```

To link an actual client portal email address to the newly created demo workspace, supply `DEMO_PORTAL_EMAIL`:
```bash
# Example
$env:DEMO_PORTAL_EMAIL="client@example.com"
npm run demo:presentation:reset
```
*(Note: The email address must already be onboarded/exist as a ClientPortalIdentity in your local database for the link to succeed).*

---

## 2. Healthcheck

Verify the presentation status at any time:
```bash
npm run demo:presentation:check
```
This check verifies the existence of workforce users, the demo client, active portal workspaces, main cases, pre-seeded tasks, compliance domains, and the initial employee count.

---

## 3. Two-Persona Presentation Flow

For the best live demonstration experience, configure two separate browser sessions:

*   **Browser Persona A (Client Portal):** Logged in as the client portal user (email matching `DEMO_PORTAL_EMAIL`).
*   **Browser Persona B (Workforce Portal):** Logged in as the responsible lawyer (`Dr. Kovács Péter`).

### Route Sequence
1.  **Client Dashboard:** `/portal/vallalat`
2.  **Workforce View:** `/clients/demoClient/vallalati-mukodes`
3.  **Live Proposal Interaction:** Create, edit, and bind proposal to Case.
4.  **Task Payoff:** Confirm proposal and see the Task created on the Case board.

---

## 4. Resetting During a Demo
If a previous run already created the compliance task or modified the employee count:
1. Stop the frontend/backend servers.
2. Run `npm run demo:presentation:reset`.
3. Restart servers and refresh browser sessions.
