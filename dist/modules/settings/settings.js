"use strict";
/**
 * Settings Service V2
 * Application settings management
 * Matching Prisma Schema V2
 */
Object.defineProperty(exports, "__esModule", { value: true });
const prisma_service_1 = require("../../prisma/prisma.service");
class SettingsService {
    /**
     * Get UI settings
     */
    async getUiSettings() {
        const settings = await prisma_service_1.prisma.systemSetting.findMany({
            where: { key: { in: ['app_config', 'theme'] } }
        });
        const appConfig = settings.find(s => s.key === 'app_config');
        const theme = settings.find(s => s.key === 'theme');
        return {
            theme: {
                mode: theme?.value?.mode || 'light',
                primaryColor: theme?.value?.primaryColor || '#4F46E5',
                secondaryColor: theme?.value?.secondaryColor || '#6366f1'
            },
            language: 'hu',
            dateFormat: 'YYYY.MM.DD.'
        };
    }
    /**
     * Update UI settings
     */
    async updateUiSettings(updates) {
        if (updates.theme) {
            await prisma_service_1.prisma.systemSetting.upsert({
                where: { key: 'theme' },
                update: {
                    value: updates.theme
                },
                create: {
                    key: 'theme',
                    value: updates.theme,
                    description: 'Theme settings'
                }
            });
        }
        return this.getUiSettings();
    }
    /**
     * Get all settings
     */
    async getAllSettings() {
        const settings = await prisma_service_1.prisma.systemSetting.findMany();
        const result = {};
        for (const s of settings) {
            result[s.key] = s.value;
        }
        return result;
    }
    /**
     * Get single setting
     */
    async getSetting(key) {
        const setting = await prisma_service_1.prisma.systemSetting.findUnique({
            where: { key }
        });
        return setting?.value;
    }
    /**
     * Update single setting
     */
    async updateSetting(key, value) {
        await prisma_service_1.prisma.systemSetting.upsert({
            where: { key },
            update: { value: value },
            create: { key, value: value }
        });
    }
}
exports.default = new SettingsService();
//# sourceMappingURL=settings.js.map