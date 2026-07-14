# Document Editor Template Preview and Generation

## Current Decision

Preview and generation are not enabled from the editor.

## Why

The existing `/contracts/preview` service creates a preview `ContractGeneration` and local DOCX file. That is not a pure variable preview. Existing `/contracts/generate` writes generated files, DB rows, and may create timeline events or SharePoint upload side effects.

## Required Future Preview

A future editor preview endpoint must be read-only and return:

- template identity;
- resolved safe values;
- unresolved values;
- required missing values;
- manual overrides;
- warnings;
- generation capability.

It must not return template binary, DOCX XML, broad case/client objects, storage paths, variable values in logs, or generated content.

## Required Future Generation Boundary

Generation must validate template access, case access, explicit variable allow-list, required values, safe output filename, and feature gates. It must not accept arbitrary `templateData`, actor IDs, storage paths, or client-provided authoritative field values.
