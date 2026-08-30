# Adminiculum Total Recovery Atlas V2

## Executive reality

**EVIDENCE_CLASS=PROVEN** — The audited release lineage is `release/editor-ops-workflow-1` at `c0ec1dfa2f13be267cab76e91d263ea0e0df8a28` (2026-08-29). `main` is a different, older line (`1b2f8794f4f85a3f0d49fb687cdfab490ed0569c`); this atlas therefore does not treat `main` as the complete product state.

Adminiculum is not a greenfield application. The repository contains substantial case, document, review, task, portal, organization, compliance, communication, time, anonymization, and workflow foundations. The dominant release risk is **connectivity, convergence, and live proof**, not absence of code.

### Three maps that must not be collapsed

1. **Built somewhere in history:** broad and deep; multiple generations exist.
2. **Connected on audited canonical:** meaningful but uneven; several backend/UI islands remain.
3. **Live accepted:** not established by this repository audit. Code, CI, configuration, deployment, and browser acceptance are separate facts.

### Highest-value findings

- **Case → Work Package:** historical and current implementation evidence exists, but modern intake is being reconnected by PR98 on top of PR96; do not count the active branch as canonical.
- **Document comparison:** structured comparison and DOCX/PDF extraction are present in the recovery line (`509412d`, PR94 lineage) but are not part of the audited canonical head.
- **Communication:** canonical workforce inbox exists; a stronger `peterfi` contextual/read-model stack is ahead of canonical and requires semantic replay, not blind merge.
- **Portal/organization:** multiple product generations exist; identity, membership, grants, organization scope, and customer-safe projections are substantial, but internal intake → portal publication remains a connection decision.
- **Security:** historical code must not be cherry-picked. Current object authorization, portal/workforce separation, safe DTOs, upload scanning, String-ID contracts, and safe error mapping are recovery gates.
- **Historical UI:** the strongest historical improvements are semantic: contextual case workspaces, summary-first dashboards, case-aware document work, and communication context. Old mock portal and browser-editor generations are not safe resurrection targets.

### Bottom line

The smallest coherent recovery sequence is: preserve current security boundaries; finish PR96/PR98 case-to-work-package wiring; replay the vetted communication context/read model; reconnect document comparison; then close the case → portal, task → time, deadline → agenda, and document → publication cuts. Treat Outlook runtime, Azure delivery, and production/browser acceptance as separate `UNPROVEN` gates.

## Coverage declaration

This is a broad repository archaeology pass, not proof that every historical commit or every GitHub PR was exhaustively reviewed. See `01_METHODOLOGY_AND_EVIDENCE.md` and `31_EVIDENCE_INDEX.md`. `AUDIT_COMPLETE=NO` where unresolved history or runtime evidence remains.
