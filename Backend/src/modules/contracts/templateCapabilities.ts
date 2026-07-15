import { isDatabaseFoundationEnabled } from '../../middleware/featureAvailability';

export interface EditorTemplateCapabilitiesDto {
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
}

export function getEditorTemplateCapabilities(): EditorTemplateCapabilitiesDto {
  const templateGenerationEnabled =
    isDatabaseFoundationEnabled('ENABLE_CONTRACT_GENERATION') &&
    isDatabaseFoundationEnabled('ENABLE_CONTRACT_GENERATION_STORAGE_MODEL');
  const documentProcessingEnabled =
    isDatabaseFoundationEnabled('ENABLE_DOCUMENT_PROCESSING') &&
    isDatabaseFoundationEnabled('ENABLE_DOCUMENT_AI_PRIVACY_MODEL');

  return {
    availability: {
      catalog: false,
      templateDetail: false,
      variablePreview: false,
      generation: false,
      generatedDocxDownload: false,
      automaticLocalImport: false,
      clauseCatalog: false,
      customClauses: false,
    },
    featureFlags: {
      templateGenerationEnabled,
      documentProcessingEnabled,
    },
    limits: {
      maxTemplates: 0,
      maxVariables: 0,
      maxStringLength: 0,
    },
    selectedBranch: 'APPROVAL_READINESS_ONLY',
    reason:
      'Contract template generation remains quarantined until the storage, retention, permission, audit, enum-drift, and production schema decisions are approved.',
    nextStep:
      'Use manual authorized DOCX download/import where already available; do not enable automatic template-to-editor generation until a separate approved contract-generation package is implemented.',
  };
}
