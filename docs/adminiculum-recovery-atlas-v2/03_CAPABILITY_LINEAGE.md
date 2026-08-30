# Capability lineage

## Release sequence

`27ab674` reconstructed a deployed frontend/backend baseline. The subsequent lineage adds document versions (`ce55a80`), annotations (`7c9a23e`), document work context (`68c8a7c`), review (`d1d8fd6`), publication (`2975942`), portal identity/membership (`9809c4c`, `35ca0e6`), organization/compliance (`1ae6b9b`, `0b2a7d6`, Phase 6/7), attention (`aedf22e`), document workspace (`511c9fb`), communications (`874933a`, `a2b5b78`), portal/workspace waves (PR60–PR79), then the recovery overlay (PR92–PR98).

## Capability families

- **Case:** `02e02d8` transactional intake → `ad065f5` overview → `fb8c9bb` cockpit → `c8809c1` compact work-package selection → PR98 current reconnection.
- **Work Package:** `ddb7459` schema → `f8e91d4` definitions → `9eec7bf` legacy instantiation → PR96 runtime → PR98 modern case creation.
- **Documents:** `ed7d21c` storage → `ce55a80` versions → `7c9a23e` annotations → `4f03b86` comparison workspace → `509412d` extraction recovery.
- **Portal:** `9ef5288` routes → `2136447` aggregate → `9809c4c` identity → `35ca0e6` approval assignment → CP1/Phase 5 organization → PR92 identity repair.
- **Communications:** `874933a` inbox → `a2b5b78` canonical composition → `b88fb84` Outlook foundation → `dbf229e` V1 inbound workbench → `peterfi/*` contextual read models.
- **Compliance:** Phase 6 foundation (`c295c46`) → requirement/rule → evaluator → applicability snapshots → findings → task/proposal → Phase 7/demo productization.

## Supersession rules

Historical V1 status workflow and the V2 dead state-machine path are architectural predecessors, not replay targets. The mock portal branch family and browser-editor generations conflict with current product principles. Preserve semantics only when current authorization and DTO rules can be applied.

## Active overlay

PR96 is the runtime foundation; PR98 is stacked on it and reconnects modern case creation. PR94 restores extraction/comparison. PR95 productizes Outlook inbound. PR97 adds an external scanner service. PR92 repairs portal identity binding. These are not canonical until authoritative PR metadata says merged.
