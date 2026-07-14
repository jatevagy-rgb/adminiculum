# Document Comments API Contract

## DTO

```ts
type DocumentCommentDto = {
  id: string;
  documentId: string;
  author: { id: string; displayName: string };
  content: string;
  status: "OPEN" | "RESOLVED";
  createdAt: string;
  updatedAt?: string | null;
  resolvedAt: null;
  capabilities: {
    canResolve: boolean;
    canReopen: boolean;
    canDelete: false;
  };
};
```

## Routes

- `GET /api/v1/documents/:id/comments?limit=&offset=`
- `POST /api/v1/documents/:id/comments` with `{ "content": "plain text" }`
- `POST /api/v1/documents/:id/comments/:commentId/resolve`
- `POST /api/v1/documents/:id/comments/:commentId/reopen`

No delete route is active.

## Errors

Authentication returns `401`; missing document returns `404`; inaccessible document returns `403`; malformed content returns `400`; invalid repeated transitions return `409`.
