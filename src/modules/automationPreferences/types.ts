export const AUTOMATION_SUPPRESSION_TYPES = ['ACTION_KEY', 'TEMPLATE_ID'] as const;
export type AutomationSuppressionType = (typeof AUTOMATION_SUPPRESSION_TYPES)[number];

export interface AutomationPreferences {
  id: string;
  userId: string;
  suggestionsEnabled: boolean;
  level1Enabled: boolean;
  level2Enabled: boolean;
  level3Enabled: boolean;
  createdAt: Date;
  updatedAt: Date;
}

export interface UpdateAutomationPreferencesRequest {
  suggestionsEnabled?: boolean;
  level1Enabled?: boolean;
  level2Enabled?: boolean;
  level3Enabled?: boolean;
}

export interface AutomationSuppression {
  id: string;
  userId: string;
  suppressionType: AutomationSuppressionType;
  value: string;
  createdAt: Date;
}

export interface CreateAutomationSuppressionRequest {
  suppressionType: AutomationSuppressionType;
  value: string;
}

export interface CreateAutomationSuppressionResult {
  suppression: AutomationSuppression;
  created: boolean;
}

