# Document Editor Template Variable Contract

No runtime variable submission was implemented in `DOCUMENT-EDITOR-TEMPLATE-ASSEMBLY-CLAUSE-CATALOG-1`.

## Required Future Shape

Future variable definitions must be explicit and allow-listed:

```ts
type TemplateVariableDefinitionDto = {
  key: string;
  label: string;
  type: 'TEXT' | 'MULTILINE_TEXT' | 'DATE' | 'MONEY' | 'CASE_FIELD' | 'CLIENT_FIELD' | 'USER_FIELD';
  required: boolean;
  source?: { domain: 'CASE' | 'CLIENT' | 'CURRENT_USER' | 'MANUAL'; field: string } | null;
  constraints?: { maxLength?: number; currency?: string | null };
};
```

Submitted values must be arrays, not broad objects:

```ts
type TemplateVariableValueDto = {
  key: string;
  value: string | number | null;
  source: 'RESOLVED' | 'MANUAL';
};
```

## Forbidden

- Arbitrary nested JSON.
- Prototype keys.
- Client-provided database field names.
- Raw object paths.
- JavaScript expressions.
- `workspaceText`.
- Communication content.
- Internal notes or audit payloads.
- Broad client/case objects.
- Variable values in logs/audit.
