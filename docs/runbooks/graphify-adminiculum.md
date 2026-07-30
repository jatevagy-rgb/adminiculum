# Graphify Adminiculum Runbook

Graphify is a local repository-intelligence layer for Adminiculum. It is advisory context for Codex and Claude Code; agents must still inspect authoritative source before editing.

## Installation

Graphify is installed as an isolated uv tool, not as a Backend or Frontend dependency:

```powershell
uv tool install "graphifyy[mcp]"
uv tool upgrade graphifyy
uv tool run --from graphifyy graphify --version
uv tool run --from "graphifyy[mcp]" python -m graphify.serve --help
```

The verified local command form is:

```powershell
uv tool run --from graphifyy graphify <command>
uv tool run --from "graphifyy[mcp]" python -m graphify.serve graphify-out/graph.json
```

## Source Scope

The source graph is built from repository source, with generated output and local evidence excluded by `.graphifyignore`.

Included source areas:

- `Backend/src/`
- `Backend/prisma/schema.prisma`
- `Backend/prisma/migrations/`
- `Backend/tests/`
- `Frontend/src/`
- `Frontend/tests/`
- tracked scripts and relevant docs

Excluded areas include `.artifacts/`, `graphify-out/`, `node_modules/`, `.next/`, `coverage/`, build/deploy ZIPs, screenshots, logs, `.env*`, uploads, quarantine files and local diagnostics such as `Backend/scripts/diag-membership.ts`.

## Full Build

Run from the repository root:

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File scripts/graphify-build.ps1
```

The initial activation uses `graphify extract . --force --code-only` to produce a deterministic AST/symbol graph without API keys or semantic extraction cost.

Expected outputs:

- `graphify-out/graph.json`
- `graphify-out/GRAPH_REPORT.md`
- `graphify-out/GRAPH.html` or the installed version's supported HTML output
- `graphify-out/GRAPH_TREE.html`
- `graphify-out/callflow.html`
- `graphify-out/freshness.json`

## Incremental Update

Run after source changes:

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File scripts/graphify-update.ps1
```

The update is local-only and does not deploy, call production services or modify the database.

## Verification

Run:

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File scripts/graphify-verify.ps1
```

The verifier checks:

- non-empty graph;
- non-empty edges;
- no `.artifacts/`, `node_modules/`, `.next/` or nested `graphify-out/` indexed paths;
- no obvious credential/connection-string patterns in generated graph JSON.

## MCP Startup

Project MCP configuration is in `.mcp.json`:

```json
{
  "mcpServers": {
    "graphify": {
      "command": "uv",
      "args": ["tool", "run", "--from", "graphifyy[mcp]", "python", "-m", "graphify.serve", "graphify-out/graph.json"]
    }
  }
}
```

Manual startup:

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File scripts/graphify-serve.ps1
```

HTTP debug startup:

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File scripts/graphify-serve.ps1 -Transport http -Port 8080
```

## Claude Code Use

Claude should use Graphify before broad cross-module grep:

```powershell
uv tool run --from graphifyy graphify query "customer authentication flow"
uv tool run --from graphifyy graphify path "ClientPortalShell" "ClientPortalIdentity"
```

Claude must verify referenced source files before editing and treat inferred or ambiguous edges as hints, not facts.

## Codex Use

Codex should use Graphify for cross-module architecture questions:

```powershell
uv tool run --from graphifyy graphify query "identity-based ClientPortalGrant lifecycle"
uv tool run --from graphifyy graphify path "ClientPublicationPanel" "ClientPortalGrant"
uv tool run --from graphifyy graphify explain "DocumentVersion"
```

For narrow single-file edits, direct source inspection is still allowed.

## Freshness

Check `graphify-out/freshness.json` before relying on the graph:

- `repositoryHead` must match `git rev-parse HEAD`;
- `graphifyVersion` should match `uv tool run --from graphifyy graphify --version`;
- `graphChecksumSha256` identifies the local graph snapshot.

If stale, run `scripts/graphify-update.ps1` or `scripts/graphify-build.ps1`.

## Useful Adminiculum Queries

```powershell
uv tool run --from graphifyy graphify query "customer authentication flow"
uv tool run --from graphifyy graphify path "ClientPortalShell" "ClientPortalIdentity"
uv tool run --from graphifyy graphify query "identity-based ClientPortalGrant lifecycle"
uv tool run --from graphifyy graphify path "ClientPublicationPanel" "ClientPortalGrant"
uv tool run --from graphifyy graphify explain "DocumentVersion"
```

## Troubleshooting

- If `uv` is missing, install uv first; do not add Graphify to `package.json`.
- If `graphify-out/graph.json` is missing, run the full build script.
- If the verifier reports generated paths, update `.graphifyignore`, delete only `graphify-out/`, and rebuild.
- If MCP tools do not appear, restart the agent after saving `.mcp.json`.

## Cleanup

To remove generated local graph output:

```powershell
Remove-Item -LiteralPath graphify-out -Recurse -Force
```

Do not delete source, docs, scripts or MCP configuration as part of cleanup.

## Upgrade

```powershell
uv tool upgrade graphifyy
powershell -NoProfile -ExecutionPolicy Bypass -File scripts/graphify-build.ps1
```

## Uninstall

```powershell
uv tool uninstall graphifyy
```

Remove `.mcp.json` entries and scripts only after confirming no agent depends on them.
