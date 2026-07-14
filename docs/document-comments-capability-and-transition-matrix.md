# Document Comments Capability and Transition Matrix

| Actor | List/create | Resolve open | Reopen resolved | Delete |
|---|---:|---:|---:|---:|
| Comment author with document access | Yes | Yes | Yes | No |
| Case manager / assigned lawyer / creator / privileged role | Yes | Yes | Yes | No |
| Case collaborator with read access | Yes | Own comments only | Own comments only | No |
| Authenticated wrong-case user | No | No | No | No |
| Unauthenticated user | No | No | No | No |

Repeated resolve and repeated reopen return `409`; wrong-document comment mutations return `404`.
