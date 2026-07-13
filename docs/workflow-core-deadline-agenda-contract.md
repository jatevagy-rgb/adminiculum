# Workflow Core Deadline Agenda Contract

## Endpoint

`GET /api/v1/agenda`

Authenticated internal users only.

## Query

| Param | Values | Default | Notes |
| --- | --- | --- | --- |
| `scope` | `MY_WORK`, `MY_CASES`, `CASE` | `MY_WORK` | `TEAM` returns `TEAM_SCOPE_NOT_AVAILABLE`. |
| `caseId` | case id | required for `CASE` | Case access is verified through owned/created/collaborator cases. |
| `status` | `OPEN`, `COMPLETED`, `ALL` | `OPEN` | Filters normalized deadline status. |
| `from` / `to` | `YYYY-MM-DD` | today to +14 days | Maximum 45-day window. |
| `limit` / `offset` | integers | `100` / `0` | Limit max is `100`. |

## Response Shape

```json
{
  "generatedAt": "2026-07-13T10:00:00.000Z",
  "timezone": "Europe/Budapest",
  "range": { "from": "2026-07-13", "to": "2026-07-27" },
  "scope": "MY_WORK",
  "summary": {
    "overdue": 0,
    "today": 0,
    "tomorrow": 0,
    "thisWeek": 0,
    "later": 0,
    "completedRecently": 0
  },
  "days": [
    {
      "date": "2026-07-14",
      "items": [
        {
          "id": "TASK:task-id",
          "sourceType": "TASK",
          "sourceId": "task-id",
          "caseId": "case-id",
          "title": "Task title",
          "safeDescription": "Optional compact task description",
          "startsAt": null,
          "dueAt": "2026-07-14T09:00:00.000Z",
          "allDay": false,
          "status": "OPEN",
          "urgency": "TOMORROW",
          "importance": "HIGH",
          "legalSignificance": null,
          "responsibility": {
            "assignee": { "id": "user-id", "displayName": "Name" },
            "responsibleLawyer": { "id": "user-id", "displayName": "Name" }
          },
          "source": { "type": "TASK", "id": "task-id", "displayName": "Feladat", "href": "/tasks?taskId=task-id" },
          "capabilities": {
            "canOpen": true,
            "canComplete": false,
            "canReopen": false,
            "canReschedule": true,
            "canCancel": false,
            "canCreateTask": false
          },
          "href": "/tasks?taskId=task-id",
          "updatedAt": "2026-07-13T09:00:00.000Z"
        }
      ]
    }
  ],
  "pagination": { "limit": 100, "offset": 0, "hasMore": false },
  "availability": {
    "taskDueDates": true,
    "caseDeadlines": false,
    "hearings": false,
    "reminders": false,
    "teamScope": false,
    "externalCalendar": false
  }
}
```

## Case Deadline Compatibility Route

`GET /api/v1/cases/:caseId/deadlines` returns the same normalized item shape flattened for a single case. It keeps the existing case read-access boundary and does not expose raw deadline extraction payloads.

## Guarantees

- explicit Prisma `select` statements;
- no raw Prisma rows;
- no relation `include` in the agenda implementation;
- no document workspace text or raw communication content;
- no AI/free-text/external calendar semantics;
- route-safe empty response when no items exist.
