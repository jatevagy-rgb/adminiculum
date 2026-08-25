# Adminiculum Presentation Demo Runbook

This document provides exact instructions for operators and developers to safely run the Adminiculum presentation demo. 

## PREREQUISITES

1. **Codebase**: Must be on the latest canonical release branch (or `antigravity/presentation-demo-productization`) containing the presentation schema and UI productization.
2. **Environment**: 
   - Ensure the server is running with `NODE_ENV=development`.
   - Ensure the environment variable `ADMINICULUM_DEMO_CONTENT_ENABLED=true` is set.
   - **Production Guard**: The demo scripts will strictly fail and exit if `NODE_ENV` is set to `production` or if `ADMINICULUM_DEMO_CONTENT_ENABLED` is missing/false.
3. **Database**: Must have a valid PostgreSQL 16 database provisioned using standard migrations.

## PRE-PRESENTATION SETUP & BASELINE (RESET TO 47)

Before the presentation begins, you must reset the demo state to its clean baseline (47 employees). 

Run the reset script:
```bash
npm run demo:presentation:reset
```
This script will idempotently purge any existing demo-namespaced facts, rules, and outcomes, and then re-seed the baseline `employee_count` fact of 47. 

To verify the baseline is properly seeded:
```bash
npm run demo:presentation:check
```
You should see: `Total employee count (baseline): 47`

## PRESENTATION PERSONAS & TWO-WINDOW SETUP

The demo requires two authenticated windows side-by-side to showcase real-time multi-actor flow.

1. **WINDOW A (Client Portal)**
   - **Persona**: Demo Ügyvezető
   - **URL**: `/portal/vallalat`
   - **Organization**: Demo Kft
   - **Job Title**: Ügyvezető
   - **Visuals**: You should see "Vállalati profil 8/12" and the current baseline "EDDIG 47".

2. **WINDOW B (Internal Workforce)**
   - **Persona**: Internal Admin/Workforce User
   - **URL**: `/clients/[id]/vallalati-mukodes` (Company Operations Route)
   - **Visuals**: You should see the company workspace without any new unexpected compliance findings.

## EXACT PRESENTATION SEQUENCE

1. **In Window A (Client Portal):**
   - Navigate to the company profile editing surface.
   - Update the employee count from **47** to **52**.
   - Submit the change.
   - **Expected Outcome**: The UI will visibly confirm the change. A "Grow panel" will display the transition from 47 to 52, and a feedback card will appear indicating "1 új terület jelent meg az áttekintésben."

2. **In Window B (Internal Workforce):**
   - Navigate to or refresh the Compliance Overview (`/clients/[id]/vallalati-mukodes`).
   - **Expected Outcome**: The real canonical compliance engine will have calculated a new finding triggered by crossing the 50-employee threshold.
   - Proceed to convert the **finding -> ComplianceProposal -> Case**.
   - Complete the standard authorized human confirmation to generate one normal Task.

## RECOVERY & POST-PRESENTATION

- **If the demo is already at 52 (or in an unknown state) before you start**: 
  Run the reset script (`npm run demo:presentation:reset`) to safely restore the baseline 47 state without affecting production data or unrelated clients.
- **After the presentation**: 
  Run the reset script again to clean up the newly generated findings and return to the baseline 47 state.
- **Refresh Durability**: The mutation to 52 is persisted to the database. Hard-refreshing the browser at any point will preserve the current state (either 47 or 52) and its canonical consequences.

## SAFETY & WARNINGS

- **NEVER** run the demo scripts against a production database.
- The `ADMINICULUM_DEMO_CONTENT_ENABLED` flag should **NEVER** be enabled in the production deployment environment.
- The reset script is strictly scoped to demo-namespaced records. It will not wipe arbitrary Client, Case, Task, or Compliance rows outside the presentation fixture.
