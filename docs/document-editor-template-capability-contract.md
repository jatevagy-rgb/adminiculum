# Document Editor Template Capability Contract

Endpoint: `GET /api/v1/contracts/editor-template-capabilities`

## Contract

The response is explicit, content-free, and side-effect-free:

```ts
type EditorTemplateCapabilitiesDto = {
  availability: {
    catalog: boolean;
    templateDetail: boolean;
    variablePreview: boolean;
    generation: boolean;
    generatedDocxDownload: boolean;
    automaticLocalImport: boolean;
    clauseCatalog: boolean;
    customClauses: boolean;
  };
  featureFlags: {
    templateGenerationEnabled: boolean;
    documentProcessingEnabled: boolean;
  };
  limits: {
    maxTemplates: number;
    maxVariables: number;
    maxStringLength: number;
  };
  selectedBranch: 'APPROVAL_READINESS_ONLY';
  reason: string;
  nextStep: string;
};
```

## Security Properties

- Authentication happens before capability disclosure.
- The endpoint is mounted before the contracts feature gate, so disabled environments can still report false capabilities.
- It does not query Prisma.
- It does not call generation services.
- It does not read template files.
- It exposes no raw environment values, secrets, storage paths, template content, variable values, generated content, SharePoint identifiers, or broad implementation metadata.

## Current Values

All template/generation/clause catalog availability booleans are `false`. Feature flag booleans report only whether the required gates are enabled; they do not authorize editor integration.
