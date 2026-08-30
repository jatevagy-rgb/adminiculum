# Work Package and workflow archaeology

At least nine workflow mechanisms are evidenced across the repository: legacy status transitions, a dead V2 state-machine path, DAG/orchestration, Work Package definitions/snapshots, case lifecycle, intake lifecycle, task lifecycle, document review, and work-items.

Keep and converge the DAG, Work Package runtime, case/intake lifecycle, task lifecycle, document review, and work-item semantics. Deprecate legacy V1 compatibility and remove the dead V2 path later only after import/test proof. PR96 is runtime recovery; PR98 is modern case creation and product UX.
