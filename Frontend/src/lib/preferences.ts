/**
 * Workflow Assistance Preferences - Local Storage Based
 * 
 * Single preference for controlling review task suggestions.
 * Stored locally in browser only.
 */

const STORAGE_KEY = 'adminiculum_preferences';

export interface WorkflowPreferences {
  /** Show task suggestions after review decisions */
  reviewTaskSuggestions: boolean;
}

const defaultPreferences: WorkflowPreferences = {
  reviewTaskSuggestions: true,
};

/**
 * Load preferences from localStorage
 */
export function loadPreferences(): WorkflowPreferences {
  if (typeof window === 'undefined') {
    return defaultPreferences;
  }
  
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored) {
      return { ...defaultPreferences, ...JSON.parse(stored) };
    }
  } catch (e) {
    console.error('Failed to load preferences:', e);
  }
  
  return defaultPreferences;
}

/**
 * Save preferences to localStorage
 */
export function savePreferences(prefs: WorkflowPreferences): void {
  if (typeof window === 'undefined') return;
  
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(prefs));
  } catch (e) {
    console.error('Failed to save preferences:', e);
  }
}

/**
 * Get a single preference value
 */
export function getPreference(
  key: keyof WorkflowPreferences
): boolean {
  const prefs = loadPreferences();
  return prefs[key] ?? true;
}

/**
 * Set a single preference value
 */
export function setPreference(
  key: keyof WorkflowPreferences,
  value: boolean
): void {
  const prefs = loadPreferences();
  prefs[key] = value;
  savePreferences(prefs);
}
