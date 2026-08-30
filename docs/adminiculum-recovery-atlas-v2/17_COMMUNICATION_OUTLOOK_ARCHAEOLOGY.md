# Communication and Outlook archaeology

Canonical communication includes workforce inbox, case communications, note/task/deadline actions, and authorization boundaries. Outlook Graph inbound foundation is present in `outlookGraphLive.ts` and the PR95 line, but configuration and live provider acceptance are separate.

The `peterfi` branches provide a stronger contextual composition/read model with fail-closed dual-link authorization and no-N+1 projections. This is the highest-confidence replay candidate, but it must retain current case authorization and cannot be treated as merged because its branches are ahead of canonical.

Missing/true-greenfield areas: persisted Outlook thread/read/reply semantics, outgoing mail, delta/subscription/webhook behavior, and attachment-to-document policy.
