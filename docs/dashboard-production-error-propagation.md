# Dashboard Production Error Propagation

Date: 2026-07-21

## Error propagation chain

Source: `Frontend/src/components/DashboardFocused.tsx` (production commit `16700eb`)

### Step 1: Request execution (line 273)

```typescript
const [taskResult, caseResult, clientResult, communicationResult, agendaResult, statsResult, operationalResult] = await Promise.all([
  getMyTasks().catch(() => null),
  getCases(1, 200).catch(() => null),
  getClients().catch(() => null),
  getCommunications({ limit: 50 }).catch(() => null),
  getWorkflowAgenda({ scope: "MY_WORK", status: "OPEN", limit: 50 }).catch(() => null),
  getDashboardStats().catch(() => null),
  getDashboardOperationalOverview().catch(() => null),
]);
```

Each request is independently caught. A failed request returns `null`. `Promise.all` never rejects because all rejections are caught.

### Step 2: State population (lines 282-289)

Each result is stored in its own state variable. Null results produce empty arrays or null state:

```typescript
setTasks(taskResult || []);
setCases(caseResult?.data || []);
setClients(clientResult?.data || []);
setCommunications(communicationResult?.communications || []);
setAgenda(agendaResult);
setStats(statsResult);
setOperational(operationalResult);
```

Partial data IS preserved. Successfully loaded endpoints populate their sections correctly.

### Step 3: Availability tracking (lines 290-297)

Per-section availability is set independently. This enables section-specific degraded states.

### Step 4: Global error flag (line 298)

```typescript
setError(!taskResult || !caseResult || !agendaResult || !statsResult || !operationalResult);
```

**This is the structural vulnerability.** A single null result from ANY of the 5 checked endpoints sets the global error to true, even when 4 of 5 succeeded.

Note: `clientResult` and `communicationResult` are NOT checked — they are truly optional.

### Step 5: Error banner rendering (line 439)

```typescript
{error ? <SafePanelError onRetry={() => void load()} detail="Egyes napi munkalisták most nem érhetők el; a betöltött adatok továbbra is használhatók." /> : null}
```

`SafePanelError` renders with title **"Az adatok betöltése sikertelen."** (defined in `OperationalPrimitives.tsx:78`).

The detail text says "a betöltött adatok továbbra is használhatók" (loaded data is still usable), acknowledging partial success — but the title says "data load failed," which contradicts the partial success.

### Step 6: Section-specific degraded states

These fire independently via `availability` state, NOT via `error`:

**"Itt folytasd" section (line 452):**
```typescript
!focusDataComplete ? <DashboardEmptyState title="A következő lépés most nem tölthető be teljesen." />
```
Where `focusDataComplete = availability.operational` (line 383).

**"Ügyek, ahol lépés szükséges" section (line 523):**
```typescript
: <DashboardEmptyState title="Az operatív ügyáttekintés most nem érhető el." />
```
Renders when `operational` state is null.

**"Nyitott ügyek" count (line 469):**
```typescript
{caseCount ?? "—"}
```
Where `caseCount = availability.operational ? operational?.summary.openCaseCount ?? 0 : null` (line 348).

## Single-endpoint failure scenario

When ONLY `getDashboardOperationalOverview()` fails:

| State variable | Value | Effect |
|---|---|---|
| `operationalResult` | `null` | Triggers error flag |
| `operational` | `null` | Operational section shows empty state |
| `availability.operational` | `false` | Focus section degrades, case count shows "—" |
| `error` | `true` | Global banner fires |
| `taskResult` | valid | Tasks section works correctly |
| `caseResult` | valid | Case lookups work correctly |
| `agendaResult` | valid | Calendar/deadline section works correctly |
| `statsResult` | valid | Documents section works correctly |
| `communicationResult` | valid | Communications section works correctly |

**Result:** 5 of 6 data sources load successfully. 3 sections show correctly. But the user sees "Az adatok betöltése sikertelen" — implying total failure.

## Outer catch block (line 299)

```typescript
} catch {
  setError(true);
}
```

This catch is unreachable under normal conditions because `Promise.all` cannot reject (all promises have `.catch(() => null)`). It would only fire from a synchronous error in the state-setting code after `await`, which is extremely unlikely.

## Root cause of the structural vulnerability

The `error` flag conflates "any endpoint failed" with "the Dashboard is broken." The Dashboard already has per-section degraded states that handle individual failures gracefully. The global banner is redundant and misleading.

## Proposed fix (not implemented in this diagnosis)

Change line 298 from:
```typescript
setError(!taskResult || !caseResult || !agendaResult || !statsResult || !operationalResult);
```

To either:
```typescript
// Option A: Only flag error when ALL core endpoints fail
setError(!taskResult && !caseResult && !agendaResult && !statsResult && !operationalResult);
```

Or:
```typescript
// Option B: Only flag error for truly critical endpoints (tasks + cases)
setError(!taskResult || !caseResult);
```

Or:
```typescript
// Option C: Remove the global error banner entirely — rely on section-specific degraded states
// (delete line 298 and the error banner at line 439)
```

Option B is recommended: tasks and cases are the minimum viable Dashboard. Stats, agenda, and operational are valuable but individually degradable.
