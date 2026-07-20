# Client Color Release Security Review

## Result

No authorization widening, arbitrary styling input, relation inference, or raw Prisma entity exposure was identified in the integrated client-color release.

## Client contract

- Accepted values are restricted to the ten `ClientColorKey` members; invalid input maps to a bounded 400 response.
- Explicit null clears a color.
- Create/update/list/detail safe DTOs expose `colorKey`, not legacy `Client.color`.
- Arbitrary backend strings are never interpolated into CSS. The frontend maps only known keys through `Frontend/src/lib/clientColors.ts`.
- Client names remain visible; the accent is decorative and `aria-hidden`.

## Legacy `Client.color`

The legacy nullable string remains in Prisma for backward compatibility only. It is not included in the new safe DTO selects, is not rendered by the frontend, is not hashed by client name, and is not copied into `colorKey`. Removal requires a separate usage/production-data audit, migration proposal, compatibility proof, and explicit approval.

## Authorization by surface

- Cases and Tasks add color only through already-authorized client relations in existing safe projections.
- Communications batch-resolve color only for persisted `clientId` values present in the authenticated list result.
- Review retains participant/reviewer scope and safe-not-found behavior; only the already-authorized task/case/client relation is projected.
- Dashboard is authenticated and actor-scoped. Admin/partner visibility and other internal-role assignment/creator/collaborator rules remain explicit.
- Notifications expose `clientColorKey: null`, make no client lookup, and infer nothing from title, message, actor, link, email, payload, or template data.

No global frontend client-by-ID fetch, route-auth change, CORS change, or hidden-resource lookup was added.

## Dashboard data minimization

`GET /api/v1/cases/dashboard/operational-overview` returns bounded operational metadata: identifiers, labels, deadlines, persisted status/priority, responsible user safe summary, supported group, safe next action, and nullable client color. It excludes document bodies, communication bodies, reviewer notes, workspace text, storage paths, attachment bodies, and sensitive legal free text.

## Protected systems

The reviewed chain contains no changes to authentication, CORS, Azure configuration, Client Portal, Outlook/Graph, Calendar, AI/n8n, document editor, clause library, package files, lockfiles, or environment files.

## Conclusion

Security review passes for a separately approved migration and deployment. Notifications must remain neutral until a typed, persisted, authorization-scoped relation is designed and reviewed.
