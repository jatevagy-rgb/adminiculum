/**
 * Settings Service V2
 * Application settings management
 * Matching Prisma Schema V2
 */
type JsonValue = Record<string, unknown> | unknown[] | string | number | boolean | null;
interface UiSettings {
    theme: {
        mode: 'light' | 'dark';
        primaryColor: string;
        secondaryColor: string;
    };
    language: string;
    dateFormat: string;
}
declare class SettingsService {
    /**
     * Get UI settings
     */
    getUiSettings(): Promise<UiSettings>;
    /**
     * Update UI settings
     */
    updateUiSettings(updates: Partial<UiSettings>): Promise<UiSettings>;
    /**
     * Get all settings
     */
    getAllSettings(): Promise<Record<string, unknown>>;
    /**
     * Get single setting
     */
    getSetting(key: string): Promise<unknown>;
    /**
     * Update single setting
     */
    updateSetting(key: string, value: JsonValue): Promise<void>;
}
declare const _default: SettingsService;
export default _default;
//# sourceMappingURL=settings.d.ts.map