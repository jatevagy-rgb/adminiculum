function parseBooleanFlag(value: string | undefined, defaultValue = false): boolean {
  if (typeof value !== 'string') return defaultValue;
  const normalized = value.trim().toLowerCase();
  return normalized === '1' || normalized === 'true' || normalized === 'yes' || normalized === 'on';
}

function parsePositiveNumber(value: string | undefined, defaultValue: number): number {
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed <= 0) return defaultValue;
  return parsed;
}

function parseCsvUserIdAllowlist(value: string | undefined): string[] {
  if (typeof value !== 'string') return [];
  return [...new Set(
    value
      .split(',')
      .map((entry) => entry.trim().toLowerCase())
      .filter(Boolean),
  )];
}

export interface AutomationL3SafePilotConfig {
  enabled: boolean;
  minConfidence: number;
  undoWindowMinutes: number;
  cohortUserAllowlist: string[];
}

export function getAutomationL3SafePilotConfig(): AutomationL3SafePilotConfig {
  return {
    enabled: parseBooleanFlag(process.env.ENABLE_AUTOMATION_L3_SAFE_PILOT, false),
    minConfidence: parsePositiveNumber(process.env.AUTOMATION_L3_SAFE_MIN_CONFIDENCE, 0.9),
    undoWindowMinutes: parsePositiveNumber(process.env.AUTOMATION_L3_SAFE_UNDO_WINDOW_MINUTES, 15),
    cohortUserAllowlist: parseCsvUserIdAllowlist(process.env.AUTOMATION_L3_SAFE_PILOT_ALLOWLIST_USER_IDS),
  };
}

