# Client Workload Tracking Module

This module provides functionality for tracking client workload by workgroups.

## Overview

- **ClientWorkgroup**: Workgroups for organizing client work (e.g., HR, Legal, Compliance)
- **WorkloadRecord**: Manually recorded workload hours per workgroup per period (YYYY-MM format)

## Data Models

### ClientWorkgroup
| Field | Type | Description |
|-------|------|-------------|
| id | UUID | Primary key |
| clientId | UUID | Foreign key to Client |
| name | String | Workgroup name |
| description | String? | Optional description |
| isActive | Boolean | Soft delete flag |
| createdAt | DateTime | Creation timestamp |
| updatedAt | DateTime | Update timestamp |

### WorkloadRecord
| Field | Type | Description |
|-------|------|-------------|
| id | UUID | Primary key |
| workgroupId | UUID | Foreign key to ClientWorkgroup |
| period | String | YYYY-MM format |
| reportedHours | Float | Aggregated hours |
| note | String? | Optional note |
| createdAt | DateTime | Creation timestamp |
| updatedAt | DateTime | Update timestamp |

## API Endpoints

### Workgroup CRUD

| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | `/api/v1/clients/:clientId/workgroups` | Create workgroup |
| GET | `/api/v1/clients/:clientId/workgroups` | List client workgroups |
| GET | `/api/v1/workgroups/:id` | Get single workgroup |
| PATCH | `/api/v1/workgroups/:id` | Update workgroup |
| DELETE | `/api/v1/workgroups/:id` | Soft delete workgroup |

### Workload Recording

| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | `/api/v1/workgroups/:id/workload` | Record workload (upsert) |
| GET | `/api/v1/workgroups/:id/workload` | Get workload records |
| GET | `/api/v1/clients/:clientId/workload-summary?period=YYYY-MM` | Get summary with percentages |

## Example Usage

### Create Workgroup
```bash
POST /api/v1/clients/{clientId}/workgroups
Content-Type: application/json

{
  "name": "HR",
  "description": "HR advisory work"
}
```

### Record Workload
```bash
POST /api/v1/workgroups/{workgroupId}/workload
Content-Type: application/json

{
  "period": "2026-02",
  "reportedHours": 42.5,
  "note": "Monthly aggregated data"
}
```

### Get Workload Summary
```bash
GET /api/v1/clients/{clientId}/workload-summary?period=2026-02
```

Response:
```json
{
  "clientId": "...",
  "period": "2026-02",
  "totalHours": 90,
  "workgroups": [
    {
      "id": "...",
      "name": "HR",
      "hours": 42,
      "percentage": 46.7
    },
    {
      "id": "...",
      "name": "Compliance",
      "hours": 30,
      "percentage": 33.3
    }
  ]
}
```

## RBAC Permissions

All endpoints are gated by the canonical Client authorization model
(`assertClientReadAccess`) and workgroup → client ownership is resolved from the
persisted row before authorization. Writes additionally require the established
client-management rule (ADMIN / PARTNER), matching the sibling client-scoped
modules (`client-company`, `client-contracts`).

| Role | Permissions |
|------|-------------|
| Admin / Partner | Full CRUD + workload recording on any client |
| Lawyer / Collaborating lawyer | Read workgroups, workload and summary for clients where the actor has Case access |
| Other workforce roles (Trainee, Legal assistant) | No access |
| Client | No workforce endpoint access (customer portal is separate) |

## Notes

- Period format: YYYY-MM (e.g., "2026-02")
- Percentage calculation: (workgroupHours / totalHours) * 100, rounded to 1 decimal
- If totalHours = 0, all percentages are 0
- Upsert behavior: If a workload record exists for a period, it will be overwritten
