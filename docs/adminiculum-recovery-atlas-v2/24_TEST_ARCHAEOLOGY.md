# Test archaeology

Evidence includes PostgreSQL integration suites for portal identity, compliance, work package runtime/case creation, document comparison persistence, demo activation, and scanner behavior; route tests for communication, Outlook status, task submission/review, document storage errors; and frontend contract tests for portal, navigation, document workspace, compact case creation, and customer-safe work summaries.

Mature tests often outlive a visible UI path. The most important examples are comparison/extraction, portal grant/membership, work-package case creation, and communication read-model tests. Treat skipped suites and `continue-on-error` workflows as incomplete evidence; inspect commands and logs rather than only check metadata.
