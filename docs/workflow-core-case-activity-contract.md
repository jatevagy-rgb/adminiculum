# Workflow Core Case Activity Contract

## Endpoint

`GET /api/v1/cases/:caseId/activity`

## Purpose

Provides a canonical internal, read-only case activity stream for Case Detail. It combines safe metadata from tasks, documents, communications, and timeline events into one normalized DTO.

## Response Shape

```ts
{
  caseId: string;
  generatedAt: string;
  pagination: { limit: number; offset: number; returned: number };
  items: Array<{
    id: string;
    kind: "TASK" | "DOCUMENT" | "COMMUNICATION" | "TIMELINE";
    source: "tasks" | "documents" | "communications" | "timeline_events";
    title: string;
    safeDescription: string | null;
    occurredAt: string;
    caseId: string;
    documentId?: string | null;
    communicationId?: string | null;
    taskId?: string | null;
    href?: string | null;
    meta: {
      status?: string | null;
      type?: string | null;
      attachmentCount?: number;
      sourceTaskCount?: number;
    };
  }>;
  privacy: {
    rawDocumentTextIncluded: false;
    rawCommunicationBodyIncluded: false;
    attachmentBytesIncluded: false;
  };
}
```

## Query Parameters

- `limit`: default `30`, max `50`
- `offset`: default `0`
- `type`: optional `TASK`, `DOCUMENT`, `COMMUNICATION`, or `TIMELINE`

## Guardrails

- Requires authenticated internal case read access.
- Uses explicit Prisma `select` blocks.
- Does not include raw document text, communication content, attachment bytes, storage URLs, or timeline JSON payload.
- Not a client portal contract.
